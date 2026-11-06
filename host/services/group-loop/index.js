/** LLM-backed analyze / compose / state-update loop for group chat. */
import { buildCharacterPrompt } from '../persona/index.js'
import { fitBubbleBudget, shapeBubbleParts } from './bubbles.js'
import { GroupLoopStore } from './store.js'
import { normalizeUsage, TokenStatsStore } from './token-stats.js'
import { GroupChatPrompts, emotionPrompt, memoryPrompt, profileData } from './prompt/index.js'
import { getWeather } from './weather.js'
import { searchWeb } from './web-search.js'
import { evaluateExpression } from './calculator.js'
import { getMarketQuote } from './market-quote.js'
import { getFinanceCalendar } from './finance-calendar.js'
import { fetchWeb } from './web-fetch.js'
import { parseToolCalls, renderObservation, toolQuery, toolSignature } from './tool-call.js'

const SPEAK_KINDS = new Set(['statement', 'reply'])
const REPLY_TYPES = new Set(['normal', 'quote', 'action', 'at'])
const MATERIAL_LIMITS = { analyze: 16000, compose: 8000, stateUpdate: 10000 }
/**
 * Safety valve, not a budget: after this many consecutive compose turns with
 * neither a tool result nor final parts the loop gives up. Tool calls and
 * steps themselves are unlimited; the model decides when the goal is met.
 */
const REACT_STALL_LIMIT = 3

function mergeUsage(left, right) {
  if (left === null || left === undefined) return right
  if (right === null || right === undefined) return left
  return {
    input: left.input + right.input,
    output: left.output + right.output,
    cacheRead: left.cacheRead + right.cacheRead,
    cacheWrite: left.cacheWrite + right.cacheWrite,
    reasoning: left.reasoning + right.reasoning,
    total: left.total + right.total,
  }
}


