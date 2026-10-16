import { useMemo } from 'react'
import type { Dataset } from '../history/data'
import { datasetSignature } from './ml/dataSignature'
import report from './ml/results.json'

const metric = (value: number | null | undefined) => value == null ? 'N/D' : new Intl.NumberFormat('es-MX', { maximumFractionDigits: 2 }).format(value)

export default function MachineLearning({ dataset }: { dataset: Dataset }) {
  const matches = useMemo(() => datasetSignature(dataset) === report.dataset.signature, [dataset])
  const validation = report.evaluation.validation
  const test = report.evaluation.test
  const rf = test.metrics.find(m => m.model === 'random_forest')?.mae
  const baselines = test.metrics.filter(m => m.model !== 'random_forest').map(m => m.mae).filter((v): v is number => typeof v === 'number')
  const bestBaseline = baselines.length ? Math.min(...baselines) : null
  const conclusion = rf == null || bestBaseline === null ? 'Muestra insuficiente: no se puede comparar desempeño.'
    : rf > bestBaseline ? 'Random Forest no supera al baseline con menor MAE en esta prueba posterior.'
      : rf === bestBaseline ? 'Random Forest empata con el mejor baseline en esta prueba posterior.'
        : 'Random Forest registra menor MAE que los baselines en esta única prueba sintética; no demuestra una mejora generalizable.'
  return <section className="data-panel ml-section" aria-labelledby="ml-heading">
    <div className="panel-header"><h2 id="ml-heading">Machine Learning</h2><span className="neutral-badge">Informativo · DEMOSTRATIVO</span></div>
    {!matches ? <p className="ml-warning">El artefacto ML no corresponde al dataset actual. Regenera el entrenamiento; se ocultan las métricas para evitar una comparación ajena.</p>
      : report.status !== 'ready' ? <p className="ml-warning">Datos insuficientes para mostrar la comparación ML completa. Revisa el JSON y sus exclusiones.</p>
        : <>
          <p className="ml-context">RandomForestRegressor real de scikit-learn, semilla {report.model.parameters.random_state}. Modelo global para {report.dataset.eligible_skus.length} SKU; mes, SKU codificado y rezagos 1–3. Métricas globales, independientes de los filtros. Protocolo distinto al MAE operativo por SKU de CU-02.</p>
          <div className="table-scroll" role="region" aria-label="Comparación de modelos Machine Learning" tabIndex={0}><table><caption>MAE en unidades vendidas observadas, sobre exactamente los mismos SKU/mes por periodo. Menor es mejor. Cada origen predice tres meses recursivos sin ventas futuras.</caption><thead><tr><th scope="col">Modelo</th><th scope="col">Validación jul–sep 2025 · MAE</th><th scope="col">n validación</th><th scope="col">Prueba oct–dic 2025 · MAE</th><th scope="col">n prueba</th></tr></thead><tbody>{validation.metrics.map(m => { const heldOut = test.metrics.find(t => t.model === m.model); return <tr key={m.model}><th scope="row">{m.label}</th><td>{metric(m.mae)}</td><td>{m.n}</td><td>{metric(heldOut?.mae)}</td><td>{heldOut?.n ?? 0}</td></tr> })}</tbody></table></div>
          <p className="ml-conclusion">{conclusion} No se reemplaza la selección actual de CU-02 ni el plan que alimenta CU-03/CU-04.</p>
          <details className="ml-details"><summary>Entrenamiento, JSON y limitaciones</summary><p>Validación: entrenamiento hasta junio 2025 ({validation.training_sample_count} filas con rezagos), origen {validation.origin}. Prueba posterior: reajuste hasta septiembre ({test.training_sample_count} filas), origen {test.origin}. Parámetros fijos, sin partición aleatoria ni tuning con la prueba.</p><p>Entrenamiento final hasta diciembre 2025: {report.training.sample_count} filas elegibles (abril 2024–diciembre 2025). Los primeros tres meses sólo aportan rezagos. Se exportaron {report.forecast.rows.length} pronósticos RF para enero–marzo 2026, con recursión sobre estimaciones internas sin redondear; salida entera no negativa, .5 hacia arriba.</p><p>Datos sintéticos, sólo 24 meses por SKU y una prueba trimestral; las {test.sample_count} observaciones no son independientes entre sí. Los faltantes pueden restringir ventas; no se inventan ventas perdidas. No se modelan promociones futuras ni se garantizan resultados comerciales.</p><a href={new URL('./ml/results.json', import.meta.url).href} download="nubora-ml-results.json">Descargar resultados y metadatos JSON</a></details>
        </>}
  </section>
}
