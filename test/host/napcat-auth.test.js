import assert from 'node:assert/strict'
import { test } from 'node:test'
import { loginProbe } from '../../host/services/napcat/webui.js'
import { sha256Hex } from '../../host/platform/mac/index.js'

test('loginProbe drops a stale cached WebUI credential on code != 0', async () => {
  const token = 'test-token'
  const manager = {
    settings: { napcatPort: 6099 },
    auth: { credential: 'stale', port: 6099, tokenHash: sha256Hex(token), expiresAt: Infinity },
    webuiReachable: false,
    now: () => 1,
    logger: { info() {}, warn() {}, error() {} },
    http: async (url) => {
      assert.match(url, /CheckLoginStatus/u)
      return { ok: true, status: 200, data: { code: -1, message: 'Unauthorized' } }
    },
  }
  const probe = await loginProbe(manager, { webui: { port: 6099, token } })
  assert.equal(probe.loggedIn, false)
  assert.equal(probe.reachable, true)
  assert.equal(manager.auth, null)
})
