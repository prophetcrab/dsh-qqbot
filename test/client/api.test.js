/**
 * `requestJson` must surface the Host's user-facing failure text. Regression:
 * a failed one-click start answered `{ ok:false, message }` (no `error`), and
 * the panel showed the generic "request failed" instead of the real reason.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { requestJson } from '../../client/runtime/api.js'

function stubFetch(response) {
  const original = globalThis.fetch
  const calls = []
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init })
    return response
  }
  return {
    calls,
    restore() { globalThis.fetch = original },
  }
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

test('requestJson: ok:false surfaces the Host message', async () => {
  const stub = stubFetch(jsonResponse({ ok: false, steps: [], message: 'NapCat/Koishi 服务尚未加载' }))
  try {
    await assert.rejects(
      () => requestJson('/qqbot/all/start', { method: 'POST', body: {} }),
      /NapCat\/Koishi 服务尚未加载/u,
    )
  } finally {
    stub.restore()
  }
})

test('requestJson: error wins over message when both exist', async () => {
  const stub = stubFetch(jsonResponse({ ok: false, error: 'bad-input', message: '输入不合法' }))
  try {
    await assert.rejects(() => requestJson('/qqbot/access', { method: 'POST' }), /bad-input/u)
  } finally {
    stub.restore()
  }
})

test('requestJson: non-2xx falls back to message and then the HTTP status', async () => {
  const withMessage = stubFetch(jsonResponse({ message: 'boom' }, 500))
  try {
    await assert.rejects(() => requestJson('/qqbot/status'), /boom/u)
  } finally {
    withMessage.restore()
  }
  const plain = stubFetch(new Response('not json', { status: 502 }))
  try {
    await assert.rejects(() => requestJson('/qqbot/status'), /HTTP 502/u)
  } finally {
    plain.restore()
  }
})

test('requestJson: acceptNotOk still returns the payload', async () => {
  const stub = stubFetch(jsonResponse({ ok: false, error: 'bot-offline' }))
  try {
    const payload = await requestJson('/qqbot/contacts', { acceptNotOk: true })
    assert.equal(payload.ok, false)
  } finally {
    stub.restore()
  }
})
