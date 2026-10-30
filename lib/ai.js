/**
 * AI chat bridge: reuse the harness's own LLM service (`ctx.llm`) instead of
 * storing or copying any API key in the QQ-side project.
 *
 * The QQ bot's Koishi plugin sends conversation messages to `/qqbot/ai/chat`;
 * this service resolves the provider/model from the plugin config (or the
 * harness default selection) and streams a completion through DSH's LLM
 * adapters, so the configured DSH provider credentials are reused as-is.
 */

import { randomUUID } from 'node:crypto'

import { DEFAULT_PERSONA, buildPersonaPrompt, normalizePersona, readPersonaFile } from './persona.js'
import {
  buildProfilePrompt,
  buildProfileUpdatePrompt,
  ensureProfile,
  loadProfileStore,
  mergeProfile,
  normalizeProfile,
  parseProfilePatch,
  profileKey,
  saveProfileStore,
} from './profiles.js'

/** @typedef {{ role: 'user' | 'assistant', text: string }} ChatMessage */

/** @param {unknown} value */
const isObject = (value) => value !== null && typeof value === 'object'

/**
 * Provider-neutral chat helper over `ctx.llm`.
 */
export class AiChatService {
  /**
   * @param {object} options
   * @param {{ get: (name: string) => any }} options.ctx plugin context (service locator)
   * @param {object} options.settings resolved plugin settings
   * @param {{ info: Function, warn: Function, error: Function }} [options.logger]
   */
  constructor(options = {}) {
    const source = isObject(options) ? options : {}
    this.ctx = source.ctx
    this.settings = source.settings ?? {}
    this.logger = normalizeLogger(source.logger)
    this.personaPath = typeof source.personaPath === 'string' ? source.personaPath : null
    this.personaLoader = typeof source.personaLoader === 'function' ? source.personaLoader : null
    this.profilesPath = typeof source.profilesPath === 'string' ? source.profilesPath : null
    this.profileStore = null
    this.profileQueues = new Map()
    this.profileSaveQueue = Promise.resolve()
    this.lastPrompt = null
  }

  /** The most recent full chat request, for the panel's prompt preview. */
  lastPromptSnapshot() {
    return this.lastPrompt
  }

  /** Resolve provider/model: explicit config, then the harness default model. */
  resolveSelection() {
    const explicitProvider = typeof this.settings.aiProvider === 'string' ? this.settings.aiProvider.trim() : ''
    const explicitModel = typeof this.settings.aiModel === 'string' ? this.settings.aiModel.trim() : ''
    if (explicitProvider !== '' && explicitModel !== '') {
      return { provider: explicitProvider, model: explicitModel, source: 'config' }
    }
    try {
      const defaultModel = this.ctx?.get?.('agentDefaultModel')
      const selection = defaultModel?.currentSelection?.()
      if (isObject(selection) && typeof selection.provider === 'string' && typeof selection.model === 'string') {
        return {
          provider: explicitProvider !== '' ? explicitProvider : selection.provider,
          model: explicitModel !== '' ? explicitModel : selection.model,
          source: 'harness-default',
        }
      }
    } catch {
      // fall through
    }
    return { provider: 'deepseek-account', model: 'deepseek-flash', source: 'fallback' }
  }

  /** Report whether the harness LLM service is mounted. */
  status() {
    const llm = this.#llm()
    const selection = this.resolveSelection()
    return {
      available: llm !== null,
      provider: selection.provider,
      model: selection.model,
      source: selection.source,
      systemPromptConfigured: typeof this.settings.aiSystemPrompt === 'string' && this.settings.aiSystemPrompt !== '',
    }
  }

