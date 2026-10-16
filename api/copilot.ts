import { createHandler } from '../server/copilot'
// Variables de Node sólo en esta función; nunca importar este módulo desde src.
declare const process: { env: Record<string, string | undefined> }
export default { fetch: createHandler(process.env) }
