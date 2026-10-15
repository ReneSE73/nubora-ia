import type { Dataset } from '../history/data'
import { forecastProduct, TARGET_MONTHS } from '../forecast/engine'

export const INVENTORY_DATE = '2025-12-31'
export const MAX_BUDGET_CENTS = 1_000_000_000_000
export interface PurchaseItem { sku: string; need: number; unitCostCents: number }
export interface Allocation extends PurchaseItem { quantity: number; purchaseCostCents: number }
export interface PurchaseRow {
  sku: string
  name: string
  category: string
  demand: number | null
  inventory: number | null
  need: number | null
  unitCostCents: number | null
  stockoutMonths: string[]
  exclusionReasons: string[]
}
export interface PlanRow extends PurchaseRow { quantity: number | null; purchaseCostCents: number | null }
const skuOrder = (a: { sku: string }, b: { sku: string }) => a.sku < b.sku ? -1 : a.sku > b.sku ? 1 : 0
const nonnegativeInteger = (value: number) => Number.isSafeInteger(value) && value >= 0

/** Formato decimal, sin separadores de miles. Conversión textual exacta, sin parseFloat. */
export function parseBudget(input: string): { valid: true; cents: number } | { valid: false; error: string } {
  const text = input.trim()
  if (text.length > 32 || !/^\d+(?:[.,]\d{1,2})?$/.test(text)) {
    return { valid: false, error: 'Ingresa un monto no negativo con hasta dos decimales, sin separadores de miles.' }
  }
  const [pesos, fraction = ''] = text.replace(',', '.').split('.')
  const cents = BigInt(pesos) * 100n + BigInt(fraction.padEnd(2, '0'))
  if (cents > BigInt(MAX_BUDGET_CENTS)) return { valid: false, error: 'El presupuesto máximo admitido es MXN 10,000,000,000.00.' }
  return { valid: true, cents: Number(cents) }
}

/**
 * Exacto para valor unitario uniforme (=1), costos positivos y sólo cotas por SKU.
 * Las K unidades más baratas minimizan el gasto para cualquier K. Si la siguiente
 * no cabe, ninguna solución de K+1 cabe. Orden: costo ascendente y SKU ordinal.
 * Se asignan bloques, no se expande cada unidad. O(n log n), memoria O(n), sin DP.
 * BigInt garantiza división entera exacta; gastos publicados <= presupuesto seguro.
 */
export function solvePurchases(items: readonly PurchaseItem[], budgetCents: number) {
  if (!nonnegativeInteger(budgetCents) || budgetCents > MAX_BUDGET_CENTS) throw new Error('Presupuesto en centavos inválido.')
  const seen = new Set<string>()
  for (const item of items) {
    if (seen.has(item.sku) || !item.sku || !nonnegativeInteger(item.need) || !Number.isSafeInteger(item.unitCostCents) || item.unitCostCents <= 0) {
      throw new Error('SKU duplicado o datos de optimización inválidos.')
    }
    seen.add(item.sku)
  }
  const ordered = [...items].sort((a, b) => a.unitCostCents - b.unitCostCents || skuOrder(a, b))
  let remaining = BigInt(budgetCents)
  const allocations: Allocation[] = ordered.map(item => {
    const affordable = remaining / BigInt(item.unitCostCents)
    const quantity = Number(affordable < BigInt(item.need) ? affordable : BigInt(item.need))
    const cost = BigInt(quantity) * BigInt(item.unitCostCents)
    remaining -= cost
    return { ...item, quantity, purchaseCostCents: Number(cost) }
  })
  const recommendedUnits = allocations.reduce((sum, row) => sum + row.quantity, 0)
  const nextUnitCostCents = allocations.find(row => row.quantity < row.need)?.unitCostCents ?? null
  return {
    allocations, budgetCents, spentCents: budgetCents - Number(remaining), remainingCents: Number(remaining), recommendedUnits,
    nextUnitCostCents, allNeedCovered: allocations.every(row => row.quantity === row.need),
  }
}