  /**
   * Stream one completion through the harness LLM service.
   *
   * @param {object} options
   * @param {ChatMessage[]} options.messages conversation messages, oldest first
   * @param {string} [options.system] system prompt override
   * @param {number} [options.maxTokens]
   * @param {number} [options.temperature]
   * @param {AbortSignal} [options.signal]
   * @returns {Promise<{ ok: boolean, reply?: string, provider?: string, model?: string, error?: string, code?: string }>}
   */
  async chat(options = {}) {
    const selectionPreview = this.resolveSelection()
    const messages = normalizeMessages(options.messages, selectionPreview)
    if (messages.length === 0) return { ok: false, error: '消息为空', code: 'EMPTY_MESSAGES' }
    const llm = this.#llm()
    if (llm === null) {
      return { ok: false, error: 'DSH 的 LLM 服务不可用（请确认已配置模型提供方）', code: 'NO_LLM_SERVICE' }
    }
    const selection = this.resolveSelection()
    // Persona card is always the first segment; the person's long-term profile
    // is the second; caller/global instructions follow.
    const persona = await this.#persona()
    const personaPrompt = buildPersonaPrompt(persona)
    const profileInfo = await this.#ensureProfile(options.groupId, options.userId, options.userName)
    const profilePrompt = profileInfo === null ? '' : buildProfilePrompt(profileInfo.profile)
    const extraSystem = typeof options.system === 'string' && options.system.trim() !== ''
      ? options.system.trim()
      : (typeof this.settings.aiSystemPrompt === 'string' ? this.settings.aiSystemPrompt.trim() : '')
    const background = typeof options.background === 'string' ? options.background.trim() : ''
    const backgroundPrompt = background !== ''
      ? `【最近群聊背景】\n${background.slice(-24000)}\n（以上只是背景信息，不要逐条回应，也不要复述消息前的人名或标签。）`
      : ''
    const others = Array.isArray(options.mentionOthers)
      ? options.mentionOthers.filter((item) => typeof item === 'string' && item !== '')
      : []
    let targetPrompt = ''
    if (options.replyToBot === true) {
      targetPrompt = '【当前消息对象】这条消息是在回复你的消息，请直接针对它回应。'
    } else if (options.mentionSelf === true) {
      targetPrompt = others.length > 0
        ? `【当前消息对象】这条消息同时 @ 了你和 ${others.join('、')}；以你被点名为准，直接回应。`
        : '【当前消息对象】这条消息在 @ 你，请直接回应。'
    } else if (others.length > 0) {
      targetPrompt = `【当前消息对象】这条消息 @ 的是 ${others.join('、')}，不是在叫你。你可以作为群友自然接话，但不要假装被点名，也不要替 ${others.join('、')} 回答。`
    } else if (options.mentionAll === true) {
      targetPrompt = '【当前消息对象】这条消息 @ 了全体成员；可以按普通群聊氛围自然参与，不要假装被单独点名。'
    }
    const focus = messages.length > 1 || background !== '' || targetPrompt !== ''
      ? '【回复要求】只针对用户最后发送的这一条消息决定是否以及如何接话；群聊背景、用户画像和话题记忆都只用于理解上下文，不要复述背景里的消息，也不要输出任何上下文标记、消息标签或发送者名前缀。'
      : ''
    const system = [personaPrompt, profilePrompt, backgroundPrompt, targetPrompt, extraSystem, focus].filter((part) => part !== '').join('\n\n')
    const request = {
      provider: selection.provider,
      model: selection.model,
      messages,
      ...(system === '' ? {} : { system }),
      maxTokens: boundedInt(options.maxTokens, this.settings.aiMaxTokens, 64, 4096, 800),
      temperature: boundedNumber(options.temperature, this.settings.aiTemperature, 0, 2, 0.7),
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    }
    const imageParts = await this.#imageParts(options.images)
    if (imageParts.length > 0) {
      const last = request.messages[request.messages.length - 1]
      if (last !== undefined && last.role === 'user') {
        last.content = [...last.content, ...imageParts]
      }
    }
    this.lastPrompt = {
      at: new Date().toISOString(),
      provider: request.provider,
      model: request.model,
      groupId: options.groupId ?? null,
      userId: options.userId ?? null,
      userName: options.userName ?? null,
      mentionSelf: options.mentionSelf === true,
      mentionOthers: Array.isArray(options.mentionOthers) ? options.mentionOthers : [],
      mentionAll: options.mentionAll === true,
      replyToBot: options.replyToBot === true,
      system: request.system ?? '',
      messages: request.messages.map((message) => ({
        role: message.role,
        text: Array.isArray(message.content)
          ? message.content.filter((part) => part?.type === 'text' && typeof part.text === 'string').map((part) => part.text).join('')
          : String(message.content ?? ''),
        imageCount: Array.isArray(message.content) ? message.content.filter((part) => part?.type === 'image').length : 0,
      })),
      imageCount: imageParts.length,
      maxTokens: request.maxTokens,
      temperature: request.temperature,
    }
    let text = ''
    let finish = null
    try {
      for await (const chunk of llm.stream(request)) {
        if (chunk?.type === 'text-delta' && typeof chunk.text === 'string') text += chunk.text
        else if (chunk?.type === 'finish') finish = chunk.reason ?? null
      }
    } catch (error) {
      const message = String(error?.message ?? error)
      this.logger.warn('LLM 调用失败：%s', message)
      return { ok: false, error: `模型调用失败：${message}`, code: 'LLM_CALL_FAILED' }
    }
    if (finish?.kind === 'error') {
      const failure = finish.failure ?? {}
      const code = typeof failure.code === 'string' ? failure.code : 'LLM_FAILED'
      const detail = typeof failure.message === 'string' && failure.message !== '' ? failure.message : code
      this.logger.warn('LLM 返回错误：%s', detail)
      return { ok: false, error: `模型返回错误：${detail}`, code, provider: selection.provider, model: selection.model }
    }
    if (finish?.kind === 'aborted') {
      return { ok: false, error: '模型调用已取消', code: 'ABORTED', provider: selection.provider, model: selection.model }
    }
    const reply = sanitizeReply(text)
    if (reply === '') return { ok: false, error: '模型没有返回内容', code: 'EMPTY_REPLY', provider: selection.provider, model: selection.model }
    if (profileInfo !== null) {
      this.#maintainProfile({
        key: profileInfo.key,
        profile: profileInfo.profile,
        messages,
        reply,
        selection,
      })
    }
    return { ok: true, reply, provider: selection.provider, model: selection.model }
  }

  /** List saved profiles, optionally filtered by group or search text. */
  async listProfiles(options = {}) {
    if (this.profilesPath === null) return []
    const path = this.profilesPath
    let profiles = []
    await this.#serializeProfileSave(async () => {
      if (this.profileStore === null) this.profileStore = await loadProfileStore(path)
      profiles = Object.entries(this.profileStore.profiles).map(([key, profile]) => ({ key, ...normalizeProfile(profile) }))
    })
    const groupId = typeof options.groupId === 'string' ? options.groupId : ''
    const search = typeof options.search === 'string' ? options.search.trim().toLowerCase() : ''
    return profiles
      .filter((profile) => (groupId === '' ? true : profile.groupId === groupId))
      .filter((profile) => search === '' || `${profile.nickname} ${profile.qq} ${profile.summary} ${profile.interests.join(' ')}`.toLowerCase().includes(search))
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
  }

  /** Create or replace one profile from the panel editor. */
  async saveProfile(input) {
    if (this.profilesPath === null) return null
    const path = this.profilesPath
    const normalized = normalizeProfile(input)
    if (normalized.groupId === '' || normalized.qq === '') return null
    let saved = null
    await this.#serializeProfileSave(async () => {
      if (this.profileStore === null) this.profileStore = await loadProfileStore(path)
      const key = profileKey(normalized.groupId, normalized.qq)
      saved = { ...normalized, key, updatedAt: new Date().toISOString() }
      this.profileStore.profiles[key] = saved
      await saveProfileStore(path, this.profileStore)
    })
    return saved
  }

  /** Delete one saved profile by `group:qq` key. */
  async deleteProfile(key) {
    if (this.profilesPath === null || typeof key !== 'string' || key === '') return false
    const path = this.profilesPath
    let deleted = false
    await this.#serializeProfileSave(async () => {
      if (this.profileStore === null) this.profileStore = await loadProfileStore(path)
      if (this.profileStore.profiles[key] === undefined) return
      delete this.profileStore.profiles[key]
      deleted = true
      await saveProfileStore(path, this.profileStore)
    })
    return deleted
  }

  /** Load or create the profile for this group member. */
  async #ensureProfile(groupId, userId, userName) {
    if (this.profilesPath === null || userId === undefined || userId === null || String(userId) === '') return null
    try {
      const path = this.profilesPath
      let ensured = null
      await this.#serializeProfileSave(async () => {
        if (this.profileStore === null) this.profileStore = await loadProfileStore(path)
        ensured = ensureProfile(this.profileStore, { groupId, userId, userName })
        if (ensured.created) await saveProfileStore(path, this.profileStore)
      })
      return ensured
    } catch (error) {
      this.logger.warn('读取用户画像失败：%s', String(error?.message ?? error))
      return null
    }
  }

  /** Serialize profile-file writes while allowing different people's LLM calls to overlap. */
  #serializeProfileSave(task) {
    const next = this.profileSaveQueue.then(task, task)
    this.profileSaveQueue = next.catch(() => {})
    return next
  }

  /**
   * After a successful reply, ask the model to merge the latest exchange into
   * this person's profile. Runs in the background so the reply is not delayed.
   */
  #maintainProfile({ key, profile, messages, reply, selection }) {
    const previous = this.profileQueues.get(key) ?? Promise.resolve()
    const next = previous.then(async () => {
      try {
        const llm = this.#llm()
        if (llm === null || this.profilesPath === null) return
        const prompt = buildProfileUpdatePrompt(profile, messages, reply)
        let text = ''
        for await (const chunk of llm.stream({
          provider: selection.provider,
          model: selection.model,
          messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
          system: '你是 QQ 群成员画像整理器。只输出约定的 JSON，不要寒暄或解释。',
          maxTokens: 500,
          temperature: 0.2,
        })) {
          if (chunk?.type === 'text-delta' && typeof chunk.text === 'string') text += chunk.text
        }
        const path = this.profilesPath
        const patch = parseProfilePatch(text)
        await this.#serializeProfileSave(async () => {
          if (this.profileStore === null) this.profileStore = await loadProfileStore(path)
          const current = this.profileStore.profiles[key] ?? profile
          this.profileStore.profiles[key] = mergeProfile(current, patch, reply)
          await saveProfileStore(path, this.profileStore)
        })
      } catch (error) {
        this.logger.warn('更新用户画像失败：%s', String(error?.message ?? error))
      }
    }, async () => {})
    const tracked = next.finally(() => {
      if (this.profileQueues.get(key) === tracked) this.profileQueues.delete(key)
    })
    this.profileQueues.set(key, tracked)
  }

  /** Persist up to 4 current-message images through the harness attachment store. */
  async #imageParts(images) {
    if (!Array.isArray(images) || images.length === 0) return []
    const attachments = this.ctx?.get?.('attachments')
    if (attachments === null || attachments === undefined || typeof attachments.saveImages !== 'function') return []
    const accepted = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
    const inputs = []
    for (const image of images.slice(0, 4)) {
      if (image === null || typeof image !== 'object') continue
      const mediaType = String(image.mediaType ?? '').toLowerCase()
      if (!accepted.has(mediaType)) continue
      if (typeof image.data !== 'string' || image.data === '') continue
      let data
      try {
        data = new Uint8Array(Buffer.from(image.data, 'base64'))
      } catch {
        continue
      }
      if (data.byteLength === 0 || data.byteLength > 8 * 1024 * 1024) continue
      inputs.push({ data, mediaType })
    }
    if (inputs.length === 0) return []
    try {
      const refs = await attachments.saveImages(inputs)
      return refs.map((attachment) => ({ type: 'image', attachment }))
    } catch (error) {
      this.logger.warn('读取图片失败（已忽略图片继续回复）：%s', String(error?.message ?? error))
      return []
    }
  }

  /** Load the persona card: injected loader, then the data file, then defaults. */
  async #persona() {
    try {
      if (this.personaLoader !== null) return normalizePersona(await this.personaLoader()) ?? DEFAULT_PERSONA
      if (this.personaPath !== null) {
        const card = await readPersonaFile(this.personaPath)
        if (card !== null) return card
      }
    } catch {
      // fall through to the default card
    }
    return DEFAULT_PERSONA
  }

  /** @returns {any|null} */
  #llm() {
    try {
      return this.ctx?.get?.('llm') ?? null
    } catch {
      return null
    }
  }
}

