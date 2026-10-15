import { useMemo, useState } from 'react'
import { demoDataset } from '../history/data'
import type { Dataset } from '../history/data'
import { monthLabel } from '../history/analysis'
import { analyzeForecast, METHOD_LABELS } from './engine'
import ForecastChart from './ForecastChart'

const metric = (value: number | null) => value === null ? 'N/D' : new Intl.NumberFormat('es-MX', { maximumFractionDigits: 2 }).format(value)

export default function Forecast({ dataset = demoDataset }: { dataset?: Dataset }) {
  const [sku, setSku] = useState('')
  const [category, setCategory] = useState('')
  const { results, history, forecast } = useMemo(() => analyzeForecast(dataset, { sku, category }), [dataset, sku, category])
  const stockouts = results.filter(result => result.stockoutMonths.length > 0)
  const incomplete = results.filter(result => !result.complete)
  return <div className="history forecast">
    <section className="intro-card" aria-label="Pronóstico demostrativo"><div className="intro-icon" aria-hidden="true">↗</div><div><h2>DEMOSTRATIVO · Enero a marzo de 2026</h2><p>Pronósticos orientativos por SKU desde el mismo historial sintético de CU-01 (enero 2024–diciembre 2025). No son predicciones comerciales garantizadas.</p></div><span className="step-label">CU-02</span></section>
    <section className="data-panel filters-panel" aria-label="Filtros del pronóstico"><div className="forecast-filters">
      <label>SKU<select value={sku} onChange={e => setSku(e.target.value)}><option value="">Todos los SKU</option>{dataset.products.map(product => <option key={product.sku} value={product.sku}>{product.sku} · {product.name}</option>)}</select></label>
      <label>Categoría<select value={category} onChange={e => setCategory(e.target.value)}><option value="">Todas las categorías</option>{[...new Set(dataset.products.map(product => product.category))].map(value => <option key={value}>{value}</option>)}</select></label>
    </div><button className="reset-button" onClick={() => { setSku(''); setCategory('') }}>Restablecer filtros</button></section>
    <p role="status" className="analysis-context">{results.length} SKU seleccionados · {results.length * 3} filas de pronóstico · Horizonte fijo de 3 meses.</p>
    {!results.length ? <section className="data-panel empty-state"><h2>Sin SKU para esta selección</h2><p>La categoría y el SKU deben coincidir. Restablece los filtros para consultar el pronóstico.</p></section> : <>
      <div className="analysis-notices">
        <p className="analysis-warning"><strong>Ventas observadas ≠ demanda real.</strong> No se inventan ventas perdidas ni se ajusta la demanda por faltantes.{stockouts.length > 0 && ' Hubo faltantes de inventario: tanto el historial como los errores de validación pueden subestimar la demanda no atendida.'}</p>
        <p className="analysis-note">Señales sintéticas, no evidencia de estacionalidad confiable. Las promociones históricas pueden afectar las ventas; estos métodos no modelan promociones futuras. No se calculan intervalos de confianza.</p>
        {incomplete.length > 0 && <p role="alert" className="analysis-warning">Datos insuficientes en {incomplete.map(result => `${result.sku} (${result.incompleteMonths.map(monthLabel).join(', ')})`).join('; ')}. Se requieren 24 registros mensuales válidos y únicos por SKU. Pronóstico y método: N/D; no se imputan ceros.</p>}
      </div>
      <details className="data-panel forecast-methods" open><summary>Cómo se calcula y valida</summary>
        <ul><li><strong>Promedio móvil de 3 meses:</strong> media de los tres meses anteriores. Febrero y marzo incorporan pronósticos internos sin redondear, sin ventas futuras.</li>
          <li><strong>Estacional ingenuo:</strong> mismo mes del año anterior; enero–marzo de 2026 toman enero–marzo de 2025.</li>
          <li><strong>Backtesting temporal:</strong> cortes en diciembre 2024, marzo, junio y septiembre 2025. Cada corte predice los tres meses siguientes; 12 objetivos sin solapamiento, enero–diciembre 2025. Cada ajuste usa sólo meses anteriores o iguales al corte.</li>
          <li><strong>Selección por SKU:</strong> menor MAE entre métodos con los mismos 12 objetivos válidos. En empate exacto gana estacional ingenuo. MAE = suma de errores absolutos / cantidad de objetivos; WAPE = suma de errores absolutos / suma de ventas observadas × 100. Un denominador cero se muestra N/D. Son errores históricos de validación, no errores conocidos de 2026.</li>
          <li><strong>Redondeo:</strong> entero más cercano, .5 hacia arriba, mínimo cero. Se aplica al publicar cada pronóstico, también en backtesting; los valores recursivos internos conservan decimales.</li></ul>
      </details>
      <section className="data-panel" aria-labelledby="forecast-chart-heading"><div className="panel-header"><h2 id="forecast-chart-heading">Histórico y pronóstico</h2><span className="neutral-badge">Unidades · Selección actual</span></div><ForecastChart history={history} forecast={forecast} /><p className="chart-legend"><span>■ Histórico observado · verde sólido</span><span className="stockout-key">▧ Pronóstico DEMOSTRATIVO · naranja discontinuo</span></p><p className="forecast-caption">Se suman los pronósticos individuales de los SKU seleccionados; no se pronostica la serie agregada. N/D si falta algún SKU de la selección.</p></section>
      <section className="data-panel" aria-labelledby="forecast-table-heading"><div className="panel-header"><h2 id="forecast-table-heading">Pronósticos por SKU y mes</h2><span className="neutral-badge">DEMOSTRATIVO</span></div><div className="table-scroll" role="region" aria-label="Tabla de pronósticos desplazable" tabIndex={0}><table><caption>Unidades enteras por SKU. MAE en unidades y WAPE en porcentaje, calculados exclusivamente con objetivos de 2025. Se repiten por horizonte porque corresponden al método seleccionado por SKU.</caption><thead><tr><th scope="col">SKU / Producto</th><th scope="col">Mes</th><th scope="col">Pronóstico · unidades</th><th scope="col">Método</th><th scope="col">MAE · unidades</th><th scope="col">WAPE %</th><th scope="col">Validación</th></tr></thead><tbody>{results.flatMap(result => result.forecast.map(point => <tr key={`${result.sku}-${point.month}`} data-sku={result.sku} data-month={point.month}><th scope="row">{result.sku}<small className="product-name">{result.product.name}</small></th><td>{monthLabel(point.month)}</td><td data-forecast={point.units ?? 'missing'}>{point.units ?? 'N/D'}</td><td>{result.method ? METHOD_LABELS[result.method] : 'N/D'}</td><td>{metric(result.metrics.mae)}</td><td>{metric(result.metrics.wape)}{result.metrics.wape !== null && ' %'}</td><td>{result.metrics.count}/12 objetivos</td></tr>))}</tbody></table></div></section>
      <details className="data-panel forecast-methods"><summary>Comparar errores de los dos métodos y criterio de selección</summary><div className="table-scroll" role="region" aria-label="Errores de validación desplazables" tabIndex={0}><table><caption>Un método sólo participa con 12/12 objetivos. Las métricas parciales son diagnósticas; no compiten en selección.</caption><thead><tr><th scope="col">SKU</th><th scope="col">Método</th><th scope="col">MAE</th><th scope="col">WAPE %</th><th scope="col">Objetivos</th><th scope="col">Selección</th></tr></thead><tbody>{results.flatMap(result => result.validation.map(candidate => <tr key={`${result.sku}-${candidate.method}`}><th scope="row">{result.sku}</th><td>{METHOD_LABELS[candidate.method]}</td><td>{metric(candidate.metrics.mae)}</td><td>{metric(candidate.metrics.wape)}</td><td>{candidate.metrics.count}/12{!candidate.eligible && ' · Incompleto'}</td><td>{candidate.method === result.method ? `Elegido: ${result.reason}` : result.method ? 'No elegido' : result.reason}</td></tr>))}</tbody></table></div></details>
      <details className="data-panel forecast-methods"><summary>Periodos con faltantes de inventario ({stockouts.length} SKU afectados)</summary>{stockouts.length ? <ul>{stockouts.map(result => <li key={result.sku}><strong>{result.sku}:</strong> {result.stockoutMonths.map(monthLabel).join(', ')}. No se estiman ventas perdidas.</li>)}</ul> : <p>No hay faltantes registrados en la selección.</p>}</details>
    </>}
  </div>
}
