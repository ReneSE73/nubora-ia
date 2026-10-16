"""Entrenamiento batch informativo. Sin APIs, tuning con prueba ni inferencia web."""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import platform
from pathlib import Path

import numpy as np
import sklearn
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder

SEED = 42
PARAMETERS = {"n_estimators": 160, "max_depth": 6, "min_samples_leaf": 2, "random_state": SEED, "n_jobs": 1}
MODELS = ["random_forest", "moving_average", "seasonal_naive"]
LABELS = {"random_forest": "Random Forest", "moving_average": "Promedio móvil 3 meses", "seasonal_naive": "Estacional ingenuo"}


def shift(month: str, offset: int) -> str:
    year, m = map(int, month.split("-"))
    index = year * 12 + m - 1 + offset
    return f"{index // 12:04d}-{index % 12 + 1:02d}"


MONTHS = [shift("2024-01", i) for i in range(24)]


def eligible_series(dataset: dict) -> tuple[dict, list]:
    """Cohorte completa para comparar siempre los mismos objetivos entre modelos."""
    series, excluded = {}, []
    products = dataset.get("products", [])
    ids = [p["sku"] for p in products]
    for sku in sorted(set(ids)):
        rows = [r for r in dataset.get("sales", []) if r.get("sku") == sku and r.get("month") in MONTHS]
        by_month = {month: [r for r in rows if r["month"] == month] for month in MONTHS}
        valid = ids.count(sku) == 1 and all(
            len(rs) == 1 and isinstance(rs[0].get("units"), (int, float))
            and not isinstance(rs[0]["units"], bool) and math.isfinite(rs[0]["units"]) and rs[0]["units"] >= 0
            for rs in by_month.values()
        )
        if valid:
            series[sku] = {month: float(rs[0]["units"]) for month, rs in by_month.items()}
        else:
            excluded.append({"sku": sku, "reason": "Se requieren 24 meses válidos y únicos de ventas observadas; no se imputan ceros."})
    return series, excluded


def features(sku: str, target: str, history: dict) -> list:
    return [int(target[5:]), sku, *[history[shift(target, -lag)] for lag in (1, 2, 3)]]


def training_rows(series: dict, cutoff: str) -> list:
    rows = []
    for sku in sorted(series):
        for target in sorted(series[sku]):
            sources = [shift(target, -lag) for lag in (1, 2, 3)]
            if target <= cutoff and all(m in series[sku] and m < target for m in sources):
                rows.append({"sku": sku, "target_month": target, "source_months": sources,
                             "x": features(sku, target, series[sku]), "y": series[sku][target]})
    return rows


def fit_rf(series: dict, cutoff: str):
    rows = training_rows(series, cutoff)
    if not rows:
        return None, rows
    # One-hot sólo se ajusta al entrenamiento. Mes y rezagos pasan como numéricos.
    encoder = ColumnTransformer([("sku", OneHotEncoder(handle_unknown="ignore", sparse_output=False), [1])], remainder="passthrough")
    model = Pipeline([("features", encoder), ("forest", RandomForestRegressor(**PARAMETERS))])
    model.fit(np.array([r["x"] for r in rows], dtype=object), np.array([r["y"] for r in rows]))
    return model, rows


def round_units(value: float) -> int:
    return max(0, math.floor(value + 0.5))


def recursive_predict(series: dict, origin: str, method: str, model=None) -> list:
    """Cada paso añade su estimación RAW, jamás el valor observado futuro."""
    history = {sku: {m: v for m, v in values.items() if m <= origin} for sku, values in series.items()}
    output = []
    for horizon in (1, 2, 3):
        target = shift(origin, horizon)
        keys, xs = [], []
        for sku in sorted(history):
            required = [shift(target, -12)] if method == "seasonal_naive" else [shift(target, -lag) for lag in (1, 2, 3)]
            if not all(m in history[sku] for m in required):
                continue
            if method == "random_forest":
                if model is not None:
                    keys.append(sku); xs.append(features(sku, target, history[sku]))
            elif method == "moving_average":
                keys.append(sku); xs.append(sum(history[sku][m] for m in required) / 3)
            elif method == "seasonal_naive":
                keys.append(sku); xs.append(history[sku][required[0]])
            else:
                raise ValueError("Método no reconocido")
        raw = model.predict(np.array(xs, dtype=object)).tolist() if method == "random_forest" and keys else xs
        for sku, value in zip(keys, raw):
            value = max(0.0, float(value))
            if not math.isfinite(value):
                raise ValueError("Pronóstico no finito")
            history[sku][target] = value
            output.append({"sku": sku, "month": target, "horizon": horizon, "origin": origin, "units": round_units(value)})
    return sorted(output, key=lambda r: (r["sku"], r["month"]))


