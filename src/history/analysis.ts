import type { Dataset, Product, Sale } from './data'

export interface Filters { sku: string; category: string; start: string; end: string }
export interface MonthlySales {
  month: string
  units: number | null // null si falta algún registro esperado; jamás sustituirlo por cero.
  observedSubtotal: number
  revenueCents: number | null
  acquisitionCents: number | null
  expectedRecords: number
  receivedRecords: number
  complete: boolean
  promotionRecords: number
  stockoutRecords: number
}

export function monthsBetween(start: string, end: string): string[] {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(start) || !/^\d{4}-(0[1-9]|1[0-2])$/.test(end) || start > end) return []
  const toIndex = (value: string) => Number(value.slice(0, 4)) * 12 + Number(value.slice(5)) - 1
  return Array.from({ length: toIndex(end) - toIndex(start) + 1 }, (_, i) => {
    const n = toIndex(start) + i
    return `${String(Math.floor(n / 12)).padStart(4, '0')}-${String(n % 12 + 1).padStart(2, '0')}`
  })
}

export function filterProducts(products: readonly Product[], filters: Filters): Product[] {
  return products.filter(p => (!filters.sku || p.sku === filters.sku) && (!filters.category || p.category === filters.category))
}

export function filterSales(dataset: Dataset, filters: Filters): Sale[] {
  const selected = new Set(filterProducts(dataset.products, filters).map(p => p.sku))
  const months = new Set(monthsBetween(filters.start, filters.end))
  return dataset.sales.filter(row => selected.has(row.sku) && months.has(row.month))
}

export function aggregateMonthly(sales: readonly Sale[], products: readonly Product[], months: readonly string[]): MonthlySales[] {
  const skus = new Set(products.map(p => p.sku))
  return months.map(month => {
    const rows = sales.filter(row => row.month === month && skus.has(row.sku))
    const counts = new Map<string, number>()
    rows.forEach(row => counts.set(row.sku, (counts.get(row.sku) ?? 0) + 1))
    const complete = skus.size > 0 && [...skus].every(sku => counts.get(sku) === 1)
    const observedSubtotal = rows.reduce((sum, row) => sum + row.units, 0)
    return {
      month, units: complete ? observedSubtotal : null, observedSubtotal,
      revenueCents: complete ? rows.reduce((sum, row) => sum + row.units * row.salePriceCents, 0) : null,
      acquisitionCents: complete ? rows.reduce((sum, row) => sum + row.units * row.acquisitionCostCents, 0) : null,
      expectedRecords: skus.size, receivedRecords: rows.length, complete,
      promotionRecords: rows.filter(row => row.promotion).length,
      stockoutRecords: rows.filter(row => row.stockouts.length > 0).length,
    }
  })
}

export function summarize(monthly: readonly MonthlySales[]) {
  const complete = monthly.filter((row): row is MonthlySales & { units: number } => row.complete && row.units !== null)
  const totalUnits = complete.reduce((sum, row) => sum + row.units, 0)
  const maximum = complete.length ? Math.max(...complete.map(row => row.units)) : null
  const minimum = complete.length ? Math.min(...complete.map(row => row.units)) : null
  return {
    totalUnits: complete.length ? totalUnits : null,
    average: complete.length ? totalUnits / complete.length : null,
    maximum, minimum,
    maximumMonths: complete.filter(row => row.units === maximum).map(row => row.month),
    minimumMonths: complete.filter(row => row.units === minimum).map(row => row.month),
    completeMonths: complete.length,
  }
}

/** Sólo compara meses equivalentes dentro del periodo seleccionado, sin rellenar huecos. */
export function compareYears(monthly: readonly MonthlySales[]) {
  const latestYear = monthly.at(-1)?.month.slice(0, 4)
  const byMonth = new Map(monthly.map(row => [row.month, row]))
  return monthly.filter(row => row.month.startsWith(`${latestYear}-`)).map(current => {
    const previousMonth = `${Number(current.month.slice(0, 4)) - 1}-${current.month.slice(5)}`
    const previous = byMonth.get(previousMonth)
    const comparable = current.units !== null && previous?.units != null
    const change = comparable ? current.units! - previous.units! : null
    const percentage = comparable && previous.units! > 0 ? change! / previous.units! * 100 : null
    return { month: current.month, previousMonth, current: current.units, previous: previous?.units ?? null, change, percentage }
  })
}

export function assessQuality(monthly: readonly MonthlySales[]) {
  const incompleteMonths = monthly.filter(row => !row.complete).map(row => row.month)
  const hasStockouts = monthly.some(row => row.stockoutRecords > 0)
  const hasPromotions = monthly.some(row => row.promotionRecords > 0)
  const consecutive = monthly.length > 0 && monthsBetween(monthly[0].month, monthly.at(-1)!.month).length === monthly.length
  const enoughHistory = monthly.length >= 24 && incompleteMonths.length === 0 && consecutive
  return { incompleteMonths, hasStockouts, hasPromotions, enoughHistory,
    seasonalityNote: enoughHistory
      ? 'Hay al menos dos ciclos anuales completos para comparación descriptiva. Esto no demuestra estacionalidad confiable: promociones, faltantes y otros factores pueden explicar las diferencias.'
      : 'Datos insuficientes para evaluar estacionalidad: se requieren al menos 24 meses consecutivos con todos los SKU seleccionados. No se afirma estacionalidad confiable.',
  }
}

export function analyzeHistory(dataset: Dataset, filters: Filters) {
  const products = filterProducts(dataset.products, filters)
  const rows = filterSales(dataset, filters)
  const monthly = aggregateMonthly(rows, products, monthsBetween(filters.start, filters.end))
  return { products, rows, monthly, summary: summarize(monthly), comparisons: compareYears(monthly), quality: assessQuality(monthly) }
}

export function stockoutDays(sale: Sale): number {
  return sale.stockouts.reduce((sum, period) => sum + (Date.parse(`${period.end}T00:00:00Z`) - Date.parse(`${period.start}T00:00:00Z`)) / 86400000 + 1, 0)
}

const monthNames = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
export function monthLabel(month: string): string {
  return `${monthNames[Number(month.slice(5)) - 1]} ${month.slice(0, 4)}`
}
