/**
 * Persistent persona presets ("预设卡"): named snapshots of an AI character
 * card that can be saved, listed, loaded into the active persona, and deleted.
 *
 * Stored in `<projectDir>/data/persona-presets.json`; the active persona keeps
 * living in `data/persona.json`, so loading a preset immediately affects the
 * next AI reply.
 */

import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { normalizePersona } from './index.js'

const MAX_PRESETS = 50
const MAX_NAME = 60

/** @typedef {{ id: string, name: string, persona: object, createdAt: string, updatedAt: string }} PersonaPreset */

/** Normalize one stored preset; returns null when it has no identity. */
export function normalizePreset(input) {
  if (input === null || typeof input !== 'object') return null
  const id = typeof input.id === 'string' && input.id.trim() !== '' ? input.id.trim() : randomUUID()
  const persona = normalizePersona(input.persona)
  const fallbackName = persona.name !== '' ? persona.name : '未命名预设'
  const name = typeof input.name === 'string' && input.name.trim() !== ''
    ? input.name.trim().slice(0, MAX_NAME)
    : fallbackName
  const now = new Date().toISOString()
  return {
    id,
    name,
    persona,
    createdAt: typeof input.createdAt === 'string' && input.createdAt !== '' ? input.createdAt : now,
    updatedAt: typeof input.updatedAt === 'string' && input.updatedAt !== '' ? input.updatedAt : now,
  }
}

/** Load the preset store; missing/corrupt file yields an empty library. */
export async function loadPresetStore(path) {
  try {
    const parsed = JSON.parse(await readFile(path, 'utf8'))
    const list = Array.isArray(parsed?.presets) ? parsed.presets : []
    return {
      version: 1,
      updatedAt: typeof parsed?.updatedAt === 'string' ? parsed.updatedAt : null,
      presets: list.map((item) => normalizePreset(item)).filter((item) => item !== null).slice(0, MAX_PRESETS),
    }
  } catch {
    return { version: 1, updatedAt: null, presets: [] }
  }
}

/** Persist the preset store. */
export async function savePresetStore(path, store) {
  const presets = (Array.isArray(store?.presets) ? store.presets : [])
    .map((item) => normalizePreset(item))
    .filter((item) => item !== null)
    .slice(0, MAX_PRESETS)
  const payload = { version: 1, updatedAt: new Date().toISOString(), presets }
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  return payload
}

/** Create or update a preset in memory. */
export function upsertPreset(store, input) {
  const id = typeof input?.id === 'string' && input.id.trim() !== '' ? input.id.trim() : null
  const existing = id === null ? null : store.presets.find((item) => item.id === id) ?? null
  const now = new Date().toISOString()
  const normalized = normalizePreset({
    ...(existing ?? {}),
    ...input,
    id: existing?.id ?? id ?? randomUUID(),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  })
  if (existing !== null) {
    store.presets[store.presets.indexOf(existing)] = normalized
  } else {
    store.presets.unshift(normalized)
  }
  store.presets = store.presets.slice(0, MAX_PRESETS)
  return normalized
}

/** Remove a preset by id, returning whether anything was deleted. */
export function removePreset(store, id) {
  const before = store.presets.length
  store.presets = store.presets.filter((item) => item.id !== id)
  return store.presets.length !== before
}
