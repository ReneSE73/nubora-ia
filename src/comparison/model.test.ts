import { describe, expect, it } from 'vitest'
import { createDataset } from '../history/data'
import { buildPlan, MAX_BUDGET_CENTS, preparePurchaseData } from '../purchases/model'
import type { PurchaseRow } from '../purchases/model'
import { buildComparison, buildProportionalBaseline, consistencyErrors, filterComparisonRows, formatCents, safeNumber } from './model'

const row = (sku: string, need: number, cost: number, inventory = 0): PurchaseRow => ({
  sku, name: sku, category: 'Prueba', demand: need + inventory, inventory, need, unitCostCents: cost, stockoutMonths: [], exclusionReasons: [],
})

describe('Baseline proporcional exacto', () => {
  it('cero presupuesto compra cero y conserva cobertura del inventario útil', () => {
    const data = [row('A', 4, 33, 2), row('B', 3, 47, 1)]
    const result = buildComparison(data, 0)
    expect(result.baseline).toMatchObject({ recommendedUnits: 0, spentCents: 0, remainingCents: 0, coverageUnits: 3, demandUnits: 10 })
    expect(result.optimized.recommendedUnits).toBe(0)
    expect(result.errors).toEqual([])
    expect(result.explanation).toContain('Empate')
  })
  it('presupuesto menor que el costo de una unidad no fuerza compras', () => {
    expect(buildProportionalBaseline([row('A', 10, 100)], 99)).toMatchObject({ recommendedUnits: 0, spentCents: 0, remainingCents: 99 })
  })
  it('presupuesto suficiente compra exactamente toda la necesidad', () => {
    const result = buildComparison([row('A', 2, 33), row('B', 3, 47)], 1000)
    expect(result.baseline).toMatchObject({ fullNeedCostCents: 207n, factorNumerator: 207n, recommendedUnits: 5, spentCents: 207, remainingCents: 793, coveragePercent: 100 })
    expect(result.deltaUnits).toBe(0); expect(result.deltaSpentCents).toBe(0)
    expect(result.explanation).toContain('Empate')
  })
  it('usa floor exacto y no redistribuye saldo aunque alcance para otra unidad', () => {
    const result = buildComparison([row('A', 2, 33), row('B', 3, 47)], 100)
    expect(result.baseline.rows.map(r => r.quantity)).toEqual([0, 1])
    expect(result.baseline).toMatchObject({ spentCents: 47, remainingCents: 53, recommendedUnits: 1, coverageUnits: 1, coveragePercent: 20 })
    expect(result.optimized).toMatchObject({ recommendedUnits: 2, spentCents: 66, remainingCents: 34 })
    expect(result).toMatchObject({ deltaUnits: 1, deltaSpentCents: 19, deltaCoveragePoints: 20, errors: [] })
    expect(result.rows.map(r => r.deltaUnits)).toEqual([2, -1])
  })
  it('necesidad cero evita división por cero; demanda cero muestra N/D', () => {
    const data = [{ ...row('A', 0, 100), demand: 10, inventory: 15 }]
    expect(buildProportionalBaseline(data, 1000)).toMatchObject({ fullNeedCostCents: 0n, factorNumerator: 0n, recommendedUnits: 0, spentCents: 0, coveragePercent: 100 })
    const emptyDemand = buildComparison([row('A', 0, 100)], 1000)
    expect(emptyDemand.baseline.coveragePercent).toBeNull()
    expect(emptyDemand.optimized.coveragePercent).toBeNull()
    expect(emptyDemand.deltaCoveragePoints).toBeNull()
    expect(emptyDemand.errors).toEqual([])
  })
  it('mantiene costo total y productos racionales mayores que MAX_SAFE_INTEGER en BigInt', () => {
    const huge = buildProportionalBaseline([row('A', 1_000_000_000, Number.MAX_SAFE_INTEGER)], MAX_BUDGET_CENTS)
    expect(huge.fullNeedCostCents).toBe(1_000_000_000n * BigInt(Number.MAX_SAFE_INTEGER))
    expect(huge.recommendedUnits).toBe(0)
    expect(huge.remainingCents).toBe(MAX_BUDGET_CENTS)
    const largeNumerator = buildProportionalBaseline([row('A', Number.MAX_SAFE_INTEGER, 1)], MAX_BUDGET_CENTS)
    expect(largeNumerator.recommendedUnits).toBe(MAX_BUDGET_CENTS)
    expect(largeNumerator.spentCents).toBe(MAX_BUDGET_CENTS)
  })
  it('rechaza conversiones y totales fuera del rango seguro', () => {
    expect(safeNumber(BigInt(Number.MAX_SAFE_INTEGER))).toBe(Number.MAX_SAFE_INTEGER)
    expect(() => safeNumber(BigInt(Number.MAX_SAFE_INTEGER) + 1n)).toThrow('seguro')
    expect(() => safeNumber(BigInt(Number.MIN_SAFE_INTEGER) - 1n)).toThrow('seguro')
    expect(() => buildProportionalBaseline([row('A', Number.MAX_SAFE_INTEGER, 1), row('B', 1, 1)], 100)).toThrow('seguro')
    expect(formatCents(9007199254740993123n)).toBe('MXN 90,071,992,547,409,931.23')
    expect(formatCents(-19)).toBe('−MXN 0.19')
    expect(formatCents(null)).toBe('N/D')
    expect(() => formatCents(1.5)).toThrow()
  })
  it.each([-1, 1.5, NaN, Infinity, MAX_BUDGET_CENTS + 1])('rechaza presupuesto inválido %s', budget => {
    expect(() => buildProportionalBaseline([row('A', 1, 1)], budget)).toThrow('Presupuesto')
  })
  it.each([0, -1, 0.5, NaN, Infinity])('rechaza costo elegible inválido %s, sin imputación', cost => {
    expect(() => buildProportionalBaseline([row('A', 2, cost)], 100)).toThrow('inválidos')
  })
})

