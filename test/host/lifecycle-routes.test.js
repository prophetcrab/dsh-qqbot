/**
 * Lifecycle route wiring: the panel's one-click start must go through the
 * shared lifecycle service (not the removed `lifecycle` feature card).
 *
 * Regression: `/qqbot/all/start` used to answer
 * `{ ok:false, message: 'unknown feature: lifecycle' }`, which the panel then
 * reduced to "request failed" on every click.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { routes } from '../../host/plugins/lifecycle/routes.js'

function fakeResponse() {
  return {
    status: 0,
    body: null,
    headersSent: false,
    writeHead(status) { this.status = status; this.headersSent = true },
    end(payload) { this.body = JSON.parse(Buffer.from(payload).toString('utf8')) },
  }
}

function fakeRequest(method = 'POST') {
  return { method, headers: {}, socket: { remoteAddress: '127.0.0.1' } }
}

/** Minimal plugin API: only the members the lifecycle routes touch. */
function fakeApi(services) {
  return {
    get: (name) => services[name],
    serialize: (task) => task(),
    kernel: { statusSnapshot: async () => ({}) },
  }
}

async function call(api, path) {
  const route = routes(api).find((entry) => entry.path === path)
  assert.ok(route, `missing route ${path}`)
  const res = fakeResponse()
  route.handler(fakeRequest('POST'), res)
  await new Promise((resolve) => setImmediate(resolve))
  return res
}

test('one-click start runs Koishi first, then NapCat, and reports steps', async () => {
  const order = []
  const api = fakeApi({
    koishi: { async start() { order.push('koishi'); return { ok: true } }, async stop() { return { ok: true } } },
    napcat: { async start() { order.push('napcat'); return { ok: true } }, async stop() { return { ok: true } } },
  })
  const res = await call(api, '/qqbot/all/start')
  assert.equal(res.status, 200)
  assert.equal(res.body.ok, true)
  assert.deepEqual(order, ['koishi', 'napcat'])
  assert.deepEqual(res.body.steps.map((step) => step.name), ['koishi', 'napcat'])
})

test('one-click start keeps the failing step message for the panel', async () => {
  const api = fakeApi({
    koishi: { async start() { return { ok: true } }, async stop() { return { ok: true } } },
    napcat: { async start() { return { ok: false, message: '未找到 QQ.app，请先安装 QQ' } }, async stop() { return { ok: true } } },
  })
  const res = await call(api, '/qqbot/all/start')
  assert.equal(res.body.ok, false)
  assert.match(res.body.message, /未找到 QQ\.app/u)
  assert.deepEqual(res.body.steps.map((step) => [step.name, step.ok]), [['koishi', true], ['napcat', false]])
})

test('one-click start reports missing services instead of throwing', async () => {
  const api = fakeApi({})
  const res = await call(api, '/qqbot/all/start')
  assert.equal(res.status, 200)
  assert.equal(res.body.ok, false)
  assert.match(res.body.message, /服务尚未加载/u)
})
