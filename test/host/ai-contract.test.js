import assert from 'node:assert/strict'
import { test } from 'node:test'
import { normalizeAiChatRequest, validateAiChatRequest } from '../../host/contracts/ai.js'

function legacyBody(overrides = {}) {
  return {
    messages: [{ role: 'user', text: '测试' }],
    background: '',
    images: [],
    backgroundImages: [],
    quotedImages: [],
    quote: null,
    groupId: '1',
    userId: '2',
    userName: 'x',
    mentionSelf: false,
    mentionOthers: [],
    mentionAll: false,
    replyToBot: false,
    ...overrides,
  }
}

test('AI contract: legacy payload with quote null is accepted', () => {
  const validation = validateAiChatRequest(legacyBody())
  assert.deepEqual(validation.errors, [])
  assert.equal(validation.valid, true)
  const request = normalizeAiChatRequest(legacyBody())
  assert.equal(request.quote, undefined)
})

test('AI contract: quote object is accepted and preserved', () => {
  const body = legacyBody({ quote: { userName: '小明', text: '旧消息', imageCount: 0 } })
  assert.equal(validateAiChatRequest(body).valid, true)
  assert.deepEqual(normalizeAiChatRequest(body).quote, body.quote)
})

test('AI contract: future apiVersion is rejected', () => {
  const validation = validateAiChatRequest(legacyBody({ apiVersion: 99 }))
  assert.equal(validation.valid, false)
  assert.ok(validation.errors.some((error) => error.includes('apiVersion')))
})
