/**
 * AI 群聊插件：把群消息作为上下文，触发时调用 DSH 的本地 AI 桥
 * （`/qqbot/ai/chat`），由 DSH 复用自己已配置的模型/API Key 生成回复。
 *
 * 触发方式：
 * - `mention`：只响应 @机器人（默认）
 * - `always`：目标群（权限白名单内的群）里的普通消息也自动接话
 * - 所有群消息都会进入该群的短期上下文，因此 AI 能“看到”前文
 */
import { Context, Schema, h } from 'koishi'
import { mkdirSync, readFileSync, watchFile, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

export const name = 'ai-chat'
export const inject: string[] = []

export interface Config {
  enabled: boolean
  replyMode: 'mention' | 'always'
  groupOnly: boolean
  historyLimit: number
  maxReplyChars: number
  timeoutMs: number
  endpoint: string
  discoveryFile: string
  stateFile: string
  systemPrompt: string
}

export const Config: Schema<Config> = Schema.object({
  enabled: Schema.boolean().default(true).description('是否启用 AI 聊天'),
  replyMode: Schema.union(['mention', 'always'] as const).default('mention')
    .description('mention=只响应 @机器人；always=目标群内普通消息也自动回复（仍受权限白名单限制）'),
  groupOnly: Schema.boolean().default(true).description('是否只处理群聊（群内需 @机器人）'),
  historyLimit: Schema.number().default(12).min(0).max(50).description('每个群保留并发送的历史消息条数'),
  maxReplyChars: Schema.number().default(1200).min(100).max(4000).description('单条回复最大字符数（超长自动分条）'),
  timeoutMs: Schema.number().default(120000).min(5000).max(600000).description('调用 DSH AI 桥的超时时间'),
  endpoint: Schema.string().default('').description('DSH AI 桥地址；留空则读取 discoveryFile'),
  discoveryFile: Schema.string().default('data/ai.json').description('DSH 写入的 AI 桥发现文件（相对项目根目录）'),
  stateFile: Schema.string().default('data/ai-chat-state.json').description('AI 监听/回复诊断状态文件（相对项目根目录）'),
  systemPrompt: Schema.string().default('').description('额外系统提示词；留空使用 DSH 侧默认'),
})

interface HistoryMessage {
  role: 'user' | 'assistant'
  text: string
}

interface Discovery {
  endpoint?: string
  provider?: string
  model?: string
}

/** 从 DSH 写入的发现文件读取 AI 桥地址。 */
function readDiscovery(file: string): Discovery | null {
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'))
    if (parsed !== null && typeof parsed === 'object' && typeof parsed.endpoint === 'string' && parsed.endpoint !== '') {
      return {
        endpoint: parsed.endpoint,
        provider: typeof parsed.provider === 'string' ? parsed.provider : undefined,
        model: typeof parsed.model === 'string' ? parsed.model : undefined,
      }
    }
  } catch {
    // file missing / not yet written
  }
  return null
}

/** 按长度/换行把长回复拆成 QQ 可发送的片段。 */
export function splitReply(text: string, max: number): string[] {
  const limit = Math.max(100, Math.trunc(max))
  const parts: string[] = []
  let rest = text.trim()
  while (rest.length > limit) {
    let cut = rest.lastIndexOf('\n', limit)
    if (cut < limit * 0.5) cut = limit
    parts.push(rest.slice(0, cut).trim())
    rest = rest.slice(cut).replace(/^\n+/u, '')
  }
  if (rest !== '') parts.push(rest)
  return parts.filter((part) => part !== '')
}

function hasMention(session: any, selfId: string): boolean {
  const elements = Array.isArray(session.elements) ? session.elements : []
  return elements.some((element: any) => element?.type === 'at' && String(element?.attrs?.id ?? '') === selfId)
}

function senderName(session: any): string {
  return String(session?.author?.name ?? session?.username ?? session?.userId ?? '群友')
}

