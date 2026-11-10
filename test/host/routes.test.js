/**
 * Route-table contract tests for the refactored host.
 *
 * Loads the real built-in plugin list against a temporary project directory and
 * asserts that every legacy route/tool/feature is still contributed, and that
 * unloading a plugin removes its routes.
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
  assert.equal(host.kernel.listPlugins().length, 13)
})

test('host: built-in feature ids and actions are preserved', async (t) => {
  const { getService, host } = await loadHost(t)
  const features = host.kernel.featureRegistry.list()
  assert.deepEqual(features.map((feature) => feature.id), BUILTIN_FEATURE_IDS)
  assert.equal(typeof getService().registerFeature, 'function')
})

test('host: client tabs are contributed by plugins', async (t) => {
  const { host } = await loadHost(t)
  const tabIds = host.kernel.listClientTabs().map((tab) => tab.id)
  for (const id of ['overview', 'ai', 'messages', 'access', 'plugins', 'features', 'logs', 'games', 'tokens']) {
    assert.ok(tabIds.includes(id), `missing client tab ${id}`)
  }
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

})

test('kernel: route methods are enforced by the shared http helper', async (t) => {
  const { routes } = await loadHost(t)
  const status = await invokeRoute(routes.get('/qqbot/status'), { method: 'POST', url: '/qqbot/status' })
  assert.equal(status.status, 405)
  assert.equal(status.body.ok, false)
})

test('group loop routes reject invalid requests with 400 before touching state', async (t) => {
  const { routes } = await loadHost(t)
  const cases = [
    { path: '/qqbot/group/analyze', body: {} },
    { path: '/qqbot/group/analyze', body: { apiVersion: 99, groupId: 'g1', material: 'hi' } },
    { path: '/qqbot/group/compose', body: { groupId: 'g1', material: 'hi', speak: { enabled: false } } },
    { path: '/qqbot/group/state-update', body: { groupId: 'g1', material: 'hi' } },
  ]
  for (const item of cases) {
    const response = await invokeRoute(routes.get(item.path), { method: 'POST', url: item.path, body: JSON.stringify(item.body) })
    assert.equal(response.status, 400, `${item.path} should reject ${JSON.stringify(item.body)}`)
    assert.equal(response.body.ok, false)
    assert.equal(response.body.code, 'BAD_REQUEST')
  }
})

test('persona settings route saves v2 name/settings and keeps other fields', async (t) => {
  const { routes } = await loadHost(t)
  const save = await invokeRoute(routes.get('/qqbot/persona/settings'), {
    method: 'POST',
    url: '/qqbot/persona/settings',
    body: JSON.stringify({ name: '小鱼', settings: ['十岁，小学四年级。', '喜欢画画。'] }),
  })
  assert.equal(save.status, 200)
  assert.equal(save.body.ok, true)
  assert.equal(save.body.data.persona.name, '小鱼')
  assert.deepEqual(save.body.data.persona.settings, ['十岁，小学四年级。', '喜欢画画。'])
  assert.ok(Array.isArray(save.body.data.persona.keywords))
  assert.ok(Array.isArray(save.body.data.persona.examples))

  const read = await invokeRoute(routes.get('/qqbot/persona/settings'), {
    method: 'GET',
    url: '/qqbot/persona/settings',
  })
  assert.equal(read.status, 200)
  assert.equal(read.body.data.persona.name, '小鱼')
  assert.deepEqual(read.body.data.persona.settings, ['十岁，小学四年级。', '喜欢画画。'])
})
