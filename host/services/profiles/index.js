/**
 * Long-term per-persona memory: one profile per (group, QQ) pair.
 *
 * Profiles are maintained after every AI reply by asking the configured model
 * to merge the latest exchange into the existing card. The profile is later
 * injected as the second system-prompt segment, right after the persona card.
 */

import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

const MAX = {
  nickname: 40,
  summary: 500,
  personality: 300,
  style: 200,
  relationship: 200,
  recent: 600,
  interests: 12,
}
const MAX_PROFILES = 2000

/** Storage key: one card per group + QQ. */
export function profileKey(groupId, userId) {
  return `${String(groupId ?? 'private')}:${String(userId ?? '')}`
}

/** Create an empty card with bounded fields. */
export function createProfile({ groupId, userId, userName }) {
  const now = new Date().toISOString()
  return {
    groupId: String(groupId ?? 'private'),
    qq: String(userId ?? ''),
    nickname: bounded(userName, MAX.nickname) || String(userId ?? ''),
    summary: '',
    personality: '',
    style: '',
    relationship: '',
    interests: [],
    recent: '',
    interactions: 0,
    firstSeen: now,
    updatedAt: now,
  }
}

/** Normalize one stored card; unknown fields are dropped. */
export function normalizeProfile(input) {
  const source = input !== null && typeof input === 'object' ? input : {}
  return {
    groupId: String(source.groupId ?? 'private'),
    qq: String(source.qq ?? ''),
    nickname: bounded(source.nickname, MAX.nickname),
    summary: bounded(source.summary, MAX.summary),
    personality: bounded(source.personality, MAX.personality),
    style: bounded(source.style, MAX.style),
    relationship: bounded(source.relationship, MAX.relationship),
    interests: Array.isArray(source.interests)
      ? source.interests.filter((item) => typeof item === 'string' && item.trim() !== '').map((item) => item.trim().slice(0, 40)).slice(0, MAX.interests)
      : [],
    recent: bounded(source.recent, MAX.recent),
    interactions: Number.isFinite(Number(source.interactions)) ? Math.max(0, Math.trunc(Number(source.interactions))) : 0,
    firstSeen: typeof source.firstSeen === 'string' ? source.firstSeen : new Date().toISOString(),
    updatedAt: typeof source.updatedAt === 'string' ? source.updatedAt : new Date().toISOString(),
  }
}

/** Load the profile store; returns an empty store when missing/corrupt. */
export async function loadProfileStore(path) {
  try {
    const parsed = JSON.parse(await readFile(path, 'utf8'))
    const profiles = {}
    if (parsed !== null && typeof parsed === 'object' && parsed.profiles !== null && typeof parsed.profiles === 'object') {
      for (const [key, value] of Object.entries(parsed.profiles)) {
        if (Object.keys(profiles).length >= MAX_PROFILES) break
        profiles[key] = normalizeProfile(value)
      }
    }
    return { version: 1, updatedAt: typeof parsed?.updatedAt === 'string' ? parsed.updatedAt : null, profiles }
  } catch {
    return { version: 1, updatedAt: null, profiles: {} }
  }
}

/** Persist the profile store. */
export async function saveProfileStore(path, store) {
  const profiles = {}
  for (const [key, value] of Object.entries(store?.profiles ?? {}).slice(0, MAX_PROFILES)) {
    profiles[key] = normalizeProfile(value)
  }
  const payload = { version: 1, updatedAt: new Date().toISOString(), profiles }
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
}

/** Get or create the profile for a group member. */
export function ensureProfile(store, { groupId, userId, userName }) {
  const key = profileKey(groupId, userId)
  if (store.profiles[key] === undefined) {
    store.profiles[key] = createProfile({ groupId, userId, userName })
    return { key, profile: store.profiles[key], created: true }
  }
  const profile = store.profiles[key]
  if (typeof userName === 'string' && userName !== '' && profile.nickname !== userName) {
    profile.nickname = bounded(userName, MAX.nickname)
  }
  return { key, profile, created: false }
}

