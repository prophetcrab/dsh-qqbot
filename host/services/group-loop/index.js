/** LLM-backed analyze / compose / state-update loop for group chat. */
import { buildPersonaPrompt } from '../persona/index.js'
import { GroupLoopStore } from './store.js'
import { analyzeSystem, composeSystem, stateUpdateSystem, userMaterial } from './prompts.js'

const SPEAK_KINDS = new Set(['statement', 'reply'])
const REPLY_TYPES = new Set(['normal', 'quote', 'action', 'at'])

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

function knownParticipants(participants) {
  return new Set((Array.isArray(participants) ? participants : []).map((participant) => String(participant.qq)))
}

export class GroupLoopService {
  constructor({ ctx, settings, logger, personaPath, profilesPath }) {
    this.ctx = ctx
    this.settings = settings
    this.logger = logger
    this.store = new GroupLoopStore({ projectDir: settings.projectDir, personaPath, profilesPath, logger })
    this.listenerPath = `${settings.projectDir}/data/state/group-listener-status.json`
    this.inFlight = new Map()
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

  async profileContext(groupId, participants) {
    const qqs = (Array.isArray(participants) ? participants : []).map((participant) => participant.qq)
    return this.store.profilesFor(groupId, qqs)
  }

  async analyze(input) {
    const groupId = text(input.groupId)
    const material = text(input.material).slice(-24000)
    if (groupId === '' || material === '') return { ok: false, error: 'material/groupId required' }
    const triggerReason = text(input.trigger?.reason)
    const direct = triggerReason === 'mention' || triggerReason === 'reply'
    const profiles = await this.profileContext(groupId, input.participants)
    try {
      const raw = await this.stream(analyzeSystem(await this.characterPrompt(), direct), userMaterial(material, profiles), { maxTokens: 420, temperature: 0.25 })
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
    const profiles = await this.profileContext(input.groupId, input.participants)
    try {
      const reply = await this.stream(composeSystem(await this.characterPrompt(), speak), userMaterial(material, profiles), { maxTokens: 500, temperature: 0.7 })
      return { ok: true, text: reply.slice(0, 2000), speak }
    } catch (error) {
      this.logger.warn?.('group-loop compose failed: %s', String(error?.message ?? error))
      return { ok: false, error: String(error?.message ?? error), text: '' }
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
    const material = text(input.material).slice(-16000)
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