export function apply(ctx: Context, config: Config): void {
  const logger = ctx.logger('ai-chat')
  const history = new Map<string, HistoryMessage[]>()
  const pending = new Set<string>()
  const discoveryPath = resolve(process.cwd(), config.discoveryFile)
  const statePath = resolve(process.cwd(), config.stateFile)
  const state: any = { replyMode: config.replyMode, lastInbound: null, lastReply: null, updatedAt: null }
  const persistState = (): void => {
    try {
      state.updatedAt = new Date().toISOString()
      mkdirSync(dirname(statePath), { recursive: true })
      writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
    } catch {
      // diagnostics only
    }
  }
  let discovery: Discovery | null = readDiscovery(discoveryPath)

  // DSH 可能在 Koishi 启动后才监听端口/写入发现文件；轮询文件即可自动接上。
  try {
    watchFile(discoveryPath, { interval: 2000 }, () => {
      const next = readDiscovery(discoveryPath)
      if (next !== null) {
        discovery = next
        logger.info('AI 桥已就绪：%s (%s/%s)', next.endpoint, next.provider ?? '?', next.model ?? '?')
      }
    }).unref?.()
  } catch {
    // ignore
  }

  const endpointOf = (): string | null => {
    if (config.endpoint !== '') return config.endpoint
    discovery = readDiscovery(discoveryPath) ?? discovery
    return discovery?.endpoint ?? null
  }

  const keyOf = (session: any): string => String(session?.guildId ?? session?.channelId ?? session?.userId ?? 'unknown')

  const pushHistory = (key: string, message: HistoryMessage): void => {
    const list = history.get(key) ?? []
    list.push(message)
    const cap = Math.max(2, config.historyLimit * 2 + 2)
    if (list.length > cap) list.splice(0, list.length - cap)
    history.set(key, list)
  }

  ctx.middleware(async (session, next) => {
    if (!config.enabled) return next()
    if (session.userId === session.selfId) return next()
    if (session.author?.isBot === true) return next()
    if (config.groupOnly && session.isDirect === true) return next()

    const elements = Array.isArray(session.elements) ? session.elements : []
    const rawText = h.select(elements, 'text').join('').trim()
    const content = rawText !== '' ? rawText : (typeof session.content === 'string' ? session.content.trim() : '')
    const key = keyOf(session)

    const mentioned = hasMention(session, String(session.selfId))
    const isCommand = content.startsWith('/')
    const shouldReply = config.replyMode === 'always' ? (!isCommand && content !== '') : mentioned
    state.lastInbound = {
      at: new Date().toISOString(),
      groupId: key,
      text: content.slice(0, 200),
      mentioned,
      shouldReply,
    }
    persistState()
    if (!shouldReply) {
      // 所有普通群消息都进入上下文，AI 才能理解前文。
      if (content !== '' && !isCommand && content.length <= 2000) {
        pushHistory(key, { role: 'user', text: `${senderName(session)}：${content}` })
      }
      return next()
    }

    if (pending.has(key)) {
      await session.send('上一条还在思考中，稍等一下～')
      return
    }

    const prompt = content !== '' ? content : '（对方 @ 了你但没有输入文字）'

    const endpoint = endpointOf()
    if (endpoint === null) {
      await session.send('AI 还没有连接上 DSH（请在 DSH 面板确认 AI 状态，或重启 Koishi）')
      return
    }

    const messages: HistoryMessage[] = [
      ...(history.get(key) ?? []).slice(-Math.max(0, config.historyLimit)),
      { role: 'user', text: `${senderName(session)}：${prompt}` },
    ]
    pending.add(key)
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), Math.max(5000, config.timeoutMs))
      timer.unref?.()
      let response: Response
      try {
        response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            messages,
            ...(config.systemPrompt !== '' ? { system: config.systemPrompt } : {}),
          }),
          signal: controller.signal,
        })
      } finally {
        clearTimeout(timer)
      }
      const data: any = await response.json().catch(() => null)
      if (data === null || data.ok !== true || typeof data.reply !== 'string') {
        const reason = data?.error ?? `HTTP ${response.status}`
        logger.warn('AI 回复失败：%s', reason)
        state.lastReply = { at: new Date().toISOString(), ok: false, error: String(reason).slice(0, 200) }
        persistState()
        await session.send(`AI 暂时不可用：${String(reason).slice(0, 200)}`)
        return
      }
      const reply = String(data.reply).trim()
      if (reply === '') return
      pushHistory(key, { role: 'assistant', text: reply })
      state.lastReply = { at: new Date().toISOString(), ok: true, replyPreview: reply.slice(0, 200) }
      persistState()
      for (const part of splitReply(reply, config.maxReplyChars)) {
        await session.send(part)
      }
      logger.debug('AI 回复群 %s：%s', key, reply.slice(0, 120))
    } catch (error: any) {
      const message = String(error?.message ?? error)
      logger.warn('AI 调用异常：%s', message)
      state.lastReply = { at: new Date().toISOString(), ok: false, error: message.slice(0, 200) }
      persistState()
      await session.send(`AI 调用失败：${message.slice(0, 200)}`)
    } finally {
      pending.delete(key)
    }
  })
}
