import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isLocalOrigin, isLoopbackAddress, only } from '../../host/kernel/http.js'

function fakeResponse() {
  return {
    status: 0,
    body: null,
    headersSent: false,
    writeHead(status) { this.status = status; this.headersSent = true },
    end(payload) { this.body = JSON.parse(Buffer.from(payload).toString('utf8')) },
  }
}

async function call(req) {
  const res = fakeResponse()
  let called = false
  only(req, res, ['GET', 'POST'], () => { called = true })
  await new Promise((resolve) => setImmediate(resolve))
  return { res, called }
}

test('local HTTP guard: only loopback remote addresses are accepted', async () => {
  assert.equal(isLoopbackAddress('127.0.0.1'), true)
  assert.equal(isLoopbackAddress('::ffff:127.0.0.1'), true)
  assert.equal(isLoopbackAddress('::1'), true)
  assert.equal(isLoopbackAddress('10.0.0.2'), false)

  const allowed = await call({ method: 'GET', headers: {}, socket: { remoteAddress: '127.0.0.1' } })
  assert.equal(allowed.called, true)
  const blocked = await call({ method: 'GET', headers: {}, socket: { remoteAddress: '10.0.0.2' } })
  assert.equal(blocked.called, false)
  assert.equal(blocked.res.status, 403)
})

test('local HTTP guard: cross-site mutations are rejected, local/no-origin allowed', async () => {
  assert.equal(isLocalOrigin('http://127.0.0.1:58614'), true)
  assert.equal(isLocalOrigin('http://localhost:58614'), true)
  assert.equal(isLocalOrigin('https://evil.example'), false)

  const evil = await call({
    method: 'POST',
    headers: { origin: 'https://evil.example' },
    socket: { remoteAddress: '127.0.0.1' },
  })
  assert.equal(evil.called, false)
  assert.equal(evil.res.status, 403)

  const local = await call({
    method: 'POST',
    headers: { origin: 'http://127.0.0.1:58614' },
    socket: { remoteAddress: '127.0.0.1' },
  })
  assert.equal(local.called, true)

  const cli = await call({ method: 'POST', headers: {}, socket: { remoteAddress: '127.0.0.1' } })
  assert.equal(cli.called, true)
})
