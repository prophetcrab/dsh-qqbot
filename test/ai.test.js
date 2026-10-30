import assert from 'node:assert/strict'
import { test } from 'node:test'
import { AiChatService, normalizeMessages, sanitizeReply } from '../lib/ai.js'

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


test('sanitizeReply: strips context labels and speaker prefixes only', () => {
  assert.equal(sanitizeReply('[背景] AI：这是回复'), '这是回复')
  assert.equal(sanitizeReply('[当前消息] 小明：这是回复'), '这是回复')
  assert.equal(sanitizeReply('第一行\n[背景] AI：第二行'), '第一行\n第二行')
  assert.equal(sanitizeReply('【当前消息】回复内容'), '回复内容')
  assert.equal(sanitizeReply('正常内容 [图片] 保留'), '正常内容 [图片] 保留')
  assert.equal(sanitizeReply('内容 [背景] 继续'), '内容 继续')
  assert.equal(sanitizeReply('内容【当前消息】继续'), '内容继续')
})


test('chat: @别人时提示模型这是对别人的消息，不要假装被点名', async () => {
  let captured = null
  const map = {
    agentDefaultModel: { currentSelection: () => ({ provider: 'p', model: 'm' }) },
    llm: {
      stream: async function* (options) {
        if (options.system?.includes('【角色设定】')) captured = options
        yield { type: 'text-delta', index: 0, text: '可以呀' }
        yield { type: 'finish', reason: { kind: 'stop' } }
      },
    },
  }
  const ai = new AiChatService({ ctx: { get: (name) => map[name] ?? null }, settings, logger })
  await ai.chat({
    messages: [{ role: 'user', text: '@小明 晚上开黑吗' }],
    background: '小明：今晚有空吗',
    mentionOthers: ['小明'],
  })
  assert.match(captured.system, /【当前消息对象】/u)
  assert.match(captured.system, /@ 的是 小明/u)
  assert.match(captured.system, /不要假装被点名/u)
})


test('chat: records the last full prompt for the panel preview', async () => {
  const map = {
    agentDefaultModel: { currentSelection: () => ({ provider: 'p', model: 'm' }) },
    llm: {
      stream: async function* () {
        yield { type: 'text-delta', index: 0, text: '好' }
        yield { type: 'finish', reason: { kind: 'stop' } }
      },
    },
  }
  const ai = new AiChatService({ ctx: { get: (name) => map[name] ?? null }, settings, logger })
  await ai.chat({
    messages: [{ role: 'user', text: '@小明 在吗' }],
    background: '小明：在的',
    mentionOthers: ['小明'],
    groupId: 'g1',
    userId: '20000',
    userName: '测试用户',
  })
  const snapshot = ai.lastPromptSnapshot()
  assert.equal(snapshot.provider, 'p')
  assert.equal(snapshot.groupId, 'g1')
  assert.deepEqual(snapshot.mentionOthers, ['小明'])
  assert.match(snapshot.system, /【角色设定】/u)
  assert.match(snapshot.system, /【当前消息对象】/u)
  assert.equal(snapshot.messages.length, 1)
  assert.equal(snapshot.messages[0].text, '@小明 在吗')
})


function scriptedLlm(scripts) {
  const calls = []
  let index = 0
  return {
    calls,
    llm: {
      stream: async function* (options) {
        calls.push(options)
        const text = scripts[Math.min(index, scripts.length - 1)]
        index += 1
        if (text !== null) yield { type: 'text-delta', index: 0, text }
        yield { type: 'finish', reason: { kind: 'stop' } }
      },
    },
  }
}

test('self-check: persona can decline a triggered message without calling the main reply', async () => {
  const scripted = scriptedLlm(['{"reply":false,"reason":"与我无关"}', '不该被调用'])
  const map = {
    agentDefaultModel: { currentSelection: () => ({ provider: 'p', model: 'm' }) },
    llm: scripted.llm,
  }
  const ai = new AiChatService({ ctx: { get: (name) => map[name] ?? null }, settings, logger })
  const result = await ai.chat({ messages: [{ role: 'user', text: '他们聊他们的' }] })
  assert.equal(result.ok, true)
  assert.equal(result.skipped, true)
  assert.match(result.reason, /与我无关/u)
  assert.equal(scripted.calls.length, 1)
  assert.equal(ai.lastGateSnapshot().reply, false)
})

