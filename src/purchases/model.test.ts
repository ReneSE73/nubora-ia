import { describe, expect, it } from 'vitest'
import { createDataset } from '../history/data'
import { forecastProduct } from '../forecast/engine'
import { buildPlan, filterPlanRows, MAX_BUDGET_CENTS, parseBudget, preparePurchaseData, solvePurchases } from './model'
import type { PurchaseItem, PurchaseRow } from './model'

// Oráculo sólo para fixtures pequeños (3 SKU, necesidad <=3, <=64 combinaciones).
function bruteForce(items: PurchaseItem[], budget: number) {
  let bestUnits = -1, bestCost = Infinity
  function visit(i: number, units: number, cost: number) {
    if (cost > budget) return
    if (i === items.length) {
      if (units > bestUnits || (units === bestUnits && cost < bestCost)) { bestUnits = units; bestCost = cost }
      return
    }
    for (let x = 0; x <= items[i].need; x++) visit(i + 1, units + x, cost + x * items[i].unitCostCents)
  }
  visit(0, 0, 0)
  return { units: bestUnits, cost: bestCost }
}
const items: PurchaseItem[] = [
  { sku: 'C', need: 3, unitCostCents: 303 },
  { sku: 'A', need: 2, unitCostCents: 101 },
  { sku: 'B', need: 4, unitCostCents: 202 },
]
const preparedRow = (sku: string, demand: number, inventory: number, cost: number): PurchaseRow => ({
  sku, name: sku, category: 'Prueba', demand, inventory, need: Math.max(0, demand - inventory), unitCostCents: cost, stockoutMonths: [], exclusionReasons: [],
})

describe('Presupuesto decimal exacto', () => {
  it.each([['0', 0], ['0.29', 29], ['1,23', 123], [' 25000.50 ', 2500050], ['0002.1', 210], ['10000000000.00', MAX_BUDGET_CENTS]])('convierte %s sin redondear costos', (input, expected) => {
    expect(parseBudget(String(input))).toEqual({ valid: true, cents: expected })
  })
  it.each(['', '-1', '+1', '1e3', 'Infinity', 'NaN', '1.005', '1,234.56', '10000000000.01', '9'.repeat(40)])('rechaza %s en vez de asumir cero', input => {
    expect(parseBudget(input).valid).toBe(false)
  })
})

