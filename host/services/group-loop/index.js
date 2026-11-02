/** LLM-backed analyze / compose / state-update loop for group chat. */
import { GroupLoopStore } from './store.js'
import { buildPersonaPrompt } from '../persona/index.js'

const SPEAK_KINDS = new Set(['statement', 'reply'])
const REPLY_TYPES = new Set(['normal', 'quote', 'action', 'at'])

function object(value) { return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {} }
function text(value) { return typeof value === 'string' ? value.trim() : '' }
function clamp(value, min, max) { const n = Number(value); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : 0 }

function parseJson(raw) {
  const value = String(raw ?? '')
  const start = value.indexOf('{')
  const end = value.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try { return JSON.parse(value.slice(start, end + 1)) } catch { return null }
}

function normalizeSpeak(value) {
  const source = object(value)
  if (source.enabled !== true) return { enabled: false }
  const kind = SPEAK_KINDS.has(source.kind) ? source.kind : 'statement'
  const target = object(source.target)
  if (kind === 'statement') return { enabled: true, kind, replyType: null, target: { messageIds: [], userIds: [] } }
  const replyType = REPLY_TYPES.has(source.replyType) ? source.replyType : 'normal'
  const messageIds = Array.isArray(target.messageIds) ? target.messageIds.filter((id) => typeof id === 'string').slice(0, 4) : []
  const userIds = Array.isArray(target.userIds) ? target.userIds.filter((id) => typeof id === 'string').slice(0, 4) : []
  if (replyType === 'quote' && messageIds.length === 0) return { enabled: false }
  if ((replyType === 'at' || replyType === 'action') && userIds.length === 0) return { enabled: false }
  return { enabled: true, kind, replyType, target: { messageIds, userIds } }
}

function normalizePatches(value) {
  const source = object(value)
  const memory = Array.isArray(source.memory) ? source.memory : []
  const userProfiles = Array.isArray(source.userProfiles) ? source.userProfiles : []
  const emotion = object(source.emotion)
  const groupState = object(source.groupState)
  return { memory, userProfiles, emotion, groupState }
}

export class GroupLoopService {
  constructor({ ctx, settings, logger, personaPath, profilesPath }) {
    this.ctx = ctx
    this.settings = settings
    this.logger = logger
    this.store = new GroupLoopStore({ projectDir: settings.projectDir, personaPath, profilesPath, logger })
    this.listenerPath = `${settings.projectDir}/data/state/group-listener-status.json`
    this.seen = new Map()
  }

  selection() {
    const configured = this.ctx?.get?.('agentDefaultModel')?.currentSelection?.()
    if (configured !== null && typeof configured === 'object' && typeof configured.provider === 'string' && typeof configured.model === 'string') return configured
    return { provider: 'deepseek-account', model: 'deepseek-flash' }
  }

  async stream(system, user, { maxTokens = 500, temperature = 0.4 } = {}) {
    const llm = this.ctx?.get?.('llm')
    if (llm === null || typeof llm?.stream !== 'function') throw new Error('LLM 服务不可用')
    const selection = this.selection()
    let output = ''
    for await (const chunk of llm.stream({
      provider: selection.provider,
      model: selection.model,
      system,
      messages: [{ role: 'user', content: [{ type: 'text', text: user }] }],
      maxTokens,
      temperature,
    })) {
      if (chunk?.type === 'text-delta' && typeof chunk.text === 'string') output += chunk.text
      if (chunk?.type === 'finish' && chunk.reason?.kind === 'error') throw new Error('模型返回错误')
    }
    return output.trim()
  }

  async characterPrompt() {
    const character = await this.store.loadCharacter()
    return buildPersonaPrompt({
      name: character.core.name,
      role: character.core.identity,
      tone: character.core.voice,
      personality: '',
      rules: '',
      examples: [],
    })
  }

  async analyze(input) {
    const groupId = text(input.groupId)
    const material = text(input.material).slice(-24000)
    if (groupId === '' || material === '') return { ok: false, error: 'material/groupId required' }
    const system = [
      await this.characterPrompt(),
      '你是群聊参与者。根据最近素材判断这一轮是否发言。',
      '不要因为被 @ 就机械回答；别人已经在回答、话题与你无关、你刚说过话时可以不发言。',
      '只输出 JSON：{"speak":{"enabled":true|false,"kind":"statement|reply","replyType":"normal|quote|action|at|null","target":{"messageIds":[],"userIds":[]}},"reason":"不超过50字"}',
      'statement 不针对具体消息；reply 必须给 target；normal 不加引用/@，quote 必须给 messageId，at/action 必须给 userId。',
    ].join('\n\n')
    try {
      const raw = await this.stream(system, material, { maxTokens: 420, temperature: 0.25 })
      const parsed = parseJson(raw)
      const speak = normalizeSpeak(parsed?.speak)
      return { ok: true, speak, reason: text(parsed?.reason).slice(0, 120), raw: raw.slice(0, 1000) }
    } catch (error) {
      this.logger.warn?.('group-loop analyze failed: %s', String(error?.message ?? error))
      return { ok: false, error: String(error?.message ?? error), speak: { enabled: false } }
    }
  }

