import assert from 'node:assert/strict'
import { test } from 'node:test'
import { syncKoishiIdentity } from '../../host/plugins/lifecycle/identity-sync.js'

function fakeApi({ current = '676512192', login = '3090495044', running = true } = {}) {
  const calls = { set: [], restart: 0 }
  const logger = { info() {}, warn() {}, error() {}, debug() {} }
  const services = {
    napcat: { loginState: async () => ({ loggedIn: true, qq: login }) },
    koishi: {
      status: async () => ({ running }),
      restart: async () => { calls.restart += 1; return { ok: true } },
    },
    setup: {
      getKoishiSelfId: async () => ({ ok: true, selfId: current }),
      setKoishiSelfId: async (qq) => { calls.set.push(qq); return { ok: true, changed: true } },
    },
  }
  return {
    calls,
    settings: { autoSyncSelfId: true },
    logger,
    get: (name) => services[name],
  }
}

test('identity-sync: switches selfId and restarts a running Koishi', async () => {
  const api = fakeApi()
  const result = await syncKoishiIdentity(api)
  assert.deepEqual(result, { checked: true, changed: true, restarted: true })
  assert.deepEqual(api.calls.set, ['3090495044'])
  assert.equal(api.calls.restart, 1)
})

test('identity-sync: writes config without restarting a stopped Koishi', async () => {
  const api = fakeApi({ running: false })
  const result = await syncKoishiIdentity(api)
  assert.equal(result.changed, true)
  assert.equal(result.restarted, false)
  assert.equal(api.calls.restart, 0)
})

test('identity-sync: no-op when the account already matches or is disabled', async () => {
  const matched = fakeApi({ current: '3090495044' })
  assert.deepEqual(await syncKoishiIdentity(matched), { checked: true, changed: false })
  assert.equal(matched.calls.restart, 0)

  const disabled = fakeApi()
  disabled.settings.autoSyncSelfId = false
  assert.deepEqual(await syncKoishiIdentity(disabled), { checked: false, reason: 'disabled' })
})