/**
 * Strip leaked prompt labels/speaker prefixes from a model reply.
 *
 * The model occasionally imitates the context markers it sees (`[背景]`,
 * `[当前消息]`, `AI：`) and sends them to the group. Remove only those known
 * markers at line starts (or immediately before a colon), leaving ordinary
 * brackets in the reply untouched.
 *
 * @param {unknown} input
 * @returns {string}
 */
export function sanitizeReply(input) {
  let text = String(input ?? '')
  const labels = '背景|当前消息|群聊背景|最近群聊背景|历史|上下文'
  const bracket = `[\\[【]\\s*(?:${labels})\\s*[\\]】]`
  // "[背景] AI：" / "[当前消息] 小明：" - drop the label and speaker prefix.
  text = text.replace(new RegExp(`(^|\\n)\\s*${bracket}\\s*(?:AI|[^：\\n]{1,40})\\s*[:：]\\s*`, 'gu'), '$1')
  // Inline occurrences of the same labelled prefix.
  text = text.replace(new RegExp(`${bracket}\\s*(?:AI|[^：\\n]{1,40})\\s*[:：]\\s*`, 'gu'), '')
  // A bare label with no speaker.
  text = text.replace(new RegExp(`(^|\\n)\\s*${bracket}\\s*`, 'gu'), '$1')
  text = text.replace(new RegExp(`${bracket}\\s*`, 'gu'), '')
  // Remove any remaining literal context markers, even mid-reply.
  text = text.replace(/[\[【]\s*(?:背景|当前消息|群聊背景|最近群聊背景|历史|上下文)\s*[\]】]/gu, '')
  text = text.replace(/^\s*AI\s*[:：]\s*/u, '')
  return text.replace(/[ \t]{2,}/g, ' ').trim()
}

