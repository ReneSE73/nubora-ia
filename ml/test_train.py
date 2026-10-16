import copy
import json
import math
import os
import unittest
from pathlib import Path

import numpy as np
from train import MODELS, build_artifact, eligible_series, evaluate, fit_rf, recursive_predict, round_units, training_rows


class TrainingTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        path = Path(os.environ.get('ML_DATASET_PATH', 'work/ml-dataset.json'))
        if not path.exists():
            raise RuntimeError('Exporta primero createDataset(): npm run ml:export')
        cls.payload = json.loads(path.read_text())
        cls.series, cls.excluded = eligible_series(cls.payload['dataset'])
        cls.report = build_artifact(cls.payload)

    def test_dataset_real_exportado(self):
        data = self.payload['dataset']
        self.assertEqual(len({p['sku'] for p in data['products']}), 20)
        self.assertEqual(len(data['sales']), 480)
        self.assertEqual(len({(r['sku'], r['month']) for r in data['sales']}), 480)
        self.assertEqual(len(self.series), 20)
        self.assertTrue(all(len(months) == 24 for months in self.series.values()))
        self.assertEqual(self.excluded, [])

    def test_caracteristicas_y_objetivos_no_sobrepasan_cada_corte(self):
        for cutoff, count in [('2025-06', 300), ('2025-09', 360), ('2025-12', 420)]:
            rows = training_rows(self.series, cutoff)
            self.assertEqual(len(rows), count)
            for row in rows:
                self.assertLessEqual(row['target_month'], cutoff)
                self.assertTrue(all(month < row['target_month'] for month in row['source_months']))
                self.assertEqual(row['x'][0], int(row['target_month'][5:]))
                self.assertEqual(row['x'][1], row['sku'])
                self.assertEqual(row['x'][2:], [self.series[row['sku']][m] for m in row['source_months']])

    def test_no_fuga_temporal_al_cambiar_todos_los_valores_futuros(self):
        for cutoff in ['2025-06', '2025-09']:
            changed = {sku: {m: value if m <= cutoff else 999999.0 for m, value in months.items()} for sku, months in self.series.items()}
            self.assertEqual(training_rows(changed, cutoff), training_rows(self.series, cutoff))
            model_a, _ = fit_rf(self.series, cutoff)
            model_b, _ = fit_rf(changed, cutoff)
            self.assertEqual(recursive_predict(self.series, cutoff, 'random_forest', model_a), recursive_predict(changed, cutoff, 'random_forest', model_b))
            for method in ['moving_average', 'seasonal_naive']:
                self.assertEqual(recursive_predict(self.series, cutoff, method), recursive_predict(changed, cutoff, method))

    def test_recursion_usa_estimaciones_propias_y_no_los_reales_del_horizonte(self):
        class LagPlusOne:
            def predict(self, x):
                return np.array([float(row[2]) + 1 for row in x])
        predicted = recursive_predict(self.series, '2025-06', 'random_forest', LagPlusOne())
        for point in predicted:
            self.assertEqual(point['units'], round_units(self.series[point['sku']]['2025-06'] + point['horizon']))

    def test_modelos_comparten_exactamente_los_mismos_objetivos_y_mae_real(self):
        for phase in ['validation', 'test']:
            report = self.report['evaluation'][phase]
            keys = []
            for method in MODELS:
                points = [p for p in report['predictions'] if p['model'] == method]
                keys.append([(p['sku'], p['month'], p['actual']) for p in points])
                metric = next(m for m in report['metrics'] if m['model'] == method)
                self.assertEqual(len(points), 60)
                self.assertEqual(metric['n'], 60)
                self.assertAlmostEqual(metric['mae'], sum(abs(p['actual'] - p['units']) for p in points) / 60, places=12)
            self.assertEqual(keys[0], keys[1]); self.assertEqual(keys[1], keys[2])
        self.assertLess(self.report['evaluation']['validation']['period'][1], self.report['evaluation']['test']['period'][0])

    def test_json_final_valido_y_sesenta_pronosticos_enteros(self):
        artifact = json.loads(json.dumps(self.report, allow_nan=False))
        self.assertEqual(artifact['status'], 'ready')
        self.assertTrue(artifact['information_only'])
        self.assertEqual(artifact['model']['parameters']['random_state'], 42)
        self.assertEqual(artifact['training']['period'], ['2024-04', '2025-12'])
        self.assertEqual(artifact['training']['sample_count'], 420)
        points = artifact['forecast']['rows']
        self.assertEqual(len(points), 60)
        self.assertEqual(len({(r['sku'], r['month']) for r in points}), 60)
        self.assertEqual({r['month'] for r in points}, {'2026-01', '2026-02', '2026-03'})
        self.assertTrue(all(isinstance(p['units'], int) and p['units'] >= 0 for p in points))
        self.assertTrue(all(math.isfinite(m['mae']) for phase in artifact['evaluation'].values() for m in phase['metrics']))

    def test_reproducibilidad_sin_fecha_ni_aleatoriedad_variable(self):
        self.assertEqual(build_artifact(self.payload), self.report)

    def test_hueco_duplicado_y_nan_excluyen_sku_sin_imputar_ceros(self):
        for mode in ['missing', 'duplicate', 'nan']:
            data = copy.deepcopy(self.payload['dataset'])
            if mode == 'missing': data['sales'].pop(0)
            elif mode == 'duplicate': data['sales'].append(copy.deepcopy(data['sales'][0]))
            else: data['sales'][0]['units'] = float('nan')
            series, excluded = eligible_series(data)
            self.assertEqual(len(series), 19)
            self.assertEqual(excluded[0]['sku'], 'SKU-001')

    def test_sin_datos_no_inventa_metricas_o_pronosticos(self):
        empty = copy.deepcopy(self.payload); empty['dataset']['sales'] = []
        artifact = build_artifact(empty)
        self.assertEqual(artifact['status'], 'insufficient_data')
        self.assertEqual(artifact['forecast']['rows'], [])
        self.assertEqual(artifact['training']['sample_count'], 0)
        self.assertTrue(all(m['mae'] is None and m['n'] == 0 for p in artifact['evaluation'].values() for m in p['metrics']))

    def test_ceros_son_observaciones_validas(self):
        zeros = {sku: {m: 0.0 for m in values} for sku, values in self.series.items()}
        report = evaluate(zeros, '2025-09', self.payload['dataset'])
        self.assertEqual(report['sample_count'], 60)
        self.assertTrue(all(m['mae'] == 0 and m['n'] == 60 for m in report['metrics']))

    def test_datos_2026_no_entran_en_entrenamiento_final(self):
        payload = copy.deepcopy(self.payload)
        payload['dataset']['sales'].append({**payload['dataset']['sales'][0], 'month': '2026-01', 'units': 999999})
        artifact = build_artifact(payload)
        self.assertEqual(artifact['forecast'], self.report['forecast'])
        self.assertEqual(artifact['training'], self.report['training'])


if __name__ == '__main__':
    unittest.main()