def evaluate(series: dict, origin: str, dataset: dict) -> dict:
    model, rows = fit_rf(series, origin)
    predictions = {method: recursive_predict(series, origin, method, model) for method in MODELS}
    maps = {method: {(p["sku"], p["month"]): p for p in values} for method, values in predictions.items()}
    common = set.intersection(*(set(values) for values in maps.values()))
    common = sorted(key for key in common if key[1] in series[key[0]])
    metrics, records = [], []
    stockouts = {(r["sku"], r["month"]) for r in dataset.get("sales", []) if r.get("stockouts")}
    for method in MODELS:
        actual = [series[sku][month] for sku, month in common]
        predicted = [maps[method][key]["units"] for key in common]
        mae = float(mean_absolute_error(actual, predicted)) if common else None
        metrics.append({"model": method, "label": LABELS[method], "mae": mae, "n": len(common)})
        records.extend({**maps[method][key], "model": method, "actual": series[key[0]][key[1]], "stockout": key in stockouts} for key in common)
    return {"origin": origin, "period": [shift(origin, 1), shift(origin, 3)], "training_sample_count": len(rows),
            "sample_count": len(common), "metrics": metrics, "predictions": records}


def build_artifact(payload: dict) -> dict:
    dataset = payload["dataset"]
    series, excluded = eligible_series(dataset)
    validation = evaluate(series, "2025-06", dataset)
    test = evaluate(series, "2025-09", dataset)
    model, rows = fit_rf(series, "2025-12")
    forecasts = recursive_predict(series, "2025-12", "random_forest", model)
    canonical = json.dumps(dataset, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()
    return {
        "schema_version": 1,
        "status": "ready" if len(series) == len(dataset.get("products", [])) and series else "partial" if series else "insufficient_data",
        "information_only": True,
        "model": {"name": "RandomForestRegressor", "parameters": PARAMETERS},
        "runtime": {"python": platform.python_version(), "scikit_learn": sklearn.__version__, "numpy": np.__version__},
        "dataset": {"signature": payload["signature"], "sha256": hashlib.sha256(canonical).hexdigest(), "sku_count": len(dataset.get("products", [])),
                    "record_count": len(dataset.get("sales", [])), "period": [MONTHS[0], MONTHS[-1]], "eligible_skus": sorted(series), "excluded_skus": excluded,
                    "stockout_records": sum(bool(r.get("stockouts")) for r in dataset.get("sales", []))},
        "features": ["month", "sku_one_hot", "lag_1", "lag_2", "lag_3"],
        "methodology": {"split": "Validación julio-septiembre 2025; prueba posterior octubre-diciembre 2025. Sin partición aleatoria.",
                        "horizon": 3, "recursion": "Cada horizonte incorpora predicciones internas sin redondear; no ventas observadas posteriores al origen.",
                        "rounding": "Entero más cercano, .5 hacia arriba, mínimo cero; MAE sobre valores publicados para todos los modelos.",
                        "selection": "Parámetros fijos antes de evaluar; sin tuning ni selección automática para optimización.",
                        "cohort": "SKU con 24 meses completos; las tres métricas usan la intersección idéntica de SKU/mes en cada periodo."},
        "training": {"period": [min((r["target_month"] for r in rows), default=None), max((r["target_month"] for r in rows), default=None)],
                     "historical_period": ["2024-01", "2025-12"], "cutoff": "2025-12", "sample_count": len(rows)},
        "evaluation": {"validation": validation, "test": test},
        "forecast": {"model": "random_forest", "origin": "2025-12", "period": ["2026-01", "2026-03"], "rows": forecasts},
        "warnings": ["DEMOSTRATIVO: datos sintéticos; no predicciones comerciales garantizadas.",
                     "Muestra pequeña: 24 meses por SKU y un único origen de prueba; las observaciones de un mismo trimestre están relacionadas.",
                     "Ventas observadas pueden subestimar demanda por faltantes. No se estiman ventas perdidas ni promociones futuras.",
                     "MAE global agregado, no prueba de mejora generalizable; ML no reemplaza los pronósticos usados por CU-03/CU-04."]
                    + (["Datos insuficientes para todos los SKU; las métricas y pronósticos sólo cubren los elegibles."] if excluded or not series else []),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=Path("work/ml-dataset.json"))
    parser.add_argument("--output", type=Path, default=Path("src/forecast/ml/results.json"))
    args = parser.parse_args()
    payload = json.loads(args.input.read_text())
    artifact = build_artifact(payload)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(artifact, ensure_ascii=False, indent=2, allow_nan=False) + "\n")
    for phase in ("validation", "test"):
        value = artifact["evaluation"][phase]
        print(f"{phase}: origen {value['origin']}, n={value['sample_count']}, entrenamiento={value['training_sample_count']}")
        for metric in value["metrics"]:
            print(f"  {metric['label']}: MAE={metric['mae']}")
    print(f"Entrenamiento final: {len(artifact['dataset']['eligible_skus'])} SKU, {artifact['training']['sample_count']} muestras; {len(artifact['forecast']['rows'])} pronósticos → {args.output}")


if __name__ == "__main__":
    main()
