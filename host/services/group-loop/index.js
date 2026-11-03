/** LLM-backed analyze / compose / state-update loop for group chat. */
import { buildPersonaPrompt } from '../persona/index.js'
import { GroupLoopStore } from './store.js'
import { analyzeSystem, composeReActSystem, composeSystem, emotionPrompt, stateUpdateSystem, userMaterial } from './prompts.js'
import { parseWebSearchCall, renderSearchResult, searchWeb } from './web-search.js'

const SPEAK_KINDS = new Set(['statement', 'reply'])
const REPLY_TYPES = new Set(['normal', 'quote', 'action', 'at'])
const MATERIAL_LIMITS = { analyze: 16000, compose: 8000, stateUpdate: 10000 }

function bubbleBudget(random) {
  const roll = random()
  return roll < 0.45 ? 1 : roll < 0.8 ? 2 : 3
}

function applyBubbleBudget(parts, budget) {
  if (!Array.isArray(parts) || parts.length <= budget) return parts
  const kept = parts.slice(0, Math.max(0, budget - 1))
  const tail = parts.slice(Math.max(0, budget - 1)).filter(Boolean).join(' ').trim()
  return tail === '' ? kept : [...kept, tail]
}

function object(value) { return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {} }
function text(value) { return typeof value === 'string' ? value.trim() : '' }

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
  return {
    memory: Array.isArray(source.memory) ? source.memory : [],
    userProfiles: Array.isArray(source.userProfiles) ? source.userProfiles : [],
    emotion: object(source.emotion),
    groupState: object(source.groupState),
  }
}

function normalizeParts(value, fallback = '') {
  const source = object(value)
  const list = Array.isArray(source.parts) ? source.parts : []
  const parts = []
  for (const item of list) {
    if (typeof item !== 'string') continue
    for (const line of item.split(/\n+/u)) {
      const part = line.trim().slice(0, 300)
      if (part !== '') parts.push(part)
      if (parts.length >= 3) break
    }
    if (parts.length >= 3) break
  }
  if (parts.length > 0) return parts
  const fallbackText = text(fallback)
  if (fallbackText === '') return []
  return fallbackText.split(/\n+/u).map((part) => part.trim()).filter(Boolean).slice(0, 3).map((part) => part.slice(0, 300))
}

function knownParticipants(participants) {
  return new Set((Array.isArray(participants) ? participants : []).map((participant) => String(participant.qq)))
}

export class GroupLoopService {
  constructor({ ctx, settings, logger, personaPath, profilesPath, webSearch = searchWeb, random = Math.random }) {
    this.ctx = ctx
    this.settings = settings
    this.logger = logger
    this.store = new GroupLoopStore({ projectDir: settings.projectDir, personaPath, profilesPath, logger })
    this.listenerPath = `${settings.projectDir}/data/state/group-listener-status.json`
    this.inFlight = new Map()
    this.webSearch = webSearch
    this.random = random
  }

  selection() {
    const configured = this.ctx?.get?.('agentDefaultModel')?.currentSelection?.()
    if (configured !== null && typeof configured === 'object' && typeof configured.provider === 'string' && typeof configured.model === 'string') return configured
    return { provider: 'deepseek-account', model: 'deepseek-flash' }
  }

  async stream(system, user, { maxTokens = 500, temperature = 0.4, images = [] } = {}) {
    const llm = this.ctx?.get?.('llm')
    if (llm === null || typeof llm?.stream !== 'function') throw new Error('LLM 服务不可用')
    const selection = this.selection()
    const imageParts = await this.imageParts(images)
    const content = [{ type: 'text', text: user }, ...imageParts]
    let output = ''
    for await (const chunk of llm.stream({
      provider: selection.provider,
      model: selection.model,
      system,
      messages: [{ role: 'user', content }],
      maxTokens,
      temperature,
    })) {
      if (chunk?.type === 'text-delta' && typeof chunk.text === 'string') output += chunk.text
      if (chunk?.type === 'finish' && chunk.reason?.kind === 'error') throw new Error('模型返回错误')
    }
    return output.trim()
  }

