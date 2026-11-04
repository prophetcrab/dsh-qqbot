/** Feature descriptors are read-only status cards; the run route remains for compatibility. */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { BUILTIN_FEATURES } from '../../host/plugins/features/builtins.js'

test('built-in feature cards are read-only status cards', () => {
  assert.deepEqual(BUILTIN_FEATURES.map((feature) => feature.id), ['overview', 'koishi-plugins', 'access'])
  for (const feature of BUILTIN_FEATURES) assert.deepEqual(feature.actions, [])
})

test('feature action route remains serialized for external callers', async () => {
  const { routes } = await import('../../host/plugins/features/routes.js')
  const { invokeRoute } = await import('./helpers.js')
  let serialized = 0
  let ran = 0
  const api = {
    serialize: async (fn) => { serialized += 1; return fn() },
    kernel: { featureRegistry: { run: async () => { ran += 1; return { ok: true } } } },
  }
  const handler = routes(api).find((route) => route.path === '/qqbot/features/run').handler
  const response = await invokeRoute(handler, {
    method: 'POST',
    url: '/qqbot/features/run',
    body: JSON.stringify({ feature: 'koishi-plugins', action: 'summary' }),
  })
  assert.equal(response.status, 200)
  assert.equal(response.body.ok, true)
  assert.equal(serialized, 1)
  assert.equal(ran, 1)
})
