import { useMemo, useState } from 'react'
import { formatMXN } from '../currency'
import { demoDataset, FIRST_MONTH, LAST_MONTH } from './data'
import type { Dataset } from './data'
import { analyzeHistory, monthLabel, monthsBetween, stockoutDays } from './analysis'
import type { Filters } from './analysis'
import MonthlyChart from './MonthlyChart'

const initialFilters: Filters = { sku: '', category: '', start: FIRST_MONTH, end: LAST_MONTH }
const number = (value: number | null) => value === null ? 'N/D' : new Intl.NumberFormat('es-MX', { maximumFractionDigits: 1 }).format(value)
const money = (cents: number | null) => cents === null ? 'N/D' : formatMXN(cents / 100)
const pageSize = 20

export default function History({ dataset = demoDataset }: { dataset?: Dataset }) {
  const [filters, setFilters] = useState<Filters>(initialFilters)
  const [page, setPage] = useState(0)
  const analysis = useMemo(() => analyzeHistory(dataset, filters), [dataset, filters])
  const { products, rows, monthly, summary, quality, comparisons } = analysis
  const productMap = new Map(dataset.products.map(p => [p.sku, p]))
  const orderedRows = [...rows].sort((a, b) => a.month.localeCompare(b.month) || a.sku.localeCompare(b.sku))
  const pageRows = orderedRows.slice(page * pageSize, (page + 1) * pageSize)
  const invalidPeriod = filters.start > filters.end
  const hasData = products.length > 0 && rows.length > 0 && !invalidPeriod
  function update(key: keyof Filters, value: string) {
    setFilters(previous => ({ ...previous, [key]: value }))
    setPage(0)
  }
  function reset() { setFilters(initialFilters); setPage(0) }
  return <div className="history">
    <section className="intro-card" aria-label="Datos de demostración"><div className="intro-icon" aria-hidden="true">◷</div><div><h2>Historial de ventas · Datos ficticios</h2><p>20 SKU · 24 meses completos · Enero 2024 a diciembre 2025. Dataset fijo y reproducible; no representa operaciones reales.</p></div><span className="step-label">CU-01</span></section>
    <section className="data-panel filters-panel" aria-label="Filtros del historial">
      <div className="filters-grid">
        <label>SKU<select value={filters.sku} onChange={e => update('sku', e.target.value)}><option value="">Todos los SKU</option>{dataset.products.map(p => <option value={p.sku} key={p.sku}>{p.sku} · {p.name}</option>)}</select></label>
        <label>Categoría<select value={filters.category} onChange={e => update('category', e.target.value)}><option value="">Todas las categorías</option>{[...new Set(dataset.products.map(p => p.category))].map(c => <option key={c}>{c}</option>)}</select></label>
        <label>Desde<select value={filters.start} onChange={e => update('start', e.target.value)}>{monthsBetween(FIRST_MONTH, LAST_MONTH).map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}</select></label>
        <label>Hasta<select value={filters.end} onChange={e => update('end', e.target.value)}>{monthsBetween(FIRST_MONTH, LAST_MONTH).map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}</select></label>
      </div><button className="reset-button" onClick={reset}>Restablecer filtros</button>
    </section>
    <p className="analysis-context" role="status">{products.length} SKU seleccionados · {monthly.length} meses en el periodo · {rows.length} registros observados.</p>
    {invalidPeriod && <p role="alert" className="analysis-warning">Periodo inválido: Desde debe ser anterior o igual a Hasta.</p>}
    {!hasData ? <section className="data-panel empty-state"><h2>Sin ventas disponibles</h2><p>{invalidPeriod ? 'Corrige el periodo para consultar el historial.' : 'No hay registros para esta combinación de filtros. La ausencia de registros no equivale a ventas de cero.'}</p><button className="return-button" onClick={reset}>Limpiar filtros</button></section> : <>
      <div className="analysis-notices">
        <p className="analysis-warning"><strong>Ventas observadas ≠ demanda real.</strong> El historial refleja unidades vendidas; no estima ventas perdidas ni demanda no atendida.{quality.hasStockouts && ' Hubo faltantes de inventario en el periodo: las ventas pueden subestimar la demanda.'}</p>
        <p className="analysis-note">{quality.seasonalityNote}{quality.hasPromotions && ' Hay meses con promoción; considera su efecto al comparar.'}</p>
        {quality.incompleteMonths.length > 0 && <p role="alert" className="analysis-warning"><strong>Datos incompletos:</strong> {quality.incompleteMonths.map(monthLabel).join(', ')}. Faltan registros o hay duplicados de SKU/mes. Estos meses aparecen como N/D y se excluyen de los indicadores; no se imputan ceros.</p>}
      </div>
      <section className="metrics-grid" aria-label="Indicadores del periodo">
        <div className="metric"><span>Unidades observadas</span><strong>{number(summary.totalUnits)}</strong><small>En meses completos</small></div>
        <div className="metric"><span>Promedio mensual</span><strong>{number(summary.average)}</strong><small>{summary.completeMonths} meses completos, incluidos ceros</small></div>
        <div className="metric"><span>Máximo mensual</span><strong>{number(summary.maximum)}</strong><small>{summary.maximumMonths.map(monthLabel).join(' · ') || 'Sin meses completos'}</small></div>
        <div className="metric"><span>Mínimo mensual</span><strong>{number(summary.minimum)}</strong><small>{summary.minimumMonths.map(monthLabel).join(' · ') || 'Sin meses completos'}</small></div>
      </section>
      <section className="data-panel" aria-labelledby="chart-heading"><div className="panel-header"><h2 id="chart-heading">Ventas mensuales observadas</h2><span className="neutral-badge">Unidades</span></div><MonthlyChart monthly={monthly} /><p className="chart-legend"><span>● Mes sin faltantes</span><span className="stockout-key">● Mes con faltantes de inventario</span><span>— Datos incompletos (N/D)</span></p></section>
      <section className="data-panel" aria-labelledby="monthly-heading"><div className="panel-header"><h2 id="monthly-heading">Resumen mensual</h2><span className="neutral-badge">Misma serie del gráfico</span></div><div className="table-scroll" role="region" aria-label="Tabla mensual desplazable" tabIndex={0}><table><caption>Totales de los SKU seleccionados. N/D indica registros incompletos; los subtotales parciales no se presentan como totales.</caption><thead><tr><th scope="col">Mes</th><th scope="col">Unidades</th><th scope="col">Ingresos MXN</th><th scope="col">Costo de unidades vendidas MXN</th><th scope="col">Registros SKU</th><th scope="col">Con promoción</th><th scope="col">Con faltantes</th></tr></thead><tbody>{monthly.map(row => <tr key={row.month} data-month={row.month}><th scope="row">{monthLabel(row.month)}</th><td data-units={row.units ?? 'missing'}>{number(row.units)}</td><td>{money(row.revenueCents)}</td><td>{money(row.acquisitionCents)}</td><td>{row.receivedRecords}/{row.expectedRecords}{!row.complete && ' · Incompleto'}</td><td>{row.promotionRecords}</td><td>{row.stockoutRecords}</td></tr>)}</tbody></table></div></section>
      <section className="data-panel" aria-labelledby="comparison-heading"><div className="panel-header"><h2 id="comparison-heading">Meses equivalentes entre años</h2><span className="neutral-badge">Comparación descriptiva</span></div><div className="table-scroll" role="region" aria-label="Comparación anual desplazable" tabIndex={0}><table><caption>Último año seleccionado frente al anterior, usando únicamente meses dentro del filtro. N/D significa que falta un mes comparable o que la base porcentual es cero.</caption><thead><tr><th scope="col">Mes</th><th scope="col">Año anterior · unidades</th><th scope="col">Año actual · unidades</th><th scope="col">Diferencia · unidades</th><th scope="col">Variación %</th></tr></thead><tbody>{comparisons.map(row => <tr key={row.month}><th scope="row">{monthLabel(row.month)} / {monthLabel(row.previousMonth)}</th><td>{number(row.previous)}</td><td>{number(row.current)}</td><td>{number(row.change)}</td><td>{number(row.percentage)}{row.percentage !== null && ' %'}</td></tr>)}</tbody></table></div></section>
      <section className="data-panel" aria-labelledby="detail-heading"><div className="panel-header"><h2 id="detail-heading">Detalle por SKU y mes</h2><span className="neutral-badge">{rows.length} registros</span></div><div className="table-scroll" role="region" aria-label="Detalle de ventas desplazable" tabIndex={0}><table><caption>Costos y precios unitarios en MXN. Inventario al corte fijo {dataset.inventoryAsOf}, no inventario histórico de cada mes ni existencias en tiempo real. Promoción: indicador mensual. Faltantes: intervalos inclusivos.</caption><thead><tr><th scope="col">Mes</th><th scope="col">SKU / Producto</th><th scope="col">Categoría</th><th scope="col">Unidades</th><th scope="col">Costo adquisición</th><th scope="col">Precio venta</th><th scope="col">Inventario al corte</th><th scope="col">Promoción</th><th scope="col">Faltantes</th></tr></thead><tbody>{pageRows.map((row, index) => <tr key={`${row.sku}-${row.month}-${index}`}><th scope="row">{monthLabel(row.month)}</th><td>{row.sku}<small className="product-name">{productMap.get(row.sku)?.name}</small></td><td>{productMap.get(row.sku)?.category}</td><td>{number(row.units)}</td><td>{money(row.acquisitionCostCents)}</td><td>{money(row.salePriceCents)}</td><td>{productMap.get(row.sku)?.currentInventory}</td><td>{row.promotion ? 'Sí' : 'No'}</td><td>{row.stockouts.length ? <>{stockoutDays(row)} días{row.stockouts.map(period => <small className="product-name" key={period.start}>{period.start} al {period.end}</small>)}</> : 'Sin faltantes'}</td></tr>)}</tbody></table></div><div className="panel-footer pagination"><button disabled={page === 0} onClick={() => setPage(p => p - 1)}>Anterior</button><span aria-live="polite">Página {page + 1} de {Math.ceil(rows.length / pageSize)} · {page * pageSize + 1}–{Math.min((page + 1) * pageSize, rows.length)} de {rows.length}</span><button disabled={(page + 1) * pageSize >= rows.length} onClick={() => setPage(p => p + 1)}>Siguiente</button></div></section>
    </>}
  </div>
}
