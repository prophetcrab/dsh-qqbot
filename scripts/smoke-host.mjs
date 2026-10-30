/**
 * Headless smoke test for the QQ bot control center host half.
 *
 * Loads index.js with a minimal fake Cordis context, collects the routes and
 * tools it registers, then serves those routes over a real HTTP server and
 * checks the read-only endpoints against the real local environment.
 *
 *   node scripts/smoke-host.mjs
 */

import assert from 'node:assert/strict'
import http from 'node:http'
import { apply, name } from '../index.js'

const routes = new Map()
const tools = new Map()
let service = null

const noopLogger = () => ({ info() {}, warn() {}, error() {}, debug() {} })

const ctx = {
  logger: noopLogger,
  provide(serviceName) {
    this.provided = serviceName
  },
  set(serviceName, value) {
    if (serviceName === 'qqbot') service = value
  },
  get() {
    return undefined
  },
  on() {
    return () => {}
  },
  effect(factory) {
    const result = factory()
    return typeof result === 'function' ? result : () => {}
  },
  inject(_names, callback) {
    callback(ctx)
  },
  webServer: {
    register({ path, handler }) {
      routes.set(path, handler)
      return () => routes.delete(path)
    },
  },
  tools: {
    register(tool) {
      tools.set(tool.name, tool)
    },
  },
  systemPrompt: { section() {} },
}

assert.equal(name, 'qqbot')
await apply(ctx, { projectDir: '/Users/crab/project/qq-bot' })

assert.ok(routes.size >= 35, `expected at least 35 routes, got ${routes.size}`)
for (const required of [
  '/qqbot/status',
  '/qqbot/features',
  '/qqbot/access',
  '/qqbot/contacts',
  '/qqbot/napcat/login',
  '/qqbot/napcat/qr',
  '/qqbot/messages',
  '/qqbot/setup',
  '/qqbot/setup/koishi',
  '/qqbot/setup/full',
  '/qqbot/ai/status',
  '/qqbot/ai/chat',
  '/qqbot/ai/settings',
  '/qqbot/profiles',
  '/qqbot/profiles/save',
  '/qqbot/profiles/delete',
  '/qqbot/persona',
  '/qqbot/persona/save',
  '/qqbot/koishi/plugins',
  '/qqbot/napcat/configure',
  '/qqbot/all/start',
  '/qqbot/koishi/plugins/toggle',
]) {
  assert.ok(routes.has(required), `missing route ${required}`)
}
assert.equal(tools.size, 6, `expected 6 tools, got ${tools.size}`)
assert.equal(typeof service?.registerFeature, 'function', 'qqbot service should expose registerFeature')

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1')
  const handler = routes.get(url.pathname)
  if (handler === undefined) {
    res.writeHead(404, { 'content-type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify({ ok: false, error: 'not found' }))
    return
  }
  handler(req, res)
})
await new Promise((resolvePromise) => server.listen(0, '127.0.0.1', resolvePromise))
const port = server.address().port
const base = `http://127.0.0.1:${port}`

