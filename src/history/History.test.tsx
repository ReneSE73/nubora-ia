import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import History from './History'
import { createDataset } from './data'

function checkSeries(container: HTMLElement) {
  const chartRows = [...container.querySelectorAll('svg g[data-month]')].map(row => [row.getAttribute('data-month'), row.getAttribute('data-units')])
  const tableRows = [...within(screen.getByRole('region', { name: 'Tabla mensual desplazable' })).getByRole('table').querySelectorAll('tbody tr')].map(row => [row.getAttribute('data-month'), row.querySelector('[data-units]')?.getAttribute('data-units')])
  expect(chartRows.length).toBeGreaterThan(0)
  expect(chartRows).toEqual(tableRows)
}

describe('Pantalla Historial', () => {
  it('mantiene consistencia entre tabla mensual y gráfico al filtrar', async () => {
    const user = userEvent.setup()
    const { container } = render(<History />)
    checkSeries(container)
    await user.selectOptions(screen.getByLabelText('SKU'), 'SKU-020')
    await user.selectOptions(screen.getByLabelText('Hasta'), '2024-02')
    checkSeries(container)
    const table = within(screen.getByRole('region', { name: 'Tabla mensual desplazable' })).getByRole('table')
    expect(table.querySelectorAll('tbody tr')).toHaveLength(2)
    expect(table.querySelector('[data-month="2024-02"] [data-units]')).toHaveTextContent('0')
    expect(container.querySelector('svg [data-month="2024-02"]')).toHaveAttribute('data-units', '0')
    expect(screen.getByText(/Datos insuficientes para evaluar estacionalidad/)).toBeInTheDocument()
  })
  it('combina filtros, muestra estado vacío y permite restablecer', async () => {
    const user = userEvent.setup()
    render(<History />)
    await user.selectOptions(screen.getByLabelText('SKU'), 'SKU-001')
    await user.selectOptions(screen.getByLabelText('Categoría'), 'Hogar')
    expect(screen.getByRole('heading', { name: 'Sin ventas disponibles' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Limpiar filtros' }))
    expect(screen.getByRole('heading', { name: 'Resumen mensual' })).toBeInTheDocument()
    expect(screen.getByLabelText('SKU')).toHaveValue('')
  })
  it('informa un periodo invertido sin mostrar indicadores falsos', async () => {
    render(<History />)
    await userEvent.selectOptions(screen.getByLabelText('Desde'), '2025-12')
    await userEvent.selectOptions(screen.getByLabelText('Hasta'), '2024-01')
    expect(screen.getByRole('alert')).toHaveTextContent('Periodo inválido')
    expect(screen.queryByRole('region', { name: 'Indicadores del periodo' })).not.toBeInTheDocument()
  })
  it('advierte faltantes, identifica datos ficticios e inventario al corte', () => {
    render(<History />)
    expect(screen.getByRole('heading', { name: /Datos ficticios/ })).toBeInTheDocument()
    expect(screen.getByText(/Hubo faltantes de inventario/)).toBeInTheDocument()
    expect(screen.getByText(/Inventario al corte fijo 2025-12-31/)).toBeInTheDocument()
    expect(screen.getByText(/no demuestra estacionalidad confiable/)).toBeInTheDocument()
  })
  it('muestra N/D y alerta cuando falta un registro sin desalinear tabla y gráfico', () => {
    const dataset = createDataset()
    dataset.sales.pop()
    const { container } = render(<History dataset={dataset} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Datos incompletos')
    expect(container.querySelector('svg [data-month="2025-12"]')).toHaveAttribute('data-units', 'missing')
    checkSeries(container)
  })
  it('muestra ausencia total de registros como estado vacío y no como cero', () => {
    render(<History dataset={{ ...createDataset(), sales: [] }} />)
    expect(screen.getByRole('heading', { name: 'Sin ventas disponibles' })).toBeInTheDocument()
    expect(screen.getByText(/ausencia de registros no equivale a ventas de cero/)).toBeInTheDocument()
  })
  it('pagina el detalle sin cambiar los indicadores y reinicia página al filtrar', async () => {
    const user = userEvent.setup()
    render(<History />)
    const table = within(screen.getByRole('region', { name: 'Detalle de ventas desplazable' })).getByRole('table')
    expect(table.querySelectorAll('tbody tr')).toHaveLength(20)
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled()
    const metrics = screen.getByRole('region', { name: 'Indicadores del periodo' }).textContent
    await user.click(screen.getByRole('button', { name: 'Siguiente' }))
    expect(screen.getByText(/Página 2 de 24/)).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Indicadores del periodo' }).textContent).toBe(metrics)
    await user.selectOptions(screen.getByLabelText('SKU'), 'SKU-001')
    expect(screen.getByText(/Página 1 de 2/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled()
  })
})
