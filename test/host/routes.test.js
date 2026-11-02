/**
 * Route-table contract tests for the refactored host.
 *
 * Loads the real built-in plugin list against a temporary project directory and
 * asserts that every legacy route/tool/feature is still contributed, that the
 * AI contract gates requests, and that unloading a plugin removes its routes.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  BUILTIN_FEATURE_IDS,
  LEGACY_ROUTE_PATHS,
  LEGACY_TOOL_NAMES,
  invokeRoute,
  loadHost,
} from './helpers.js'

test('host: every legacy route and tool is contributed', async (t) => {
  const { routes, tools, getService, host } = await loadHost(t)
  for (const path of LEGACY_ROUTE_PATHS) assert.ok(routes.has(path), `missing route ${path}`)
  assert.equal(routes.has('/qqbot/client/tabs'), true, 'client tab contribution route is missing')
  assert.equal(routes.size, LEGACY_ROUTE_PATHS.length + 1)

  for (const name of LEGACY_TOOL_NAMES) assert.ok(tools.has(name), `missing tool ${name}`)
  assert.equal(tools.size, LEGACY_TOOL_NAMES.length)

  const service = getService()
  assert.equal(typeof service?.registerFeature, 'function')
  assert.equal(typeof service?.getStatus, 'function')
  assert.equal(typeof host.kernel.unload, 'function')
  assert.equal(host.kernel.listPlugins().length, 10)
})

test('host: built-in feature ids and actions are preserved', async (t) => {
  const { getService, host } = await loadHost(t)
  const features = host.kernel.featureRegistry.list()
  assert.deepEqual(features.map((feature) => feature.id), BUILTIN_FEATURE_IDS)
  const lifecycle = features.find((feature) => feature.id === 'lifecycle')
  assert.ok(lifecycle.actions.some((action) => action.id === 'all-start'))
  assert.ok(lifecycle.actions.some((action) => action.id === 'all-stop'))
  assert.equal(typeof getService().registerFeature, 'function')
})

test('host: client tabs are contributed by plugins', async (t) => {
  const { host } = await loadHost(t)
  const tabIds = host.kernel.listClientTabs().map((tab) => tab.id)
  for (const id of ['overview', 'ai', 'messages', 'access', 'plugins', 'features', 'logs']) {
    assert.ok(tabIds.includes(id), `missing client tab ${id}`)
  }
})

test('AI contract: chat route rejects future apiVersion and preserves legacy calls', async (t) => {
  const { routes } = await loadHost(t)
  const handler = routes.get('/qqbot/ai/chat')
  assert.equal(typeof handler, 'function')

  const future = await invokeRoute(handler, {
    method: 'POST',
    url: '/qqbot/ai/chat',
    body: JSON.stringify({ apiVersion: 99, messages: [] }),
  })
  assert.equal(future.status, 400)
  assert.equal(future.body.ok, false)
  assert.equal(future.body.code, 'BAD_REQUEST')

  const legacy = await invokeRoute(handler, {
    method: 'POST',
    url: '/qqbot/ai/chat',
    body: JSON.stringify({ messages: [] }),
  })
  assert.equal(legacy.status, 200)
  assert.equal(legacy.body.ok, false)
  assert.equal(legacy.body.code, 'EMPTY_MESSAGES')
  assert.equal(legacy.body.apiVersion, 1)

  const wrongMethod = await invokeRoute(handler, { method: 'GET', url: '/qqbot/ai/chat' })
  assert.equal(wrongMethod.status, 405)
})

test('kernel: unloading a plugin removes its routes/tools/features', async (t) => {
  const { routes, tools, host } = await loadHost(t)
  assert.equal(host.kernel.unload('qqbot-napcat'), true)
  assert.equal(routes.has('/qqbot/napcat/install'), false)
  assert.equal(routes.has('/qqbot/napcat/configure'), false)
  assert.equal(routes.has('/qqbot/persona'), true)
  assert.equal(tools.has('qqbot_configure'), false)
  assert.equal(tools.has('qqbot_status'), true)

  assert.equal(host.kernel.unload('qqbot-features'), true)
  assert.equal(routes.has('/qqbot/features'), false)
  assert.equal(host.kernel.featureRegistry.list().length, 0)

  assert.equal(host.kernel.unload('qqbot-ai'), true)
  assert.equal(routes.has('/qqbot/ai/chat'), false)
  assert.equal(host.kernel.get('ai'), undefined)
})

test('kernel: route methods are enforced by the shared http helper', async (t) => {
  const { routes } = await loadHost(t)
  const status = await invokeRoute(routes.get('/qqbot/status'), { method: 'POST', url: '/qqbot/status' })
  assert.equal(status.status, 405)
  assert.equal(status.body.ok, false)
})
