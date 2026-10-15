import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import Forecast from './Forecast'
import { createDataset } from '../history/data'

function assertChartTotals(container: HTMLElement) {
  const table = within(screen.getByRole('region', { name: 'Tabla de pronósticos desplazable' })).getByRole('table')
  for (const month of ['2026-01', '2026-02', '2026-03']) {
    const cells = [...table.querySelectorAll(`tr[data-month="${month}"] [data-forecast]`)]
    const total = cells.some(cell => cell.getAttribute('data-forecast') === 'missing') ? 'missing' : String(cells.reduce((sum, cell) => sum + Number(cell.getAttribute('data-forecast')), 0))
    expect(container.querySelector(`svg [data-kind="forecast"][data-month="${month}"]`)).toHaveAttribute('data-units', total)
  }
}

describe('Pantalla CU-02', () => {
  it('muestra 60 filas demostrativas, métodos y distinción visual entre pasado y futuro', () => {
    const { container } = render(<Forecast />)
    expect(screen.getByRole('heading', { name: /DEMOSTRATIVO · Enero/ })).toBeInTheDocument()
    const table = within(screen.getByRole('region', { name: 'Tabla de pronósticos desplazable' })).getByRole('table')
    expect(table.querySelectorAll('tbody tr')).toHaveLength(60)
    expect(container.querySelectorAll('svg [data-kind="history"]')).toHaveLength(24)
    expect(container.querySelectorAll('svg [data-kind="forecast"]')).toHaveLength(3)
    expect(screen.getByText(/Hubo faltantes de inventario/)).toBeInTheDocument()
    expect(screen.getByText(/No son predicciones comerciales garantizadas/)).toBeInTheDocument()
    assertChartTotals(container)
  })
  it('filtra categoría y SKU; gráfico y tabla permanecen consistentes', async () => {
    const user = userEvent.setup()
    const { container } = render(<Forecast />)
    await user.selectOptions(screen.getByRole('combobox', { name: 'Categoría' }), 'Despensa')
    expect(screen.getByRole('status')).toHaveTextContent('5 SKU seleccionados · 15 filas')
    assertChartTotals(container)
    await user.selectOptions(screen.getByRole('combobox', { name: 'SKU' }), 'SKU-001')
    expect(screen.getByRole('status')).toHaveTextContent('1 SKU seleccionados · 3 filas')
    assertChartTotals(container)
    await user.selectOptions(screen.getByRole('combobox', { name: 'Categoría' }), 'Hogar')
    expect(screen.getByRole('heading', { name: 'Sin SKU para esta selección' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Restablecer filtros' }))
    expect(screen.getByRole('status')).toHaveTextContent('20 SKU seleccionados · 60 filas')
  })
  it('señala datos incompletos como N/D sin publicar totales parciales', () => {
    const dataset = createDataset(); dataset.sales.shift()
    const { container } = render(<Forecast dataset={dataset} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Datos insuficientes en SKU-001')
    const first = container.querySelector('tr[data-sku="SKU-001"] [data-forecast]')
    expect(first).toHaveTextContent('N/D')
    assertChartTotals(container)
  })
  it('mantiene WAPE N/D con denominador cero y pronóstico cero válido', () => {
    const dataset = createDataset(); dataset.sales = dataset.sales.map(row => ({ ...row, units: 0 }))
    const { container } = render(<Forecast dataset={dataset} />)
    const table = within(screen.getByRole('region', { name: 'Tabla de pronósticos desplazable' })).getByRole('table')
    const first = table.querySelector('tbody tr')!
    expect(first.querySelector('[data-forecast]')).toHaveTextContent('0')
    expect(first.children[5]).toHaveTextContent('N/D')
    expect(first.children[4]).toHaveTextContent('0')
    assertChartTotals(container)
  })
})
