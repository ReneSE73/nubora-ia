import { describe, expect, it } from 'vitest'
import { createDataset } from './data'
import type { Dataset, Sale } from './data'
import { aggregateMonthly, analyzeHistory, assessQuality, compareYears, filterSales, monthsBetween, stockoutDays, summarize } from './analysis'
import type { Filters } from './analysis'

const filters: Filters = { sku: '', category: '', start: '2024-01', end: '2025-12' }
function sale(sku: string, month: string, units: number): Sale {
  return { sku, month, units, acquisitionCostCents: 100, salePriceCents: 250, promotion: false, stockouts: [] }
}
const tiny: Dataset = {
  inventoryAsOf: '2025-12-31',
  products: [{ sku: 'A', name: 'A', category: 'Uno', currentInventory: 7 }, { sku: 'B', name: 'B', category: 'Dos', currentInventory: 3 }],
  sales: [sale('A', '2024-01', 10), sale('A', '2024-02', 0), sale('B', '2024-01', 20), sale('B', '2024-02', 4)],
}

describe('Dataset fijo v1', () => {
  it('genera exactamente los mismos 20 SKU y 480 registros de 24 meses completos', () => {
    const data = createDataset()
    expect(createDataset()).toEqual(data)
    expect(data.products).toHaveLength(20)
    expect(new Set(data.products.map(p => p.sku)).size).toBe(20)
    expect(data.sales).toHaveLength(480)
    expect(new Set(data.sales.map(row => `${row.sku}/${row.month}`)).size).toBe(480)
    const monthly = analyzeHistory(data, filters).monthly
    expect(monthly).toHaveLength(24)
    expect(monthly.every(row => row.complete && row.receivedRecords === 20)).toBe(true)
    expect(data.sales.some(row => row.units === 0)).toBe(true)
    expect(data.sales.some(row => row.promotion)).toBe(true)
    expect(data.sales.some(row => row.stockouts.length > 0)).toBe(true)
  })
  it('mantiene costos, precios, existencias y faltantes válidos', () => {
    const data = createDataset()
    expect(data.products.every(p => Number.isInteger(p.currentInventory) && p.currentInventory >= 0 && p.category.length > 0)).toBe(true)
    for (const row of data.sales) {
      expect(Number.isInteger(row.units) && row.units >= 0).toBe(true)
      expect(row.acquisitionCostCents).toBeGreaterThan(0)
      expect(row.salePriceCents).toBeGreaterThan(row.acquisitionCostCents)
      for (const period of row.stockouts) {
        expect(period.start.slice(0, 7)).toBe(row.month)
        expect(period.end.slice(0, 7)).toBe(row.month)
        expect(stockoutDays(row)).toBe(6)
      }
    }
  })
})

describe('Filtros y agregaciones', () => {
  it('aplica SKU, categoría y límites inclusivos de periodo conjuntamente', () => {
    const result = filterSales(createDataset(), { ...filters, sku: 'SKU-001', category: 'Despensa', start: '2024-03', end: '2024-05' })
    expect(result.map(row => row.month)).toEqual(['2024-03', '2024-04', '2024-05'])
    expect(result.every(row => row.sku === 'SKU-001')).toBe(true)
    expect(filterSales(tiny, { ...filters, category: 'Uno' })).toHaveLength(2)
    expect(filterSales(tiny, { ...filters, sku: 'A', category: 'Dos' })).toEqual([])
  })
  it('rechaza periodos invertidos o inválidos y cruza el cambio de año', () => {
    expect(monthsBetween('2025-12', '2024-01')).toEqual([])
    expect(monthsBetween('2024-13', '2025-01')).toEqual([])
    expect(monthsBetween('2024-12', '2025-01')).toEqual(['2024-12', '2025-01'])
    expect(filterSales(tiny, { ...filters, start: '2025-12', end: '2024-01' })).toEqual([])
  })
  it('agrega unidades, ingresos y costos desde los mismos registros', () => {
    const result = analyzeHistory(tiny, { ...filters, end: '2024-02' })
    expect(result.monthly.map(row => [row.units, row.revenueCents, row.acquisitionCents])).toEqual([[30, 7500, 3000], [4, 1000, 400]])
    expect(result.summary).toMatchObject({ totalUnits: 34, average: 17, maximum: 30, minimum: 4, maximumMonths: ['2024-01'], minimumMonths: ['2024-02'] })
  })
  it('incluye meses explícitos de cero en el promedio y el mínimo', () => {
    const result = analyzeHistory(tiny, { ...filters, sku: 'A', end: '2024-02' })
    expect(result.monthly.map(row => row.units)).toEqual([10, 0])
    expect(result.summary).toMatchObject({ totalUnits: 10, average: 5, minimum: 0, completeMonths: 2 })
  })
  it('conserva empates en máximo y mínimo y nunca divide entre cero', () => {
    const zeros = aggregateMonthly([sale('A', '2024-01', 0), sale('A', '2024-02', 0)], tiny.products.slice(0, 1), ['2024-01', '2024-02'])
    expect(summarize(zeros)).toMatchObject({ average: 0, maximum: 0, minimum: 0, maximumMonths: ['2024-01', '2024-02'] })
    expect(summarize([])).toMatchObject({ totalUnits: null, average: null, maximum: null, minimum: null })
  })
  it('conserva el total filtrado y no modifica el dataset de origen', () => {
    const data = createDataset()
    const original = JSON.stringify(data)
    const result = analyzeHistory(data, { ...filters, category: 'Hogar' })
    expect(result.summary.totalUnits).toBe(result.rows.reduce((sum, row) => sum + row.units, 0))
    expect(result.monthly.reduce((sum, row) => sum + row.revenueCents!, 0)).toBe(result.rows.reduce((sum, row) => sum + row.units * row.salePriceCents, 0))
    expect(JSON.stringify(data)).toBe(original)
  })
})