try {
  const statusResponse = await fetch(`${base}/qqbot/status`)
  assert.equal(statusResponse.status, 200)
  const status = await statusResponse.json()
  assert.equal(status.ok, true)
  assert.equal(typeof status.data, 'object')
  assert.equal(typeof status.data.settings?.koishiPort, 'number')
  assert.equal(typeof status.data.napcat?.installed, 'boolean')
  assert.equal(typeof status.data.koishi?.exists, 'boolean')
  assert.ok(Array.isArray(status.data.features))
  const featureIds = status.data.features.map((feature) => feature.id)
  for (const id of ['overview', 'lifecycle', 'configuration', 'koishi-plugins', 'access']) {
    assert.ok(featureIds.includes(id), `missing built-in feature ${id}`)
  }
  const lifecycle = status.data.features.find((feature) => feature.id === 'lifecycle')
  assert.ok(lifecycle.actions.some((action) => action.id === 'all-start'))

  const featuresResponse = await fetch(`${base}/qqbot/features`)
  const features = await featuresResponse.json()
  assert.equal(features.ok, true)
  assert.ok(features.data.some((feature) => feature.id === 'configuration'))

  const accessResponse = await fetch(`${base}/qqbot/access`)
  const accessBody = await accessResponse.json()
  assert.equal(accessBody.ok, true)
  assert.ok(['all', 'whitelist', 'blacklist'].includes(accessBody.data.inbound.groups.mode))
  assert.ok(Array.isArray(accessBody.data.inbound.groups.ids))

  const contactsResponse = await fetch(`${base}/qqbot/contacts`)
  const contactsBody = await contactsResponse.json()
  assert.equal(typeof contactsBody.ok, 'boolean')
  assert.ok(Array.isArray(contactsBody.groups))
  assert.ok(Array.isArray(contactsBody.friends))

  const aiSettingsResponse = await fetch(`${base}/qqbot/ai/settings`)
  const aiSettingsBody = await aiSettingsResponse.json()
  assert.equal(aiSettingsBody.ok, true)
  assert.equal(typeof aiSettingsBody.data.settings.replyProbability, 'number')

  const profilesResponse = await fetch(`${base}/qqbot/profiles`)
  const profilesBody = await profilesResponse.json()
  assert.equal(profilesBody.ok, true)
  assert.ok(Array.isArray(profilesBody.data.profiles))

  const personaResponse = await fetch(`${base}/qqbot/persona`)
  const personaBody = await personaResponse.json()
  assert.equal(personaBody.ok, true)
  assert.equal(typeof personaBody.data.persona.name, 'string')
  assert.ok(Array.isArray(personaBody.data.persona.examples))
  assert.match(personaBody.data.promptPreview, /【角色设定】/u)

  const aiStatusResponse = await fetch(`${base}/qqbot/ai/status`)
  const aiStatusBody = await aiStatusResponse.json()
  assert.equal(aiStatusBody.ok, true)
  assert.equal(typeof aiStatusBody.data.available, 'boolean')
  assert.equal(typeof aiStatusBody.data.provider, 'string')
  assert.equal(typeof aiStatusBody.data.model, 'string')

  const aiEmptyResponse = await fetch(`${base}/qqbot/ai/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ messages: [] }),
  })
  const aiEmptyBody = await aiEmptyResponse.json()
  assert.equal(aiEmptyBody.ok, false)
  assert.equal(aiEmptyBody.code, 'EMPTY_MESSAGES')

  const setupResponse = await fetch(`${base}/qqbot/setup`)
  const setupBody = await setupResponse.json()
  assert.equal(setupBody.ok, true)
  assert.equal(typeof setupBody.data.projectDir, 'string')
  assert.equal(typeof setupBody.data.hasNodeModules, 'boolean')
  assert.equal(typeof setupBody.data.templateAvailable, 'boolean')

  const loginResponse = await fetch(`${base}/qqbot/napcat/login`)
  const loginBody = await loginResponse.json()
  assert.equal(loginBody.ok, true)
  assert.equal(typeof loginBody.data.loggedIn, 'boolean')
  assert.ok('phase' in loginBody.data)

  const messagesResponse = await fetch(`${base}/qqbot/messages?limit=5`)
  const messagesBody = await messagesResponse.json()
  assert.equal(typeof messagesBody.ok, 'boolean')
  assert.ok(Array.isArray(messagesBody.data.messages))

  const qrResponse = await fetch(`${base}/qqbot/napcat/qr`)
  assert.ok([200, 404].includes(qrResponse.status))
  if (qrResponse.status === 200) assert.match(qrResponse.headers.get('content-type') ?? '', /image\/png/u)

  const pluginsResponse = await fetch(`${base}/qqbot/koishi/plugins`)
  const pluginBody = await pluginsResponse.json()
  assert.equal(pluginBody.ok, true)
  assert.ok(Array.isArray(pluginBody.data))

  const logsResponse = await fetch(`${base}/qqbot/logs?source=koishi&lines=5`)
  const logs = await logsResponse.json()
  assert.equal(logs.ok, true)
  assert.ok(Array.isArray(logs.lines))

  const wrongMethod = await fetch(`${base}/qqbot/status`, { method: 'POST' })
  assert.equal(wrongMethod.status, 405)

  const missing = await fetch(`${base}/qqbot/nope`)
  assert.equal(missing.status, 404)

  console.log(`host smoke: ok (${routes.size} routes, ${tools.size} tools, ${featureIds.length} features, ${pluginBody.data.length} koishi plugins)`)
} finally {
  await new Promise((resolvePromise) => server.close(resolvePromise))
}
