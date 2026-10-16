// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'
import { createHandler, groundAnswer, openAIProvider } from './copilot'
import { buildContext, defaults } from '../src/copilot/context'
import { createDataset } from '../src/history/data'
import { analyzeHistory } from '../src/history/analysis'
import { analyzeForecast } from '../src/forecast/engine'
import { preparePurchaseData } from '../src/purchases/model'
import { buildComparison } from '../src/comparison/model'
const env = { OPENAI_API_KEY: 'server-only-test-secret', OPENAI_MODEL: 'configured-model', COPILOT_ENABLED: 'true', COPILOT_ORIGIN: 'https://nubora.test' }
const good = { sentences: ['El plan recomienda {{optimized.units}} unidades.', 'La explicación reconoce {{history.quality.seasonalityNote}}.'] }
const req = (body: unknown = { question: 'Explica la compra', settings: defaults }, headers = {}) => new Request('https://nubora.test/api/copilot', { method: 'POST', headers: { origin: env.COPILOT_ORIGIN, 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) })
describe('Contexto de Copilot', () => {
  it('reutiliza exactamente los motores y presupuesto global sin mutaciones', () => {
    const data = createDataset(), original = JSON.stringify(data)
    const c = buildContext(defaults)
    const h = analyzeHistory(data, defaults), f = analyzeForecast(data, defaults)
    const compare = buildComparison(preparePurchaseData(data), 2500000)
    expect(c.evidence['history.totalUnits']).toBe(String(h.summary.totalUnits))
    expect(c.facts.forecast.monthly).toEqual(f.forecast)
    expect(c.facts.optimized.units).toBe(compare.optimized.recommendedUnits)
    expect(c.facts.baseline.spentCents).toBe(compare.baseline.spentCents)
    expect(c.facts.comparison.deltaCoveragePoints).toBe(compare.deltaCoveragePoints)
    expect(JSON.stringify(data)).toBe(original)
    expect(c.evidence['ml.test.metrics.0.mae']).toBe('9.9')
  })
  it('aplica filtros y periodo al historial, mantiene globales compra y ML', () => {
    const all = buildContext(defaults)
    const c = buildContext({ ...defaults, sku: 'SKU-001', start: '2025-01' })
    expect(c.facts.history.selectedSkus).toEqual(['SKU-001'])
    expect(c.facts.history.monthly).toHaveLength(12)
    expect(c.facts.forecast.products).toHaveLength(1)
    expect(c.facts.purchases).toHaveLength(1)
    expect(c.facts.optimized).toEqual(all.facts.optimized)
    expect(c.facts.ml).toEqual(all.facts.ml)
    expect(buildContext({ ...defaults, budget: '0' }).facts.optimized.units).toBe(0)
  })
  it('conserva selección vacía como N/D y advertencias de stockouts', () => {
    const c = buildContext({ ...defaults, sku: 'SKU-001', category: 'Hogar' })
    expect(c.evidence['history.average']).toBe('N/D')
    expect(c.facts.forecast.monthly.every(p => p.units === null)).toBe(true)
    expect(buildContext(defaults).facts.history.quality.hasStockouts).toBe(true)
  })
  it.each([{ ...defaults, sku: 'fake' }, { ...defaults, budget: '-1' }, { ...defaults, start: '1900-01' }, { ...defaults, start: '2025-12', end: '2024-01' }])('rechaza controles inválidos', s => expect(() => buildContext(s)).toThrow())
})
describe('API con proveedor simulado', () => {
  it('responde con cifras verificadas, fuentes y advertencia sintética', async () => {
    const provider = vi.fn().mockResolvedValue(good)
    const r = await createHandler(env, provider)(req())
    const body = await r.json()
    expect(r.status).toBe(200); expect(body.answer).toContain('764 unidades')
    expect(body.answer).toContain('datos son sintéticos')
    expect(body.sources[0]).toEqual({ id: 'optimized.units', value: '764' })
    expect(JSON.stringify(provider.mock.calls)).not.toContain(env.OPENAI_API_KEY)
    expect(JSON.stringify(body)).not.toContain(env.OPENAI_API_KEY)
    expect(r.headers.get('cache-control')).toBe('no-store')
  })
  it('sin configuración no consulta proveedor ni finge IA', async () => {
    const provider = vi.fn()
    const r = await createHandler({}, provider)(req())
    expect(r.status).toBe(503); expect(provider).not.toHaveBeenCalled()
  })
  it('valida método, origen, tipo, longitud y contexto no confiable', async () => {
    const p = vi.fn(), h = createHandler(env, p)
    expect((await h(new Request('https://nubora.test/api/copilot'))).status).toBe(405)
    expect((await h(req(undefined, { origin: 'https://evil.test' }))).status).toBe(403)
    expect((await h(req(undefined, { 'content-type': 'text/plain' }))).status).toBe(415)
    expect((await h(req({ question: '', settings: defaults }))).status).toBe(400)
    expect((await h(req({ question: 'x'.repeat(601), settings: defaults }))).status).toBe(400)
    expect((await h(req({ question: 'x', settings: defaults, context: { units: 999 } }))).status).toBe(400)
    expect((await h(req({ question: 'x'.repeat(5000) }))).status).toBe(413)
    expect((await h(req(undefined, { 'content-length': '5000' }))).status).toBe(413)
    expect(p).not.toHaveBeenCalled()
  })
  it('rechaza JSON malformado', async () => {
    const r = await createHandler(env, vi.fn())(new Request('https://nubora.test/api/copilot', { method: 'POST', headers: { origin: env.COPILOT_ORIGIN, 'content-type': 'application/json' }, body: '{' }))
    expect(r.status).toBe(400)
  })
  it('limita diez llamadas por minuto y reinicia ventana', async () => {
    let time = 100000
    const p = vi.fn().mockResolvedValue(good), h = createHandler(env, p, { now: () => time })
    for (let i = 0; i < 10; i++) expect((await h(req())).status).toBe(200)
    expect((await h(req())).status).toBe(429); expect(p).toHaveBeenCalledTimes(10)
    time += 60000; expect((await h(req())).status).toBe(200)
  })
  it('aborta espera y limita concurrencia', async () => {
    const p = vi.fn().mockImplementation(() => new Promise(() => {})), h = createHandler(env, p, { timeoutMs: 20 })
    const a = h(req()), b = h(req())
    await new Promise(resolve => setTimeout(resolve, 2))
    expect((await h(req())).status).toBe(429)
    expect((await a).status).toBe(504); expect((await b).status).toBe(504)
    expect(p.mock.calls[0][2].aborted).toBe(true)
  })
  it('no filtra errores ni secretos del proveedor', async () => {
    const r = await createHandler(env, async () => { throw new Error(env.OPENAI_API_KEY) })(req())
    expect(r.status).toBe(502); expect(await r.text()).not.toContain(env.OPENAI_API_KEY)
  })
  it.each([{ sentences: ['Número inventado 999.', 'Otra {{optimized.units}}.'] }, { sentences: ['{{missing}}', '{{optimized.units}}'] }, { sentences: ['sin referencia', '{{optimized.units}}'] }, { sentences: ['<script>{{optimized.units}}</script>', '{{optimized.units}}'] }, { sentences: [] }])('rechaza respuesta no fundamentada', raw => expect(() => groundAnswer(raw, buildContext(defaults).evidence)).toThrow())
  it('integra Responses real por HTTP, clave sólo en header, sin almacenar', async () => {
    const transport = vi.fn().mockResolvedValue(Response.json({ status: 'completed', output: [{ content: [{ type: 'output_text', text: JSON.stringify(good) }] }] }))
    const result = await openAIProvider(env, transport)('Pregunta no confiable', buildContext(defaults), new AbortController().signal)
    expect(result).toEqual(good)
    const [url, options] = transport.mock.calls[0]
    expect(url).toBe('https://api.openai.com/v1/responses')
    expect(options.headers.Authorization).toBe(`Bearer ${env.OPENAI_API_KEY}`)
    expect(options.body).not.toContain(env.OPENAI_API_KEY)
    const body = JSON.parse(options.body)
    expect(body.store).toBe(false); expect(body.max_output_tokens).toBe(700)
    expect(body.text.format.strict).toBe(true); expect(body.tools).toBeUndefined()
  })
  it('rechaza HTTP fallido, rechazo e incompletitud sin inventar explicación', async () => {
    for (const response of [new Response('', { status: 429 }), Response.json({ status: 'incomplete' }), Response.json({ status: 'completed', output: [{ content: [{ type: 'refusal' }] }] })]) {
      await expect(openAIProvider(env, vi.fn().mockResolvedValue(response))('x', buildContext(defaults), new AbortController().signal)).rejects.toThrow()
    }
  })
})