  async imageParts(images) {
    const attachments = this.ctx?.get?.('attachments')
    if (!Array.isArray(images) || images.length === 0 || attachments === null || attachments === undefined || typeof attachments.saveImages !== 'function') return []
    const accepted = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
    const inputs = []
    for (const image of images.slice(0, 4)) {
      if (image === null || typeof image !== 'object') continue
      const mediaType = String(image.mediaType ?? '').toLowerCase()
      if (!accepted.has(mediaType) || typeof image.data !== 'string' || image.data === '') continue
      let data
      try { data = new Uint8Array(Buffer.from(image.data, 'base64')) } catch { continue }
      if (data.byteLength === 0 || data.byteLength > 6 * 1024 * 1024) continue
      inputs.push({ data, mediaType })
    }
    if (inputs.length === 0) return []
    try {
      const refs = await attachments.saveImages(inputs)
      return refs.map((attachment) => ({ type: 'image', attachment }))
    } catch (error) {
      this.logger.warn?.('group-loop image save failed: %s', String(error?.message ?? error))
      return []
    }
  }

  imageNote(input) {
    const counts = [input.images?.length ?? 0, input.quotedImages?.length ?? 0, input.backgroundImages?.length ?? 0]
    if (counts.every((count) => count === 0)) return ''
    return `【本轮附带图片】当前消息 ${counts[0]} 张；引用消息 ${counts[1]} 张；最近背景 ${counts[2]} 张。图片按这个顺序附带，请先看图片再回复。`
  }

  async characterSnapshot() {
    const character = await this.store.loadCharacter()
    const prompt = buildPersonaPrompt({
      name: character.core.name,
      role: character.core.identity,
      tone: character.core.voice,
      personality: '',
      rules: '',
      examples: [],
    })
    return { character, prompt }
  }


  async profileContext(groupId, participants) {
    const qqs = (Array.isArray(participants) ? participants : []).map((participant) => participant.qq)
    return this.store.profilesFor(groupId, qqs)
  }

  async groupBackground(groupId) {
    const state = await this.store.groupState(groupId)
    const lines = []
    if (typeof state.topic === 'string' && state.topic.trim() !== '') lines.push(`最近话题：${state.topic.trim()}`)
    if (Array.isArray(state.participants) && state.participants.length > 0) lines.push(`常出现的参与者：${state.participants.slice(0, 8).join('、')}`)
    return lines.length === 0 ? '' : `【群聊背景摘要（历史状态，不是当前消息）】\n${lines.join('\n')}`
  }

  async analyze(input) {
    const groupId = text(input.groupId)
    const material = text(input.material).slice(-MATERIAL_LIMITS.analyze)
    if (groupId === '' || material === '') return { ok: false, error: 'material/groupId required' }
    const triggerReason = text(input.trigger?.reason)
    const direct = triggerReason === 'mention' || triggerReason === 'reply'
    const profiles = await this.profileContext(groupId, input.participants)
    const images = [...(input.images ?? []), ...(input.quotedImages ?? []), ...(input.backgroundImages ?? [])]
    const character = await this.characterSnapshot()
    try {
      const raw = await this.stream(analyzeSystem(character.prompt, direct, emotionPrompt(character.character.emotion)), userMaterial(material, profiles, this.imageNote(input), await this.groupBackground(groupId)), { maxTokens: 420, temperature: 0.25, images })
      const parsed = parseJson(raw)
      const speak = normalizeSpeak(parsed?.speak)
      return { ok: true, speak, reason: text(parsed?.reason).slice(0, 120), raw: raw.slice(0, 1000) }
    } catch (error) {
      this.logger.warn?.('group-loop analyze failed: %s', String(error?.message ?? error))
      return { ok: false, error: String(error?.message ?? error), speak: { enabled: false } }
    }
  }

  async compose(input) {
    const material = text(input.material).slice(-MATERIAL_LIMITS.compose)
    const speak = normalizeSpeak(input.speak)
    if (speak.enabled !== true) return { ok: true, text: '', empty: true }
    const budget = Number.isInteger(input.bubbleBudget) && input.bubbleBudget >= 1 && input.bubbleBudget <= 3 ? input.bubbleBudget : bubbleBudget(this.random)
    const profiles = await this.profileContext(input.groupId, input.participants)
    const images = [...(input.images ?? []), ...(input.quotedImages ?? []), ...(input.backgroundImages ?? [])]
    const character = await this.characterSnapshot()
    const baseUser = userMaterial(material, profiles, this.imageNote(input), await this.groupBackground(input.groupId))
    if (this.settings.webSearchEnabled === true) return this.composeWithTools({ input, speak, character, baseUser, images, budget })
    try {
      const raw = await this.stream(composeSystem(character.prompt, speak, emotionPrompt(character.character.emotion), budget), baseUser, { maxTokens: 500, temperature: 0.7, images })
      const parts = applyBubbleBudget(normalizeParts(parseJson(raw), raw), budget)
      return { ok: true, text: parts.join(''), parts, speak, toolCalls: [], bubbleBudget: budget }
    } catch (error) {
      this.logger.warn?.('group-loop compose failed: %s', String(error?.message ?? error))
      return { ok: false, error: String(error?.message ?? error), text: '' }
    }
  }