describe('Optimización exacta por bloques', () => {
  it('presupuesto cero recomienda exactamente cero', () => {
    const plan = solvePurchases(items, 0)
    expect(plan.recommendedUnits).toBe(0)
    expect(plan.spentCents).toBe(0)
    expect(plan.remainingCents).toBe(0)
    expect(plan.allocations.every(row => row.quantity === 0)).toBe(true)
  })
  it('presupuesto insuficiente para una unidad conserva el saldo', () => {
    expect(solvePurchases(items, 100)).toMatchObject({ recommendedUnits: 0, spentCents: 0, remainingCents: 100, nextUnitCostCents: 101 })
  })
  it('presupuesto suficiente compra toda la necesidad sin excedentes', () => {
    const total = items.reduce((sum, item) => sum + item.need * item.unitCostCents, 0)
    const plan = solvePurchases(items, total + 777)
    expect(plan.allocations.every(row => row.quantity === row.need)).toBe(true)
    expect(plan).toMatchObject({ recommendedUnits: 9, spentCents: total, remainingCents: 777, allNeedCovered: true, nextUnitCostCents: null })
  })
  it('respeta centavos y gasto secundario, sin agotar presupuesto a la fuerza', () => {
    const plan = solvePurchases([{ sku: 'A', need: 4, unitCostCents: 33 }], 100)
    expect(plan).toMatchObject({ recommendedUnits: 3, spentCents: 99, remainingCents: 1 })
    const sameCoverage = solvePurchases([{ sku: 'Caro', need: 1, unitCostCents: 70 }, { sku: 'Barato', need: 1, unitCostCents: 60 }], 100)
    expect(sameCoverage).toMatchObject({ recommendedUnits: 1, spentCents: 60, remainingCents: 40 })
  })
  it('coincide con fuerza bruta para cobertura máxima y mínimo gasto', () => {
    for (const costs of [[1, 2, 3], [2, 2, 3], [7, 3, 2]]) {
      for (let a = 0; a <= 3; a++) for (let b = 0; b <= 3; b++) for (let c = 0; c <= 3; c++) {
        const small = [a, b, c].map((need, i) => ({ sku: String(i), need, unitCostCents: costs[i] }))
        const fullCost = small.reduce((sum, item) => sum + item.need * item.unitCostCents, 0)
        for (let budget = 0; budget <= fullCost + 1; budget++) {
          const exact = solvePurchases(small, budget)
          const brute = bruteForce(small, budget)
          expect([exact.recommendedUnits, exact.spentCents]).toEqual([brute.units, brute.cost])
        }
      }
    }
  })
  it('cumple cotas enteras y restricción presupuestaria en todos los presupuestos pequeños', () => {
    for (let budget = 0; budget <= 2000; budget += 7) {
      const plan = solvePurchases(items, budget)
      expect(plan.spentCents).toBeLessThanOrEqual(budget)
      expect(plan.spentCents + plan.remainingCents).toBe(budget)
      expect(plan.spentCents).toBe(plan.allocations.reduce((sum, row) => sum + row.quantity * row.unitCostCents, 0))
      expect(plan.allocations.every(row => Number.isInteger(row.quantity) && row.quantity >= 0 && row.quantity <= row.need)).toBe(true)
      if (plan.nextUnitCostCents !== null) expect(plan.remainingCents).toBeLessThan(plan.nextUnitCostCents)
    }
  })
  it('desempata por SKU ordinal sin depender del orden de entrada ni mutarlo', () => {
    const tie = [{ sku: 'SKU-2', need: 2, unitCostCents: 5 }, { sku: 'SKU-10', need: 2, unitCostCents: 5 }]
    const snapshot = JSON.stringify(tie)
    const plan = solvePurchases(tie, 15)
    expect(plan.allocations.map(row => [row.sku, row.quantity])).toEqual([['SKU-10', 2], ['SKU-2', 1]])
    expect(solvePurchases([...tie].reverse(), 15)).toEqual(plan)
    expect(JSON.stringify(tie)).toBe(snapshot)
  })
  it('procesa presupuestos grandes sin DP ni expandir unidades', () => {
    const plan = solvePurchases([{ sku: 'A', need: Number.MAX_SAFE_INTEGER, unitCostCents: 1 }], MAX_BUDGET_CENTS)
    expect(plan.recommendedUnits).toBe(MAX_BUDGET_CENTS)
    expect(plan.spentCents).toBe(MAX_BUDGET_CENTS)
  })
  it.each([-1, 0.5, NaN, Infinity, MAX_BUDGET_CENTS + 1])('rechaza presupuesto interno inválido %s', budget => {
    expect(() => solvePurchases(items, budget)).toThrow('Presupuesto')
  })
  it('rechaza SKU duplicado, necesidad no entera y costos no positivos o fraccionarios', () => {
    expect(() => solvePurchases([items[0], items[0]], 10)).toThrow()
    for (const cost of [0, -1, 1.5, NaN, Infinity]) expect(() => solvePurchases([{ sku: 'A', need: 1, unitCostCents: cost }], 100)).toThrow()
    expect(() => solvePurchases([{ sku: 'A', need: 1.5, unitCostCents: 1 }], 100)).toThrow()
  })
})

