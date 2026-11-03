/** Lifecycle feature result aggregation and busy-route contracts. */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { BUILTIN_FEATURES } from '../../host/plugins/features/builtins.js'

test('all-start reports failure when one service step fails', async () => {
  const lifecycle = BUILTIN_FEATURES.find((feature) => feature.id === 'lifecycle')
  const action = lifecycle.actions.find((entry) => entry.id === 'all-start')
  const result = await action.run({
    koishi: { start: async () => ({ ok: true, message: 'koishi started' }) },
    napcat: { start: async () => ({ ok: false, message: 'login failed' }) },
  })
  assert.equal(result.ok, false)
  assert.match(result.message, /napcat: failed/u)
})

test('feature action route runs under the shared serializer', async () => {
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
    body: JSON.stringify({ feature: 'lifecycle', action: 'all-stop' }),
  })
  assert.equal(response.status, 200)
  assert.equal(response.body.ok, true)
  assert.equal(serialized, 1)
  assert.equal(ran, 1)
})
