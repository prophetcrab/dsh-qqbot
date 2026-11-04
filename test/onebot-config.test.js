/**
 * Pure OneBot configuration helpers: client upsert/dedupe and token masking.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { listWebsocketClients, maskOnebotConfig, upsertWebsocketClient } from '../host/services/napcat/onebot-config.js'

/** A realistic empty `onebot11_<uin>.json` payload. */
function emptyOnebotConfig() {
  return {
    network: {
      httpServers: [],
      httpSseServers: [],
      httpClients: [],
      websocketServers: [],
      websocketClients: [],
      plugins: [],
    },
    musicSignUrl: '',
    enableLocalFile2Url: false,
    parseMultMsg: false,
    imageDownloadProxy: '',
    timeout: {
      baseTimeout: 10000,
      uploadSpeedKBps: 256,
      downloadSpeedKBps: 256,
      maxTimeout: 1800000,
    },
  }
}

/** Construct a manager with fakes pre-wired. */
function makeManager({ settings = makeSettings(), platform = fakePlatform(), logger = noopLogger, deps = {} } = {}) {
  return new NapcatManager({ settings, logger, deps: { platform, ...deps } })
}

// ------------------------------------------------------------ pure functions --

test('upsertWebsocketClient adds the koishi client to an empty config', () => {
  const original = emptyOnebotConfig()
  const { config, changed } = upsertWebsocketClient(original, {
    url: 'ws://127.0.0.1:5140/onebot',
    token: 'tok-1',
  })
  assert.equal(changed, true)
  assert.equal(config.network.websocketClients.length, 1)
  assert.deepEqual(config.network.websocketClients[0], {
    name: 'koishi',
    enable: true,
    url: 'ws://127.0.0.1:5140/onebot',
    messagePostFormat: 'array',
    reportSelfMessage: false,
    reconnectInterval: 5000,
    token: 'tok-1',
    debug: false,
    heartInterval: 30000,
  })
  // deep copy: the input stays untouched
  assert.deepEqual(original.network.websocketClients, [])
})

test('upsertWebsocketClient updates the same-name client and keeps other clients', () => {
  const original = emptyOnebotConfig()
  original.network.websocketClients.push(
    { name: 'koishi', enable: false, url: 'ws://old:1/x', token: 'old', verifyCertificate: true },
    { name: 'other', enable: true, url: 'ws://127.0.0.1:6000/onebot', token: 'other-token' },
  )
  const snapshot = JSON.parse(JSON.stringify(original))

  const { config, changed } = upsertWebsocketClient(original, {
    url: 'ws://127.0.0.1:5140/onebot',
    token: 'new-token',
  })

  assert.equal(changed, true)
  assert.equal(config.network.websocketClients.length, 2)
  const koishi = config.network.websocketClients.find((client) => client.name === 'koishi')
  assert.equal(koishi.url, 'ws://127.0.0.1:5140/onebot')
  assert.equal(koishi.token, 'new-token')
  assert.equal(koishi.enable, true)
  // unknown keys of an existing client are preserved
  assert.equal(koishi.verifyCertificate, true)
  assert.deepEqual(
    config.network.websocketClients.find((client) => client.name === 'other'),
    snapshot.network.websocketClients[1],
  )
  assert.deepEqual(original, snapshot)
})

test('upsertWebsocketClient removes duplicate reverse clients targeting the same URL', () => {
  const original = emptyOnebotConfig()
  original.network.websocketClients.push(
    { name: 'rws', enable: true, url: 'ws://127.0.0.1:5140/onebot' },
    { name: 'koishi', enable: true, url: 'ws://127.0.0.1:5140/onebot' },
    { name: 'other', enable: true, url: 'ws://127.0.0.1:6000/onebot' },
  )
  const { config, changed } = upsertWebsocketClient(original, { url: 'ws://127.0.0.1:5140/onebot' })
  assert.equal(changed, true)
  assert.deepEqual(config.network.websocketClients.map((client) => client.name), ['koishi', 'other'])
  const again = upsertWebsocketClient(config, { url: 'ws://127.0.0.1:5140/onebot' })
  assert.equal(again.changed, false)
})

test('upsertWebsocketClient is idempotent on an already-configured file', () => {
  const options = { url: 'ws://127.0.0.1:5140/onebot', token: 'tok-1' }
  const first = upsertWebsocketClient(emptyOnebotConfig(), options)
  const second = upsertWebsocketClient(first.config, options)
  assert.equal(second.changed, false)
  assert.equal(second.config.network.websocketClients.length, 1)
  assert.deepEqual(second.config, first.config)
})

test('upsertWebsocketClient rejects programmer errors with TypeError', () => {
  assert.throws(() => upsertWebsocketClient(null, { url: 'ws://x' }), TypeError)
  assert.throws(() => upsertWebsocketClient({}, { url: '' }), TypeError)
})

test('listWebsocketClients exposes name/url/enable only', () => {
  const config = {
    network: {
      websocketClients: [
        { name: 'koishi', url: 'ws://a', enable: true, token: 'secret' },
        { url: 'ws://b' },
        'not-a-client',
      ],
    },
  }
  assert.deepEqual(listWebsocketClients(config), [
    { name: 'koishi', url: 'ws://a', enable: true },
    { name: '', url: 'ws://b', enable: true },
  ])
  assert.deepEqual(listWebsocketClients(null), [])
})

test('maskOnebotConfig never leaks tokens', () => {
  const original = emptyOnebotConfig()
  original.network.websocketClients.push({
    name: 'koishi',
    enable: true,
    url: 'ws://127.0.0.1:5140/onebot',
    token: 'super-secret-token',
  })
  original.network.httpServers.push({ host: '127.0.0.1', port: 3000, token: 'http-secret' })

  const masked = maskOnebotConfig(original)
  const json = JSON.stringify(masked)
  assert.equal(json.includes('super-secret-token'), false)
  assert.equal(json.includes('http-secret'), false)
  assert.equal(masked.network.websocketClients[0].token, 'supe…')
  assert.equal(masked.network.httpServers[0].token, 'http…')
  assert.equal(masked.network.websocketClients[0].url, 'ws://127.0.0.1:5140/onebot')
  assert.equal(original.network.websocketClients[0].token, 'super-secret-token')
  assert.equal(maskOnebotConfig(null), null)
})

// ----------------------------------------------------------------- configure --

