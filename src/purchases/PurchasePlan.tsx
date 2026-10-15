import { useMemo, useState } from 'react'
import { demoDataset } from '../history/data'
import type { Dataset } from '../history/data'
import { monthLabel } from '../history/analysis'
import { formatMXN } from '../currency'
import { buildPlan, filterPlanRows, parseBudget, preparePurchaseData } from './model'
import PurchaseChart from './PurchaseChart'

const quantity = (value: number | null) => value === null ? 'N/D' : new Intl.NumberFormat('es-MX', { maximumFractionDigits: 1 }).format(value)
const money = (cents: number | null) => cents === null ? 'N/D' : formatMXN(cents / 100)

export default function PurchasePlan({ dataset = demoDataset }: { dataset?: Dataset }) {
  const [budget, setBudget] = useState('25000.00')
  const [sku, setSku] = useState('')
  const [category, setCategory] = useState('')
  const parsed = parseBudget(budget)
  const cents = parsed.valid ? parsed.cents : null
  const prepared = useMemo(() => preparePurchaseData(dataset), [dataset])
  // Los filtros de presentación NO son dependencias del plan ni del entrenamiento.
  const calculation = useMemo(() => {
    if (cents === null) return { plan: null, error: null }
    try { return { plan: buildPlan(prepared, cents), error: null } }
    catch (error) { return { plan: null, error: error instanceof Error ? error.message : 'No se pudo verificar el modelo.' } }
  }, [prepared, cents])
  const { plan } = calculation
  const visible = plan ? filterPlanRows(plan.rows, { sku, category }) : []
  const excluded = prepared.filter(row => row.exclusionReasons.length > 0)
  const stockouts = prepared.filter(row => row.stockoutMonths.length > 0)
  return <div className="history purchases">
    <section className="intro-card" aria-label="Plan de compra demostrativo"><div className="intro-icon" aria-hidden="true">▤</div><div><h2>DEMOSTRATIVO · Compra bajo presupuesto</h2><p>Recomendación matemática orientativa para enero–marzo de 2026. Usa los pronósticos de CU-02 y las existencias al corte 2025-12-31. No ejecuta compras reales.</p></div><span className="step-label">CU-03</span></section>
    <section className="data-panel purchases-input" aria-label="Presupuesto global"><label htmlFor="purchase-budget">Presupuesto global en MXN</label><input id="purchase-budget" type="text" inputMode="decimal" maxLength={32} value={budget} aria-describedby="purchase-budget-help" aria-invalid={!parsed.valid} onChange={event => setBudget(event.target.value)} /><p id="purchase-budget-help">Monto no negativo, hasta dos decimales y sin separadores de miles (ejemplo: 25000.50). Máximo MXN 10,000,000,000.00. Se convierte exactamente a centavos.</p><p><strong>El presupuesto es global para los {dataset.products.length} SKU del catálogo.</strong> Cambiarlo recalcula el plan completo; filtrar SKU o categoría sólo cambia la presentación.</p></section>
    {!parsed.valid && <p className="analysis-warning" role="alert">Presupuesto inválido: {parsed.error} No se muestra una recomendación anterior ni se asume presupuesto cero.</p>}
    {calculation.error && <p className="analysis-warning" role="alert">Sin solución verificable: {calculation.error}</p>}
    <div className="analysis-notices"><p className="analysis-warning"><strong>Datos sintéticos y costos históricos de referencia.</strong> El costo unitario procede del registro válido de diciembre de 2025, en centavos MXN; no es una cotización futura. Las existencias no son inventario en tiempo real.</p><p className="analysis-warning"><strong>Ventas observadas ≠ demanda real.</strong> {stockouts.length ? 'Hubo stockouts (faltantes de inventario) en el historial; los pronósticos pueden subestimar la demanda. ' : ''}No se inventan ventas perdidas. Se simplifica todo el trimestre como un horizonte acumulado: se supone compra disponible al inicio, sin fechas de reposición, plazos, impuestos adicionales, fletes, mínimos de proveedor ni transferencias entre SKU.</p></div>
    {excluded.length > 0 && <section className="data-panel purchases-exclusions" aria-label="SKU excluidos"><h2>SKU excluidos ({excluded.length})</h2><p>La optimalidad y los totales se refieren únicamente a los SKU elegibles. N/D no equivale a cero.</p><ul>{excluded.map((row, i) => <li key={`${row.sku}-${i}`}><strong>{row.sku || 'SKU vacío'}:</strong> {row.exclusionReasons.join(' ')}</li>)}</ul></section>}
    {plan && <>
      <p role="status" className="analysis-context">Plan global: {plan.eligibleCount} SKU elegibles · {plan.excludedCount} excluidos · {visible.length} filas visibles. Los totales globales no cambian al filtrar.</p>
      <section className="metrics-grid" aria-label="Resumen global del plan">
        <div className="metric"><span>Presupuesto global</span><strong>{money(plan.budgetCents)}</strong><small>MXN, todos los SKU elegibles</small></div>
        <div className="metric"><span>Presupuesto utilizado</span><strong>{money(plan.spentCents)}</strong><small>Costos enteros, sin exceder presupuesto</small></div>
        <div className="metric"><span>Presupuesto restante</span><strong>{money(plan.remainingCents)}</strong><small>Saldo global, no saldo de la vista</small></div>
        <div className="metric"><span>Unidades recomendadas</span><strong>{quantity(plan.recommendedUnits)}</strong><small>Unidades adicionales cubiertas</small></div>
        <div className="metric"><span>Demanda pronosticada</span><strong>{quantity(plan.demandUnits)}</strong><small>Suma enero–marzo 2026 · CU-02</small></div>
        <div className="metric"><span>Inventario disponible</span><strong>{quantity(plan.inventoryUnits)}</strong><small>Corte 2025-12-31 · SKU elegibles</small></div>
        <div className="metric"><span>Necesidad acumulada</span><strong>{quantity(plan.needUnits)}</strong><small>Suma max(0, demanda − inventario) por SKU</small></div>
        <div className="metric"><span>Cobertura estimada</span><strong>{quantity(plan.coveragePercent)}{plan.coveragePercent !== null && ' %'}</strong><small>{quantity(plan.coverageUnits)} de {quantity(plan.demandUnits)} unidades; inventario útil + compra. Sin demanda: N/D.</small></div>
      </section>
      <details className="data-panel purchases-method" open><summary>{plan.eligibleCount ? 'Solución óptima para el modelo definido · Justificación' : 'Sin SKU elegibles · Modelo definido'}</summary><div><p><strong>Objetivo primario:</strong> maximizar Σ xᵢ (unidades adicionales de demanda pronosticada cubiertas). <strong>Secundario:</strong> minimizar Σ xᵢcᵢ entre planes con igual cobertura. No se ponderan márgenes, ingresos ni prioridades comerciales.</p><p>Restricciones: xᵢ entero, 0 ≤ xᵢ ≤ necesidadᵢ, y Σ xᵢcᵢ ≤ presupuesto. Necesidadᵢ = max(0, suma del pronóstico de los tres meses − inventarioᵢ).</p><p><strong>Algoritmo exacto:</strong> ordenar por costo unitario ascendente; ante igual costo, SKU ascendente por código de caracteres. Asignar a cada SKU min(necesidad, saldo / costo con división entera). Se procesan bloques, sin expandir unidades. Tiempo O(n log n), memoria O(n), independientes del presupuesto.</p><p><strong>Prueba de optimalidad:</strong> para cualquier K, las K unidades más baratas tienen el menor gasto posible. Intercambiar una unidad más cara por una disponible más barata mantiene cobertura y reduce gasto. El plan compra ese prefijo hasta que no cabe la siguiente unidad. Entonces K+1 unidades son inviables y el gasto para K es mínimo. Los costos iguales se desempatan por SKU, sin aleatoriedad.</p><p><strong>Comprobación:</strong> {plan.recommendedUnits} unidades, gasto {money(plan.spentCents)} ≤ presupuesto {money(plan.budgetCents)}; saldo {money(plan.remainingCents)}. {plan.nextUnitCostCents === null ? 'Se cubre exactamente toda la necesidad elegible, sin excedentes.' : `La unidad pendiente más barata cuesta ${money(plan.nextUnitCostCents)} y supera el saldo. El presupuesto no permite cubrir una unidad adicional.`}</p></div></details>
      <section className="data-panel filters-panel" aria-label="Filtros de visualización del plan"><div className="purchases-filters"><label>SKU<select value={sku} onChange={event => setSku(event.target.value)}><option value="">Todos los SKU</option>{[...new Set(prepared.map(row => row.sku))].map(value => <option key={value}>{value}</option>)}</select></label><label>Categoría<select value={category} onChange={event => setCategory(event.target.value)}><option value="">Todas las categorías</option>{[...new Set(prepared.map(row => row.category))].sort().map(value => <option key={value}>{value}</option>)}</select></label></div><button className="reset-button" onClick={() => { setSku(''); setCategory('') }}>Restablecer filtros de visualización</button></section>
      {!visible.length ? <section className="data-panel empty-state"><h2>Sin SKU para esta vista</h2><p>La combinación SKU/categoría no coincide. El plan y el presupuesto global permanecen intactos.</p></section> : <>
        <section className="data-panel" aria-labelledby="purchase-chart-heading"><div className="panel-header"><h2 id="purchase-chart-heading">Necesidad frente a compra recomendada</h2><span className="neutral-badge">Sólo SKU visibles</span></div><PurchaseChart rows={visible} /><p className="chart-legend"><span>▧ Necesidad · claro discontinuo</span><span>■ Compra recomendada · verde sólido</span><span>N/D · Excluido</span></p></section>
        <section className="data-panel" aria-labelledby="purchase-table-heading"><div className="panel-header"><h2 id="purchase-table-heading">Cantidades recomendadas por SKU</h2><span className="neutral-badge">DEMOSTRATIVO · Vista filtrada</span></div><div className="table-scroll" role="region" aria-label="Tabla del plan de compra desplazable" tabIndex={0}><table><caption>Costos de referencia de diciembre 2025 en MXN. Inventario al corte 2025-12-31. Las filas visibles no reasignan el presupuesto global. Los SKU excluidos conservan N/D en cantidad y gasto.</caption><thead><tr><th scope="col">SKU / Producto</th><th scope="col">Categoría</th><th scope="col">Demanda ene–mar</th><th scope="col">Inventario</th><th scope="col">Necesidad</th><th scope="col">Costo unitario</th><th scope="col">Cantidad recomendada</th><th scope="col">Costo de compra</th><th scope="col">Estado</th></tr></thead><tbody>{visible.map((row, i) => <tr key={`${row.sku}-${i}`} data-sku={row.sku} data-need={row.need ?? 'missing'} data-quantity={row.quantity ?? 'missing'}><th scope="row">{row.sku}<small className="product-name">{row.name}</small></th><td>{row.category}</td><td>{quantity(row.demand)}</td><td>{quantity(row.inventory)}</td><td>{quantity(row.need)}</td><td>{money(row.unitCostCents)}</td><td>{quantity(row.quantity)}</td><td>{money(row.purchaseCostCents)}</td><td>{row.exclusionReasons.length ? row.exclusionReasons.join(' ') : row.stockoutMonths.length ? 'Elegible · historial con faltantes' : 'Elegible'}</td></tr>)}</tbody></table></div></section>
      </>}
    </>}
    <details className="data-panel purchases-method"><summary>Periodos históricos afectados por stockouts ({stockouts.length} SKU)</summary><div>{stockouts.length ? <ul>{stockouts.map((row, i) => <li key={`${row.sku}-${i}`}><strong>{row.sku}:</strong> {row.stockoutMonths.map(monthLabel).join(', ')}.</li>)}</ul> : <p>Sin faltantes registrados en este dataset.</p>}</div></details>
  </div>
}