describe('Identidad de datos, consistencia y signos', () => {
  it('misma preparación y mismas exclusiones que CU-03, conservando N/D y las causas exactas', () => {
    const dataset = createDataset()
    dataset.sales.find(r => r.sku === 'SKU-001' && r.month === '2025-12')!.acquisitionCostCents = 0
    dataset.sales = dataset.sales.filter(r => !(r.sku === 'SKU-002' && r.month === '2024-01'))
    const prepared = preparePurchaseData(dataset)
    const result = buildComparison(prepared, 2500000)
    expect(result.optimized).toEqual(buildPlan(prepared, 2500000))
    expect(result.baseline.eligibleCount).toBe(result.optimized.eligibleCount)
    expect(result.baseline.excludedCount).toBe(2)
    result.rows.forEach((r, i) => {
      for (const plan of [result.optimized, result.baseline]) {
        expect(plan.rows[i].exclusionReasons).toEqual(prepared[i].exclusionReasons)
        expect([plan.rows[i].sku, plan.rows[i].demand, plan.rows[i].inventory, plan.rows[i].need, plan.rows[i].unitCostCents]).toEqual([prepared[i].sku, prepared[i].demand, prepared[i].inventory, prepared[i].need, prepared[i].unitCostCents])
      }
      if (prepared[i].exclusionReasons.length) expect([r.baselineQuantity, r.optimizedQuantity, r.baselineCostCents, r.optimizedCostCents, r.deltaUnits]).toEqual([null, null, null, null, null])
    })
    expect(result.errors).toEqual([])
  })
  it('compara factibilidad y dominancia en muchos casos pequeños', () => {
    let cases = 0
    for (const costs of [[1, 2, 3], [2, 2, 3], [7, 3, 2]]) {
      for (let a = 0; a <= 3; a++) for (let b = 0; b <= 3; b++) for (let c = 0; c <= 3; c++) {
        const prepared = [a, b, c].map((need, i) => row(String(i), need, costs[i], i))
        const total = prepared.reduce((sum, r) => sum + r.need! * r.unitCostCents!, 0)
        for (let budget = 0; budget <= total + 1; budget++) {
          const result = buildComparison(prepared, budget)
          expect(result.errors).toEqual([])
          expect(result.optimized.recommendedUnits).toBeGreaterThanOrEqual(result.baseline.recommendedUnits)
          expect(result.baseline.spentCents).toBeLessThanOrEqual(budget)
          expect(result.baseline.rows.every(r => Number.isInteger(r.quantity) && r.quantity! >= 0 && r.quantity! <= r.need!)).toBe(true)
          cases++
        }
      }
    }
    expect(cases).toBe(2784)
  })
  it('empate en cobertura con menor gasto no afirma mejora de cobertura', () => {
    const result = buildComparison([row('A', 2, 3), row('B', 3, 4)], 12)
    expect(result).toMatchObject({ deltaUnits: 0, deltaSpentCents: -1, deltaCoveragePoints: 0, errors: [] })
    expect(result.explanation).toContain('no hay mejora de cobertura')
  })
  it('detecta un optimizado que cubra menos y no acepta superioridad', () => {
    const result = buildComparison([row('A', 2, 10)], 20)
    const broken = { ...result.optimized, rows: result.optimized.rows.map(r => ({ ...r, quantity: 0, purchaseCostCents: 0 })), recommendedUnits: 0, spentCents: 0, remainingCents: 20, coverageUnits: 0, coveragePercent: 0 }
    expect(consistencyErrors(broken, result.baseline).join(' ')).toContain('cubre menos unidades')
  })
  it('detecta divergencia de fuente, gasto o totales', () => {
    const result = buildComparison([row('A', 2, 10)], 20)
    expect(consistencyErrors(result.optimized, { ...result.baseline, spentCents: 1 }).join(' ')).toContain('inconsistentes')
    expect(consistencyErrors(result.optimized, { ...result.baseline, rows: result.baseline.rows.map(r => ({ ...r, inventory: 1 })) }).join(' ')).toContain('mismos SKU, datos')
    expect(consistencyErrors(result.optimized, { ...result.baseline, budgetCents: 21 }).join(' ')).toContain('presupuesto')
  })
  it('totales y diferencias corresponden a la suma de filas', () => {
    const result = buildComparison(preparePurchaseData(createDataset()), 2500000)
    for (const plan of [result.optimized, result.baseline]) {
      expect(plan.recommendedUnits).toBe(plan.rows.reduce((sum, r) => sum + (r.quantity ?? 0), 0))
      expect(BigInt(plan.spentCents)).toBe(plan.rows.reduce((sum, r) => sum + BigInt(r.purchaseCostCents ?? 0), 0n))
      expect(plan.spentCents + plan.remainingCents).toBe(plan.budgetCents)
    }
    expect(result.deltaUnits).toBe(result.rows.reduce((sum, r) => sum + (r.deltaUnits ?? 0), 0))
    expect(result.deltaSpentCents).toBe(result.optimized.spentCents - result.baseline.spentCents)
    expect(result.deltaCoveragePoints).toBeCloseTo(result.optimized.coveragePercent! - result.baseline.coveragePercent!, 12)
  })
  it('conserva el resultado aprobado de CU-03 y calcula el baseline dinámicamente', () => {
    const prepared = preparePurchaseData(createDataset())
    const result = buildComparison(prepared, 2500000)
    expect(result.optimized).toMatchObject({ recommendedUnits: 764, spentCents: 2496050, remainingCents: 3950 })
    const total = prepared.reduce((sum, r) => sum + BigInt(r.need!) * BigInt(r.unitCostCents!), 0n)
    const expected = prepared.map(r => BigInt(r.need!) * 2500000n / total)
    expect(result.baseline.rows.map(r => BigInt(r.quantity!))).toEqual(expected)
    expect(result.baseline).toMatchObject({ recommendedUnits: 526, spentCents: 2463925, remainingCents: 36075, coverageUnits: 1826 })
    console.info('CU-04 fixture MXN 25,000.00:', JSON.stringify({ totalNeedCents: String(total), baselineUnits: result.baseline.recommendedUnits, baselineSpentCents: result.baseline.spentCents, baselineRemainingCents: result.baseline.remainingCents, baselineCovered: result.baseline.coverageUnits, baselineCoveragePercent: result.baseline.coveragePercent, optimizedUnits: result.optimized.recommendedUnits, deltaUnits: result.deltaUnits, deltaSpentCents: result.deltaSpentCents, deltaCoveragePoints: result.deltaCoveragePoints }))
  })
  it('no muta dataset ni preparación; conserva determinismo y filtros sólo de presentación', () => {
    const dataset = createDataset()
    const original = JSON.stringify(dataset)
    const prepared = preparePurchaseData(dataset)
    const before = JSON.stringify(prepared)
    const first = buildComparison(prepared, 2500000)
    expect(buildComparison(preparePurchaseData(createDataset()), 2500000)).toEqual(first)
    expect(buildComparison(preparePurchaseData({ ...dataset, products: [...dataset.products].reverse(), sales: [...dataset.sales].reverse() }), 2500000)).toEqual(first)
    const filtered = filterComparisonRows(first.rows, { sku: 'SKU-001', category: 'Despensa' })
    expect(filtered).toEqual([first.rows[0]])
    expect(filtered[0]).toBe(first.rows[0])
    expect(filterComparisonRows(first.rows, { sku: '', category: 'Hogar' })).toHaveLength(5)
    expect(filterComparisonRows(first.rows, { sku: 'SKU-001', category: 'Hogar' })).toEqual([])
    expect(JSON.stringify(prepared)).toBe(before)
    expect(JSON.stringify(dataset)).toBe(original)
  })
})
