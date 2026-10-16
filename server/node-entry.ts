import type { IncomingMessage, ServerResponse } from 'node:http'
import { Readable } from 'node:stream'
import copilot from './web-entry'

/** Adaptador Node HTTP del launcher Vercel; mantiene el handler Web y sus límites. */
export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    const headers = new Headers()
    for (const [key, value] of Object.entries(req.headers)) {
      if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(', ') : value)
    }
    const method = req.method ?? 'GET'
    const init: RequestInit & { duplex?: 'half' } = { method, headers }
    if (method !== 'GET' && method !== 'HEAD') {
      init.body = Readable.toWeb(req) as ReadableStream<Uint8Array>
      init.duplex = 'half'
    }
    const response = await copilot.fetch(new Request('https://copilot.internal/api/copilot', init))
    res.statusCode = response.status
    response.headers.forEach((value, key) => res.setHeader(key, value))
    res.end(Buffer.from(await response.arrayBuffer()))
  } catch {
    res.statusCode = 500
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Cache-Control', 'no-store')
    res.end(JSON.stringify({ error: 'No se pudo procesar la consulta.' }))
  }
}