describe('Calidad y comparación anual', () => {
  it('distingue un registro perdido de un mes con cero ventas', () => {
    const data = { ...tiny, sales: tiny.sales.filter(row => !(row.sku === 'B' && row.month === '2024-02')) }
    const result = analyzeHistory(data, { ...filters, end: '2024-02' })
    expect(result.monthly[1]).toMatchObject({ units: null, observedSubtotal: 0, complete: false, receivedRecords: 1, expectedRecords: 2, revenueCents: null })
    expect(result.summary).toMatchObject({ average: 30, completeMonths: 1, minimum: 30 })
    expect(result.quality.incompleteMonths).toEqual(['2024-02'])
    expect(result.quality.enoughHistory).toBe(false)
  })
  it('detecta un mes completamente ausente sin convertirlo en cero', () => {
    const result = analyzeHistory(tiny, { ...filters, start: '2024-03', end: '2024-03' })
    expect(result.rows).toHaveLength(0)
    expect(result.monthly[0].units).toBeNull()
    expect(result.summary.average).toBeNull()
    expect(result.quality.incompleteMonths).toEqual(['2024-03'])
  })
  it('detecta duplicados incluso si el número total de filas coincide', () => {
    const rows = [sale('A', '2024-01', 10), sale('A', '2024-01', 20)]
    expect(aggregateMonthly(rows, tiny.products, ['2024-01'])[0].complete).toBe(false)
  })
  it('marca faltantes y promociones sin ajustar ventas ni inferir demanda', () => {
    const result = analyzeHistory(createDataset(), filters)
    expect(result.quality).toMatchObject({ hasStockouts: true, hasPromotions: true, enoughHistory: true })
    expect(result.quality.seasonalityNote).toContain('no demuestra estacionalidad confiable')
    expect(result.summary.totalUnits).toBe(result.rows.reduce((sum, row) => sum + row.units, 0))
  })
  it('no considera suficientes menos de 24 meses, registros perdidos o meses discontinuos', () => {
    const full = analyzeHistory(createDataset(), filters).monthly
    expect(assessQuality(full.slice(0, 23)).enoughHistory).toBe(false)
    const data = createDataset(); data.sales.pop()
    expect(analyzeHistory(data, filters).quality.enoughHistory).toBe(false)
    const discontinuous = [...full, { ...full[23], month: '2026-02' }]
    expect(assessQuality(discontinuous).enoughHistory).toBe(false)
  })
  it('compara sólo meses equivalentes y calcula diferencias sobre la base anterior', () => {
    const monthly = aggregateMonthly([sale('A', '2024-01', 10), sale('A', '2024-02', 20), sale('A', '2025-01', 15), sale('A', '2025-02', 10)], tiny.products.slice(0, 1), ['2024-01', '2024-02', '2025-01', '2025-02'])
    expect(compareYears(monthly)).toEqual([
      { month: '2025-01', previousMonth: '2024-01', current: 15, previous: 10, change: 5, percentage: 50 },
      { month: '2025-02', previousMonth: '2024-02', current: 10, previous: 20, change: -10, percentage: -50 },
    ])
  })
  it('devuelve porcentaje N/D con base cero y comparación N/D si falta el mes anterior', () => {
    const monthly = aggregateMonthly([sale('A', '2024-01', 0), sale('A', '2025-01', 5)], tiny.products.slice(0, 1), ['2024-01', '2025-01', '2025-02'])
    expect(compareYears(monthly)[0]).toMatchObject({ change: 5, percentage: null })
    expect(compareYears(monthly)[1]).toMatchObject({ previous: null, current: null, change: null, percentage: null })
    expect(compareYears(monthly.slice(1))[0].change).toBeNull()
  })
  it('no crea promedios ni estacionalidad para un conjunto de SKU vacío', () => {
    const result = analyzeHistory(tiny, { ...filters, sku: 'desconocido' })
    expect(result.summary.average).toBeNull()
    expect(result.quality.enoughHistory).toBe(false)
  })
})
