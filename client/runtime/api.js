/**
 * Pure HTTP helpers, formatters and payload-shaping functions shared by the
 * client plugins. No React, no state: everything here is testable in isolation.
 */

/** Status polling interval; the Host route is cheap and read-only. */
export const POLL_MS = 4000

/** Log tail size requested from GET /qqbot/logs. */
export const LOG_LINES = 200

/** Scope modes accepted by the Host access policy. */
export const ACCESS_MODES = ['all', 'whitelist', 'blacklist']

/** Fixed smoke-style prompt used by the panel's AI self-test. */
export const AI_TEST_PROMPT = '请只回复：AI 面板测试成功'

/** The persona card supports at most 8 few-shot examples. */
export const MAX_PERSONA_EXAMPLES = 8

/** Locale keys for the `/qqbot/setup/full` step ids. */
export const SETUP_STEP_KEYS = {
  'koishi-project': 'setupStepProject',
  'koishi-deps': 'setupStepDeps',
  'napcat-install': 'setupStepNapcatInstall',
  'koishi-start': 'setupStepKoishiStart',
  'napcat-configure': 'setupStepConfigure',
  'napcat-start': 'setupStepNapcatStart',
}

export function messageOf(error) {
  return String(error && error.message !== undefined ? error.message : error)
}

/**
 * JSON fetch wrapper. Every Host route answers `{ ok, ... }`; a transport
 * failure, a non-2xx status or `ok:false` all throw with a user-facing text.
 * `acceptNotOk` opts out of the `ok:false` throw: /qqbot/contacts reports an
 * unavailable bot that way while the panel must stay editable.
 */
export async function requestJson(path, options) {
  const config = options || {}
  const init = {
    method: config.method || 'GET',
    cache: 'no-store',
    headers: { accept: 'application/json' },
  }
  if (config.body !== undefined) {
    init.headers['content-type'] = 'application/json'
    init.body = JSON.stringify(config.body)
  }
  const response = await fetch(path, init)
  let payload = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }
  if (!response.ok) throw new Error(payload && payload.error ? payload.error : `HTTP ${response.status}`)
  if (payload !== null && payload.ok === false && config.acceptNotOk !== true) {
    throw new Error(payload.error ? payload.error : 'request failed')
  }
  return payload
}

export function pickText(value, lang) {
  if (typeof value === 'string') return value
  if (value === null || typeof value !== 'object') return ''
  const preferred = value[lang]
  if (typeof preferred === 'string' && preferred !== '') return preferred
  const fallback = value[lang === 'zh' ? 'en' : 'zh']
  return typeof fallback === 'string' ? fallback : ''
}

export function compactValue(value) {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'string') return value === '' ? '—' : value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return `${value.length}`
  try {
    const text = JSON.stringify(value)
    if (typeof text !== 'string') return '—'
    return text.length > 96 ? `${text.slice(0, 93)}…` : text
  } catch {
    return '—'
  }
}

export function pluginKey(plugin) {
  if (plugin === null || typeof plugin !== 'object') return ''
  if (typeof plugin.key === 'string' && plugin.key !== '') return plugin.key
  if (typeof plugin.name === 'string') return plugin.name
  if (typeof plugin.packageName === 'string') return plugin.packageName
  return ''
}

export function pluginLabel(plugin) {
  if (plugin !== null && typeof plugin === 'object' && typeof plugin.name === 'string' && plugin.name !== '') return plugin.name
  return pluginKey(plugin)
}

export function formatTime(value) {
  if (typeof value !== 'string' || value === '') return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleTimeString()
}

export function aiSettingsDraftFrom(settings) {
  const source = settings !== null && typeof settings === 'object' ? settings : {}
  const probability = Number(source.replyProbability)
  const followUp = Number(source.followUpMinutes)
  const history = Number(source.historyLimit)
  const batchWindow = Number(source.batchWindowMs)
  const batchMaxWait = Number(source.batchMaxWaitMs)
  return {
    enabled: source.enabled !== false,
    replyProbabilityPercent: Number.isFinite(probability) ? Math.round(probability * 10000) / 100 : 15,
    followUpMinutes: Number.isFinite(followUp) ? followUp : 3,
    historyLimit: Number.isFinite(history) ? history : 100,
    batchWindowMs: Number.isFinite(batchWindow) ? batchWindow : 2500,
    batchMaxWaitMs: Number.isFinite(batchMaxWait) ? batchMaxWait : 10000,
  }
}

export function aiSettingsBodyFrom(draft) {
  const percent = Number(draft.replyProbabilityPercent)
  const probability = Number.isFinite(percent) ? Math.min(1, Math.max(0, percent / 100)) : 0.15
  const followUp = Number(draft.followUpMinutes)
  const history = Number(draft.historyLimit)
  const batchWindow = Number(draft.batchWindowMs)
  const batchMaxWait = Number(draft.batchMaxWaitMs)
  return {
    enabled: draft.enabled === true,
    replyProbability: Math.round(probability * 1000) / 1000,
    followUpMinutes: Number.isFinite(followUp) ? followUp : 3,
    historyLimit: Number.isFinite(history) ? history : 100,
    batchWindowMs: Number.isFinite(batchWindow) ? Math.min(10000, Math.max(0, batchWindow)) : 2500,
    batchMaxWaitMs: Number.isFinite(batchMaxWait) ? Math.min(30000, Math.max(0, batchMaxWait)) : 10000,
  }
}