/**
 * Render a profile as the second system-prompt segment. Basic empty cards
 * still expose the person's name/QQ so the model knows who it is replying to.
 */
export function buildProfilePrompt(profile) {
  if (profile === null || typeof profile !== 'object') return ''
  const lines = []
  if (profile.nickname !== '') lines.push(`昵称：${profile.nickname}`)
  if (profile.qq !== '') lines.push(`QQ：${profile.qq}`)
  if (profile.summary !== '') lines.push(`人物概要：${profile.summary}`)
  if (profile.personality !== '') lines.push(`性格印象：${profile.personality}`)
  if (profile.style !== '') lines.push(`说话风格：${profile.style}`)
  if (profile.relationship !== '') lines.push(`与机器人的关系：${profile.relationship}`)
  if (profile.interests.length > 0) lines.push(`兴趣话题：${profile.interests.join('、')}`)
  if (profile.recent !== '') lines.push(`近期互动：${profile.recent}`)
  if (lines.length === 0) return ''
  return `【用户画像】\n${lines.join('\n')}\n（画像仅作为背景理解，不要直接复述，也不要声称你记得画像里的所有细节。）`
}

/** Build the prompt used to merge an exchange into an existing profile. */
export function buildProfileUpdatePrompt(profile, exchange, reply) {
  const history = exchange
    .slice(-6)
    .map((message) => `${message.role === 'assistant' ? '机器人' : '群友'}：${String(message.text ?? '').slice(0, 500)}`)
    .join('\n')
  return [
    '你负责维护 QQ 群成员的人物画像。根据【现有画像】和【最新对话】更新画像。',
    '只输出一个 JSON 对象，不要输出 Markdown 或解释。字段：',
    '{"summary":"一句话人物概要（可空）","personality":"性格印象（可空）","style":"说话风格（可空）","relationship":"与机器人的关系（可空）","interests":["兴趣1","兴趣2"],"recent":"最近一次互动的简短摘要（可空）"}',
    '要求：只记录对话中明确体现或强烈暗示的信息，不要编造；每个字段不超过 200 字；interests 最多 8 个短词。',
    '',
    `【现有画像】\n${buildProfilePrompt(profile) || '（暂无）'}`,
    `【最新对话】\n${history}\n机器人：${String(reply ?? '').slice(0, 500)}`,
  ].join('\n')
}

/** Parse a model's JSON profile patch, tolerating code fences and surrounding text. */
export function parseProfilePatch(text) {
  const raw = String(text ?? '').trim()
  if (raw === '') return null
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1))
    return parsed !== null && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

/** Merge a JSON patch into a profile with bounded fields. */
export function mergeProfile(profile, patch, reply) {
  const next = normalizeProfile(profile)
  if (patch !== null && typeof patch === 'object') {
    const stringField = (key, limit) => {
      if (typeof patch[key] === 'string' && patch[key].trim() !== '') next[key] = patch[key].trim().slice(0, limit)
    }
    stringField('summary', MAX.summary)
    stringField('personality', MAX.personality)
    stringField('style', MAX.style)
    stringField('relationship', MAX.relationship)
    stringField('recent', MAX.recent)
    if (Array.isArray(patch.interests)) {
      next.interests = patch.interests
        .filter((item) => typeof item === 'string' && item.trim() !== '')
        .map((item) => item.trim().slice(0, 40))
        .slice(0, MAX.interests)
    }
  }
  if (typeof reply === 'string' && reply.trim() !== '') {
    next.recent = reply.trim().slice(0, MAX.recent)
  }
  next.interactions += 1
  next.updatedAt = new Date().toISOString()
  return next
}

function bounded(value, limit) {
  return typeof value === 'string' ? value.trim().slice(0, limit) : ''
}

export { existsSync }
