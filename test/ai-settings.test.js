import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { AI_SETTINGS_DEFAULTS, normalizeAiSettings, readAiSettings, writeAiSettings } from '../lib/ai-settings.js'

test('normalizeAiSettings: clamps and defaults', () => {
  const settings = normalizeAiSettings({ replyProbability: 1.8, followUpMinutes: -2, historyLimit: 999 })
  assert.equal(settings.replyProbability, 1)
  assert.equal(settings.followUpMinutes, 0)
  assert.equal(settings.historyLimit, 200)
  assert.equal(settings.batchWindowMs, 2500)
  assert.equal(settings.batchMaxWaitMs, 10000)
  assert.equal(settings.enabled, true)
  assert.deepEqual(normalizeAiSettings({}), { ...AI_SETTINGS_DEFAULTS })
  assert.equal(normalizeAiSettings({ enabled: false }).enabled, false)
})

test('read/write settings roundtrip, missing falls back', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-ai-settings-'))
  const path = join(dir, 'ai-settings.json')
  assert.deepEqual(await readAiSettings(path), { ...AI_SETTINGS_DEFAULTS })
  const saved = await writeAiSettings(path, { replyProbability: 0.42, followUpMinutes: 5, historyLimit: 50, batchWindowMs: 4000, batchMaxWaitMs: 12000, enabled: true })
  assert.equal(saved.replyProbability, 0.42)
  assert.equal(saved.batchWindowMs, 4000)
  assert.equal(saved.batchMaxWaitMs, 12000)
  assert.deepEqual(await readAiSettings(path), saved)
  await rm(dir, { recursive: true, force: true })
})