export function profileDraftFrom(profile) {
  const source = profile !== null && typeof profile === 'object' ? profile : {}
  const text = (value) => (typeof value === 'string' ? value : '')
  return {
    key: text(source.key),
    groupId: text(source.groupId),
    qq: text(source.qq),
    nickname: text(source.nickname),
    summary: text(source.summary),
    personality: text(source.personality),
    style: text(source.style),
    relationship: text(source.relationship),
    interests: Array.isArray(source.interests) ? source.interests.map((item) => String(item)).join(', ') : '',
    recent: text(source.recent),
    interactions: Number(source.interactions) || 0,
  }
}

export function parseInterests(text) {
  if (typeof text !== 'string' || text.trim() === '') return []
  const seen = new Set()
  for (const part of text.split(/[,，、;；]+/u)) {
    const value = part.trim()
    if (value !== '') seen.add(value)
  }
  return [...seen]
}

export function profileBodyFrom(draft) {
  return {
    key: draft.key,
    groupId: draft.groupId,
    qq: draft.qq,
    nickname: draft.nickname,
    summary: draft.summary,
    personality: draft.personality,
    style: draft.style,
    relationship: draft.relationship,
    interests: parseInterests(draft.interests),
    recent: draft.recent,
  }
}

export function draftFromPersona(persona) {
  const source = persona !== null && typeof persona === 'object' ? persona : {}
  const text = (value) => (typeof value === 'string' ? value : '')
  const examples = Array.isArray(source.examples)
    ? source.examples
      .filter((item) => item !== null && typeof item === 'object')
      .slice(0, MAX_PERSONA_EXAMPLES)
      .map((item) => ({ user: text(item.user), assistant: text(item.assistant) }))
    : []
  return {
    name: text(source.name),
    role: text(source.role),
    tone: text(source.tone),
    personality: text(source.personality),
    rules: text(source.rules),
    examples,
  }
}

export function personaBody(draft) {
  return {
    name: draft.name,
    role: draft.role,
    tone: draft.tone,
    personality: draft.personality,
    rules: draft.rules,
    examples: draft.examples.map((example) => ({ user: example.user, assistant: example.assistant })),
  }
}

export function normalizeMode(value) {
  return ACCESS_MODES.includes(value) ? value : 'all'
}

export function scopeIds(scope) {
  return Array.isArray(scope.ids) ? scope.ids.map((id) => String(id)) : []
}

export function parsePrefixes(text) {
  if (typeof text !== 'string' || text.trim() === '') return []
  const seen = new Set()
  for (const part of text.split(/[\s,，、;；]+/u)) {
    const prefix = part.trim()
    if (prefix !== '') seen.add(prefix)
  }
  return [...seen]
}

/**
 * Turn an AccessPolicy payload into the editable draft. Every scope keeps
 * its full mode and id list; selection happens through the contact lists.
 */
export function draftFromPolicy(policy) {
  const source = policy !== null && typeof policy === 'object' ? policy : {}
  const inbound = source.inbound !== null && typeof source.inbound === 'object' ? source.inbound : {}
  const outbound = source.outbound !== null && typeof source.outbound === 'object' ? source.outbound : {}
  const quiet = inbound.quiet !== null && typeof inbound.quiet === 'object' ? inbound.quiet : {}
  const inboundGroups = inbound.groups !== null && typeof inbound.groups === 'object' ? inbound.groups : {}
  const inboundPrivate = inbound.private !== null && typeof inbound.private === 'object' ? inbound.private : {}
  const outboundGroups = outbound.groups !== null && typeof outbound.groups === 'object' ? outbound.groups : {}
  const outboundPrivate = outbound.private !== null && typeof outbound.private === 'object' ? outbound.private : {}
  return {
    inboundGroupsMode: normalizeMode(inboundGroups.mode),
    inboundGroupIds: scopeIds(inboundGroups),
    inboundPrivateMode: normalizeMode(inboundPrivate.mode),
    inboundPrivateIds: scopeIds(inboundPrivate),
    outboundGroupsMode: normalizeMode(outboundGroups.mode),
    outboundGroupIds: scopeIds(outboundGroups),
    outboundPrivateMode: normalizeMode(outboundPrivate.mode),
    outboundPrivateIds: scopeIds(outboundPrivate),
    quietEnabled: quiet.enabled === true,
    prefixes: Array.isArray(quiet.prefixes) ? quiet.prefixes.map((prefix) => String(prefix)).join(' ') : '',
  }
}