test('self-check: accepted message proceeds to the main reply', async () => {
  const scripted = scriptedLlm(['{"reply":true,"reason":"可以聊"}', '那就一起呀'])
  const map = {
    agentDefaultModel: { currentSelection: () => ({ provider: 'p', model: 'm' }) },
    llm: scripted.llm,
  }
  const ai = new AiChatService({ ctx: { get: (name) => map[name] ?? null }, settings, logger })
  const result = await ai.chat({ messages: [{ role: 'user', text: '要一起吗' }] })
  assert.equal(result.ok, true)
  assert.equal(result.skipped, undefined)
  assert.equal(result.reply, '那就一起呀')
  assert.equal(scripted.calls.length, 2)
})

test('self-check: malformed verdict falls back to replying', async () => {
  const scripted = scriptedLlm(['不是 JSON', '照常回复'])
  const map = {
    agentDefaultModel: { currentSelection: () => ({ provider: 'p', model: 'm' }) },
    llm: scripted.llm,
  }
  const ai = new AiChatService({ ctx: { get: (name) => map[name] ?? null }, settings, logger })
  const result = await ai.chat({ messages: [{ role: 'user', text: '你好' }] })
  assert.equal(result.ok, true)
  assert.equal(result.reply, '照常回复')
  assert.equal(scripted.calls.length, 2)
})


test('chat: backgroundImages are sent as a separate background image message', async () => {
  let captured = null
  const saved = []
  const map = {
    agentDefaultModel: { currentSelection: () => ({ provider: 'p', model: 'm' }) },
    attachments: {
      saveImages: async (inputs) => {
        saved.push(...inputs)
        return inputs.map((_, index) => ({ attachmentId: `bg-${index}`, mediaType: inputs[index].mediaType, bytes: 4, width: 1, height: 1 }))
      },
    },
    llm: {
      stream: async function* (options) {
        captured = options
        yield { type: 'text-delta', index: 0, text: '图中是红色的' }
        yield { type: 'finish', reason: { kind: 'stop' } }
      },
    },
  }
  const ai = new AiChatService({ ctx: { get: (name) => map[name] ?? null }, settings, logger })
  const result = await ai.chat({
    messages: [{ role: 'user', text: '分析一下刚才那张图' }],
    backgroundImages: [{ mediaType: 'image/png', data: Buffer.from([1, 2, 3, 4]).toString('base64') }],
  })
  assert.equal(result.ok, true)
  assert.equal(saved.length, 1)
  const first = captured.messages[0]
  assert.equal(first.role, 'user')
  assert.match(first.content[0].text, /【背景图片】/u)
  assert.deepEqual(first.content[1], {
    type: 'image',
    attachment: { attachmentId: 'bg-0', mediaType: 'image/png', bytes: 4, width: 1, height: 1 },
  })
  assert.equal(ai.lastPromptSnapshot().backgroundImageCount, 1)
})


test('chat: quoted message text and image are prioritized as reply context', async () => {
  let captured = null
  const saved = []
  const map = {
    agentDefaultModel: { currentSelection: () => ({ provider: 'p', model: 'm' }) },
    attachments: {
      saveImages: async (inputs) => {
        saved.push(...inputs)
        return inputs.map((_, index) => ({ attachmentId: `quote-${index}`, mediaType: inputs[index].mediaType, bytes: 4, width: 1, height: 1 }))
      },
    },
    llm: {
      stream: async function* (options) {
        captured = options
        yield { type: 'text-delta', index: 0, text: '这张图是蓝色的' }
        yield { type: 'finish', reason: { kind: 'stop' } }
      },
    },
  }
  const ai = new AiChatService({ ctx: { get: (name) => map[name] ?? null }, settings, logger })
  const result = await ai.chat({
    messages: [{ role: 'user', text: '@你 分析一下这张图' }],
    quote: { userName: '小明', text: '', imageCount: 1 },
    quotedImages: [{ mediaType: 'image/png', data: Buffer.from([1, 2, 3, 4]).toString('base64') }],
    mentionSelf: true,
  })
  assert.equal(result.ok, true)
  assert.match(captured.system, /【当前消息引用的内容】/u)
  assert.match(captured.system, /发送者：小明/u)
  assert.match(captured.system, /优先针对被引用的那条消息/u)
  const first = captured.messages[0]
  assert.match(first.content[0].text, /【引用消息中的图片】/u)
  assert.equal(first.content[1].type, 'image')
  assert.equal(ai.lastPromptSnapshot().quotedImageCount, 1)
})
