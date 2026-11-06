/** Service-level tests for prompt boundaries, degraded updates and idempotency. */
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { GroupLoopService } from '../../host/services/group-loop/index.js'

async function setup(stream, options = {}) {
  const root = await mkdtemp(join(tmpdir(), 'dsh-group-loop-service-'))
  const service = new GroupLoopService({
    ctx: { get: (name) => name === 'agentDefaultModel' ? { currentSelection: () => ({ provider: 'p', model: 'm' }) } : name === 'llm' ? { stream } : null },
    settings: { projectDir: root, ...(options.settings ?? {}) },
    logger: { warn() {} },
    personaPath: join(root, 'persona.json'),
    profilesPath: join(root, 'profiles.json'),
    ...(options.webSearch ? { webSearch: options.webSearch } : {}),
    ...(options.weather ? { weather: options.weather } : {}),
    ...(options.financeCalendar ? { financeCalendar: options.financeCalendar } : {}),
    random: options.random ?? (() => 0.9),
  })
  return { root, service }
}

test('profile data is placed in user content, never in the system prompt', async () => {
  let captured = null
  const stream = async function* (options) {
    captured = options
    yield { type: 'text-delta', text: '{"speak":{"enabled":false},"reason":"不接"}' }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
  const { root, service } = await setup(stream)
  await service.store.applyProfiles('g1', [{ qq: '20000', patch: { summary: '秘密画像摘要', interests: ['游戏'] } }], [{ qq: '20000', nickname: '小明' }])
  const result = await service.analyze({
    groupId: 'g1',
    material: '[2026] 小明(20000)：你好',
    participants: [{ qq: '20000', nickname: '小明' }],
    trigger: { reason: 'count' },
  })
  assert.equal(result.ok, true)
  assert.equal(result.speak.enabled, false)
  assert.equal(captured.system.includes('秘密画像摘要'), false)
  assert.match(captured.system, /【当前状态（软约束）】/u)
  assert.match(captured.system, /社交电量/u)
  assert.equal(captured.messages[0].content[0].text.includes('<profile-data>'), true)
  assert.equal(captured.messages[0].content[0].text.includes('秘密画像摘要'), true)
  await rm(root, { recursive: true, force: true })
})

test('state update is idempotent and reports degraded LLM failures', async () => {
  let calls = 0
  const stream = async function* () {
    calls += 1
    yield { type: 'text-delta', text: '{"memory":[{"summary":"记住"}],"userProfiles":[],"emotion":{"valenceDelta":0.05},"groupState":{}}' }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
  const { root, service } = await setup(stream)
  const input = { loopId: 'loop-service', groupId: 'g1', material: '素材', participants: [], speak: { enabled: false }, sendResult: { sent: false } }
  const first = await service.stateUpdate(input)
  const second = await service.stateUpdate(input)
  assert.equal(first.degraded, false)
  assert.equal(first.memory, 1)
  assert.equal(second.duplicate, true)
  assert.equal(calls, 1)
  await rm(root, { recursive: true, force: true })

  const failing = async function* () { throw new Error('model down') }
  const fallback = await setup(failing)
  const degraded = await fallback.service.stateUpdate({ ...input, loopId: 'loop-degraded' })
  assert.equal(degraded.degraded, true)
  assert.match(degraded.error, /model down/)
  await rm(fallback.root, { recursive: true, force: true })
})

test('compose plans one to three short bubbles from JSON', async () => {
  const stream = async function* () {
    yield { type: 'text-delta', text: '{"parts":["第一句","第二句","第三句"]}' }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
  const { root, service } = await setup(stream)
  const result = await service.compose({
    groupId: 'g1',
    material: '素材',
    participants: [],
    speak: { enabled: true, kind: 'statement', replyType: null, target: { messageIds: [], userIds: [] } },
  })
  assert.equal(result.ok, true)
  assert.deepEqual(result.parts, ['第一句', '第二句', '第三句'])
  assert.equal(result.text, '第一句第二句第三句')
  await rm(root, { recursive: true, force: true })
})

test('compose attaches images as image content parts', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-group-loop-image-'))
  let captured = null
  const service = new GroupLoopService({
    ctx: { get: (name) => name === 'agentDefaultModel' ? { currentSelection: () => ({ provider: 'p', model: 'm' }) } : name === 'llm' ? {
      stream: async function* (options) {
        captured = options
        yield { type: 'text-delta', text: '{"parts":["看到了"]}' }
        yield { type: 'finish', reason: { kind: 'stop' } }
      },
    } : name === 'attachments' ? { saveImages: async (inputs) => inputs.map((_, index) => ({ attachmentId: `att-${index}` })) } : null },
    settings: { projectDir: root },
    logger: { warn() {} },
    personaPath: join(root, 'persona.json'),
    profilesPath: join(root, 'profiles.json'),
  })
  const result = await service.compose({
    groupId: 'g1', material: '素材', participants: [], speak: { enabled: true, kind: 'statement', replyType: null, target: {} },
    images: [{ mediaType: 'image/png', data: Buffer.from('x').toString('base64') }],
  })
  assert.equal(result.ok, true)
  assert.deepEqual(result.parts, ['看到了'])
  assert.ok(captured.messages[0].content.some((part) => part.type === 'image'))
  await rm(root, { recursive: true, force: true })
})

test('group prompts describe behavior without explicit prohibition lists', async () => {
  const { GroupChatPrompts, emotionPrompt } = await import('../../host/services/group-loop/prompt/index.js')
  const statePrompt = emotionPrompt({ valence: 0.1, energy: 0.5, socialBattery: 0.5, stress: 0.2, arousal: 0.4 })
  const promptsService = new GroupChatPrompts()
  const context = {
    characterPrompt: '角色',
    statePrompt,
    direct: false,
    profilesText: '',
    imageNote: '',
    background: '',
    memoryText: '',
    material: '素材',
  }
  const prompts = [
    promptsService.buildAnalyze(context).system,
    promptsService.buildCompose({ ...context, speak: { kind: 'reply', replyType: 'normal', target: { messageIds: [], userIds: [] } }, targetBubbles: null, reactTools: false }).system,
    promptsService.buildStateUpdate({ currentText: '角色：x', material: '素材' }).system,
  ]
  for (const prompt of prompts) assert.doesNotMatch(prompt, /不要|禁止/u)
})

test('compose falls back to plain model text without a TDZ error', async () => {
  const stream = async function* () {
    yield { type: 'text-delta', text: '在的，刚爬完楼' }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
  const { root, service } = await setup(stream)
  const result = await service.compose({
    groupId: 'g1', material: '素材', participants: [], speak: { enabled: true, kind: 'reply', replyType: 'at', target: { messageIds: [], userIds: ['1'] } },
  })
  assert.equal(result.ok, true)
  assert.deepEqual(result.parts, ['在的，刚爬完楼'])
  await rm(root, { recursive: true, force: true })
})

test('compose splits newline-separated bubble content from one JSON part', async () => {
  const stream = async function* () {
    yield { type: 'text-delta', text: '{"parts":["第一句\\n\\n第二句"]}' }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
  const { root, service } = await setup(stream)
  const result = await service.compose({
    groupId: 'g1', material: '素材', participants: [], speak: { enabled: true, kind: 'reply', replyType: 'normal', target: { messageIds: [], userIds: ['1'] } },
  })
  assert.deepEqual(result.parts, ['第一句', '第二句'])
  await rm(root, { recursive: true, force: true })
})

test('compose runs a ReAct web_search observation before final speech', async () => {
  let turn = 0
  let captured = ''
  const stream = async function* (options) {
    turn += 1
    captured = options.messages[0].content[0].text
    if (turn === 1) yield { type: 'text-delta', text: '{"type":"tool_call","tool":"web_search","args":{"query":"期货 保证金"}}' }
    else yield { type: 'text-delta', text: '{"type":"final","parts":["查了下","保证金是按合约价值算的"]}' }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
  const webSearch = async (query) => ({ ok: true, query, asOf: '2026-11-03T10:00:00+08:00', results: [{ title: '期货保证金', url: 'https://example.com', snippet: '保证金是履约担保。' }] })
  const { root, service } = await setup(stream, {
    settings: { webSearchEnabled: true, webSearchMaxResults: 3, webSearchTimeoutMs: 1000 },
    webSearch,
  })
  const result = await service.compose({
    groupId: 'g1', material: '期货保证金怎么算', participants: [], speak: { enabled: true, kind: 'reply', replyType: 'normal', target: { messageIds: [], userIds: ['1'] } },
  })
  assert.equal(result.ok, true)
  assert.deepEqual(result.parts, ['查了下', '保证金是按合约价值算的'])
  assert.equal(result.toolCalls.length, 1)
  assert.equal(result.toolCalls[0].tool, 'web_search')
  assert.match(captured, /web_search 参考材料/u)
  await rm(root, { recursive: true, force: true })
})

test('bubble budget produces one, two or three parts and caps model output', async () => {
  let index = 0
  const stream = async function* () {
    index += 1
    yield { type: 'text-delta', text: '{"parts":["一","二","三"]}' }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
  const { root, service } = await setup(stream, { random: () => 0 })
  const one = await service.compose({ groupId: 'g1', material: '素材', participants: [], speak: { enabled: true, kind: 'reply', replyType: 'normal', target: {} } })
  assert.equal(one.parts.length, 1)
  assert.equal(one.bubbleBudget, 1)
  const two = await setup(stream, { random: () => 0.6 })
  const second = await two.service.compose({ groupId: 'g1', material: '素材', participants: [], speak: { enabled: true, kind: 'reply', replyType: 'normal', target: {} } })
  assert.equal(second.parts.length, 2)
  await rm(root, { recursive: true, force: true })
  await rm(two.root, { recursive: true, force: true })
})

test('structured JSON fallback is never emitted as a speech bubble', async () => {
  const stream = async function* () {
    yield { type: 'text-delta', text: '"{\\"parts\\":[\\"一\\",\\"二\\"]}"' }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
  const { root, service } = await setup(stream)
  const result = await service.compose({ groupId: 'g1', material: '素材', participants: [], speak: { enabled: true, kind: 'reply', replyType: 'normal', target: {} } })
  assert.deepEqual(result.parts, ['一', '二'])
  await rm(root, { recursive: true, force: true })
})

test('compose reads personality and rules from persona.json without few-shot/keywords', async () => {
  let captured = null
  const stream = async function* (options) {
    captured = options
    yield { type: 'text-delta', text: '{"parts":["在"]}' }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
  const { root, service } = await setup(stream)
  await writeFile(join(root, 'persona.json'), JSON.stringify({
    name: '测试角色', role: '群里的测试角色', tone: '短句', personality: '热情、好奇', rules: '像熟人一样接话',
    keywords: ['股票'], examples: [{ user: '你好', assistant: '在' }],
  }), 'utf8')
  const result = await service.compose({ groupId: 'g1', material: '素材', participants: [], speak: { enabled: true, kind: 'reply', replyType: 'normal', target: {} } })
  assert.equal(result.ok, true)
  assert.match(captured.system, /性格：热情、好奇/u)
  assert.match(captured.system, /行为准则：像熟人一样接话/u)
  assert.doesNotMatch(captured.system, /兴趣关键词|对话示例|股票/u)
  await rm(root, { recursive: true, force: true })
})

test('analyze preserves focus and quote references', async () => {
  const stream = async function* () {
    yield { type: 'text-delta', text: '{"speak":{"enabled":true,"kind":"reply","replyType":"at","target":{"messageIds":["m1"],"userIds":["20000"]},"focus":{"messageIds":["m0"],"userIds":[]},"quote":{"messageIds":["m0"],"userIds":[]}},"reason":"回答上一条"}' }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
  const { root, service } = await setup(stream)
  const result = await service.analyze({ groupId: 'g1', material: '素材', trigger: { reason: 'mention', messageId: 'm1' }, participants: [] })
  assert.deepEqual(result.speak.focus, { messageIds: ['m0'], userIds: [] })
  assert.deepEqual(result.speak.quote, { messageIds: ['m0'], userIds: [] })
  await rm(root, { recursive: true, force: true })
})

test('compose records token usage and cache information', async () => {
  const stream = async function* () {
    yield { type: 'text-delta', text: '{"parts":["在"]}' }
    yield { type: 'usage', usage: { inputTokens: 120, outputTokens: 30, cacheReadTokens: 80, cacheWriteTokens: 10 } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
  const { root, service } = await setup(stream)
  const result = await service.compose({ groupId: 'g1', loopId: 'loop-token', material: '素材', participants: [], speak: { enabled: true, kind: 'reply', replyType: 'normal', target: {} } })
  assert.equal(result.ok, true)
  const stats = await service.tokenStatsSnapshot()
  assert.equal(stats.totals.calls, 1)
  assert.equal(stats.totals.input, 120)
  assert.equal(stats.totals.output, 30)
  assert.equal(stats.totals.cacheRead, 80)
  assert.equal(stats.recent.length, 1)
  assert.equal(stats.recent[0].loopId, 'loop-token')
  await rm(root, { recursive: true, force: true })
})

test('weather tool is called before a weather answer and its observation is reused', async () => {
  const responses = [
    '{"type":"tool_call","tool":"weather","args":{"location":"上海","date":"today"}}',
    '{"type":"final","parts":["上海今天多云，18度左右。"]}',
  ]
  let index = 0
  const stream = async function* () {
    yield { type: 'text-delta', text: responses[index++] }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
  let called = null
  const { root, service } = await setup(stream, {
    settings: { weatherEnabled: true, weatherTimeoutMs: 1000 },
    weather: async (location, options) => {
      called = { location, options }
      return { ok: true, location: { name: '上海' }, current: { description: '多云', temperature: 18 }, day: { description: '多云', min: 15, max: 22 }, forecast: [], asOf: '2026-11-04T10:00:00.000Z' }
    },
  })
  const result = await service.compose({ groupId: 'g1', loopId: 'weather-loop', material: '上海今天天气怎么样', participants: [], speak: { enabled: true, kind: 'reply', replyType: 'normal', target: {} } })
  assert.equal(result.ok, true)
  assert.equal(called.location, '上海')
  assert.equal(result.toolCalls[0].tool, 'weather')
  assert.match(result.text, /多云/u)
  await rm(root, { recursive: true, force: true })
})

test('the model may answer directly without using a tool when information is sufficient', async () => {
  let calls = 0
  const stream = async function* () {
    calls += 1
    yield { type: 'text-delta', text: '{"type":"final","parts":["这个我记得，不用查。"]}' }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
  const { root, service } = await setup(stream, {
    settings: { webSearchEnabled: true, weatherEnabled: true },
    weather: async () => { throw new Error('weather should not be forced') },
    webSearch: async () => { throw new Error('search should not be forced') },
  })
  const result = await service.compose({ groupId: 'g1', loopId: 'direct-tool', material: '上海今天天气怎么样', participants: [], speak: { enabled: true, kind: 'reply', replyType: 'normal', target: {} } })
  assert.equal(result.ok, true)
  assert.deepEqual(result.parts, ['这个我记得，不用查。'])
  assert.deepEqual(result.toolCalls, [])
  assert.equal(calls, 1)
  await rm(root, { recursive: true, force: true })
})

test('the ReAct loop can run calculator and group_search tools', async () => {
  const responses = [
    '{"type":"tool_call","tool":"calculator","args":{"expression":"(5000*0.18)+12"}}',
    '{"type":"tool_call","tool":"group_search","args":{"query":"爆仓","limit":5}}',
    '{"type":"final","parts":["算好了，也找到了。"]}',
  ]
  let index = 0
  const stream = async function* () {
    yield { type: 'text-delta', text: responses[index++] }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
  const { root, service } = await setup(stream, { settings: { webSearchEnabled: true } })
  await service.store.archiveMaterial('g1', '[2026/11/4 17:00:00] 小明(20000) [id:m1]：我爆仓了')
  const result = await service.compose({ groupId: 'g1', loopId: 'tools-loop', material: '帮我算算，顺便查一下之前爆仓的事', participants: [], speak: { enabled: true, kind: 'reply', replyType: 'normal', target: {} } })
  assert.equal(result.ok, true)
  assert.deepEqual(result.toolCalls.map((call) => call.tool), ['calculator', 'group_search'])
  assert.match(result.toolCalls[0].query, /5000/u)
  await rm(root, { recursive: true, force: true })
})

test('the ReAct loop is not capped at 4 steps or 2 tool calls', async () => {
  const expressions = ['1+1', '2+2', '3+3', '4+4', '5+5', '6+6']
  let index = 0
  const stream = async function* () {
    const next = index < expressions.length
      ? JSON.stringify({ type: 'tool_call', tool: 'calculator', args: { expression: expressions[index] } })
      : '{"type":"final","parts":["算完了"]}'
    index += 1
    yield { type: 'text-delta', text: next }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
  const { root, service } = await setup(stream, { settings: { webSearchEnabled: true } })
  const result = await service.compose({
    groupId: 'g1', loopId: 'uncapped-loop', material: '多轮计算', participants: [], speak: { enabled: true, kind: 'reply', replyType: 'normal', target: {} },
  })
  assert.equal(result.ok, true)
  assert.deepEqual(result.parts, ['算完了'])
  assert.equal(result.toolCalls.length, 6)
  assert.deepEqual(result.toolCalls.map((call) => call.tool), Array(6).fill('calculator'))
  await rm(root, { recursive: true, force: true })
})

test('the ReAct loop gives up only when it stops making progress', async () => {
  let calls = 0
  const stream = async function* () {
    calls += 1
    // Always the same call: executed once, then repeats forever.
    yield { type: 'text-delta', text: '{"type":"tool_call","tool":"calculator","args":{"expression":"1+1"}}' }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
  const { root, service } = await setup(stream, { settings: { webSearchEnabled: true } })
  const result = await service.compose({
    groupId: 'g1', loopId: 'stalled-loop', material: '一直重复', participants: [], speak: { enabled: true, kind: 'reply', replyType: 'normal', target: {} },
  })
  assert.equal(result.ok, false)
  assert.equal(result.toolCalls.length, 1)
  assert.equal(calls, 4) // 1 executed + REACT_STALL_LIMIT (3) refusals
  assert.match(result.error, /ReAct 未生成最终发言/u)
  await rm(root, { recursive: true, force: true })
})

test('finance calendar is available as a ReAct tool', async () => {
  let index = 0
  const stream = async function* () {
    yield { type: 'text-delta', text: index++ === 0 ? '{"type":"tool_call","tool":"finance_calendar","args":{"date":"today","type":"economic"}}' : '{"type":"final","parts":["今天有ADP数据。"]}' }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
  const { root, service } = await setup(stream, {
    settings: { weatherEnabled: true },
    financeCalendar: async (args) => ({ ok: true, start: '2026-11-04', end: '2026-11-05', events: [{ start: '2026-11-04', name: '美国:ADP就业人数', type: '经济数据' }], source: 'eastmoney' }),
  })
  const result = await service.compose({ groupId: 'g1', loopId: 'calendar-loop', material: '今天有什么财经数据', participants: [], speak: { enabled: true, kind: 'reply', replyType: 'normal', target: {} } })
  assert.equal(result.ok, true)
  assert.equal(result.toolCalls[0].tool, 'finance_calendar')
  assert.match(result.text, /ADP/u)
  await rm(root, { recursive: true, force: true })
})