describe('Integración con datos de CU-01 y pronósticos de CU-02', () => {
  it('reutiliza los 20 pronósticos, inventarios al corte y costos de diciembre exactos', () => {
    const dataset = createDataset()
    const original = JSON.stringify(dataset)
    const prepared = preparePurchaseData(dataset)
    expect(prepared).toHaveLength(20)
    for (const row of prepared) {
      expect(row.demand).toBe(forecastProduct(dataset, row.sku).forecast.reduce((sum, p) => sum + p.units!, 0))
      expect(row.inventory).toBe(dataset.products.find(p => p.sku === row.sku)!.currentInventory)
      expect(row.unitCostCents).toBe(dataset.sales.find(s => s.sku === row.sku && s.month === '2025-12')!.acquisitionCostCents)
      expect(row.need).toBe(Math.max(0, row.demand! - row.inventory!))
    }
    const plan = buildPlan(prepared, 2500000)
    expect(plan.eligibleCount).toBe(20)
    expect(plan.coveragePercent).toBeLessThanOrEqual(100)
    expect(plan.spentCents).toBeLessThanOrEqual(plan.budgetCents)
    expect(JSON.stringify(dataset)).toBe(original)
  })
  it('no transfiere inventario excedente entre SKU y limita la cobertura por demanda', () => {
    const data = [preparedRow('A', 5, 100, 20), preparedRow('B', 5, 0, 20)]
    const plan = buildPlan(data, 0)
    expect(plan).toMatchObject({ demandUnits: 10, inventoryUnits: 100, needUnits: 5, coverageUnits: 5, coveragePercent: 50 })
    expect(plan.rows[0].quantity).toBe(0)
    expect(buildPlan(data, 100).coveragePercent).toBe(100)
    expect(buildPlan([preparedRow('A', 0, 100, 20)], 100).coveragePercent).toBeNull()
  })
  it('excluye historia incompleta y no convierte pronóstico N/D en cero', () => {
    const dataset = createDataset(); dataset.sales.shift()
    const plan = buildPlan(preparePurchaseData(dataset), 100000)
    expect(plan.excludedCount).toBe(1)
    expect(plan.rows[0]).toMatchObject({ demand: null, need: null, quantity: null, purchaseCostCents: null })
    expect(plan.rows[0].exclusionReasons.join(' ')).toContain('Pronóstico N/D')
    expect(plan.allocations.some(row => row.sku === 'SKU-001')).toBe(false)
  })
  it.each([0, -100, 1.5, NaN, Infinity])('excluye costo histórico inválido %s sin alterar el pronóstico', cost => {
    const dataset = createDataset()
    dataset.sales.find(row => row.sku === 'SKU-001' && row.month === '2025-12')!.acquisitionCostCents = cost
    const row = buildPlan(preparePurchaseData(dataset), 10000).rows[0]
    expect(row.demand).not.toBeNull()
    expect(row.unitCostCents).toBeNull()
    expect(row.quantity).toBeNull()
    expect(row.exclusionReasons.join(' ')).toContain('Costo de adquisición')
  })
  it.each(['missing', 'duplicate'])('excluye registro diciembre %s', mode => {
    const dataset = createDataset()
    const december = dataset.sales.find(row => row.sku === 'SKU-001' && row.month === '2025-12')!
    if (mode === 'missing') dataset.sales = dataset.sales.filter(row => row !== december)
    else dataset.sales.push({ ...december })
    const row = preparePurchaseData(dataset)[0]
    expect(row.unitCostCents).toBeNull()
    expect(row.exclusionReasons.join(' ')).toContain('Costo de adquisición')
  })
  it('excluye inventario inválido, corte incorrecto y SKU de catálogo duplicado', () => {
    const invalid = createDataset(); invalid.products[0].currentInventory = -1
    expect(preparePurchaseData(invalid)[0].inventory).toBeNull()
    const wrongDate = createDataset(); wrongDate.inventoryAsOf = '2026-01-01'
    expect(buildPlan(preparePurchaseData(wrongDate), 100).excludedCount).toBe(20)
    const duplicate = createDataset(); duplicate.products.push({ ...duplicate.products[0] })
    expect(preparePurchaseData(duplicate).filter(row => row.sku === 'SKU-001').every(row => row.exclusionReasons.length > 0)).toBe(true)
  })
  it('filtros son sólo una vista del plan global y no reasignan recursos', () => {
    const plan = buildPlan(preparePurchaseData(createDataset()), 2500000)
    const snapshot = JSON.stringify(plan)
    expect(filterPlanRows(plan.rows, { sku: '', category: 'Hogar' })).toHaveLength(5)
    const one = filterPlanRows(plan.rows, { sku: 'SKU-001', category: 'Despensa' })
    expect(one).toHaveLength(1)
    expect(one[0]).toBe(plan.rows[0])
    expect(filterPlanRows(plan.rows, { sku: 'SKU-001', category: 'Hogar' })).toEqual([])
    expect(JSON.stringify(plan)).toBe(snapshot)
  })
  it('es determinista ante otra generación y reordenamiento de datos', () => {
    const dataset = createDataset()
    const first = buildPlan(preparePurchaseData(dataset), 1234567)
    expect(buildPlan(preparePurchaseData(createDataset()), 1234567)).toEqual(first)
    const reordered = { ...dataset, products: [...dataset.products].reverse(), sales: [...dataset.sales].reverse() }
    expect(buildPlan(preparePurchaseData(reordered), 1234567)).toEqual(first)
  })
})
