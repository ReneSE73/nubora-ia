import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createDataset } from '../history/data'
import * as model from './model'
import PurchasePlan from './PurchasePlan'

afterEach(() => vi.restoreAllMocks())
function checkChart(container: HTMLElement) {
  const chart = [...container.querySelectorAll('svg g[data-sku]')].map(row => [row.getAttribute('data-sku'), row.getAttribute('data-need'), row.getAttribute('data-quantity')])
  const table = [...within(screen.getByRole('region', { name: 'Tabla del plan de compra desplazable' })).getByRole('table').querySelectorAll('tbody tr')].map(row => [row.getAttribute('data-sku'), row.getAttribute('data-need'), row.getAttribute('data-quantity')])
  expect(chart.length).toBeGreaterThan(0)
  expect(chart).toEqual(table)
}

describe('Pantalla CU-03', () => {
  it('presenta plan global de 20 SKU, referencia histórica y advertencias', () => {
    const { container } = render(<PurchasePlan />)
    expect(screen.getByRole('status')).toHaveTextContent('20 SKU elegibles · 0 excluidos · 20 filas visibles')
    expect(screen.getByText(/El presupuesto es global para los 20 SKU/)).toBeInTheDocument()
    expect(screen.getByText(/no es una cotización futura/)).toBeInTheDocument()
    expect(screen.getByText(/Hubo stockouts/)).toBeInTheDocument()
    checkChart(container)
  })
  it('filtrar no recalcula ni modifica el plan ni sus indicadores globales', async () => {
    const user = userEvent.setup()
    const spy = vi.spyOn(model, 'buildPlan')
    const { container } = render(<PurchasePlan />)
    const originalCalls = spy.mock.calls.length
    const summary = screen.getByRole('region', { name: 'Resumen global del plan' }).textContent
    await user.selectOptions(screen.getByRole('combobox', { name: 'Categoría' }), 'Despensa')
    expect(screen.getByRole('status')).toHaveTextContent('5 filas visibles')
    checkChart(container)
    await user.selectOptions(screen.getByRole('combobox', { name: 'SKU' }), 'SKU-001')
    expect(screen.getByRole('status')).toHaveTextContent('1 filas visibles')
    checkChart(container)
    expect(spy.mock.calls.length).toBe(originalCalls)
    expect(screen.getByRole('region', { name: 'Resumen global del plan' }).textContent).toBe(summary)
    await user.selectOptions(screen.getByRole('combobox', { name: 'Categoría' }), 'Hogar')
    expect(screen.getByRole('heading', { name: 'Sin SKU para esta vista' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Restablecer filtros de visualización' }))
    expect(screen.getByRole('status')).toHaveTextContent('20 filas visibles')
    expect(spy.mock.calls.length).toBe(originalCalls)
  })
  it('presupuesto cero produce cantidades y gastos cero', async () => {
    const user = userEvent.setup()
    const { container } = render(<PurchasePlan />)
    const input = screen.getByRole('textbox', { name: 'Presupuesto global en MXN' })
    await user.clear(input); await user.type(input, '0')
    expect(container.querySelectorAll('tbody tr[data-quantity="0"]')).toHaveLength(20)
    const summary = screen.getByRole('region', { name: 'Resumen global del plan' })
    expect(summary).toHaveTextContent('Unidades recomendadas0')
    checkChart(container)
  })
  it('no muestra un plan anterior ni supone cero cuando el presupuesto es inválido', async () => {
    const user = userEvent.setup()
    render(<PurchasePlan />)
    const input = screen.getByRole('textbox', { name: 'Presupuesto global en MXN' })
    await user.clear(input); await user.type(input, '-5')
    expect(screen.getByRole('alert')).toHaveTextContent('Presupuesto inválido')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(screen.queryByRole('region', { name: 'Resumen global del plan' })).not.toBeInTheDocument()
  })
  it('muestra exclusiones con causa y N/D, sin ocultar los SKU', () => {
    const dataset = createDataset()
    dataset.sales.find(row => row.sku === 'SKU-001' && row.month === '2025-12')!.acquisitionCostCents = 0
    const { container } = render(<PurchasePlan dataset={dataset} />)
    expect(screen.getByRole('region', { name: 'SKU excluidos' })).toHaveTextContent('SKU-001')
    expect(screen.getByRole('region', { name: 'SKU excluidos' })).toHaveTextContent('Costo de adquisición')
    expect(screen.getByRole('status')).toHaveTextContent('19 SKU elegibles · 1 excluidos')
    const first = container.querySelector('tbody tr[data-sku="SKU-001"]')!
    expect(first).toHaveAttribute('data-quantity', 'missing')
    expect(first.children[6]).toHaveTextContent('N/D')
    checkChart(container)
  })
  it('con presupuesto suficiente compra exactamente la necesidad y muestra cobertura 100%', async () => {
    const user = userEvent.setup()
    const { container } = render(<PurchasePlan />)
    const input = screen.getByRole('textbox', { name: 'Presupuesto global en MXN' })
    await user.clear(input); await user.type(input, '1000000.00')
    expect([...container.querySelectorAll('tbody tr[data-sku]')].every(row => row.getAttribute('data-quantity') === row.getAttribute('data-need'))).toBe(true)
    expect(screen.getByRole('region', { name: 'Resumen global del plan' })).toHaveTextContent('Cobertura estimada100 %')
  })
})
