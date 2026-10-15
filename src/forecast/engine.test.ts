import { describe, expect, it } from 'vitest'
import { createDataset } from '../history/data'
import { monthsBetween } from '../history/analysis'
import { analyzeForecast, backtest, errorMetrics, forecastProduct, METHODS, observedSeries, predict, roundForecast, selectMethod, shiftMonth, VALIDATION_ORIGINS } from './engine'
import type { Point } from './engine'

const point = (month: string, units: number | null): Point => ({ month, units, stockout: false, promotion: false })
const series = (value: number) => monthsBetween('2024-01', '2025-12').map(month => point(month, value))

describe('Métodos puros y redondeo', () => {
  it('calcula MA3 recursivo para tres horizontes sin ventas futuras', () => {
    expect(predict([point('2025-10', 3), point('2025-11', 6), point('2025-12', 9)], '2025-12', 'moving-average')).toEqual([
      { month: '2026-01', units: 6 }, { month: '2026-02', units: 7 }, { month: '2026-03', units: 7 },
    ])
  })
  it('no redondea los valores recursivos internos', () => {
    expect(predict([point('2025-10', 0), point('2025-11', 0), point('2025-12', 1)], '2025-12', 'moving-average').map(p => p.units)).toEqual([0, 0, 1])
  })
  it('usa el mismo mes del año anterior', () => {
    expect(predict([point('2025-01', 4), point('2025-02', 5), point('2025-03', 6)], '2025-12', 'seasonal-naive').map(p => p.units)).toEqual([4, 5, 6])
    expect(shiftMonth('2025-12', 1)).toBe('2026-01')
  })
  it('redondea .5 hacia arriba y nunca publica negativos', () => {
    expect([0, 0.49, 0.5, 2.5, -3].map(roundForecast)).toEqual([0, 0, 1, 3, 0])
  })
  it.each(METHODS)('%s distingue falta de datos de un cero válido', method => {
    expect(predict([], '2025-12', method).every(p => p.units === null)).toBe(true)
    expect(predict(series(0), '2025-12', method).map(p => p.units)).toEqual([0, 0, 0])
  })
  it('un hueco MA3 no se sustituye por el cuarto mes más reciente', () => {
    expect(predict([point('2025-09', 10), point('2025-10', 10), point('2025-12', 10)], '2025-12', 'moving-average').every(p => p.units === null)).toBe(true)
  })
})

describe('Backtesting temporal y métricas', () => {
  it('calcula MAE y WAPE con denominadores explícitos', () => {
    expect(errorMetrics([{ actual: 10, predicted: 8 }, { actual: 20, predicted: 24 }])).toEqual({ mae: 3, wape: 20, count: 2 })
    expect(errorMetrics([{ actual: 0, predicted: 5 }])).toEqual({ mae: 5, wape: null, count: 1 })
    expect(errorMetrics([])).toEqual({ mae: null, wape: null, count: 0 })
  })
  it('evalúa 12 objetivos sin solapamiento y calcula errores conocidos a mano', () => {
    const values = series(10).map(p => p.month.startsWith('2025') ? { ...p, units: 20 } : p)
    const moving = backtest(values, 'moving-average')
    const seasonal = backtest(values, 'seasonal-naive')
    expect(moving.metrics).toEqual({ mae: 2.5, wape: 12.5, count: 12 })
    expect(seasonal.metrics).toEqual({ mae: 10, wape: 50, count: 12 })
    expect(new Set(moving.points.map(p => p.month)).size).toBe(12)
    expect(moving.points.map(p => p.month)).toEqual(monthsBetween('2025-01', '2025-12'))
    expect(selectMethod([moving, seasonal])).toBe('moving-average')
    expect(moving.points.every(p => p.origin < p.month && p.horizon >= 1 && p.horizon <= 3)).toBe(true)
  })
  it.each(METHODS)('%s no usa observaciones posteriores a cada corte', method => {
    const values = observedSeries(createDataset().sales, 'SKU-001')
    for (const origin of VALIDATION_ORIGINS) {
      const altered = values.map(p => p.month > origin ? { ...p, units: 999999 } : p)
      expect(predict(altered, origin, method)).toEqual(predict(values, origin, method))
      const original = backtest(values, method).points.filter(p => p.origin === origin).map(p => p.predicted)
      const changed = backtest(altered, method).points.filter(p => p.origin === origin).map(p => p.predicted)
      expect(changed).toEqual(original)
    }
  })
  it('los datos posteriores al cierre de 2025 no cambian selección ni pronóstico final', () => {
    const dataset = createDataset()
    const original = forecastProduct(dataset, 'SKU-001')
    const future = { ...dataset, sales: [...dataset.sales, { ...dataset.sales[0], month: '2026-01', units: 999999 }] }
    expect(forecastProduct(future, 'SKU-001')).toEqual(original)
  })
  it('rechaza validación parcial y resuelve empates de forma determinista', () => {
    const candidates = METHODS.map(method => backtest(series(0), method))
    expect(candidates.every(c => c.metrics.mae === 0 && c.metrics.wape === null && c.eligible)).toBe(true)
    expect(selectMethod(candidates)).toBe('seasonal-naive')
    expect(selectMethod([...candidates].reverse())).toBe('seasonal-naive')
    expect(selectMethod(METHODS.map(method => backtest([], method)))).toBeNull()
    const partial = backtest(series(10).filter(p => p.month !== '2025-12'), 'moving-average')
    expect(partial.eligible).toBe(false)
    expect(partial.metrics.count).toBe(11)
    expect(selectMethod([partial])).toBeNull()
  })
  it('identifica objetivos afectados por faltantes sin corregir sus ventas', () => {
    const values = series(10).map(p => p.month === '2025-01' ? { ...p, stockout: true, units: 2 } : p)
    const result = backtest(values, 'seasonal-naive')
    expect(result.points[0]).toMatchObject({ actual: 2, predicted: 10, stockout: true })
  })
})

