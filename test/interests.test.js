import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { InterestStore } from '../host/services/ai/interests.js'

test('InterestStore: merges semantic interests and rejects empty labels', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-interests-'))
  const path = join(dir, 'interests.json')
  const store = new InterestStore(path)
  const now = Date.now()
  const accepted = await store.merge('g1', [
    { label: '龙图', aliases: ['龙图表情包'], summary: '群友喜欢龙图', weight: 0.6, confidence: 0.7, ttlHours: 2 },
    { label: '', summary: 'bad' },
  ], now)
  assert.deepEqual(accepted, ['龙图'])
  await store.merge('g1', [{ label: '龙图', aliases: ['龙图梗'], weight: 0.7, confidence: 0.8, ttlHours: 2 }], now + 1000)
  const list = store.snapshot()
  assert.equal(list.length, 1)
  assert.ok(list[0].weight > 0.6)
  assert.ok(list[0].aliases.includes('龙图表情包'))
  assert.ok(list[0].aliases.includes('龙图梗'))
  await rm(dir, { recursive: true, force: true })
})

test('InterestStore: expired interests are pruned and never resurrected', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-interests-expire-'))
  const path = join(dir, 'interests.json')
  const now = Date.now()
  await writeFile(path, JSON.stringify({
    version: 1,
    interests: [{ groupId: 'g1', label: '过期主题', aliases: [], summary: '', weight: 0.8, confidence: 0.8, expiresAt: now - 1, lastSeenAt: now - 1000 }],
  }))
  const store = new InterestStore(path)
  await store.merge('g1', [], now)
  assert.deepEqual(store.snapshot(), [])
  await rm(dir, { recursive: true, force: true })
})
