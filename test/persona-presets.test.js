import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { loadPresetStore, normalizePreset, removePreset, savePresetStore, upsertPreset } from '../host/services/persona/presets.js'

const persona = { version: 2, name: '猫娘', settings: ['群里的猫娘', '软萌'], keywords: [], examples: [] }

test('normalizePreset: fills id/name/timestamps and bounds fields', () => {
  const preset = normalizePreset({ name: '  测试预设 ', persona })
  assert.equal(preset.name, '测试预设')
  assert.equal(preset.persona.name, '猫娘')
  assert.equal(typeof preset.id, 'string')
  assert.equal(typeof preset.createdAt, 'string')
  assert.equal(typeof preset.updatedAt, 'string')
})

test('upsertPreset: creates then updates while preserving id/createdAt', () => {
  const store = { version: 1, presets: [] }
  const created = upsertPreset(store, { name: '预设 A', persona })
  assert.equal(store.presets.length, 1)
  const updated = upsertPreset(store, { id: created.id, name: '预设 B', persona: { ...persona, settings: ['群里的猫娘', '高冷'] } })
  assert.equal(store.presets.length, 1)
  assert.equal(updated.id, created.id)
  assert.equal(updated.name, '预设 B')
  assert.equal(updated.createdAt, created.createdAt)
  assert.deepEqual(updated.persona.settings, ['群里的猫娘', '高冷'])
})

test('removePreset: deletes by id', () => {
  const store = { version: 1, presets: [] }
  const preset = upsertPreset(store, { name: 'A', persona })
  assert.equal(removePreset(store, preset.id), true)
  assert.equal(removePreset(store, preset.id), false)
  assert.equal(store.presets.length, 0)
})

test('store roundtrip and missing file', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-presets-'))
  const path = join(dir, 'persona-presets.json')
  const empty = await loadPresetStore(path)
  assert.deepEqual(empty.presets, [])
  const store = { version: 1, presets: [] }
  upsertPreset(store, { name: '预设 A', persona })
  await savePresetStore(path, store)
  const loaded = await loadPresetStore(path)
  assert.equal(loaded.presets.length, 1)
  assert.equal(loaded.presets[0].name, '预设 A')
  assert.equal(loaded.presets[0].persona.name, '猫娘')
  await rm(dir, { recursive: true, force: true })
})
