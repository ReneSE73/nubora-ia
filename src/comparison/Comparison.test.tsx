import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import Comparison from './Comparison'
import * as model from './model'
import { createDataset } from '../history/data'
import { preparePurchaseData } from '../purchases/model'

afterEach(() => vi.restoreAllMocks())

describe('Pantalla CU-04', () => {
  it('presenta estrategias globales, gráfica, advertencias y puntos porcentuales', () => {
    const { container } = render(<Comparison />)
    expect(screen.getByRole('region', { name: 'Plan optimizado · CU-03' })).toHaveTextContent('764')
    expect(screen.getByRole('region', { name: 'Plan optimizado · CU-03' })).toHaveTextContent('MXN 24,960.50')
    expect(screen.getByRole('region', { name: 'Diferencias globales optimizado menos baseline' })).toHaveTextContent('Puntos porcentuales, no variación porcentual relativa')
    expect(screen.getByText(/Hubo stockouts/)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /DEMOSTRATIVO/ })).toBeInTheDocument()
    const table = within(screen.getByRole('region', { name: 'Tabla comparativa desplazable' })).getByRole('table')
    expect(table.querySelectorAll('tbody tr')).toHaveLength(20)
    for (const strategy of ['baseline', 'optimized']) {
      const total = [...table.querySelectorAll('tbody tr')].reduce((sum, row) => sum + Number(row.getAttribute(`data-${strategy}`)), 0)
      expect(container.querySelector(`svg [data-strategy="${strategy}"]`)).toHaveAttribute('data-units', String(total))
    }
  })
  it('filtros no recalculan estrategias ni cambian indicadores o gráfica global', async () => {
    const user = userEvent.setup()
    const spy = vi.spyOn(model, 'buildComparison')
    const { container } = render(<Comparison />)
    const calls = spy.mock.calls.length
    const metrics = screen.getByRole('region', { name: 'Indicadores globales comparados' }).textContent
    const graph = container.querySelector('svg')!.outerHTML
    await user.selectOptions(screen.getByRole('combobox', { name: 'Categoría' }), 'Hogar')
    expect(screen.getByRole('status')).toHaveTextContent('5 filas visibles')
    expect(spy.mock.calls.length).toBe(calls)
    expect(screen.getByRole('region', { name: 'Indicadores globales comparados' }).textContent).toBe(metrics)
    expect(container.querySelector('svg')!.outerHTML).toBe(graph)
    await user.selectOptions(screen.getByRole('combobox', { name: 'SKU' }), 'SKU-001')
    expect(screen.getByRole('heading', { name: 'Sin SKU para esta vista' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Restablecer filtros de presentación' }))
    expect(screen.getByRole('status')).toHaveTextContent('20 filas visibles')
    expect(spy.mock.calls.length).toBe(calls)
  })
  it('presupuesto cero muestra empate sin mejora ficticia', async () => {
    const user = userEvent.setup()
    const { container } = render(<Comparison />)
    const input = screen.getByRole('textbox', { name: 'Presupuesto global en MXN' })
    await user.clear(input); await user.type(input, '0')
    expect(screen.getByRole('note')).toHaveTextContent('Empate')
    expect(container.querySelector('svg [data-strategy="baseline"]')).toHaveAttribute('data-units', '0')
    expect(container.querySelector('svg [data-strategy="optimized"]')).toHaveAttribute('data-units', '0')
  })
  it('presupuesto inválido oculta la comparación anterior', async () => {
    const user = userEvent.setup()
    render(<Comparison />)
    const input = screen.getByRole('textbox', { name: 'Presupuesto global en MXN' })
    await user.clear(input); await user.type(input, '-1')
    expect(screen.getByRole('alert')).toHaveTextContent('Presupuesto inválido')
    expect(screen.queryByRole('region', { name: 'Indicadores globales comparados' })).not.toBeInTheDocument()
  })
  it('conserva exclusiones y N/D de CU-03 en ambas estrategias', () => {
    const dataset = createDataset(); dataset.sales.shift()
    const prepared = preparePurchaseData(dataset)
    const { container } = render(<Comparison dataset={dataset} />)
    expect(screen.getByRole('region', { name: 'Exclusiones compartidas' })).toHaveTextContent(prepared[0].exclusionReasons[0])
    const row = container.querySelector('tbody tr[data-sku="SKU-001"]')!
    expect(row).toHaveAttribute('data-baseline', 'missing')
    expect(row).toHaveAttribute('data-optimized', 'missing')
    expect(row.children[6]).toHaveTextContent('N/D')
    expect(row.children[7]).toHaveTextContent('N/D')
  })
  it('muestra error de consistencia y suprime conclusiones si el chequeo falla', () => {
    const original = model.buildComparison(preparePurchaseData(createDataset()), 2500000)
    vi.spyOn(model, 'buildComparison').mockReturnValue({ ...original, errors: ['El plan optimizado cubre menos unidades que el baseline válido.'], explanation: 'Error de consistencia.' })
    render(<Comparison />)
    expect(screen.getByRole('alert')).toHaveTextContent('No se afirma superioridad')
    expect(screen.queryByRole('region', { name: 'Indicadores globales comparados' })).not.toBeInTheDocument()
    expect(screen.queryByRole('note')).not.toBeInTheDocument()
  })
  it('con demanda cero, cobertura y diferencias porcentuales son N/D', () => {
    const dataset = createDataset(); dataset.sales = dataset.sales.map(r => ({ ...r, units: 0 }))
    const { container } = render(<Comparison dataset={dataset} />)
    expect(container.querySelector('svg [data-strategy="baseline"]')).toHaveAttribute('data-coverage', 'missing')
    expect(container.querySelector('svg [data-strategy="optimized"]')).toHaveAttribute('data-coverage', 'missing')
    expect(screen.getByRole('region', { name: 'Diferencias globales optimizado menos baseline' })).toHaveTextContent('N/D')
  })
})