function bubbleBudget(random) {
  const roll = random()
  return roll < 0.45 ? 1 : roll < 0.8 ? 2 : 3
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

function normalizeRef(value) {
  const source = object(value)
  const messageIds = Array.isArray(source.messageIds) ? source.messageIds.filter((id) => typeof id === 'string').slice(0, 4) : []
  const userIds = Array.isArray(source.userIds) ? source.userIds.filter((id) => typeof id === 'string').slice(0, 4) : []
  return { messageIds, userIds }
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
  const result = { enabled: true, kind, replyType, target: { messageIds, userIds } }
  const focus = normalizeRef(source.focus)
  const quote = normalizeRef(source.quote)
  if (focus.messageIds.length > 0) result.focus = focus
  if (quote.messageIds.length > 0) result.quote = quote
  return result
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

function collectParts(value, depth = 0) {
  if (depth > 3 || value === null || value === undefined) return []
  if (typeof value === 'string') {
    try {
      const decoded = JSON.parse(value)
      if (decoded !== value) return collectParts(decoded, depth + 1)
    } catch { /* not a complete JSON string */ }
    const parsed = parseJson(value)
    return parsed === null ? [] : collectParts(parsed, depth + 1)
  }
  if (Array.isArray(value)) return value.filter((item) => typeof item === 'string')
  if (typeof value !== 'object') return []
  return Array.isArray(value.parts) ? value.parts.filter((item) => typeof item === 'string') : []
}

function normalizeParts(value, fallback = '') {
  let list = collectParts(value)
  if (list.length === 0) {
    try { list = collectParts(JSON.parse(fallback)) } catch { list = collectParts(parseJson(fallback)) }
  }
  const parts = shapeBubbleParts(list)
  if (parts.length > 0) return parts
  const fallbackText = text(fallback)
  if (fallbackText === '') return []
  const embedded = fallbackText.match(/"parts"\s*:\s*\[([\s\S]*?)\]/u)
  if (embedded !== null) {
    try {
      const parsed = JSON.parse(`[${embedded[1]}]`)
      if (Array.isArray(parsed)) return normalizeParts({ parts: parsed })
    } catch { /* fall through */ }
  }
  if (/^\s*[\[{]/u.test(fallbackText) || fallbackText.includes('"type":"final"')) return []
  return shapeBubbleParts(fallbackText.split(/\n+/u))
}

function knownParticipants(participants) {
  return new Set((Array.isArray(participants) ? participants : []).map((participant) => String(participant.qq)))
}

export class GroupLoopService {
  constructor({ ctx, settings, logger, personaPath, profilesPath, webSearch = searchWeb, weather = getWeather, marketQuote = getMarketQuote, financeCalendar = getFinanceCalendar, webFetch: webFetchTool = fetchWeb, random = Math.random }) {
    this.ctx = ctx
    this.settings = settings
    this.logger = logger
    this.store = new GroupLoopStore({ projectDir: settings.projectDir, personaPath, profilesPath, logger })
    this.tokenStats = new TokenStatsStore({ projectDir: settings.projectDir, logger })
    this.prompts = new GroupChatPrompts({ projectDir: settings.projectDir, logger })
    this.listenerPath = `${settings.projectDir}/data/state/group-listener-status.json`
    this.inFlight = new Map()
    this.webSearch = webSearch
    this.weather = weather
    this.marketQuote = marketQuote
    this.financeCalendar = financeCalendar
    this.webFetch = webFetchTool
    this.random = random
  }

  selection() {
    const configured = this.ctx?.get?.('agentDefaultModel')?.currentSelection?.()
    if (configured !== null && typeof configured === 'object' && typeof configured.provider === 'string' && typeof configured.model === 'string') return configured
    return { provider: 'deepseek-account', model: 'deepseek-flash' }
  }

  async recordUsage({ groupId, loopId, kind, usage = null, recent = false }) {
    const selection = this.selection()
    return this.tokenStats.record({
      groupId, loopId, kind, usage, recent,
      provider: selection.provider, model: selection.model,
    })
  }

  async tokenStatsSnapshot() { return this.tokenStats.snapshot() }
  async clearTokenStats() { return this.tokenStats.clear() }

  async stream(system, user, { maxTokens = 500, temperature = 0.4, images = [], onUsage = null } = {}) {
    const llm = this.ctx?.get?.('llm')
    if (llm === null || typeof llm?.stream !== 'function') throw new Error('LLM 服务不可用')
    const selection = this.selection()
    const imageParts = await this.imageParts(images)
    const content = [{ type: 'text', text: user }, ...imageParts]
    let output = ''
    let usage = null
    for await (const chunk of llm.stream({
      provider: selection.provider,
      model: selection.model,
      system,
      messages: [{ role: 'user', content }],
      maxTokens,
      temperature,
    })) {
      if (chunk?.type === 'text-delta' && typeof chunk.text === 'string') output += chunk.text
      if (chunk?.type === 'usage' && chunk.usage !== null && typeof chunk.usage === 'object') usage = normalizeUsage(chunk.usage)
      if (chunk?.type === 'finish' && chunk.reason?.kind === 'error') throw new Error('模型返回错误')
    }
    if (typeof onUsage === 'function') await onUsage(usage)
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
    const persona = await this.store.loadPersona()
    const prompt = buildCharacterPrompt({
      ...(persona !== null && typeof persona === 'object' ? persona : {}),
      name: persona?.name || character.core.name,
      role: persona?.role || character.core.identity,
      tone: persona?.tone || character.core.voice,
    })
    return { character, prompt }
  }


  async profileContext(groupId, participants) {
    const qqs = (Array.isArray(participants) ? participants : []).map((participant) => participant.qq)
    return this.store.profilesFor(groupId, qqs)
  }

  async memoryContext(groupId) {
    return memoryPrompt(await this.store.memories(50), groupId)
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
    try { await this.store.archiveMaterial(groupId, material) } catch (error) { this.logger.warn?.('group-loop message archive failed: %s', String(error?.message ?? error)) }
    try {
      const prompt = this.prompts.buildAnalyze({
        characterPrompt: character.prompt,
        statePrompt: emotionPrompt(character.character.emotion),
        direct,
        profilesText: profileData(profiles),
        imageNote: this.imageNote(input),
        background: await this.groupBackground(groupId),
        memoryText: await this.memoryContext(groupId),
        material,
      })
      const raw = await this.stream(prompt.system, prompt.user, { maxTokens: 420, temperature: 0.25, images, onUsage: (usage) => this.recordUsage({ groupId, loopId: text(input.loopId), kind: 'analyze', usage }) })
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
    const context = {
      characterPrompt: character.prompt,
      statePrompt: emotionPrompt(character.character.emotion),
      profilesText: profileData(profiles),
      imageNote: this.imageNote(input),
      background: await this.groupBackground(input.groupId),
      memoryText: await this.memoryContext(input.groupId),
      material,
      speak,
    }
    if (this.settings.webSearchEnabled === true || this.settings.weatherEnabled === true) {
      const prompt = this.prompts.buildCompose({ ...context, targetBubbles: budget, reactTools: true })
      return this.composeWithTools({ input, speak, baseUser: prompt.user, system: prompt.system, images, budget })
    }
    try {
      const prompt = this.prompts.buildCompose({ ...context, targetBubbles: budget, reactTools: false })
      const raw = await this.stream(prompt.system, prompt.user, { maxTokens: 500, temperature: 0.7, images, onUsage: (usage) => this.recordUsage({ groupId: input.groupId, loopId: input.loopId, kind: 'compose', usage, recent: true }) })
      const parts = fitBubbleBudget(normalizeParts(parseJson(raw), raw), budget)
      return { ok: true, text: parts.join(''), parts, speak, toolCalls: [], bubbleBudget: budget }
    } catch (error) {
      this.logger.warn?.('group-loop compose failed: %s', String(error?.message ?? error))
      return { ok: false, error: String(error?.message ?? error), text: '' }
    }
  }

  async composeWithTools({ input, speak, baseUser, system, images, budget }) {
    const toolCalls = []
    const executed = new Set()
    let observations = ''
    let composeUsage = null
    let stalls = 0
    // No fixed step/tool-call budget: the model keeps calling tools until it
    // decides the goal is met. `stalls` only stops a non-terminating loop.
    for (;;) {
      let raw = ''
      try {
        raw = await this.stream(system, `${baseUser}${observations ? `\n\n${observations}` : ''}`, { maxTokens: 600, temperature: 0.7, images, onUsage: (usage) => { composeUsage = mergeUsage(composeUsage, usage) } })
      } catch (error) {
        this.logger.warn?.('group-loop react compose failed: %s', String(error?.message ?? error))
        return { ok: false, error: String(error?.message ?? error), text: '', toolCalls }
      }
      const parsed = parseJson(raw)
      const calls = parseToolCalls(raw, parsed)
      if (calls.length > 0) {
        let progressed = false
        for (const call of calls) {
          const signature = toolSignature(call)
          if (executed.has(signature)) {
            observations += '\n\n【工具观察】这个工具参数已经执行过，请基于已有 observation 继续或给 final parts。'
            continue
          }
          const started = Date.now()
          let result
          try {
            result = await this.runTool(call, input.groupId)
          } catch (error) {
            result = { ok: false, error: String(error?.message ?? error) }
          }
          executed.add(signature)
          progressed = true
          const query = toolQuery(call)
          const count = Array.isArray(result?.messages) ? result.messages.length : Array.isArray(result?.events) ? result.events.length : Array.isArray(result?.results) ? result.results.length : result?.ok === true ? 1 : 0
          toolCalls.push({
            tool: call.tool,
            query,
            source: result?.source ?? (call.tool === 'group_search' ? 'local' : call.tool === 'calculator' ? 'local' : 'unknown'),
            ok: result?.ok === true,
            results: count,
            latencyMs: Date.now() - started,
            ...(result?.ok === true ? {} : { error: String(result?.error ?? 'tool failed') }),
          })
          observations += `\n\n${renderObservation(call.tool, result).slice(0, 14000)}`
        }
        if (progressed) {
          stalls = 0
          continue
        }
        // Only already-executed calls were requested: nudge once, then stop if
        // the model keeps requesting the same thing.
        stalls += 1
        if (stalls >= REACT_STALL_LIMIT) break
        continue
      }
      if (/tool_call|<\|\|DSML|DSML/iu.test(raw)) {
        stalls += 1
        observations += '\n\n【工具观察】工具调用格式无法解析，请重新输出合法 tool_call，或直接给 final parts。'
        if (stalls >= REACT_STALL_LIMIT) break
        continue
      }
      const parts = fitBubbleBudget(normalizeParts(parsed, raw), budget)
      if (parts.length > 0) {
        await this.recordUsage({ groupId: input.groupId, loopId: input.loopId, kind: 'compose', usage: composeUsage, recent: true })
        return { ok: true, text: parts.join(''), parts, speak, toolCalls, bubbleBudget: budget }
      }
      stalls += 1
      observations += '\n\n【工具观察】请输出 final parts，或调用可用工具。'
      if (stalls >= REACT_STALL_LIMIT) break
    }
    await this.recordUsage({ groupId: input.groupId, loopId: input.loopId, kind: 'compose', usage: composeUsage })
    return { ok: false, error: 'ReAct 未生成最终发言', text: '', toolCalls }
  }

  async runTool(call, groupId) {
    const args = call.args ?? {}
    switch (call.tool) {
      case 'web_search': {
        const query = text(args.query).slice(0, 160)
        if (query === '') return { ok: false, error: 'query 为空' }
        return this.webSearch(query, {
          maxResults: this.settings.webSearchMaxResults,
          timeoutMs: this.settings.webSearchTimeoutMs,
          enrich: this.settings.webFetchEnabled !== false,
          pageLimit: this.settings.webFetchPages,
          pageTimeoutMs: this.settings.webFetchTimeoutMs,
          pageMaxChars: this.settings.webFetchMaxChars,
        })
      }
      case 'weather': {
        const location = text(args.location).slice(0, 80)
        if (location === '') return { ok: false, error: 'location 为空' }
        return this.weather(location, { timeoutMs: this.settings.weatherTimeoutMs, date: text(args.date).slice(0, 20) })
      }
      case 'group_search': {
        const query = text(args.query).slice(0, 80)
        const limit = Math.max(1, Math.min(20, Number(args.limit) || 10))
        const messages = await this.store.searchMessages(groupId, query, limit)
        return { ok: true, messages, source: 'local' }
      }
      case 'web_fetch': {
        const url = text(args.url).slice(0, 2000)
        if (url === '') return { ok: false, error: 'url 为空' }
        return this.webFetch(url, { timeoutMs: this.settings.webFetchTimeoutMs, maxChars: this.settings.webFetchMaxChars, fetchImpl: globalThis.fetch })
      }
      case 'market_quote': {
        const symbol = text(args.symbol).slice(0, 40)
        if (symbol === '') return { ok: false, error: 'symbol 为空' }
        return this.marketQuote(symbol, { market: text(args.market).slice(0, 30), timeoutMs: this.settings.marketQuoteTimeoutMs })
      }
      case 'calculator': {
        return evaluateExpression(text(args.expression).slice(0, 240))
      }
      case 'finance_calendar': {
        return this.financeCalendar({ date: text(args.date).slice(0, 20), start: text(args.start).slice(0, 20), end: text(args.end).slice(0, 20), type: text(args.type).slice(0, 20), limit: Number(args.limit) || 20 }, { timeoutMs: this.settings.financeCalendarTimeoutMs })
      }
      default:
        return { ok: false, error: `未知工具：${call.tool}` }
    }
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
      const prompt = this.prompts.buildStateUpdate({ currentText: current, material })
      parsed = parseJson(await this.stream(prompt.system, prompt.user, { maxTokens: 600, temperature: 0.2, onUsage: (usage) => this.recordUsage({ groupId, loopId, kind: 'state-update', usage }) })) ?? {}
    } catch (cause) {
      degraded = true
      error = String(cause?.message ?? cause)
      this.logger.warn?.('group-loop state update failed: %s', error)
    }
    const patches = normalizePatches(parsed)
    const known = knownParticipants(participants)
    patches.userProfiles = patches.userProfiles.filter((entry) => entry !== null && typeof entry === 'object' && known.has(String(entry.qq)))
    const applied = await this.store.applyStateUpdate({ loopId, groupId, patches, participants, emotionActive: sendResult.sent === true })
    return { ...applied.result, duplicate: applied.duplicate, degraded, ...(error !== '' ? { error } : {}) }
  }

  async dashboard(groupId = null) { return this.store.dashboard(this.listenerPath, groupId) }
}
