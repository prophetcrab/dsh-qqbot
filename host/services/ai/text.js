/**
 * Pure text helpers for the AI chat bridge: failure classification, reply
 * sanitizing and request-message normalization. No I/O, no LLM access.
 */

import { randomUUID } from 'node:crypto'

/** @typedef {{ role: 'user' | 'assistant', text: string }} ChatMessage */

/** @param {unknown} value */
export const isObject = (value) => value !== null && typeof value === 'object'

/** Treat provider overload/rate-limit/timeout failures as retryable. */
export function isTransientLlmFailure(failure) {
  const code = String(failure?.code ?? '').toUpperCase()
  const message = String(failure?.message ?? '')
  if (['RATE_LIMIT', 'OVERLOADED', 'TIMEOUT', 'SERVER', 'SERVER_ERROR', 'INTERNAL_ERROR', 'SERVICE_UNAVAILABLE', 'BUSY'].includes(code)) return true
  return /too busy|rate.?limit|temporarily|overloaded|service unavailable|internal server error|\b429\b|\b500\b|\b502\b|\b503\b|\b504\b/iu.test(message)
}

/**
 * Strip leaked prompt labels/speaker prefixes from a model reply.
 *
 * The model occasionally imitates the context markers it sees (`[背景]`,
 * `[当前消息]`, `AI：`) and sends them to the group. Remove only those known
 * markers at line starts (or immediately before a colon), leaving ordinary
 * brackets in the reply untouched.
 *
 * @param {unknown} input
 * @returns {string}
 */
export function sanitizeReply(input) {
  let text = String(input ?? '')
  const labels = '背景|当前消息|群聊背景|最近群聊背景|历史|上下文'
  const bracket = `[\\[【]\\s*(?:${labels})\\s*[\\]】]`
  // "[背景] AI：" / "[当前消息] 小明：" - drop the label and speaker prefix.
  text = text.replace(new RegExp(`(^|\\n)\\s*${bracket}\\s*(?:AI|[^：\\n]{1,40})\\s*[:：]\\s*`, 'gu'), '$1')
  // Inline occurrences of the same labelled prefix.
  text = text.replace(new RegExp(`${bracket}\\s*(?:AI|[^：\\n]{1,40})\\s*[:：]\\s*`, 'gu'), '')
  // A bare label with no speaker.
  text = text.replace(new RegExp(`(^|\\n)\\s*${bracket}\\s*`, 'gu'), '$1')
  text = text.replace(new RegExp(`${bracket}\\s*`, 'gu'), '')
  // Remove any remaining literal context markers, even mid-reply.
  text = text.replace(/[\[【]\s*(?:背景|当前消息|群聊背景|最近群聊背景|历史|上下文)\s*[\]】]/gu, '')
  text = text.replace(/^\s*AI\s*[:：]\s*/u, '')
  return text.replace(/[ \t]{2,}/g, ' ').trim()
}

/**
 * Convert simple `{role, text}` messages into RequestMessage values accepted by
 * `ctx.llm.stream`. Only text is supported here.
 *
 * @param {unknown} input
 * @returns {Array<{ role: 'user' | 'assistant', content: Array<{ type: 'text', text: string }> }>}
 */
export function normalizeMessages(input, selection = { provider: 'deepseek-account', model: 'deepseek-flash' }) {
  if (!Array.isArray(input)) return []
  const output = []
  for (const item of input) {
    if (!isObject(item)) continue
    const role = item.role === 'assistant' ? 'assistant' : item.role === 'user' ? 'user' : null
    if (role === null) continue
    const raw = typeof item.text === 'string'
      ? item.text
      : Array.isArray(item.content)
        ? item.content.filter((part) => isObject(part) && part.type === 'text' && typeof part.text === 'string').map((part) => part.text).join('')
        : typeof item.content === 'string' ? item.content : ''
    const text = raw.trim()
    if (text === '') continue
    const content = [{ type: 'text', text: text.slice(0, 6000) }]
    if (role === 'assistant') {
      // RequestMessage requires a full assistant Message (id + model source);
      // request-only inputs are user-role only.
      output.push({
        role: 'assistant',
        id: randomUUID(),
        content,
        source: {
          kind: 'model',
          provider: String(selection?.provider ?? 'deepseek-account'),
          model: String(selection?.model ?? 'deepseek-flash'),
        },
      })
    } else {
      output.push({ role: 'user', content })
    }
  }
  return output.slice(-40)
}

/** @param {unknown} value */
export function normalizeLogger(logger) {
  const source = isObject(logger) ? logger : {}
  return {
    info: typeof source.info === 'function' ? source.info.bind(source) : () => {},
    warn: typeof source.warn === 'function' ? source.warn.bind(source) : () => {},
    error: typeof source.error === 'function' ? source.error.bind(source) : () => {},
    debug: typeof source.debug === 'function' ? source.debug.bind(source) : () => {},
  }
}

export function boundedInt(value, fallback, min, max, defaultValue) {
  const raw = value ?? fallback
  const number = Number(raw)
  if (!Number.isFinite(number)) return defaultValue
  return Math.min(max, Math.max(min, Math.trunc(number)))
}

export function boundedNumber(value, fallback, min, max, defaultValue) {
  const raw = value ?? fallback
  const number = Number(raw)
  if (!Number.isFinite(number)) return defaultValue
  return Math.min(max, Math.max(min, number))
}