  async composeWithTools({ input, speak, character, baseUser, images, budget }) {
    const toolCalls = []
    let observations = ''
    const system = composeReActSystem(character.prompt, speak, emotionPrompt(character.character.emotion), budget)
    for (let step = 0; step < 4; step += 1) {
      let raw = ''
      try {
        raw = await this.stream(system, `${baseUser}${observations ? `\n\n${observations}` : ''}`, { maxTokens: 600, temperature: 0.7, images })
      } catch (error) {
        this.logger.warn?.('group-loop react compose failed: %s', String(error?.message ?? error))
        return { ok: false, error: String(error?.message ?? error), text: '', toolCalls }
      }
      const parsed = parseJson(raw)
      const requestedCall = parseWebSearchCall(raw, parsed)
      if (requestedCall !== null && toolCalls.length < 2) {
        const query = text(requestedCall.query).slice(0, 160)
        if (query === '') {
          observations += '\n\n【工具观察】检索词为空，请直接给 final parts。'
          continue
        }
        const started = Date.now()
        const result = await this.webSearch(query, { maxResults: this.settings.webSearchMaxResults, timeoutMs: this.settings.webSearchTimeoutMs })
        toolCalls.push({ tool: 'web_search', query, source: result.source ?? 'unknown', ok: result.ok === true, results: result.results?.length ?? 0, latencyMs: Date.now() - started })
        observations += `\n\n${renderSearchResult(result).slice(0, 8000)}`
        if (toolCalls.length >= 2) observations += '\n\n【工具观察】工具预算已用完，请直接给 final parts。'
        continue
      }
      if (/tool_call|<\|\|DSML|DSML/iu.test(raw)) {
        observations += '\n\n【工具观察】工具调用格式无法解析，请重新调用 web_search，或直接给 final parts。'
        continue
      }
      const parts = applyBubbleBudget(normalizeParts(parsed, raw), budget)
      if (parts.length > 0) return { ok: true, text: parts.join(''), parts, speak, toolCalls, bubbleBudget: budget }
      observations += '\n\n【工具观察】请输出 final parts，或调用 web_search。'
    }
    return { ok: false, error: 'ReAct 未生成最终发言', text: '', toolCalls }
  }

  async stateUpdate(input) {
    const loopId = text(input.loopId)
    const cached = await this.store.getProcessedLoop(loopId)
    if (cached !== null) return { ...cached, duplicate: true }
    const active = this.inFlight.get(loopId)
    if (active !== undefined) return active
    const promise = this.runStateUpdate(input).finally(() => { this.inFlight.delete(loopId) })
    this.inFlight.set(loopId, promise)
    return promise
  }

  async runStateUpdate(input) {
    const loopId = text(input.loopId)
    const groupId = text(input.groupId)
    const material = text(input.material).slice(-MATERIAL_LIMITS.stateUpdate)
    const participants = Array.isArray(input.participants) ? input.participants : []
    const character = await this.store.loadCharacter()
    const speak = normalizeSpeak(input.speak)
    const sendResult = object(input.sendResult)
    const current = [
      `角色：${character.core.name} / ${character.core.identity}`,
      `情绪：${JSON.stringify(character.emotion)}`,
      `本轮 speak：${JSON.stringify(speak)}`,
      `发送结果：${JSON.stringify(sendResult)}`,
    ].join('\n')
    let parsed = {}
    let degraded = false
    let error = ''
    try {
      parsed = parseJson(await this.stream(stateUpdateSystem(), `${current}\n\n素材：\n${material}`, { maxTokens: 600, temperature: 0.2 })) ?? {}
    } catch (cause) {
      degraded = true
      error = String(cause?.message ?? cause)
      this.logger.warn?.('group-loop state update failed: %s', error)
    }
    const patches = normalizePatches(parsed)
    const known = knownParticipants(participants)
    patches.userProfiles = patches.userProfiles.filter((entry) => entry !== null && typeof entry === 'object' && known.has(String(entry.qq)))
    const applied = await this.store.applyStateUpdate({ loopId, groupId, patches, participants })
    return { ...applied.result, duplicate: applied.duplicate, degraded, ...(error !== '' ? { error } : {}) }
  }

  async dashboard(groupId = null) { return this.store.dashboard(this.listenerPath, groupId) }
}
