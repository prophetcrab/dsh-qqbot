/**
 * Contacts bridge: the QQ bot control center reads the logged-in account's
 * group and friend lists from the Koishi health endpoint, so the panel can
 * manage permissions by clicking real names instead of typing ids.
 */

import { httpJson } from './util.js'

/**
 * Fetch groups and friends from the local Koishi project.
 *
 * @param {{ koishiPort: number }} settings
 * @param {{ httpJson?: typeof httpJson, timeoutMs?: number }} [deps]
 * @returns {Promise<{ ok: boolean, groups: Array<object>, friends: Array<object>, selfId: string|null, fetchedAt: string|null, error?: string }>}
 */
export async function fetchContacts(settings, deps = {}) {
  const request = deps.httpJson ?? httpJson
  const url = `http://127.0.0.1:${settings.koishiPort}/api/qqbot/contacts`
  const result = await request(url, { timeoutMs: deps.timeoutMs ?? 8000 })
  if (!result.ok) {
    return {
      ok: false,
      groups: [],
      friends: [],
      selfId: null,
      fetchedAt: null,
      error: result.error ?? `HTTP ${result.status}`,
    }
  }
  return normalizeContacts(result.data)
}

/**
 * Normalize the Koishi contacts payload. Tolerates a missing/failed payload so
 * the panel can still edit modes and report why the lists are empty.
 *
 * @param {unknown} data
 */
export function normalizeContacts(data) {
  const source = data !== null && typeof data === 'object' ? data : {}
  const groups = Array.isArray(source.groups)
    ? source.groups
        .map((group) => normalizeGroup(group))
        .filter((group) => group.id !== '')
        .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
    : []
  const friends = Array.isArray(source.friends)
    ? source.friends
        .map((friend) => normalizeFriend(friend))
        .filter((friend) => friend.id !== '')
        .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
    : []
  return {
    ok: source.ok === true,
    groups,
    friends,
    selfId: typeof source.selfId === 'string' ? source.selfId : null,
    fetchedAt: typeof source.fetchedAt === 'string' ? source.fetchedAt : new Date().toISOString(),
    ...(source.ok === true ? {} : { error: typeof source.error === 'string' ? source.error : 'contacts unavailable' }),
  }
}

function normalizeGroup(group) {
  const source = group !== null && typeof group === 'object' ? group : {}
  const id = String(source.id ?? '').trim()
  const memberCount = Number(source.memberCount)
  return {
    id,
    name: String(source.name ?? id).trim() || id,
    ...(Number.isFinite(memberCount) && memberCount > 0 ? { memberCount } : {}),
  }
}

function normalizeFriend(friend) {
  const source = friend !== null && typeof friend === 'object' ? friend : {}
  const id = String(source.id ?? '').trim()
  return { id, name: String(source.name ?? id).trim() || id }
}
