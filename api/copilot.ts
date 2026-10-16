import { createHandler } from '../server/copilot'
// Variables de Node sólo en esta función; nunca importar este módulo desde src.
declare const process: { env: Record<string, string | undefined> }
export default { fetch: createHandler({
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  GEMINI_MODEL: process.env.GEMINI_MODEL,
  COPILOT_ENABLED: process.env.COPILOT_ENABLED,
  COPILOT_ORIGIN: process.env.COPILOT_ORIGIN,
}) }