/** Se reutiliza CU-02, con el mismo dataset; no se reconstruye ningún pronóstico. */
export function preparePurchaseData(dataset: Dataset): PurchaseRow[] {
  const counts = new Map<string, number>()
  dataset.products.forEach(product => counts.set(product.sku, (counts.get(product.sku) ?? 0) + 1))
  return dataset.products.map(product => {
    const exclusionReasons: string[] = []
    if (counts.get(product.sku) !== 1 || !product.sku) exclusionReasons.push('SKU de catálogo duplicado o vacío.')
    const prediction = forecastProduct(dataset, product.sku)
    const validForecast = prediction.method !== null && prediction.forecast.length === 3 && prediction.forecast.every((point, i) => point.month === TARGET_MONTHS[i] && point.units !== null && nonnegativeInteger(point.units))
    const total = validForecast ? prediction.forecast.reduce((sum, point) => sum + point.units!, 0) : null
    const demand = total !== null && nonnegativeInteger(total) ? total : null
    if (demand === null) exclusionReasons.push('Pronóstico N/D, incompleto o fuera del rango entero seguro (CU-02).')
    const inventory = dataset.inventoryAsOf === INVENTORY_DATE && nonnegativeInteger(product.currentInventory) ? product.currentInventory : null
    if (inventory === null) exclusionReasons.push('Inventario inválido o sin corte 2025-12-31.')
    const december = dataset.sales.filter(row => row.sku === product.sku && row.month === '2025-12')
    const validCost = december.length === 1 && nonnegativeInteger(december[0].units) && Number.isSafeInteger(december[0].acquisitionCostCents) && december[0].acquisitionCostCents > 0
    const unitCostCents = validCost ? december[0].acquisitionCostCents : null
    if (unitCostCents === null) exclusionReasons.push('Costo de adquisición de diciembre 2025 ausente, duplicado o inválido (debe ser entero positivo en centavos).')
    return {
      sku: product.sku, name: product.name, category: product.category,
      demand, inventory, need: demand !== null && inventory !== null ? Math.max(0, demand - inventory) : null,
      unitCostCents, stockoutMonths: prediction.stockoutMonths, exclusionReasons,
    }
  }).sort(skuOrder)
}

export function buildPlan(prepared: readonly PurchaseRow[], budgetCents: number) {
  const eligible = prepared.filter(row => row.exclusionReasons.length === 0)
  const solution = solvePurchases(eligible.map(row => ({ sku: row.sku, need: row.need!, unitCostCents: row.unitCostCents! })), budgetCents)
  const bySku = new Map(solution.allocations.map(row => [row.sku, row]))
  const rows: PlanRow[] = prepared.map(row => ({ ...row,
    quantity: row.exclusionReasons.length ? null : bySku.get(row.sku)!.quantity,
    purchaseCostCents: row.exclusionReasons.length ? null : bySku.get(row.sku)!.purchaseCostCents,
  }))
  const demandUnits = eligible.reduce((sum, row) => sum + row.demand!, 0)
  const inventoryUnits = eligible.reduce((sum, row) => sum + row.inventory!, 0)
  const needUnits = eligible.reduce((sum, row) => sum + row.need!, 0)
  const existingCoveredUnits = eligible.reduce((sum, row) => sum + Math.min(row.inventory!, row.demand!), 0)
  // Los enteros individuales seguros no bastan para garantizar totales seguros.
  if (![demandUnits, inventoryUnits, needUnits, existingCoveredUnits].every(nonnegativeInteger)) throw new Error('Los totales del catálogo exceden el rango entero seguro.')
  return {
    ...solution, rows, eligibleCount: eligible.length, excludedCount: prepared.length - eligible.length,
    demandUnits, inventoryUnits, needUnits, existingCoveredUnits,
    coverageUnits: existingCoveredUnits + solution.recommendedUnits,
    coveragePercent: demandUnits === 0 ? null : (existingCoveredUnits + solution.recommendedUnits) / demandUnits * 100,
  }
}
export type PurchasePlan = ReturnType<typeof buildPlan>

/** Sólo presentación; no asigna presupuesto ni vuelve a calcular el plan global. */
export function filterPlanRows(rows: readonly PlanRow[], filters: { sku: string; category: string }): PlanRow[] {
  return rows.filter(row => (!filters.sku || row.sku === filters.sku) && (!filters.category || row.category === filters.category))
}
