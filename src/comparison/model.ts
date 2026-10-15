import { buildPlan, MAX_BUDGET_CENTS } from '../purchases/model'
import type { PlanRow, PurchasePlan, PurchaseRow } from '../purchases/model'

export function safeNumber(value: bigint, label = 'Resultado'): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)) throw new Error(`${label} fuera del rango entero seguro.`)
  return Number(value)
}

/** Moneda exacta también para costo total de necesidad > MAX_SAFE_INTEGER. */
export function formatCents(value: number | bigint | null): string {
  if (value === null) return 'N/D'
  if (typeof value === 'number' && !Number.isSafeInteger(value)) throw new Error('Importe no entero o inseguro.')
  const cents = BigInt(value)
  const absolute = cents < 0n ? -cents : cents
  return `${cents < 0n ? '−' : ''}MXN ${new Intl.NumberFormat('es-MX').format(absolute / 100n)}.${String(absolute % 100n).padStart(2, '0')}`
}

type SummaryFields = 'rows' | 'budgetCents' | 'spentCents' | 'remainingCents' | 'recommendedUnits' | 'eligibleCount' | 'excludedCount' | 'demandUnits' | 'inventoryUnits' | 'needUnits' | 'existingCoveredUnits' | 'coverageUnits' | 'coveragePercent'
export type Strategy = Pick<PurchasePlan, SummaryFields>
export interface Baseline extends Strategy { fullNeedCostCents: bigint; factorNumerator: bigint }

/** Cantidades racionales exactas, floor por SKU; jamás redistribuye el saldo. */
export function buildProportionalBaseline(prepared: readonly PurchaseRow[], budgetCents: number): Baseline {
  if (!Number.isSafeInteger(budgetCents) || budgetCents < 0 || budgetCents > MAX_BUDGET_CENTS) throw new Error('Presupuesto en centavos inválido.')
  const eligible = prepared.filter(row => row.exclusionReasons.length === 0)
  const seen = new Set<string>()
  for (const row of eligible) {
    if (!row.sku || seen.has(row.sku) || ![row.need, row.demand, row.inventory].every(v => v !== null && Number.isSafeInteger(v) && v >= 0) || row.unitCostCents === null || !Number.isSafeInteger(row.unitCostCents) || row.unitCostCents <= 0 || row.need !== Math.max(0, row.demand! - row.inventory!)) throw new Error('Datos elegibles inválidos o inconsistentes.')
    seen.add(row.sku)
  }
  const budget = BigInt(budgetCents)
  const fullNeedCostCents = eligible.reduce((sum, row) => sum + BigInt(row.need!) * BigInt(row.unitCostCents!), 0n)
  const factorNumerator = budget < fullNeedCostCents ? budget : fullNeedCostCents
  let spent = 0n, units = 0n
  const rows: PlanRow[] = prepared.map(row => {
    if (row.exclusionReasons.length) return { ...row, quantity: null, purchaseCostCents: null }
    const q = fullNeedCostCents === 0n ? 0n : BigInt(row.need!) * factorNumerator / fullNeedCostCents
    const cost = q * BigInt(row.unitCostCents!)
    if (q < 0n || q > BigInt(row.need!)) throw new Error('Cantidad baseline fuera de las cotas.')
    spent += cost; units += q
    return { ...row, quantity: safeNumber(q, 'Cantidad baseline'), purchaseCostCents: safeNumber(cost, 'Costo baseline') }
  })
  if (spent > budget) throw new Error('El baseline excede el presupuesto.')
  const demand = eligible.reduce((sum, row) => sum + BigInt(row.demand!), 0n)
  const inventory = eligible.reduce((sum, row) => sum + BigInt(row.inventory!), 0n)
  const need = eligible.reduce((sum, row) => sum + BigInt(row.need!), 0n)
  const existing = eligible.reduce((sum, row) => sum + BigInt(Math.min(row.inventory!, row.demand!)), 0n)
  const demandUnits = safeNumber(demand, 'Demanda total')
  const coverageUnits = safeNumber(existing + units, 'Cobertura total')
  return {
    rows, budgetCents, fullNeedCostCents, factorNumerator,
    spentCents: safeNumber(spent, 'Gasto baseline'), remainingCents: safeNumber(budget - spent, 'Saldo baseline'), recommendedUnits: safeNumber(units, 'Unidades baseline'),
    eligibleCount: eligible.length, excludedCount: prepared.length - eligible.length,
    demandUnits, inventoryUnits: safeNumber(inventory, 'Inventario total'), needUnits: safeNumber(need, 'Necesidad total'), existingCoveredUnits: safeNumber(existing, 'Inventario útil'),
    coverageUnits, coveragePercent: demand === 0n ? null : coverageUnits / demandUnits * 100,
  }
}

