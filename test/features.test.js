import { test } from 'node:test'
import assert from 'node:assert/strict'
import { FeatureRegistry } from '../lib/features.js'

const deps = {
  settings: { projectDir: '/tmp/x' },
  logger: { info() {}, warn() {}, error() {} },
  napcat: { status: async () => ({ running: true }), start: async () => ({ ok: true }) },
  koishi: { status: async () => ({ running: false }) },
  plugins: { list: async () => [] },
  platform: { detectQq: () => ({ installed: true }) },
}

test('FeatureRegistry: register, list, status and action', async () => {
  const registry = new FeatureRegistry(deps)
  const off = registry.register({
    id: 'demo',
    title: { zh: '示例', en: 'Demo' },
    description: { zh: '演示', en: 'Demo' },
    status: (deps) => ({ napcat: deps.napcat.status }),
    actions: [{ id: 'go', title: { zh: '执行', en: 'Run' }, run: async () => ({ ok: true, message: 'done' }) }],
  })
  assert.deepEqual(registry.list().map((feature) => feature.id), ['demo'])
  assert.equal(registry.list()[0].actions[0].id, 'go')
  assert.equal(typeof registry.list()[0].actions[0].run, 'undefined')

  const statuses = await registry.statusAll()
  assert.equal(typeof statuses.demo.status, 'object')

  const result = await registry.run('demo', 'go', {})
  assert.equal(result.ok, true)
  assert.equal(result.message, 'done')

  await assert.rejects(() => registry.run('demo', 'missing', {}), /unknown action/u)
  off()
  assert.deepEqual(registry.list(), [])
})

test('FeatureRegistry: duplicate id replaces, unknown feature rejects', async () => {
  const registry = new FeatureRegistry(deps)
  registry.register({ id: 'x', title: 'X', description: 'x' })
  registry.register({ id: 'x', title: 'Y', description: 'y' })
  assert.equal(registry.list().length, 1)
  assert.equal(registry.list()[0].title.en, 'Y')
  await assert.rejects(() => registry.run('missing', 'go'), /unknown feature/u)
})
