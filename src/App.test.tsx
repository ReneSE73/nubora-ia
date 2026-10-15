import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import App from './App'
import { formatMXN } from './currency'

describe('Nubora', () => {
  it('inicia con historial vacío y moneda mexicana', () => {
    render(<App />)
    expect(screen.getByRole('heading', { level: 1, name: 'Historial' })).toBeInTheDocument()
    expect(screen.getByText('Tu historial comienza aquí')).toBeInTheDocument()
    expect(screen.getByText('MXN · Pesos mexicanos')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /CU-01 Historial/ })).toHaveAttribute('aria-current', 'page')
  })
  it.each(['Pronóstico', 'Plan de compra', 'Comparación'])('navega a %s sin inventar resultados y permite regresar', async (title) => {
    const user = userEvent.setup()
    render(<App />)
    const navigation = within(screen.getByRole('navigation'))
    const button = navigation.getByRole('button', { name: new RegExp(title) })
    await user.click(button)
    expect(screen.getByRole('heading', { level: 1, name: title })).toBeInTheDocument()
    expect(button).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('heading', { name: 'Módulo pendiente' })).toBeInTheDocument()
    expect(screen.getByText(/No hay cálculos ni resultados generados/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Volver a Historial/ }))
    expect(screen.getByText('Tu historial comienza aquí')).toBeInTheDocument()
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