/**
 * Convert simple `{role, text}` messages into RequestMessage values accepted by
 * `ctx.llm.stream`. Only text is supported here.
 *
 * @param {unknown} input
 * @returns {Array<{ role: 'user' | 'assistant', content: Array<{ type: 'text', text: string }> }>}
 */
export function normalizeMessages(input, selection = { provider: 'deepseek-account', model: 'deepseek-flash' }) {
  if (!Array.isArray(input)) return []
  const output = []
  for (const item of input) {
    if (!isObject(item)) continue
    const role = item.role === 'assistant' ? 'assistant' : item.role === 'user' ? 'user' : null
    if (role === null) continue
    const raw = typeof item.text === 'string'
      ? item.text
      : Array.isArray(item.content)
        ? item.content.filter((part) => isObject(part) && part.type === 'text' && typeof part.text === 'string').map((part) => part.text).join('')
        : typeof item.content === 'string' ? item.content : ''
    const text = raw.trim()
    if (text === '') continue
    const content = [{ type: 'text', text: text.slice(0, 6000) }]
    if (role === 'assistant') {
      // RequestMessage requires a full assistant Message (id + model source);
      // request-only inputs are user-role only.
      output.push({
        role: 'assistant',
        id: randomUUID(),
        content,
        source: {
          kind: 'model',
          provider: String(selection?.provider ?? 'deepseek-account'),
          model: String(selection?.model ?? 'deepseek-flash'),
        },
      })
    } else {
      output.push({ role: 'user', content })
    }
  }
  return output.slice(-40)
}

/** @param {unknown} value */
function normalizeLogger(logger) {
  const source = isObject(logger) ? logger : {}
  return {
    info: typeof source.info === 'function' ? source.info.bind(source) : () => {},
    warn: typeof source.warn === 'function' ? source.warn.bind(source) : () => {},
    error: typeof source.error === 'function' ? source.error.bind(source) : () => {},
    debug: typeof source.debug === 'function' ? source.debug.bind(source) : () => {},
  }
}

function boundedInt(value, fallback, min, max, defaultValue) {
  const raw = value ?? fallback
  const number = Number(raw)
  if (!Number.isFinite(number)) return defaultValue
  return Math.min(max, Math.max(min, Math.trunc(number)))
}

function boundedNumber(value, fallback, min, max, defaultValue) {
  const raw = value ?? fallback
  const number = Number(raw)
  if (!Number.isFinite(number)) return defaultValue
  return Math.min(max, Math.max(min, number))
}
