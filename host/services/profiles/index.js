/**
 * Long-term per-persona memory: one profile per (group, QQ) pair.
 *
 * Profiles are maintained after every AI reply by asking the configured model
 * to merge the latest exchange into the existing card. The profile is later
 * injected as the second system-prompt segment, right after the persona card.
 */

import { existsSync } from 'node:fs'
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
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
  const temp = `${path}.${process.pid}.${Date.now()}.tmp`
  try {
    await writeFile(temp, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
    await rename(temp, path)
  } finally {
    await unlink(temp).catch(() => {})
  }
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
