import assert from 'node:assert/strict'
import { test } from 'node:test'
import { AiChatService, normalizeMessages } from '../lib/ai.js'

const logger = { info() {}, warn() {}, error() {}, debug() {} }

/** Fake ctx.get with a scripted LLM stream. */
function fakeCtx({ chunks = [], selection = { provider: 'deepseek-account', model: 'deepseek-flash' }, llm = true } = {}) {
  const map = {
    agentDefaultModel: { currentSelection: () => selection },
  }
  if (llm) {
    map.llm = {
      stream: async function* () {
        for (const chunk of chunks) yield chunk
        yield { type: 'finish', reason: { kind: 'stop' } }
      },
    }
  }
  return { get: (name) => map[name] ?? null }
}

const settings = { aiProvider: '', aiModel: '', aiSystemPrompt: '', aiMaxTokens: 256, aiTemperature: 0.5 }

test('normalizeMessages: keeps text roles, drops empties and caps history', () => {
  const messages = normalizeMessages([
    { role: 'user', text: '你好' },
    { role: 'assistant', text: '在的' },
    { role: 'system', text: 'ignored' },
    { role: 'user', text: '   ' },
  ])
  assert.deepEqual(messages, [
    { role: 'user', content: [{ type: 'text', text: '你好' }] },
    { role: 'assistant', content: [{ type: 'text', text: '在的' }] },
  ])
})

test('chat: streams text-delta chunks and uses harness default selection', async () => {
  const ctx = fakeCtx({
    chunks: [
      { type: 'text-delta', index: 0, text: '你' },
      { type: 'text-delta', index: 0, text: '好' },
    ],
  })
  const ai = new AiChatService({ ctx, settings, logger })
  const result = await ai.chat({ messages: [{ role: 'user', text: 'hi' }] })
  assert.equal(result.ok, true)
  assert.equal(result.reply, '你好')
  assert.equal(result.provider, 'deepseek-account')
  assert.equal(result.model, 'deepseek-flash')
})

test('chat: explicit provider/model config wins', async () => {
  const ai = new AiChatService({
    ctx: fakeCtx({ chunks: [{ type: 'text-delta', index: 0, text: 'ok' }] }),
    settings: { ...settings, aiProvider: 'deepseek-official', aiModel: 'deepseek-chat' },
    logger,
  })
  assert.deepEqual(ai.resolveSelection(), { provider: 'deepseek-official', model: 'deepseek-chat', source: 'config' })
  const result = await ai.chat({ messages: [{ role: 'user', text: 'hi' }] })
  assert.equal(result.ok, true)
  assert.equal(result.provider, 'deepseek-official')
})

test('chat: missing LLM service is reported', async () => {
  const ai = new AiChatService({ ctx: fakeCtx({ llm: false }), settings, logger })
  const result = await ai.chat({ messages: [{ role: 'user', text: 'hi' }] })
  assert.equal(result.ok, false)
  assert.equal(result.code, 'NO_LLM_SERVICE')
})

test('chat: empty messages are rejected before calling the provider', async () => {
  const ai = new AiChatService({ ctx: fakeCtx(), settings, logger })
  const result = await ai.chat({ messages: [] })
  assert.equal(result.ok, false)
  assert.equal(result.code, 'EMPTY_MESSAGES')
})

test('chat: terminal error finish becomes a structured failure', async () => {
  const map = {
    agentDefaultModel: { currentSelection: () => ({ provider: 'p', model: 'm' }) },
    llm: {
      stream: async function* () {
        yield { type: 'text-delta', index: 0, text: 'partial' }
        yield { type: 'finish', reason: { kind: 'error', failure: { code: 'AUTH', message: 'bad key' } } }
      },
    },
  }
  const ai = new AiChatService({ ctx: { get: (name) => map[name] ?? null }, settings, logger })
  const result = await ai.chat({ messages: [{ role: 'user', text: 'hi' }] })
  assert.equal(result.ok, false)
  assert.equal(result.code, 'AUTH')
  assert.match(result.error, /bad key/u)
})
