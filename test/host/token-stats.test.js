import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { normalizeUsage, TokenStatsStore } from '../../host/services/group-loop/token-stats.js'

test('normalizes camelCase and provider-snake_case usage fields', () => {
  assert.deepEqual(normalizeUsage({ inputTokens: 10, outputTokens: 3, cacheReadTokens: 4, cacheWriteTokens: 2, totalTokens: 13 }), {
    input: 10, output: 3, cacheRead: 4, cacheWrite: 2, reasoning: 0, total: 13,
  })
  assert.deepEqual(normalizeUsage({ prompt_tokens: 20, completion_tokens: 5, prompt_tokens_details: { cached_tokens: 6 }, total_tokens: 25 }), {
    input: 20, output: 5, cacheRead: 6, cacheWrite: 0, reasoning: 0, total: 25,
  })
})

test('records overall/group/day usage and only compose in recent responses', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-token-stats-'))
  const store = new TokenStatsStore({ projectDir: root, logger: { warn() {} } })
  await store.record({ groupId: 'g1', loopId: 'loop-1', kind: 'analyze', usage: { inputTokens: 100, outputTokens: 10, cacheReadTokens: 40 } })
  await store.record({ groupId: 'g1', loopId: 'loop-1', kind: 'compose', usage: { inputTokens: 200, outputTokens: 40, cacheReadTokens: 100 } , recent: true })
  await store.record({ groupId: 'g2', loopId: 'loop-2', kind: 'state-update', usage: { inputTokens: 300, outputTokens: 30 } })
  const snapshot = await store.snapshot()
  assert.equal(snapshot.totals.calls, 3)
  assert.equal(snapshot.totals.input, 600)
  assert.equal(snapshot.totals.output, 80)
  assert.equal(snapshot.totals.cacheRead, 140)
  assert.equal(snapshot.totals.total, 680)
  assert.ok(Math.abs(snapshot.totals.cacheHitRate - 140 / 600) < 1e-9)
  assert.equal(snapshot.groups.length, 2)
  assert.equal(snapshot.groups.find((group) => group.groupId === 'g1').cacheRead, 140)
  assert.equal(snapshot.recent.length, 1)
  assert.equal(snapshot.recent[0].kind, 'compose')
  assert.equal(snapshot.recent[0].groupId, 'g1')
  assert.equal(snapshot.today.calls, 3)
  await store.clear()
  const cleared = await store.snapshot()
  assert.equal(cleared.totals.calls, 0)
  assert.deepEqual(cleared.recent, [])
  await rm(root, { recursive: true, force: true })
})