describe('Dataset CU-01 y consistencia de filtros', () => {
  it('produce 60 filas enteras no negativas, reutilizando 480 registros sin mutarlos', () => {
    const dataset = createDataset()
    const snapshot = JSON.stringify(dataset)
    const result = analyzeForecast(dataset, { sku: '', category: '' })
    expect(result.results).toHaveLength(20)
    const forecasts = result.results.flatMap(r => r.forecast.map(p => ({ ...p, sku: r.sku })))
    expect(forecasts).toHaveLength(60)
    expect(new Set(forecasts.map(p => `${p.sku}/${p.month}`)).size).toBe(60)
    expect(forecasts.every(p => p.units !== null && Number.isInteger(p.units) && p.units >= 0)).toBe(true)
    expect(result.results.every(r => r.metrics.count === 12 && r.validation.every(v => v.eligible))).toBe(true)
    expect(dataset.sales).toHaveLength(480)
    expect(JSON.stringify(dataset)).toBe(snapshot)
  })
  it('aplica SKU y categoría conjuntamente sin cambiar el modelo por SKU', () => {
    const dataset = createDataset()
    const all = analyzeForecast(dataset, { sku: '', category: '' })
    const one = analyzeForecast(dataset, { sku: 'SKU-001', category: 'Despensa' })
    expect(one.results).toEqual([all.results[0]])
    expect(analyzeForecast(dataset, { sku: '', category: 'Despensa' }).results).toHaveLength(5)
    const empty = analyzeForecast(dataset, { sku: 'SKU-001', category: 'Hogar' })
    expect(empty.results).toEqual([])
    expect(empty.forecast.every(p => p.units === null)).toBe(true)
  })
  it('serie de gráfico equivale a la suma de filas individuales tras filtrar', () => {
    const result = analyzeForecast(createDataset(), { sku: '', category: 'Hogar' })
    result.forecast.forEach((p, i) => expect(p.units).toBe(result.results.reduce((sum, r) => sum + r.forecast[i].units!, 0)))
    result.history.forEach((p, i) => expect(p.units).toBe(result.results.reduce((sum, r) => sum + r.history[i].units!, 0)))
  })
  it.each(['missing', 'duplicate', 'invalid'])('detecta %s sin inventar pronósticos ni ocultar faltantes', mode => {
    const dataset = createDataset()
    if (mode === 'missing') dataset.sales.shift()
    if (mode === 'duplicate') dataset.sales.push({ ...dataset.sales[0] })
    if (mode === 'invalid') dataset.sales[0].units = NaN
    const result = forecastProduct(dataset, 'SKU-001')
    expect(result.complete).toBe(false)
    expect(result.incompleteMonths).toContain('2024-01')
    expect(result.method).toBeNull()
    expect(result.forecast.every(p => p.units === null)).toBe(true)
    if (mode !== 'missing') expect(result.stockoutMonths).toContain('2024-01')
    const all = analyzeForecast(dataset, { sku: '', category: '' })
    expect(all.forecast.every(p => p.units === null)).toBe(true)
  })
  it('un catálogo sin registros devuelve N/D, no ventas cero', () => {
    const result = forecastProduct({ ...createDataset(), sales: [] }, 'SKU-001')
    expect(result.metrics).toEqual({ mae: null, wape: null, count: 0 })
    expect(result.history.every(p => p.units === null)).toBe(true)
    expect(result.forecast.every(p => p.units === null)).toBe(true)
  })
})
