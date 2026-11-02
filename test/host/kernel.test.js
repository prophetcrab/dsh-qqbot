/**
 * Kernel contract tests: manifest validation, dependency ordering, contribution
 * registration/removal and status aggregation.
 *
 * Uses synthetic plugins only — no services, no filesystem, no network.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Kernel } from '../../host/kernel/index.js'

const noopLogger = () => ({ info() {}, warn() {}, error() {}, debug() {} })

function makeKernel(settings = { projectDir: '/tmp/qqbot-test', koishiPort: 5140, napcatPort: 6099, reversePath: '/onebot' }) {
  return new Kernel({ settings, logger: noopLogger() })
}

function plugin(overrides) {
  return {
    id: 'demo',
    name: 'demo',
    version: '1.0.0',
    inject: [],
    provides: [],
    apply() {},
    ...overrides,
  }
}

test('kernel: rejects invalid manifests', async () => {
  const kernel = makeKernel()
  await assert.rejects(kernel.load([{ id: 'x', name: 'x' }]), /apply\(\) is required/u)
  await assert.rejects(kernel.load([plugin({ id: '' })]), /plugin\.id/u)
})

test('kernel: rejects duplicate ids, duplicate services and unknown injects', async () => {
  const kernel = makeKernel()
  await assert.rejects(
    kernel.load([plugin({ id: 'a', name: 'a' }), plugin({ id: 'a', name: 'b' })]),
    /duplicate plugin id/u,
  )
  const kernel2 = makeKernel()
  await assert.rejects(
    kernel2.load([
      plugin({ id: 'a', provides: ['svc'] }),
      plugin({ id: 'b', provides: ['svc'] }),
    ]),
    /service svc is provided by both/u,
  )
  const kernel3 = makeKernel()
  await assert.rejects(kernel3.load([plugin({ id: 'a', inject: ['missing'] })]), /unknown service/u)
})

test('kernel: rejects dependency cycles', async () => {
  const kernel = makeKernel()
  await assert.rejects(
    kernel.load([
      plugin({ id: 'a', provides: ['a'], inject: ['b'] }),
      plugin({ id: 'b', provides: ['b'], inject: ['a'] }),
    ]),
    /cycle/u,
  )
})

test('kernel: loads plugins in dependency order and exposes services', async () => {
  const kernel = makeKernel()
  const order = []
  await kernel.load([
    plugin({
      id: 'consumer',
      name: 'consumer',
      inject: ['svc'],
      provides: ['consumer'],
      apply(api) {
        order.push('consumer')
        assert.equal(typeof api.get('svc').ping, 'function')
      },
    }),
    plugin({
      id: 'provider',
      name: 'provider',
      provides: ['svc'],
      apply(api) {
        order.push('provider')
        api.provide('svc', { ping: () => 'pong' })
      },
    }),
  ])
  assert.deepEqual(order, ['provider', 'consumer'])
  assert.equal(kernel.get('svc').ping(), 'pong')
  assert.deepEqual(kernel.listPlugins().map((item) => item.id), ['provider', 'consumer'])
})

test('kernel: unload removes exactly one plugin contributions', async () => {
  const kernel = makeKernel()
  const fakeWeb = { register: () => () => {} }
  kernel.mountWebServer(fakeWeb)
  const fakeTools = { register: () => () => {} }
  kernel.mountTools(fakeTools)
  await kernel.load([
    plugin({
      id: 'a',
      provides: ['svc-a'],
      apply(api) {
        api.provide('svc-a', { ok: true })
        api.registerRoute({ path: '/a', handler: () => {} })
        api.registerTool({ name: 'tool-a', execute: async () => ({}) })
        api.registerFeature({ id: 'feature-a', title: 'A' })
        api.registerStatusProvider(async () => ({ a: { loaded: true } }))
        api.registerClientTab({ id: 'tab-a', title: { zh: 'A', en: 'A' } })
        api.registerSystemPrompt({ name: 'prompt-a', text: 'A' })
      },
    }),
    plugin({
      id: 'b',
      provides: [],
      apply(api) {
        api.registerRoute({ path: '/b', handler: () => {} })
      },
    }),
  ])
  assert.equal(kernel.routes.has('/a'), true)
  assert.equal(kernel.routes.has('/b'), true)
  assert.equal(kernel.get('svc-a').ok, true)
  assert.deepEqual((await kernel.statusSnapshot()).a, { loaded: true })

  kernel.unload('a')
  assert.equal(kernel.routes.has('/a'), false)
  assert.equal(kernel.routes.has('/b'), true)
  assert.equal(kernel.tools.has('tool-a'), false)
  assert.equal(kernel.clientTabs.has('tab-a'), false)
  assert.equal(kernel.services.has('svc-a'), false)
  assert.equal(kernel.listFeatures().some((feature) => feature.id === 'feature-a'), false)
  assert.equal(kernel.systemPrompts.length, 0)
  assert.equal(kernel.listFeatures().length, 0)
  assert.equal(kernel.statusProviders.has('a'), false)
  assert.deepEqual((await kernel.statusSnapshot()).features, [])
})

test('kernel: status snapshot merges providers and evaluates feature status', async () => {
  const kernel = makeKernel()
  await kernel.load([
    plugin({
      id: 'p1',
      apply(api) {
        api.registerStatusProvider(async () => ({ platform: { id: 'macos' }, settings: { projectDir: '/tmp' } }))
        api.registerFeature({ id: 'f', title: 'F', status: async () => ({ ready: true }) })
      },
    }),
    plugin({
      id: 'p2',
      apply(api) {
        api.registerStatusProvider(async () => ({ napcat: { installed: true } }))
      },
    }),
  ])
  const snapshot = await kernel.statusSnapshot()
  assert.equal(snapshot.platform.id, 'macos')
  assert.equal(snapshot.napcat.installed, true)
  assert.equal(snapshot.settings.projectDir, '/tmp')
  assert.equal(snapshot.features[0].id, 'f')
  assert.deepEqual(snapshot.features[0].status, { ready: true })
  assert.equal(typeof snapshot.updatedAt, 'string')
})

test('kernel: provider failures are contained per provider', async () => {
  const kernel = makeKernel()
  await kernel.load([
    plugin({
      id: 'bad',
      apply(api) {
        api.registerStatusProvider(async () => { throw new Error('boom') })
      },
    }),
    plugin({
      id: 'good',
      apply(api) {
        api.registerStatusProvider(async () => ({ ok: true }))
      },
    }),
  ])
  const snapshot = await kernel.statusSnapshot()
  assert.equal(snapshot.ok, true)
})

test('kernel: duplicate route and tool registration fail closed', async () => {
  const kernel = makeKernel()
  await kernel.load([
    plugin({
      id: 'a',
      apply(api) {
        api.registerRoute({ path: '/dup', handler: () => {} })
        api.registerTool({ name: 'dup', execute: async () => ({}) })
      },
    }),
    plugin({
      id: 'b',
      apply(api) {
        assert.throws(() => api.registerRoute({ path: '/dup', handler: () => {} }), /duplicate route/u)
        assert.throws(() => api.registerTool({ name: 'dup', execute: async () => ({}) }), /duplicate tool/u)
      },
    }),
  ])
  assert.ok(true)
})

test('kernel: client tabs are ordered and unloadable', async () => {
  const kernel = makeKernel()
  await kernel.load([
    plugin({ id: 'a', apply: (api) => api.registerClientTab({ id: 'two', title: { zh: '2', en: '2' }, order: 2 }) }),
    plugin({ id: 'b', apply: (api) => api.registerClientTab({ id: 'one', title: { zh: '1', en: '1' }, order: 1 }) }),
  ])
  assert.deepEqual(kernel.listClientTabs().map((tab) => tab.id), ['one', 'two'])
  kernel.unload('b')
  assert.deepEqual(kernel.listClientTabs().map((tab) => tab.id), ['two'])
})
