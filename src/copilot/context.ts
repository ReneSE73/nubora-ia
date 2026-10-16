import { createDataset, FIRST_MONTH, LAST_MONTH } from '../history/data'
import { analyzeHistory } from '../history/analysis'
import { analyzeForecast } from '../forecast/engine'
import { preparePurchaseData, parseBudget } from '../purchases/model'
import type { Strategy } from '../comparison/model'
import { buildComparison, formatCents } from '../comparison/model'
import report from '../forecast/ml/results.json'
import { datasetSignature } from '../forecast/ml/dataSignature'

export interface Settings { sku: string; category: string; start: string; end: string; budget: string }
export const defaults: Settings = { sku: '', category: '', start: FIRST_MONTH, end: LAST_MONTH, budget: '25000.00' }
export function validateSettings(value: unknown): Settings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Filtros inválidos.')
  const s = value as Record<string, unknown>
  if (Object.keys(s).sort().join() !== Object.keys(defaults).sort().join() || Object.values(s).some(v => typeof v !== 'string')) throw new Error('Filtros inválidos.')
  const settings = s as unknown as Settings
  const d = createDataset()
  if ((settings.sku && !d.products.some(p => p.sku === settings.sku)) || (settings.category && !d.products.some(p => p.category === settings.category)) || !/^202[45]-(0[1-9]|1[0-2])$/.test(settings.start) || !/^202[45]-(0[1-9]|1[0-2])$/.test(settings.end) || settings.start > settings.end || !parseBudget(settings.budget).valid) throw new Error('Filtros, periodo o presupuesto inválidos.')
  return settings
}
export function buildContext(input: Settings) {
  const settings = validateSettings(input)
  const dataset = createDataset()
  const history = analyzeHistory(dataset, settings)
  const forecast = analyzeForecast(dataset, settings)
  const budget = parseBudget(settings.budget)
  if (!budget.valid) throw new Error(budget.error)
  const comparison = buildComparison(preparePurchaseData(dataset), budget.cents)
  const summary = (p: Strategy) => ({ spentMXN: formatCents(p.spentCents), remainingMXN: formatCents(p.remainingCents), units: p.recommendedUnits, spentCents: p.spentCents, remainingCents: p.remainingCents, coverageUnits: p.coverageUnits, coveragePercent: p.coveragePercent, demandUnits: p.demandUnits, inventoryUnits: p.inventoryUnits, needUnits: p.needUnits, eligibleCount: p.eligibleCount })
  const facts = {
    scope: { ...settings, budgetCents: budget.cents, synthetic: true, inventoryAsOf: dataset.inventoryAsOf, forecastHorizon: ['2026-01', '2026-02', '2026-03'], note: 'Filtros propios de Copilot. Periodo sólo para historial; presupuesto global de todos los SKU. Filtros SKU/categoría sólo presentan filas de compras, no recalculan el plan.' },
    history: { selectedSkus: history.products.map(p => p.sku), ...history.summary, monthly: history.monthly, comparisons: history.comparisons, quality: history.quality },
    forecast: { monthly: forecast.forecast, products: forecast.results.map(r => ({ sku: r.sku, method: r.method, metrics: r.metrics, forecast: r.forecast, reason: r.reason, stockoutMonths: r.stockoutMonths })) },
    ml: datasetSignature(dataset) === report.dataset.signature ? { status: report.status, validation: { origin: report.evaluation.validation.origin, metrics: report.evaluation.validation.metrics }, test: { origin: report.evaluation.test.origin, metrics: report.evaluation.test.metrics }, note: 'Global e informativo. No sustituye métodos operativos. Un único trimestre de prueba no demuestra mejora general.' } : { status: 'unavailable' },
    optimized: summary(comparison.optimized), baseline: summary(comparison.baseline),
    comparison: { deltaUnits: comparison.deltaUnits, deltaSpentCents: comparison.deltaSpentCents, deltaCoveragePoints: comparison.deltaCoveragePoints, errors: comparison.errors, explanation: comparison.explanation },
    purchases: comparison.rows.filter(r => (!settings.sku || r.sku === settings.sku) && (!settings.category || r.category === settings.category)),
    rules: 'Ventas observadas no son demanda real. Stockouts pueden subestimar demanda; no se inventan ventas perdidas. Costos históricos de diciembre, no cotización. Optimización maximiza unidades y luego minimiza gasto, sin márgenes. Baseline proporcional racional con floor sin redistribuir saldo. Sin compras reales ni ROI. N/D no es cero. No se demuestra estacionalidad confiable.'
  }
  // Referencias de hojas verificables; las cifras se insertan por servidor, nunca las calcula el LLM.
  const evidence: Record<string, string> = {}
  function flatten(value: unknown, path: string) {
    if (value !== null && typeof value === 'object') Object.entries(value).forEach(([key, v]) => flatten(v, path ? `${path}.${key}` : key))
    else evidence[path] = value === null ? 'N/D' : String(value)
  }
  flatten(facts, '')
  return { facts, evidence }
}