  async compose(input) {
    const material = text(input.material).slice(-24000)
    const speak = normalizeSpeak(input.speak)
    if (speak.enabled !== true) return { ok: true, text: '', empty: true }
    const target = speak.target
    const system = [
      await this.characterPrompt(),
      '你是群里的普通群友，不是客服。只写这次要发送的内容。',
      speak.kind === 'statement' ? '发表一条主观观点，不要假装回复某条消息。' : '只针对 target 消息回复，不要总结整段素材。',
      speak.replyType === 'normal' ? 'normal：不写 @、不写引用标记，直接写文本。' : '',
      speak.replyType === 'at' ? 'at：不要手写 @，发送层会插入 @。' : '',
      speak.replyType === 'quote' ? 'quote：不要重复引用全文，直接回应。' : '',
      '短一点，像群聊，不要客服腔，不要列表，不要解释你在做什么。',
      `target.messageIds=${JSON.stringify(target.messageIds)}，target.userIds=${JSON.stringify(target.userIds)}`,
    ].filter(Boolean).join('\n\n')
    try {
      const reply = await this.stream(system, material, { maxTokens: 500, temperature: 0.7 })
      return { ok: true, text: reply.slice(0, 2000), speak }
    } catch (error) {
      this.logger.warn?.('group-loop compose failed: %s', String(error?.message ?? error))
      return { ok: false, error: String(error?.message ?? error), text: '' }
    }
  }

  async stateUpdate(input) {
    const loopId = text(input.loopId)
    const groupId = text(input.groupId)
    if (loopId !== '' && this.seen.has(loopId)) return this.seen.get(loopId)
    const material = text(input.material).slice(-16000)
    const character = await this.store.loadCharacter()
    const speak = normalizeSpeak(input.speak)
    const sendResult = object(input.sendResult)
    const current = [
      `角色：${character.core.name} / ${character.core.identity}`,
      `情绪：${JSON.stringify(character.emotion)}`,
      `本轮 speak：${JSON.stringify(speak)}`,
      `发送结果：${JSON.stringify(sendResult)}`,
    ].join('\n')
    const system = [
      '你是群聊角色状态维护器。只输出 JSON，不要解释。',
      '维护自身记忆、用户画像、情绪和群状态。只记录有长期价值的信息；没有变化就返回空数组。',
      '输出：{"memory":[{"summary":"一句话","kind":"event|relationship|reflection","importance":"low|medium|high","tags":[],"participants":[]}],"userProfiles":[{"qq":"QQ","patch":{"summary":"","interests":[]}}],"emotion":{"valenceDelta":0,"arousalDelta":0,"energyDelta":0,"socialBatteryDelta":0,"stressDelta":0},"groupState":{"topic":"","participants":[],"unansweredQuestion":""}}',
      '用户画像只允许素材中出现的用户；不要编造；emotion 只给小幅 delta；groupState 可空。',
    ].join('\n\n')
    let parsed = {}
    try {
      parsed = parseJson(await this.stream(system, `${current}\n\n素材：\n${material}`, { maxTokens: 600, temperature: 0.2 })) ?? {}
    } catch (error) {
      this.logger.warn?.('group-loop state update failed: %s', String(error?.message ?? error))
    }
    const patches = normalizePatches(parsed)
    const memory = await this.store.appendMemory(patches.memory)
    const profiles = await this.store.applyProfiles(groupId, patches.userProfiles)
    const emotion = { ...character.emotion }
    for (const key of ['valence', 'arousal', 'energy', 'socialBattery', 'stress']) {
      const delta = Number(patches.emotion[`${key}Delta`])
      if (!Number.isFinite(delta)) continue
      const bounds = key === 'valence' ? [-1, 1] : [0, 1]
      emotion[key] = clamp(Number(emotion[key]) + delta, bounds[0], bounds[1])
    }
    const saved = await this.store.saveCharacter({ ...character, emotion })
    const groups = await this.store.loadGroups()
    const previous = object(groups.groups[groupId])
    const groupState = patches.groupState
    const hasGroupPatch = typeof groupState.topic === 'string' || Array.isArray(groupState.participants)
    groups.groups[groupId] = {
      ...previous,
      ...(typeof groupState.topic === 'string' && groupState.topic.trim() !== '' ? { topic: groupState.topic.trim().slice(0, 200) } : {}),
      ...(Array.isArray(groupState.participants) ? { participants: groupState.participants.filter((id) => typeof id === 'string').slice(0, 20) } : {}),
      ...(typeof groupState.unansweredQuestion === 'string' ? { unansweredQuestion: groupState.unansweredQuestion.trim().slice(0, 300) } : {}),
      lastLoop: loopId,
      updatedAt: new Date().toISOString(),
    }
    await this.store.saveGroups(groups)
    const result = { ok: true, memory: memory.length, userProfiles: profiles, emotionUpdated: true, groupStateUpdated: hasGroupPatch, character: saved, memoryIds: memory.map((item) => item.id) }
    if (loopId !== '') this.seen.set(loopId, result)
    return result
  }

  async dashboard() { return this.store.dashboard(this.listenerPath) }
}
