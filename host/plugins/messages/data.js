/**
 * Message feed bridge: the panel shows the bot's recent inbound messages from
 * the Koishi health plugin's ring buffer.
 */

import { httpJson } from '../../platform/mac/index.js'

/**
 * Fetch the recent message buffer from the local Koishi project.
 *
 * @param {{ koishiPort: number }} settings
 * @param {{ limit?: number }} [options]
 * @param {{ httpJson?: typeof httpJson, timeoutMs?: number }} [deps]
 * @returns {Promise<{ ok: boolean, messages: Array<object>, total: number, updatedAt: string|null, error?: string }>}
 */
export async function fetchMessages(settings, options = {}, deps = {}) {
  const request = deps.httpJson ?? httpJson
  const limit = clampInt(options.limit, 50, 1, 200)
  const url = `http://127.0.0.1:${settings.koishiPort}/api/qqbot/messages?limit=${limit}`
  const result = await request(url, { timeoutMs: deps.timeoutMs ?? 8000 })
  if (!result.ok) {
    return {
      ok: false,
      messages: [],
      total: 0,
      updatedAt: null,
      error: result.error ?? `HTTP ${result.status}`,
    }
  }
  return normalizeMessages(result.data, limit)
}

/**
 * Normalize the Koishi message feed payload (tolerates `{data:...}` wrappers).
 *
 * @param {unknown} payload
 * @param {number} [limit]
 */
export function normalizeMessages(payload, limit = 50) {
  const outer = payload !== null && typeof payload === 'object' ? payload : {}
  const source = outer.data !== null && typeof outer.data === 'object' ? outer.data : outer
  const rawList = Array.isArray(source.messages) ? source.messages : []
  const messages = rawList
    .map((message) => normalizeMessage(message))
    .filter((message) => message !== null)
    .slice(-clampInt(limit, 50, 1, 200))
  return {
    ok: source.ok !== false,
    messages,
    total: Number.isFinite(Number(source.total)) ? Number(source.total) : messages.length,
    updatedAt: typeof source.updatedAt === 'string' ? source.updatedAt : null,
  }
}

/** Normalize one message record from the Koishi buffer. */
export function normalizeMessage(raw) {
  if (raw === null || typeof raw !== 'object') return null
  const time = typeof raw.time === 'string' && raw.time !== '' ? raw.time : new Date().toISOString()
  const content = typeof raw.content === 'string' ? raw.content : ''
  return {
    id: typeof raw.id === 'number' ? raw.id : Number(raw.id) || 0,
    time,
    direction: raw.direction === 'out' ? 'out' : 'in',
    scene: raw.scene === 'private' ? 'private' : 'group',
    targetId: String(raw.targetId ?? raw.groupId ?? ''),
    ...(typeof raw.groupId === 'string' ? { groupId: raw.groupId } : {}),
    userId: String(raw.userId ?? ''),
    ...(typeof raw.userName === 'string' && raw.userName !== '' ? { userName: raw.userName } : {}),
    content,
    ...(typeof raw.messageId === 'string' && raw.messageId !== '' ? { messageId: raw.messageId } : {}),
  }
}

/** Clamp an integer candidate. */
function clampInt(value, fallback, min, max) {
  const number = Number(value)
  if (!Number.isInteger(number)) return fallback
  return Math.min(max, Math.max(min, number))
}
