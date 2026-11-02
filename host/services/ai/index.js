/**
 * AI chat bridge: reuse the harness's own LLM service (`ctx.llm`) instead of
 * storing or copying any API key in the QQ-side project.
 */

import { DEFAULT_PERSONA, buildPersonaPrompt, normalizePersona, readPersonaFile } from '../persona/index.js'
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
} from '../profiles/index.js'
import {
  boundedInt,
  boundedNumber,
  isObject,
  isTransientLlmFailure,
  normalizeLogger,
  normalizeMessages,
  sanitizeReply,
} from './text.js'

export class AiChatService {
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
    this.lastGate = null
  }

  lastPromptSnapshot() {
    return this.lastPrompt
  }

  lastGateSnapshot() {
    return this.lastGate
  }

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
    const quote = options.quote !== null && typeof options.quote === 'object' ? options.quote : null
    const quotePrompt = quote !== null && (typeof quote.text === 'string' && quote.text !== '' || quote.imageCount > 0)
      ? `【当前消息引用的内容】\n发送者：${String(quote.userName ?? '某人')}\n内容：${String(quote.text ?? '') === '' ? '（一张图片）' : String(quote.text)}`
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
    const focus = messages.length > 1 || background !== '' || targetPrompt !== '' || quotePrompt !== ''
      ? '【回复要求】只针对用户最后发送的这一条消息决定是否以及如何接话；如果存在【当前消息引用的内容】，优先针对被引用的那条消息回答或分析。群聊背景、用户画像和话题记忆都只用于理解上下文，不要复述背景里的消息，也不要输出任何上下文标记、消息标签或发送者名前缀。'
      : ''
    const system = [personaPrompt, profilePrompt, backgroundPrompt, quotePrompt, targetPrompt, extraSystem, focus].filter((part) => part !== '').join('\n\n')
    // Let the character decide whether to speak, even after a trigger fired.
    const gateBackground = background !== '' ? background.split('\n').slice(-6).join('\n') : ''
    if (this.settings.aiSelfCheck !== false && messages.length > 0
      && !(Array.isArray(options.images) && options.images.length > 0)
      && !(Array.isArray(options.backgroundImages) && options.backgroundImages.length > 0)
      && !(Array.isArray(options.quotedImages) && options.quotedImages.length > 0)) {
      const gate = await this.#selfCheck({
        selection,
        messages,
        system: [personaPrompt, profilePrompt, gateBackground === '' ? '' : `【最近群聊背景】\n${gateBackground}`, quotePrompt, targetPrompt]
          .filter((part) => part !== '')
          .join('\n\n'),
      })
      if (gate !== null && gate.reply === false) {
        return {
          ok: true,
          skipped: true,
          reason: gate.reason ?? 'persona declined to reply',
          provider: selection.provider,
          model: selection.model,
        }
      }
    }
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
    const backgroundImageParts = await this.#imageParts(options.backgroundImages)
    const quotedImageParts = await this.#imageParts(options.quotedImages)
    const contextMessages = []
    if (backgroundImageParts.length > 0) {
      contextMessages.push({
        role: 'user',
        content: [
          { type: 'text', text: '【背景图片】以下是最近群聊里出现过的图片，只用于理解上下文，不是当前消息。' },
          ...backgroundImageParts,
        ],
      })
    }
    if (quotedImageParts.length > 0) {
      contextMessages.push({
        role: 'user',
        content: [
          { type: 'text', text: `【引用消息中的图片】${quote?.userName !== undefined ? `${quote.userName}：` : ''}这是当前消息所回复的内容，请优先分析它。` },
          ...quotedImageParts,
        ],
      })
    }
    if (contextMessages.length > 0) request.messages = [...contextMessages, ...request.messages]
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
      backgroundImageCount: backgroundImageParts.length,
      quotedImageCount: quotedImageParts.length,
      quote: quote === null ? null : { userName: quote.userName ?? null, text: quote.text ?? '', imageCount: quotedImageParts.length },
      maxTokens: request.maxTokens,
      temperature: request.temperature,
      gate: this.lastGate,
    }
    const collected = await this.#collectStream(request, 2)
    if (collected.error !== undefined) {
      const message = String(collected.error?.message ?? collected.error)
      this.logger.warn('LLM 调用失败：%s', message)
      return { ok: false, error: `模型调用失败：${message}`, code: 'LLM_CALL_FAILED' }
    }
    if (collected.aborted === true) {
      return { ok: false, error: '模型调用已取消', code: 'ABORTED', provider: selection.provider, model: selection.model }
    }
    if (collected.failure !== null) {
      const failure = collected.failure
      const detail = typeof failure.message === 'string' && failure.message !== '' ? failure.message : String(failure.code ?? 'LLM_FAILED')
      this.logger.warn('LLM 返回错误：%s', detail)
      if (isTransientLlmFailure(failure)) {
        return { ok: false, error: '模型服务繁忙，请稍后再试', code: 'BUSY', retryable: true, provider: selection.provider, model: selection.model }
      }
      return { ok: false, error: `模型返回错误：${detail}`, code: typeof failure.code === 'string' ? failure.code : 'LLM_FAILED', provider: selection.provider, model: selection.model }
    }
    const text = collected.text
    let finish = collected.finish
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

  async #collectStream(request, attempts = 2) {
    const llm = this.#llm()
    if (llm === null) return { text: '', finish: null, failure: { code: 'NO_LLM_SERVICE', message: 'LLM 服务不可用' } }
    let lastFailure = null
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      let text = ''
      let finish = null
      try {
        for await (const chunk of llm.stream(request)) {
          if (chunk?.type === 'text-delta' && typeof chunk.text === 'string') text += chunk.text
          else if (chunk?.type === 'finish') finish = chunk.reason ?? null
        }
      } catch (error) {
        const message = String(error?.message ?? error)
        if (attempt + 1 < attempts && isTransientLlmFailure({ message })) {
          await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)))
          continue
        }
        return { text, finish, error }
      }
      if (finish?.kind === 'aborted') return { text, finish, aborted: true, failure: null }
      if (finish?.kind === 'error') {
        lastFailure = finish.failure ?? { code: 'LLM_FAILED' }
        if (attempt + 1 < attempts && isTransientLlmFailure(lastFailure)) {
          await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)))
          continue
        }
        return { text, finish, failure: lastFailure }
      }
      return { text, finish, failure: null }
    }
    return { text: '', finish: null, failure: lastFailure ?? { code: 'LLM_FAILED' } }
  }

  async #selfCheck({ selection, messages, system }) {
    const llm = this.#llm()
    if (llm === null) return null
    const gateSystem = [
      system,
      '【自检要求】你就是上面这个角色。请结合你的人设、性格、身份和当前语境，判断这条消息是否值得你接话。',
      '被 @ 或被回复并不代表必须说话；如果这句话更适合别人回答、与你无关、会打断别人、或按你的性格根本不想接，就选择不回复。',
      '只输出一个 JSON：{"reply":true|false,"reason":"不超过30字的理由"}，不要输出其他内容。',
    ].filter((part) => part !== '').join('\n\n')
    let text = ''
    try {
      const collected = await this.#collectStream({
        provider: selection.provider,
        model: selection.model,
        system: gateSystem,
        messages: messages.map((message) => ({
          role: message.role,
          content: message.content.filter((part) => part.type === 'text'),
        })),
        maxTokens: 120,
        temperature: 0.2,
      }, 1)
      if (collected.error !== undefined || collected.failure !== null || collected.aborted === true) {
        this.logger.warn('AI 自检失败，默认回复')
        return null
      }
      text = collected.text
    } catch (error) {
      this.logger.warn('AI 自检失败，默认回复：%s', String(error?.message ?? error))
      return null
    }
    const raw = text.trim()
    const start = raw.indexOf('{')
    const end = raw.lastIndexOf('}')
    let parsed = null
    if (start >= 0 && end > start) {
      try {
        parsed = JSON.parse(raw.slice(start, end + 1))
      } catch {
        parsed = null
      }
    }
    const reply = parsed !== null && typeof parsed === 'object'
      ? parsed.reply !== false
      : true
    const reason = parsed !== null && typeof parsed.reason === 'string' ? parsed.reason.slice(0, 80) : ''
    this.lastGate = { at: new Date().toISOString(), reply, reason, raw: raw.slice(0, 400), system: gateSystem }
    this.logger.info('AI 自检：%s%s', reply ? '回复' : '不回复', reason === '' ? '' : `（${reason}）`)
    return { reply, reason }
  }

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

  #serializeProfileSave(task) {
    const next = this.profileSaveQueue.then(task, task)
    this.profileSaveQueue = next.catch(() => {})
    return next
  }

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

  #llm() {
    try {
      return this.ctx?.get?.('llm') ?? null
    } catch {
      return null
    }
  }
}
