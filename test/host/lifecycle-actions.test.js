/**
 * Shared lifecycle actions and the panel's all-start/all-stop routes.
 *
 * The panel buttons, `/qqbot/all/*` and `qqbot_control` must share one
 * ordering; these tests pin Koishi-first start, Koishi-first stop and the
 * failure-reporting shape.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { startAll, stopAll } from '../../host/services/lifecycle/index.js'
import { routes } from '../../host/plugins/lifecycle/routes.js'
import { invokeRoute } from './helpers.js'

function fakeServices(calls, { failNapcatStart = false } = {}) {
  return {
    koishi: {
      start: async () => { calls.push('koishi.start'); return { ok: true, message: 'koishi started' } },
      stop: async () => { calls.push('koishi.stop'); return { ok: true, message: 'koishi stopped' } },
    },
    napcat: {
      start: async () => {
        calls.push('napcat.start')
        if (failNapcatStart) throw new Error('docker unavailable')
        return { ok: true, message: 'napcat started' }
      },
      stop: async () => { calls.push('napcat.stop'); return { ok: true, message: 'napcat stopped' } },
    },
  }
}

test('lifecycle: startAll starts Koishi before NapCat', async () => {
  const calls = []
  const result = await startAll(fakeServices(calls))
  assert.equal(result.ok, true)
  assert.deepEqual(calls, ['koishi.start', 'napcat.start'])
  assert.deepEqual(result.steps.map((step) => step.name), ['koishi', 'napcat'])
  assert.match(result.message, /koishi: ok/u)
})

test('lifecycle: stopAll stops Koishi before NapCat', async () => {
  const calls = []
  const result = await stopAll(fakeServices(calls))
  assert.equal(result.ok, true)
  assert.deepEqual(calls, ['koishi.stop', 'napcat.stop'])
  assert.match(result.message, /napcat: stopped/u)
})

test('lifecycle: a failing step is reported without throwing', async () => {
  const calls = []
  const result = await startAll(fakeServices(calls, { failNapcatStart: true }))
  assert.equal(result.ok, false)
  assert.deepEqual(calls, ['koishi.start', 'napcat.start'])
  assert.equal(result.steps[1].ok, false)
  assert.match(result.steps[1].message, /docker unavailable/u)
})

test('lifecycle routes: /qqbot/all/start and /qqbot/all/stop use the shared actions', async () => {
  const calls = []
  const services = fakeServices(calls)
  const api = {
    serialize: async (fn) => fn(),
    get: (name) => services[name],
  }
  const handlers = new Map(routes(api).map((route) => [route.path, route.handler]))

  const started = await invokeRoute(handlers.get('/qqbot/all/start'), { method: 'POST', url: '/qqbot/all/start' })
  assert.equal(started.status, 200)
  assert.equal(started.body.ok, true)
  const stopped = await invokeRoute(handlers.get('/qqbot/all/stop'), { method: 'POST', url: '/qqbot/all/stop' })
  assert.equal(stopped.status, 200)
  assert.equal(stopped.body.ok, true)
  assert.deepEqual(calls, ['koishi.start', 'napcat.start', 'koishi.stop', 'napcat.stop'])
})
