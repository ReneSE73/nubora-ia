import type { Dataset, Sale } from '../history/data'
import { FIRST_MONTH, LAST_MONTH } from '../history/data'
import { filterProducts, monthsBetween } from '../history/analysis'

export type Method = 'moving-average' | 'seasonal-naive'
export const METHODS: readonly Method[] = ['moving-average', 'seasonal-naive']
export const METHOD_LABELS: Record<Method, string> = {
  'moving-average': 'Promedio móvil de 3 meses',
  'seasonal-naive': 'Estacional ingenuo',
}
export const TARGET_MONTHS = ['2026-01', '2026-02', '2026-03'] as const
export const VALIDATION_ORIGINS = ['2024-12', '2025-03', '2025-06', '2025-09'] as const
export const EXPECTED_VALIDATION_POINTS = 12
export interface Point { month: string; units: number | null; stockout: boolean; promotion: boolean }
export interface Prediction { month: string; units: number | null }
export interface ValidationPoint {
  origin: string
  month: string
  horizon: number
  actual: number
  predicted: number
  stockout: boolean
}
export interface Metrics { mae: number | null; wape: number | null; count: number }
export interface Backtest { method: Method; metrics: Metrics; points: ValidationPoint[]; eligible: boolean }
export interface ForecastFilters { sku: string; category: string }

export function shiftMonth(month: string, offset: number): string {
  const n = Number(month.slice(0, 4)) * 12 + Number(month.slice(5)) - 1 + offset
  return `${Math.floor(n / 12)}-${String(n % 12 + 1).padStart(2, '0')}`
}

/** Claves mensuales explícitas: huecos, duplicados y valores inválidos son N/D, no cero. */
export function observedSeries(sales: readonly Sale[], sku: string): Point[] {
  return monthsBetween(FIRST_MONTH, LAST_MONTH).map(month => {
    const matches = sales.filter(row => row.sku === sku && row.month === month)
    const valid = matches.length === 1 && Number.isFinite(matches[0].units) && matches[0].units >= 0
    return { month, units: valid ? matches[0].units : null,
      stockout: matches.some(row => row.stockouts.length > 0), promotion: matches.some(row => row.promotion) }
  })
}

/** Redondeo al entero más cercano; .5 hacia arriba y límite inferior de cero. */
export function roundForecast(value: number): number {
  return Math.max(0, Math.round(value))
}

/**
 * Sólo lee observaciones <= origin. MA3 recursivo: los horizontes 2 y 3 incorporan
 * estimaciones internas sin redondear. Redondea únicamente los valores publicados.
 */
export function predict(series: readonly Point[], origin: string, method: Method, horizon = 3): Prediction[] {
  const values = new Map(series.filter(row => row.month <= origin).map(row => [row.month, row.units]))
  const result: Prediction[] = []
  for (let h = 1; h <= horizon; h++) {
    const month = shiftMonth(origin, h)
    let raw: number | null = null
    if (method === 'seasonal-naive') {
      raw = values.get(shiftMonth(month, -12)) ?? null
    } else {
      const window = [1, 2, 3].map(offset => values.get(shiftMonth(month, -offset)))
      if (window.every(value => value != null && Number.isFinite(value))) {
        raw = (window as number[]).reduce((sum, value) => sum + value, 0) / 3
      }
    }
    if (raw !== null && (!Number.isFinite(raw) || raw < 0)) raw = null
    values.set(month, raw)
    result.push({ month, units: raw === null ? null : roundForecast(raw) })
  }
  return result
}

export function errorMetrics(points: readonly { actual: number; predicted: number }[]): Metrics {
  if (!points.length) return { mae: null, wape: null, count: 0 }
  const absoluteError = points.reduce((sum, point) => sum + Math.abs(point.actual - point.predicted), 0)
  const actualTotal = points.reduce((sum, point) => sum + Math.abs(point.actual), 0)
  return { mae: absoluteError / points.length, wape: actualTotal === 0 ? null : absoluteError / actualTotal * 100, count: points.length }
}

/** Orígenes fijos no solapados; los valores reales se usan sólo después de predecir. */
export function backtest(series: readonly Point[], method: Method): Backtest {
  const byMonth = new Map(series.map(point => [point.month, point]))
  const points: ValidationPoint[] = []
  for (const origin of VALIDATION_ORIGINS) {
    const predictions = predict(series, origin, method)
    predictions.forEach((prediction, i) => {
      const actual = byMonth.get(prediction.month)
      if (actual?.units != null && prediction.units !== null) points.push({
        origin, month: prediction.month, horizon: i + 1,
        actual: actual.units, predicted: prediction.units, stockout: actual.stockout,
      })
    })
  }
  return { method, points, metrics: errorMetrics(points), eligible: points.length === EXPECTED_VALIDATION_POINTS }
}

/** Se comparan 12 objetivos idénticos. MAE menor gana; empate exacto favorece estacional ingenuo. */
export function selectMethod(candidates: readonly Backtest[]): Method | null {
  const eligible = candidates.filter(candidate => candidate.eligible && candidate.metrics.mae !== null)
  eligible.sort((a, b) => a.metrics.mae! - b.metrics.mae! || (a.method === b.method ? 0 : a.method === 'seasonal-naive' ? -1 : 1))
  return eligible[0]?.method ?? null
}

export function forecastProduct(dataset: Dataset, sku: string) {
  const history = observedSeries(dataset.sales, sku)
  const validation = METHODS.map(method => backtest(history, method))
  const complete = history.every(point => point.units !== null)
  const method = complete ? selectMethod(validation) : null
  const selected = validation.find(candidate => candidate.method === method)
  const forecast = method ? predict(history, LAST_MONTH, method) : TARGET_MONTHS.map(month => ({ month, units: null }))
  const competing = validation.filter(candidate => candidate.eligible)
  const tied = method !== null && competing.length === 2 && competing[0].metrics.mae === competing[1].metrics.mae
  return {
    sku, history, validation, method, forecast, complete,
    metrics: selected?.metrics ?? { mae: null, wape: null, count: 0 },
    reason: !complete ? 'Datos insuficientes: se requieren 24 meses completos y sin duplicados.'
      : !method ? 'Datos insuficientes: ningún método cubre los 12 objetivos de validación.'
        : tied ? 'Empate de MAE: se elige estacional ingenuo por la regla fija de desempate.'
          : 'Menor MAE sobre los mismos 12 meses de validación (2025).',
    stockoutMonths: history.filter(point => point.stockout).map(point => point.month),
    promotionMonths: history.filter(point => point.promotion).map(point => point.month),
    incompleteMonths: history.filter(point => point.units === null).map(point => point.month),
  }
}
export type ProductForecast = ReturnType<typeof forecastProduct>

/** Filtrar cambia la selección, nunca el entrenamiento ni el método de un SKU. */
export function analyzeForecast(dataset: Dataset, filters: ForecastFilters) {
  const products = filterProducts(dataset.products, { ...filters, start: FIRST_MONTH, end: LAST_MONTH })
  const results = products.map(product => ({ product, ...forecastProduct(dataset, product.sku) }))
  const history = monthsBetween(FIRST_MONTH, LAST_MONTH).map((month, i) => {
    const points = results.map(result => result.history[i])
    return { month, units: results.length && points.every(point => point.units !== null) ? points.reduce((sum, point) => sum + point.units!, 0) : null }
  })
  const forecast = TARGET_MONTHS.map((month, i) => {
    const points = results.map(result => result.forecast[i])
    return { month, units: results.length && points.every(point => point.units !== null) ? points.reduce((sum, point) => sum + point.units!, 0) : null }
  })
  return { results, history, forecast }
}
