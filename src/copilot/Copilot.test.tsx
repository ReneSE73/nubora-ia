import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import Copilot from './Copilot'
import App from '../App'
afterEach(() => vi.unstubAllGlobals())
describe('Chat Copilot', () => {
  it('es navegable y ofrece preguntas sin respuestas falsas', async () => {
    render(<App />)
    await userEvent.click(screen.getByRole('button', { name: /CU-05 AI Copilot/ }))
    expect(screen.getByRole('heading', { name: 'NUBORA AI Copilot' })).toBeInTheDocument()
    expect(screen.getByRole('log')).toHaveTextContent('No incluyas datos personales')
    expect(screen.getByRole('button', { name: 'Enviar pregunta' })).toBeDisabled()
  })
  it('envía controles actuales y muestra respuesta simulada con fuentes', async () => {
    const transport = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ answer: 'Respuesta del proveedor simulado, datos sintéticos.', sources: [{ id: 'optimized.units', value: '764' }], model: 'mock' }) })
    vi.stubGlobal('fetch', transport)
    render(<Copilot />)
    await userEvent.clear(screen.getByLabelText('Presupuesto global MXN')); await userEvent.type(screen.getByLabelText('Presupuesto global MXN'), '100.50')
    await userEvent.selectOptions(screen.getByLabelText('SKU'), 'SKU-001')
    await userEvent.click(screen.getByRole('button', { name: 'Explica la compra recomendada con este presupuesto.' }))
    expect(await screen.findByText(/Respuesta del proveedor simulado/)).toBeInTheDocument()
    const body = JSON.parse(transport.mock.calls[0][1].body)
    expect(body.settings.budget).toBe('100.50'); expect(body.settings.sku).toBe('SKU-001')
    expect(Object.keys(body)).toEqual(['question', 'settings'])
    expect(screen.getByText(/Contexto: SKU-001/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Limpiar conversación' }))
    expect(screen.queryByText(/Respuesta del proveedor simulado/)).not.toBeInTheDocument()
  })
  it('muestra indisponibilidad del servidor sin respuesta de IA', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: 'Copilot no disponible: falta configuración del servidor.' }) }))
    render(<Copilot />)
    await userEvent.click(screen.getByRole('button', { name: /Resume las ventas/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent('falta configuración')
    expect(screen.queryByText(/Copilot:/)).not.toBeInTheDocument()
  })
  it('bloquea filtros inválidos antes de consultar', async () => {
    const f = vi.fn(); vi.stubGlobal('fetch', f); render(<Copilot />)
    await userEvent.clear(screen.getByLabelText('Presupuesto global MXN')); await userEvent.type(screen.getByLabelText('Presupuesto global MXN'), '-1')
    await userEvent.click(screen.getByRole('button', { name: /Resume las ventas/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent('inválidos'); expect(f).not.toHaveBeenCalled()
  })
  it('controla errores de red y respuesta inesperada', async () => {
    const f = vi.fn().mockRejectedValue(new Error('Error de red')); vi.stubGlobal('fetch', f); render(<Copilot />)
    await userEvent.click(screen.getByRole('button', { name: /Resume las ventas/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Error de red')
    f.mockResolvedValue({ ok: true, json: async () => ({ answer: null }) })
    await userEvent.click(screen.getByRole('button', { name: /Resume las ventas/ }))
    expect(await screen.findByText('Respuesta inválida del servidor.')).toBeInTheDocument()
  })
  it('permite cancelar y evita envíos concurrentes', async () => {
    const f = vi.fn().mockImplementation((_, options) => new Promise((_, reject) => options.signal.addEventListener('abort', () => reject(new Error('abort')))))
    vi.stubGlobal('fetch', f); render(<Copilot />)
    await userEvent.click(screen.getByRole('button', { name: /Resume las ventas/ }))
    expect(screen.getByRole('status')).toHaveTextContent('Consultando')
    expect(screen.getByRole('button', { name: /Resume las ventas/ })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar consulta' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('cancelada'))
    expect(f).toHaveBeenCalledTimes(1)
  })
})
