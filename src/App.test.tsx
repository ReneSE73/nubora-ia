import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import App from './App'
import { formatMXN } from './currency'

describe('Nubora', () => {
  it('inicia con análisis histórico y moneda mexicana', () => {
    render(<App />)
    expect(screen.getByRole('heading', { level: 1, name: 'Historial' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Ventas mensuales observadas' })).toBeInTheDocument()
    expect(screen.getByText('MXN · Pesos mexicanos')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /CU-01 Historial/ })).toHaveAttribute('aria-current', 'page')
  })
  it('abre CU-04 y conserva navegables los tres casos anteriores', async () => {
    const user = userEvent.setup()
    render(<App />)
    const nav = within(screen.getByRole('navigation'))
    await user.click(nav.getByRole('button', { name: /CU-04 Comparación/ }))
    expect(screen.getByRole('heading', { name: 'Comparación por SKU' })).toBeInTheDocument()
    await user.click(nav.getByRole('button', { name: /CU-03 Plan de compra/ }))
    expect(screen.getByRole('heading', { name: 'Cantidades recomendadas por SKU' })).toBeInTheDocument()
    await user.click(nav.getByRole('button', { name: /CU-02 Pronóstico/ }))
    expect(screen.getByRole('heading', { name: 'Pronósticos por SKU y mes' })).toBeInTheDocument()
    await user.click(nav.getByRole('button', { name: /CU-01 Historial/ }))
    expect(screen.getByRole('heading', { name: 'Ventas mensuales observadas' })).toBeInTheDocument()
  })
  it('abre CU-02 demostrativo y conserva el acceso a Historial', async () => {
    const user = userEvent.setup()
    render(<App />)
    const navigation = within(screen.getByRole('navigation'))
    await user.click(navigation.getByRole('button', { name: /CU-02 Pronóstico/ }))
    expect(screen.getByRole('heading', { name: 'Pronósticos por SKU y mes' })).toBeInTheDocument()
    await user.click(navigation.getByRole('button', { name: /CU-01 Historial/ }))
    expect(screen.getByRole('heading', { name: 'Ventas mensuales observadas' })).toBeInTheDocument()
  })
  it('abre CU-03 y permite seguir usando CU-01 y CU-02', async () => {
    const user = userEvent.setup()
    render(<App />)
    const navigation = within(screen.getByRole('navigation'))
    await user.click(navigation.getByRole('button', { name: /CU-03 Plan de compra/ }))
    expect(screen.getByRole('heading', { name: 'Cantidades recomendadas por SKU' })).toBeInTheDocument()
    await user.click(navigation.getByRole('button', { name: /CU-02 Pronóstico/ }))
    expect(screen.getByRole('heading', { name: 'Pronósticos por SKU y mes' })).toBeInTheDocument()
    await user.click(navigation.getByRole('button', { name: /CU-01 Historial/ }))
    expect(screen.getByRole('heading', { name: 'Ventas mensuales observadas' })).toBeInTheDocument()
  })
  it('permite navegar desde la ruta de trabajo', async () => {
    render(<App />)
    await userEvent.click(within(screen.getByRole('region', { name: 'Ruta de trabajo' })).getByRole('button', { name: /Comparación/ }))
    expect(screen.getByRole('heading', { level: 1, name: 'Comparación' })).toBeInTheDocument()
  })
  it('formatea importes en MXN con dos decimales', () => {
    expect(formatMXN(1234.5).replace(/\s/g, ' ')).toBe('MXN 1,234.50')
  })
})
