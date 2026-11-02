import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fetchMessages, normalizeMessage, normalizeMessages } from '../host/plugins/messages/data.js'

test('normalizeMessage: group/private fields and defaults', () => {
  assert.deepEqual(normalizeMessage({
    id: 7,
    time: '2026-10-30T00:00:00.000Z',
    direction: 'in',
    scene: 'group',
    targetId: '123456',
    groupId: '123456',
    userId: '20000',
    userName: 'Alice',
    content: '/echo hi',
    messageId: '99',
  }), {
    id: 7,
    time: '2026-10-30T00:00:00.000Z',
    direction: 'in',
    scene: 'group',
    targetId: '123456',
    groupId: '123456',
    userId: '20000',
    userName: 'Alice',
    content: '/echo hi',
    messageId: '99',
  })
  const fallback = normalizeMessage({ id: 'x' })
  assert.equal(fallback.id, 0)
  assert.equal(fallback.scene, 'group')
  assert.equal(fallback.direction, 'in')
})

test('normalizeMessages: wraps data, sorts shape, clamps limit', () => {
  const result = normalizeMessages({
    data: {
      ok: true,
      total: 12,
      updatedAt: '2026-10-30T00:00:00.000Z',
      messages: [
        { id: 1, content: 'a', scene: 'group', targetId: '1' },
        { id: 2, content: 'b', scene: 'private', targetId: '2' },
        null,
      ],
    },
  }, 50)
  assert.equal(result.ok, true)
  assert.equal(result.messages.length, 2)
  assert.equal(result.messages[1].scene, 'private')
  assert.equal(result.total, 12)
})

test('fetchMessages: success and transport failure', async () => {
  const success = await fetchMessages({ koishiPort: 5140 }, { limit: 10 }, {
    httpJson: async (url) => {
      assert.match(url, /:5140\/api\/qqbot\/messages\?limit=10$/u)
      return { ok: true, status: 200, data: { ok: true, messages: [{ id: 1, content: 'hi' }], total: 1 } }
    },
  })
  assert.equal(success.ok, true)
  assert.equal(success.messages.length, 1)

  const failure = await fetchMessages({ koishiPort: 5140 }, {}, {
    httpJson: async () => ({ ok: false, status: 0, data: null, error: 'ECONNREFUSED' }),
  })
  assert.equal(failure.ok, false)
  assert.equal(failure.error, 'ECONNREFUSED')
  assert.deepEqual(failure.messages, [])
})
