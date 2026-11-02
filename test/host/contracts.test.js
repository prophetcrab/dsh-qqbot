/**
 * Contract tests: AI request/response, status DTO, panel descriptors, config
 * schema and the lightweight schema validator.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  AI_CHAT_API_VERSION,
  aiChatResponse,
  normalizeAiChatRequest,
  panelSchema,
  validateAgainstSchema,
  validateAiChatRequest,
  validateClientTab,
  validateHostConfig,
  validatePanelFeature,
  validateStatusSnapshot,
} from '../../host/contracts/index.js'

test('AI contract: legacy requests are version 1', () => {
  const result = validateAiChatRequest({ messages: [{ role: 'user', text: 'hi' }] })
  assert.equal(result.valid, true)
  assert.equal(result.apiVersion, 1)
  assert.equal(AI_CHAT_API_VERSION, 1)
})

test('AI contract: unsupported apiVersion fails closed', () => {
  const result = validateAiChatRequest({ apiVersion: 2, messages: [] })
  assert.equal(result.valid, false)
  assert.ok(result.errors.some((error) => error.includes('apiVersion')))
})

test('AI contract: malformed fields are rejected', () => {
  assert.equal(validateAiChatRequest({ messages: 'nope' }).valid, false)
  assert.equal(validateAiChatRequest({ messages: [{ role: 'system' }] }).valid, false)
  assert.equal(validateAiChatRequest({ messages: [], mentionSelf: 'yes' }).valid, false)
  assert.equal(validateAiChatRequest(null).valid, false)
})

test('AI contract: normalize keeps the v1 fields and drops unknown ones', () => {
  const request = normalizeAiChatRequest({
    messages: [{ role: 'user', text: 'hi' }],
    images: [{ data: 'x' }],
    background: 'bg',
    quote: { userName: 'a', text: 'b' },
    mentionSelf: true,
    mentionAll: false,
    groupId: '1',
    userId: '2',
    userName: 'u',
    system: 'sys',
    somethingNew: 'ignored',
  })
  assert.equal(request.apiVersion, 1)
  assert.equal(request.messages.length, 1)
  assert.equal(request.background, 'bg')
  assert.equal(request.quote.userName, 'a')
  assert.equal(request.mentionSelf, true)
  assert.equal('mentionAll' in request, false)
  assert.equal('somethingNew' in request, false)
})

test('AI contract: response builder keeps the documented shapes', () => {
  assert.deepEqual(aiChatResponse({ ok: true, reply: 'hi', provider: 'p', model: 'm' }), { ok: true, reply: 'hi', provider: 'p', model: 'm' })
  assert.deepEqual(aiChatResponse({ ok: true, skipped: true, reason: 'r' }), { ok: true, skipped: true, reason: 'r' })
  const busy = aiChatResponse({ ok: false, code: 'BUSY', retryable: true })
  assert.equal(busy.ok, false)
  assert.equal(busy.code, 'BUSY')
  assert.equal(busy.retryable, true)
})

test('status contract: validates the stable snapshot shape', () => {
  const snapshot = {
    platform: { id: 'macos', label: 'macOS', supported: true, napcatSupported: true, koishiSupported: true },
    settings: { projectDir: '/tmp/qq-bot', koishiPort: 5140, napcatPort: 6099, reversePath: '/onebot' },
    qq: { installed: true, path: '/Applications/QQ.app', version: '6.9' },
    napcat: { installed: true, running: false },
    koishi: { exists: true, running: false },
    bot: { online: false, selfId: null, platform: null },
    ai: { available: false, provider: 'p', model: 'm' },
    aiSettings: {},
    persona: { name: 'p' },
    features: [],
    clientTabs: [],
    updatedAt: new Date().toISOString(),
  }
  assert.deepEqual(validateStatusSnapshot(snapshot), { valid: true, errors: [] })
  assert.equal(validateStatusSnapshot({ ...snapshot, platform: undefined }).valid, false)
})

test('panel contract: feature and tab descriptors', () => {
  assert.equal(validatePanelFeature({ id: 'x', title: { zh: 'x', en: 'x' }, description: { zh: '', en: '' }, actions: [] }).valid, true)
  assert.equal(validatePanelFeature({ id: 'x' }).valid, false)
  assert.equal(validateClientTab({ id: 't', title: { zh: 't', en: 't' }, order: 1 }).valid, true)
  assert.equal(validateClientTab({ title: { zh: 't', en: 't' } }).valid, false)
  assert.ok(panelSchema.definitions.feature)
})

test('config contract: resolved settings validate against the schema', () => {
  const resolved = {
    projectDir: '/tmp/qq-bot',
    koishiPort: 5140,
    napcatPort: 6099,
    reversePath: '/onebot',
    napcatToken: '',
    qqPath: '',
    napcatDir: '',
    offlineVendorDir: '',
    offlineNapcatVersion: '',
    aiProvider: '',
    aiModel: '',
    aiSystemPrompt: 'hi',
    aiMaxTokens: 800,
    aiTemperature: 0.7,
    aiSelfCheck: true,
    autoRestartKoishi: true,
    autoInstallDeps: true,
    logLines: 200,
  }
  assert.equal(validateHostConfig(resolved).valid, true)
  assert.equal(validateHostConfig({ ...resolved, koishiPort: 0 }).valid, false)
  assert.equal(validateHostConfig({ ...resolved, aiTemperature: 9 }).valid, false)
})

test('validator: supports the schema subset used by contracts', () => {
  const schema = {
    type: 'object',
    properties: {
      name: { type: 'string', minLength: 1 },
      count: { type: 'integer', minimum: 1, maximum: 3 },
      tags: { type: 'array', maxItems: 2, items: { type: 'string' } },
      mode: { type: 'string', enum: ['a', 'b'] },
    },
    required: ['name'],
    additionalProperties: false,
  }
  assert.equal(validateAgainstSchema({ name: 'x', count: 2, tags: ['a'], mode: 'b' }, schema).valid, true)
  assert.equal(validateAgainstSchema({}, schema).valid, false)
  assert.equal(validateAgainstSchema({ name: 'x', count: 4 }, schema).valid, false)
  assert.equal(validateAgainstSchema({ name: 'x', tags: ['a', 'b', 'c'] }, schema).valid, false)
  assert.equal(validateAgainstSchema({ name: 'x', mode: 'c' }, schema).valid, false)
  assert.equal(validateAgainstSchema({ name: 'x', extra: 1 }, schema).valid, false)
  assert.equal(validateAgainstSchema({ name: '' }, schema).valid, false)
})