/** Defensa adicional: identidad de entradas, factibilidad y objetivos, sin modificar CU-03. */
export function consistencyErrors(optimized: Strategy, baseline: Strategy): string[] {
  const errors: string[] = []
  const same = ['budgetCents', 'eligibleCount', 'excludedCount', 'demandUnits', 'inventoryUnits', 'needUnits', 'existingCoveredUnits'] as const
  if (same.some(key => optimized[key] !== baseline[key])) errors.push('Las estrategias no comparten presupuesto o totales de entrada.')
  const source = (row: PlanRow) => [row.sku, row.name, row.category, row.demand, row.inventory, row.need, row.unitCostCents, row.exclusionReasons, row.stockoutMonths]
  if (JSON.stringify(optimized.rows.map(source)) !== JSON.stringify(baseline.rows.map(source))) errors.push('Las estrategias no comparten los mismos SKU, datos o causas de exclusión.')
  for (const [name, plan] of [['Optimizado', optimized], ['Baseline', baseline]] as const) {
    let spent = 0n, units = 0n, existing = 0n, demand = 0n
    for (const row of plan.rows) {
      if (row.exclusionReasons.length) {
        if (row.quantity !== null || row.purchaseCostCents !== null) errors.push(`${name}: un SKU excluido se convirtió en compra.`)
        continue
      }
      if (row.quantity === null || !Number.isSafeInteger(row.quantity) || row.quantity < 0 || row.need === null || row.quantity > row.need || row.unitCostCents === null || !Number.isSafeInteger(row.unitCostCents) || row.unitCostCents <= 0 || row.demand === null || row.inventory === null) {
        errors.push(`${name}: cantidad o datos no válidos para ${row.sku}.`); continue
      }
      const cost = BigInt(row.quantity) * BigInt(row.unitCostCents)
      if (row.purchaseCostCents === null || !Number.isSafeInteger(row.purchaseCostCents) || BigInt(row.purchaseCostCents) !== cost) errors.push(`${name}: costo de fila inconsistente.`)
      spent += cost; units += BigInt(row.quantity)
      existing += BigInt(Math.min(row.inventory, row.demand)); demand += BigInt(row.demand)
    }
    if (spent > BigInt(plan.budgetCents) || spent !== BigInt(plan.spentCents) || BigInt(plan.remainingCents) !== BigInt(plan.budgetCents) - spent || units !== BigInt(plan.recommendedUnits) || existing + units !== BigInt(plan.coverageUnits) || demand !== BigInt(plan.demandUnits)) errors.push(`${name}: totales o presupuesto inconsistentes.`)
    const percent = demand === 0n ? null : safeNumber(existing + units) / safeNumber(demand) * 100
    if (percent === null ? plan.coveragePercent !== null : plan.coveragePercent === null || Math.abs(plan.coveragePercent - percent) > 1e-9) errors.push(`${name}: porcentaje de cobertura inconsistente.`)
  }
  if (optimized.coverageUnits < baseline.coverageUnits || optimized.recommendedUnits < baseline.recommendedUnits) errors.push('El plan optimizado cubre menos unidades que el baseline válido. No se puede afirmar superioridad.')
  if (optimized.recommendedUnits === baseline.recommendedUnits && optimized.spentCents > baseline.spentCents) errors.push('Empate en unidades con mayor gasto optimizado: objetivo secundario inconsistente.')
  return errors
}

export interface ComparisonRow extends PurchaseRow {
  baselineQuantity: number | null; optimizedQuantity: number | null
  baselineCostCents: number | null; optimizedCostCents: number | null; deltaUnits: number | null
}

export function buildComparison(prepared: readonly PurchaseRow[], budgetCents: number) {
  const optimized = buildPlan(prepared, budgetCents)
  const baseline = buildProportionalBaseline(prepared, budgetCents)
  const errors = consistencyErrors(optimized, baseline)
  const deltaUnits = safeNumber(BigInt(optimized.recommendedUnits) - BigInt(baseline.recommendedUnits))
  const deltaSpentCents = safeNumber(BigInt(optimized.spentCents) - BigInt(baseline.spentCents))
  const deltaCoveragePoints = optimized.demandUnits === 0 ? null : deltaUnits / optimized.demandUnits * 100
  const rows: ComparisonRow[] = prepared.map((row, i) => ({ ...row,
    baselineQuantity: baseline.rows[i].quantity, optimizedQuantity: optimized.rows[i].quantity,
    baselineCostCents: baseline.rows[i].purchaseCostCents, optimizedCostCents: optimized.rows[i].purchaseCostCents,
    deltaUnits: baseline.rows[i].quantity === null || optimized.rows[i].quantity === null ? null : safeNumber(BigInt(optimized.rows[i].quantity!) - BigInt(baseline.rows[i].quantity!)),
  }))
  const explanation = errors.length ? 'Error de consistencia: no se afirma superioridad de ninguna estrategia.'
    : optimized.eligibleCount === 0 ? 'No hay SKU elegibles para comparar. Revisa las causas de exclusión.'
      : deltaUnits > 0 ? `El optimizado cubre ${deltaUnits} unidades adicionales de demanda pronosticada. Prioriza unidades de menor costo; el baseline aplica la misma fracción a cada necesidad, redondea hacia abajo y no redistribuye el saldo.`
        : deltaSpentCents < 0 ? 'Empate en unidades cubiertas. El optimizado utiliza menos gasto en este modelo; no hay mejora de cobertura.'
          : 'Empate: ambas estrategias compran las mismas unidades totales y tienen el mismo gasto. No hay diferencia de cobertura.'
  return { optimized, baseline, rows, errors, deltaUnits, deltaSpentCents, deltaCoveragePoints, explanation }
}
export type Comparison = ReturnType<typeof buildComparison>

/** Vista de filas ya comparadas, sin recalcular estrategias ni presupuesto. */
export function filterComparisonRows(rows: readonly ComparisonRow[], filters: { sku: string; category: string }) {
  return rows.filter(row => (!filters.sku || row.sku === filters.sku) && (!filters.category || row.category === filters.category))
}
