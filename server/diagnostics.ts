export type Stage = 'context' | 'provider' | 'grounding'
export type Code = 'GEMINI_HTTP' | 'GEMINI_SDK' | 'GEMINI_BLOCKED' | 'GEMINI_INCOMPLETE' | 'GEMINI_TEXT_INVALID' | 'GEMINI_JSON_INVALID' | 'GROUND_SHAPE' | 'GROUND_LENGTH' | 'GROUND_UNKNOWN_REFERENCE' | 'GROUND_MISSING_REFERENCE' | 'GROUND_FORBIDDEN_CONTENT' | 'COPILOT_TIMEOUT' | 'COPILOT_INTERNAL'
export type Details = { httpStatus?: number; providerStatus?: string; providerReason?: string; finishReason?: string; model?: string }
export class CopilotError extends Error {
  constructor(readonly code: Code, readonly details: Details = {}) { super(code) }
}
const statuses = new Set(['INVALID_ARGUMENT', 'UNAUTHENTICATED', 'PERMISSION_DENIED', 'NOT_FOUND', 'RESOURCE_EXHAUSTED', 'FAILED_PRECONDITION', 'INTERNAL', 'UNAVAILABLE', 'DEADLINE_EXCEEDED'])
const reasons = new Set(['API_KEY_INVALID', 'API_KEY_EXPIRED', 'API_KEY_SERVICE_BLOCKED', 'API_KEY_HTTP_REFERRER_BLOCKED', 'API_KEY_IP_ADDRESS_BLOCKED', 'SERVICE_DISABLED', 'BILLING_DISABLED', 'RATE_LIMIT_EXCEEDED', 'QUOTA_EXCEEDED', 'MODEL_NOT_FOUND'])
const finishes = new Set(['STOP', 'MAX_TOKENS', 'SAFETY', 'RECITATION', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'SPII', 'OTHER', 'LANGUAGE', 'IMAGE_SAFETY', 'MALFORMED_FUNCTION_CALL'])
export const safeFinish = (value: unknown) => typeof value === 'string' && finishes.has(value) ? value : 'OTHER'
/** Sólo extraer enums conocidos/código HTTP; jamás registrar message, stack, URL o body. */
export function sdkFailure(error: unknown): CopilotError {
  const e = error as { status?: unknown; message?: unknown }
  const httpStatus = typeof e?.status === 'number' && Number.isInteger(e.status) && e.status >= 400 && e.status <= 599 ? e.status : undefined
  const details: Details = { ...(httpStatus ? { httpStatus } : {}) }
  if (typeof e?.message === 'string' && e.message.length <= 16384) {
    try {
      const data = JSON.parse(e.message)?.error
      if (statuses.has(data?.status)) details.providerStatus = data.status
      const reason = data?.details?.find((d: { reason?: unknown }) => typeof d?.reason === 'string' && reasons.has(d.reason as string))?.reason
      if (reason) details.providerReason = reason
    } catch { /* Mensajes arbitrarios nunca se propagan. */ }
  }
  return new CopilotError(httpStatus ? 'GEMINI_HTTP' : 'GEMINI_SDK', details)
}
export function failureEvent(error: unknown, stage: Stage, requestId: string, aborted: boolean) {
  const failure = aborted ? new CopilotError('COPILOT_TIMEOUT') : error instanceof CopilotError ? error : new CopilotError('COPILOT_INTERNAL')
  return { event: 'copilot_failure', requestId, stage, code: failure.code, ...failure.details }
}
