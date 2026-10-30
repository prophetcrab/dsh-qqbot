/**
 * AI chat bridge: reuse the harness's own LLM service (`ctx.llm`) instead of
 * storing or copying any API key in the QQ-side project.
 *
 * The QQ bot's Koishi plugin sends conversation messages to `/qqbot/ai/chat`;
 * this service resolves the provider/model from the plugin config (or the
 * harness default selection) and streams a completion through DSH's LLM
 * adapters, so the configured DSH provider credentials are reused as-is.
 */

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
    const messages = normalizeMessages(options.messages)
    if (messages.length === 0) return { ok: false, error: '消息为空', code: 'EMPTY_MESSAGES' }
    const llm = this.#llm()
    if (llm === null) {
      return { ok: false, error: 'DSH 的 LLM 服务不可用（请确认已配置模型提供方）', code: 'NO_LLM_SERVICE' }
    }
    const selection = this.resolveSelection()
    const system = typeof options.system === 'string' && options.system.trim() !== ''
      ? options.system
      : (typeof this.settings.aiSystemPrompt === 'string' && this.settings.aiSystemPrompt.trim() !== '' ? this.settings.aiSystemPrompt : undefined)
    const request = {
      provider: selection.provider,
      model: selection.model,
      messages,
      ...(system === undefined ? {} : { system }),
      maxTokens: boundedInt(options.maxTokens, this.settings.aiMaxTokens, 64, 4096, 800),
      temperature: boundedNumber(options.temperature, this.settings.aiTemperature, 0, 2, 0.7),
      ...(options.signal === undefined ? {} : { signal: options.signal }),
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
    const reply = text.trim()
    if (reply === '') return { ok: false, error: '模型没有返回内容', code: 'EMPTY_REPLY', provider: selection.provider, model: selection.model }
    return { ok: true, reply, provider: selection.provider, model: selection.model }
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
 * Convert simple `{role, text}` messages into RequestMessage values accepted by
 * `ctx.llm.stream`. Only text is supported here.
 *
 * @param {unknown} input
 * @returns {Array<{ role: 'user' | 'assistant', content: Array<{ type: 'text', text: string }> }>}
 */
export function normalizeMessages(input) {
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
    output.push({ role, content: [{ type: 'text', text: text.slice(0, 6000) }] })
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
