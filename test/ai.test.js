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
  assert.equal(messages.length, 2)
  assert.deepEqual(messages[0], { role: 'user', content: [{ type: 'text', text: '你好' }] })
  assert.equal(messages[1].role, 'assistant')
  assert.equal(messages[1].content[0].text, '在的')
  assert.equal(messages[1].source.provider, 'deepseek-account')
  assert.equal(typeof messages[1].id, 'string')
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


test('chat: persona card is the first system segment, extra prompt follows', async () => {
  let captured = null
  const map = {
    agentDefaultModel: { currentSelection: () => ({ provider: 'p', model: 'm' }) },
    llm: {
      stream: async function* (options) {
        captured = options
        yield { type: 'text-delta', index: 0, text: '好' }
        yield { type: 'finish', reason: { kind: 'stop' } }
      },
    },
  }
  const ai = new AiChatService({
    ctx: { get: (name) => map[name] ?? null },
    settings,
    logger,
    personaLoader: async () => ({
      name: '猫娘',
      role: '群里的猫娘助手',
      tone: '软萌',
      personality: '好奇',
      rules: '句尾带喵',
      examples: [{ user: '你好', assistant: '你好喵' }],
    }),
  })
  await ai.chat({ messages: [{ role: 'user', text: 'hi' }], system: '额外规则：不要刷屏' })
  assert.ok(captured.system.startsWith('【角色设定】'))
  assert.match(captured.system, /名称：猫娘/u)
  assert.match(captured.system, /【对话示例】/u)
  assert.match(captured.system, /额外规则：不要刷屏/u)
  assert.ok(captured.system.indexOf('【角色设定】') < captured.system.indexOf('额外规则'))
})


test('chat: profile is the second system segment and focus instruction follows', async () => {
  const { mkdtemp, rm } = await import('node:fs/promises')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const { saveProfileStore } = await import('../lib/profiles.js')
  const dir = await mkdtemp(join(tmpdir(), 'dsh-ai-profile-'))
  const profilesPath = join(dir, 'profiles.json')
  await saveProfileStore(profilesPath, {
    version: 1,
    profiles: {
      'g1:20000': {
        groupId: 'g1', qq: '20000', nickname: '小明', summary: '喜欢打游戏',
        personality: '话多', style: '网络用语', relationship: '常和机器人互怼',
        interests: ['游戏'], recent: '刚聊了新番', interactions: 3,
      },
    },
  })
  let captured = null
  const map = {
    agentDefaultModel: { currentSelection: () => ({ provider: 'p', model: 'm' }) },
    llm: {
      stream: async function* (options) {
        if (options.system?.includes('【角色设定】')) captured = options
        yield { type: 'text-delta', index: 0, text: '好' }
        yield { type: 'finish', reason: { kind: 'stop' } }
      },
    },
  }
  const ai = new AiChatService({
    ctx: { get: (name) => map[name] ?? null },
    settings,
    logger,
    profilesPath,
  })
  await ai.chat({
    messages: [{ role: 'user', text: '[背景] A：旧消息' }, { role: 'user', text: '[当前消息] 小明：你好' }],
    groupId: 'g1',
    userId: '20000',
    userName: '小明',
  })
  assert.ok(captured.system.indexOf('【角色设定】') >= 0)
  assert.ok(captured.system.indexOf('【用户画像】') > captured.system.indexOf('【角色设定】'))
  assert.ok(captured.system.indexOf('【回复要求】') > captured.system.indexOf('【用户画像】'))
  assert.match(captured.system, /昵称：小明/u)
  await rm(dir, { recursive: true, force: true })
})

test('chat: current-message images are stored as attachments and attached to the prompt', async () => {
  let captured = null
  const saved = []
  const map = {
    agentDefaultModel: { currentSelection: () => ({ provider: 'p', model: 'm' }) },
    attachments: {
      saveImages: async (inputs) => {
        saved.push(...inputs)
        return [{ attachmentId: 'att-1', mediaType: 'image/png', bytes: 4, width: 1, height: 1 }]
      },
    },
    llm: {
      stream: async function* (options) {
        captured = options
        yield { type: 'text-delta', index: 0, text: '看到图片了' }
        yield { type: 'finish', reason: { kind: 'stop' } }
      },
    },
  }
  const ai = new AiChatService({ ctx: { get: (name) => map[name] ?? null }, settings, logger })
  const result = await ai.chat({
    messages: [{ role: 'user', text: '看图' }],
    images: [{ mediaType: 'image/png', data: Buffer.from([1, 2, 3, 4]).toString('base64') }],
  })
  assert.equal(result.ok, true)
  assert.equal(saved.length, 1)
  assert.equal(saved[0].mediaType, 'image/png')
  const last = captured.messages.at(-1)
  assert.equal(last.role, 'user')
  assert.deepEqual(last.content.at(-1), {
    type: 'image',
    attachment: { attachmentId: 'att-1', mediaType: 'image/png', bytes: 4, width: 1, height: 1 },
  })
})


test('profile panel methods: save, list with search, delete', async () => {
  const { mkdtemp, rm } = await import('node:fs/promises')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const dir = await mkdtemp(join(tmpdir(), 'dsh-ai-profiles-api-'))
  const profilesPath = join(dir, 'profiles.json')
  const ai = new AiChatService({ ctx: fakeCtx(), settings, logger, profilesPath })
  const saved = await ai.saveProfile({
    groupId: 'g1', qq: '20000', nickname: '小明', summary: '喜欢打游戏',
    personality: '话多', style: '网络用语', relationship: '群友', interests: ['游戏'], recent: '刚聊了新番',
  })
  assert.equal(saved.key, 'g1:20000')
  const list = await ai.listProfiles({ search: '打游戏' })
  assert.equal(list.length, 1)
  assert.equal(list[0].nickname, '小明')
  assert.equal((await ai.listProfiles({ groupId: 'other' })).length, 0)
  assert.equal(await ai.deleteProfile('g1:20000'), true)
  assert.equal((await ai.listProfiles()).length, 0)
  await rm(dir, { recursive: true, force: true })
})
