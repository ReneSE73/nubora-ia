import { useEffect, useRef, useState } from 'react'
import { createDataset } from '../history/data'
import { defaults, validateSettings, type Settings } from './context'

const dataset = createDataset()
const suggestions = ['Resume las ventas históricas y los faltantes.', '¿Cómo se eligió el pronóstico?', '¿Machine Learning supera a los otros modelos?', 'Explica la compra recomendada con este presupuesto.', '¿Por qué difieren el plan óptimo y el proporcional?']
interface Message { question: string; answer?: string; error?: string; sources?: { id: string; value: string }[]; scope: Settings; model?: string }
export default function Copilot() {
  const [settings, setSettings] = useState(defaults)
  const [question, setQuestion] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const controller = useRef<AbortController | null>(null)
  useEffect(() => () => controller.current?.abort(), [])
  const change = (key: keyof Settings, value: string) => setSettings(s => ({ ...s, [key]: value }))
  async function ask(text: string) {
    if (busy) return
    try { validateSettings(settings); if (!text.trim() || text.length > 600) throw new Error('Escribe una pregunta de hasta 600 caracteres.') }
    catch (e) { setError((e as Error).message); return }
    setError(''); setBusy(true); setQuestion('')
    const snapshot = { ...settings }
    setMessages(m => [...m.slice(-9), { question: text, scope: snapshot }])
    const abort = new AbortController(); controller.current = abort
    const timer = setTimeout(() => abort.abort(), 18000)
    try {
      const response = await fetch('/api/copilot', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: text, settings: snapshot }), signal: abort.signal })
      const body = await response.json().catch(() => null)
      if (!response.ok) throw new Error(body?.error ?? 'Copilot no disponible. Este sitio necesita una API de servidor configurada; no se ha mostrado una respuesta de IA.')
      if (typeof body?.answer !== 'string' || body.answer.length > 5000 || !Array.isArray(body.sources) || body.sources.some((s: { id?: unknown; value?: unknown }) => typeof s?.id !== 'string' || typeof s?.value !== 'string')) throw new Error('Respuesta inválida del servidor.')
      setMessages(m => m.map((item, i) => i === m.length - 1 ? { ...item, answer: body.answer, sources: body.sources, model: body.model } : item))
    } catch (e) {
      if (controller.current !== abort) return
      const message = abort.signal.aborted ? 'Consulta cancelada o tiempo de espera agotado. No se obtuvo respuesta de IA.' : (e as Error).message
      setMessages(m => m.map((item, i) => i === m.length - 1 ? { ...item, error: message } : item))
    } finally { clearTimeout(timer); if (controller.current === abort) { setBusy(false); controller.current = null } }
  }
  return <section className="data-panel copilot" aria-label="NUBORA AI Copilot">
    <div className="panel-header"><h2>NUBORA AI Copilot</h2><span className="neutral-badge">IA generativa · Sólo explicación</span></div>
    <div className="copilot-body">
      <p>Pregunta sobre tus resultados. El servidor consulta IA generativa real cuando está configurado. Datos sintéticos; no modifica pronósticos ni compras.</p>
      <p className="copilot-note">Contexto propio de este chat: selecciona filtros y presupuesto aquí. No se sincronizan con las otras pantallas. El periodo afecta sólo Historial; los pronósticos conservan el trimestre y el presupuesto es global para todos los SKU. Cada mensaje conserva su contexto. Las preguntas son independientes: no se envía la conversación anterior.</p>
      <fieldset disabled={busy} className="copilot-filters"><legend>Contexto de la consulta</legend>
        <label>SKU<select value={settings.sku} onChange={e => change('sku', e.target.value)}><option value="">Todos los SKU</option>{dataset.products.map(p => <option key={p.sku} value={p.sku}>{p.sku} · {p.name}</option>)}</select></label>
        <label>Categoría<select value={settings.category} onChange={e => change('category', e.target.value)}><option value="">Todas las categorías</option>{[...new Set(dataset.products.map(p => p.category))].map(c => <option key={c}>{c}</option>)}</select></label>
        <label>Desde<input type="month" min="2024-01" max="2025-12" value={settings.start} onChange={e => change('start', e.target.value)} /></label>
        <label>Hasta<input type="month" min="2024-01" max="2025-12" value={settings.end} onChange={e => change('end', e.target.value)} /></label>
        <label>Presupuesto global MXN<input inputMode="decimal" value={settings.budget} onChange={e => change('budget', e.target.value)} /></label>
      </fieldset>
      <div className="copilot-suggestions" aria-label="Preguntas sugeridas">{suggestions.map(s => <button key={s} disabled={busy} onClick={() => void ask(s)}>{s}</button>)}</div>
      <div role="log" aria-label="Conversación" aria-live="polite" aria-relevant="additions text" className="copilot-log">
        {!messages.length && <p className="copilot-empty">¿Qué te gustaría entender? Puedes empezar con una pregunta sugerida. No incluyas datos personales ni secretos; la pregunta y el contexto sintético se enviarán al proveedor.</p>}
        {messages.map((m, i) => <article key={i} className="copilot-message"><p><strong>Tú:</strong> {m.question}</p><small>Contexto: {m.scope.sku || 'Todos los SKU'} · {m.scope.category || 'Todas las categorías'} · {m.scope.start} a {m.scope.end} · Presupuesto global MXN {m.scope.budget}</small>{m.answer && <><p><strong>Copilot:</strong> {m.answer}</p><details><summary>Fuentes del contexto · {m.model}</summary><ul>{m.sources?.map(s => <li key={s.id}><strong>{s.id}</strong>: {s.value}</li>)}</ul></details></>}{m.error && <p role="alert">{m.error}</p>}</article>)}
        {busy && <p role="status">Consultando al modelo…</p>}
      </div>
      <form onSubmit={e => { e.preventDefault(); void ask(question) }}><label htmlFor="copilot-question">Tu pregunta</label><textarea id="copilot-question" rows={3} maxLength={600} value={question} disabled={busy} onChange={e => setQuestion(e.target.value)} placeholder="Explica los resultados que estoy viendo…" /><small>{question.length}/600 caracteres · Sin datos personales</small><div className="copilot-actions"><button disabled={busy || !question.trim()} type="submit">Enviar pregunta</button>{busy && <button type="button" onClick={() => controller.current?.abort()}>Cancelar consulta</button>}<button type="button" disabled={busy} onClick={() => { setMessages([]); setError('') }}>Limpiar conversación</button></div></form>
      {error && <p role="alert">{error}</p>}
    </div>
  </section>
}
