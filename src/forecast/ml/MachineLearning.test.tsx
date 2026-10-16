import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { createDataset } from '../../history/data'
import { observedSeries, predict } from '../engine'
import { datasetSignature } from './dataSignature'
import report from './results.json'
import MachineLearning from '../MachineLearning'

describe('Artefacto de entrenamiento Python y presentación ML', () => {
  it('corresponde al dataset vigente y contiene 60 pronósticos RF válidos', () => {
    const data = createDataset()
    expect(report.schema_version).toBe(1)
    expect(report.information_only).toBe(true)
    expect(report.status).toBe('ready')
    expect(report.dataset.signature).toBe(datasetSignature(data))
    expect(report.dataset.sku_count).toBe(20)
    expect(report.dataset.record_count).toBe(480)
    expect(report.dataset.eligible_skus).toHaveLength(20)
    expect(report.dataset.excluded_skus).toEqual([])
    expect(report.model.name).toBe('RandomForestRegressor')
    expect(report.model.parameters.random_state).toBe(42)
    expect(report.training).toMatchObject({ cutoff: '2025-12', sample_count: 420, period: ['2024-04', '2025-12'] })
    expect(report.forecast.rows).toHaveLength(60)
    expect(new Set(report.forecast.rows.map(r => `${r.sku}/${r.month}`)).size).toBe(60)
    expect(report.forecast.rows.every(r => Number.isSafeInteger(r.units) && r.units >= 0 && r.origin === '2025-12' && r.month >= '2026-01' && r.month <= '2026-03')).toBe(true)
  })
  it('las métricas reflejan exactamente las predicciones y comparten las mismas observaciones', () => {
    const data = createDataset()
    for (const phase of [report.evaluation.validation, report.evaluation.test]) {
      const observations: string[][] = []
      expect(phase.sample_count).toBe(60)
      expect(phase.metrics).toHaveLength(3)
      for (const metric of phase.metrics) {
        const rows = phase.predictions.filter(p => p.model === metric.model)
        observations.push(rows.map(p => `${p.sku}/${p.month}/${p.actual}`))
        expect(rows).toHaveLength(60)
        expect(metric.n).toBe(60)
        expect(metric.mae).toBeCloseTo(rows.reduce((sum, p) => sum + Math.abs(p.actual - p.units), 0) / 60, 12)
        for (const point of rows) expect(point.actual).toBe(data.sales.find(r => r.sku === point.sku && r.month === point.month)!.units)
      }
      expect(observations[0]).toEqual(observations[1]); expect(observations[1]).toEqual(observations[2])
    }
    expect(report.evaluation.validation.period[1] < report.evaluation.test.period[0]).toBe(true)
    expect(report.evaluation.validation.training_sample_count).toBe(300)
    expect(report.evaluation.test.training_sample_count).toBe(360)
  })
  it('los baselines de Python reproducen los métodos puros existentes de TypeScript', () => {
    const data = createDataset()
    for (const phase of [report.evaluation.validation, report.evaluation.test]) {
      for (const product of data.products) {
        const history = observedSeries(data.sales, product.sku)
        for (const [pythonName, tsName] of [['moving_average', 'moving-average'], ['seasonal_naive', 'seasonal-naive']] as const) {
          const expected = predict(history, phase.origin, tsName)
          const actual = phase.predictions.filter(r => r.model === pythonName && r.sku === product.sku).map(r => ({ month: r.month, units: r.units }))
          expect(actual).toEqual(expected)
        }
      }
    }
  })
  it('muestra métricas reales sin afirmar una mejora frente al mejor baseline', () => {
    render(<MachineLearning dataset={createDataset()} />)
    const section = screen.getByRole('region', { name: 'Machine Learning' })
    expect(within(section).getByRole('heading', { name: 'Machine Learning' })).toBeInTheDocument()
    expect(section).toHaveTextContent('Random Forest no supera al baseline con menor MAE')
    expect(section).toHaveTextContent('No se reemplaza la selección actual de CU-02')
    const table = within(section).getByRole('table')
    expect(table.querySelectorAll('tbody tr')).toHaveLength(3)
    expect(table).toHaveTextContent('9.9')
    expect(within(section).getByRole('link', { name: /Descargar resultados/ })).toHaveAttribute('download', 'nubora-ml-results.json')
  })
  it('oculta métricas ante un dataset diferente en lugar de atribuirle el informe estático', () => {
    const dataset = createDataset(); dataset.sales[0].units++
    render(<MachineLearning dataset={dataset} />)
    expect(screen.getByText(/El artefacto ML no corresponde al dataset actual/)).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })
  it('firma estable sin depender del orden y sensible a cambios de datos', () => {
    const data = createDataset()
    expect(datasetSignature({ ...data, products: [...data.products].reverse(), sales: [...data.sales].reverse() })).toBe(datasetSignature(data))
    const changed = createDataset(); changed.sales.pop()
    expect(datasetSignature(changed)).not.toBe(datasetSignature(data))
  })
})
