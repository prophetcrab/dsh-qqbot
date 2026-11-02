/**
 * AI chat contract: versioned request validation plus a normalized request body
 * the host passes to the AI service. Older Koishi plugins omit `apiVersion`;
 * that is treated as version 1, while future versions fail closed at the HTTP
 * boundary instead of silently degrading.
 */

import aiChatSchema from './ai-chat.schema.json' with { type: 'json' }
import { validateAgainstSchema } from './validate.js'

/** Current contract version. */
export const AI_CHAT_API_VERSION = 1

/** Response codes the Koishi side is allowed to branch on. */
export const AI_CHAT_ERROR_CODES = Object.freeze([
  'EMPTY_MESSAGES',
  'NO_LLM_SERVICE',
  'LLM_CALL_FAILED',
  'BUSY',
  'ABORTED',
  'EMPTY_REPLY',
])

/**
 * Validate an incoming `/qqbot/ai/chat` body.
 *
 * @param {unknown} body
 * @returns {{ valid: boolean, errors: string[], apiVersion: number|null }}
 */
export function validateAiChatRequest(body) {
  const apiVersion = body !== null && typeof body === 'object' && body.apiVersion !== undefined
    ? body.apiVersion
    : AI_CHAT_API_VERSION
  const errors = []
  if (apiVersion !== AI_CHAT_API_VERSION) {
    errors.push(`apiVersion: unsupported version ${String(apiVersion)} (max ${AI_CHAT_API_VERSION})`)
  }
  const structural = validateAgainstSchema(body, aiChatSchema)
  errors.push(...structural.errors.filter((error) => !error.startsWith('$.apiVersion')))
  return { valid: errors.length === 0, errors, apiVersion: Number.isInteger(apiVersion) ? apiVersion : null }
}

/**
 * Normalize a validated (or lenient legacy) request into the shape the AI
 * service consumes. Unknown fields are dropped, so a future client cannot leak
 * data through the host.
 *
 * @param {Record<string, any>} body
 */
export function normalizeAiChatRequest(body) {
  const source = body !== null && typeof body === 'object' ? body : {}
  const strings = ['groupId', 'userId', 'userName', 'background', 'system']
  const booleans = ['mentionSelf', 'mentionAll', 'replyToBot']
  const arrays = ['images', 'backgroundImages', 'quotedImages', 'mentionOthers']
  const request = {
    apiVersion: Number.isInteger(source.apiVersion) && source.apiVersion > 0 ? source.apiVersion : AI_CHAT_API_VERSION,
    messages: Array.isArray(source.messages) ? source.messages : [],
  }
  for (const key of strings) {
    if (typeof source[key] === 'string') request[key] = source[key]
  }
  for (const key of booleans) {
    if (source[key] === true) request[key] = true
  }
  for (const key of arrays) {
    if (Array.isArray(source[key])) request[key] = source[key]
  }
  if (source.quote !== null && typeof source.quote === 'object') request.quote = source.quote
  return request
}

/** Build a contract-shaped success/error response (used by tests and routes). */
export function aiChatResponse(result) {
  const source = result !== null && typeof result === 'object' ? result : {}
  if (source.ok === true && source.skipped === true) {
    return { ok: true, skipped: true, reason: String(source.reason ?? '') }
  }
  if (source.ok === true) {
    return { ok: true, reply: String(source.reply ?? ''), provider: String(source.provider ?? ''), model: String(source.model ?? '') }
  }
  return {
    ok: false,
    code: typeof source.code === 'string' ? source.code : 'LLM_FAILED',
    ...(source.retryable === true ? { retryable: true } : {}),
    ...(typeof source.error === 'string' ? { error: source.error } : {}),
  }
}
