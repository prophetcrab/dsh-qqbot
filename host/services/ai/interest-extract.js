/** Extract durable semantic interests with the LLM and merge them into the store. */

/**
 * @param {object} options
 * @param {object} options.llm DSH LLM service
 * @param {import('./interests.js').InterestStore} options.store
 * @param {string} options.groupId
 * @param {Array<{text?: string}>} options.messages
 * @param {string} [options.background]
 * @param {string} [options.reply]
 * @param {{provider: string, model: string}} options.selection
 * @param {object} options.logger
 * @param {number} [options.now]
 */
export async function maintainInterests({ llm, store, groupId, messages, background, reply, selection, logger, now = Date.now(), throttleMs = 10 * 60 * 1000 }) {
  if (llm === null || typeof llm?.stream !== 'function' || store === null) return
  if (typeof groupId !== 'string' || groupId === '') return
  if (store.shouldExtract(groupId, now, throttleMs) !== true) return
  const context = [
    typeof background === 'string' ? background.slice(-6000) : '',
    ...(Array.isArray(messages) ? messages.slice(-6).map((message) => String(message.text ?? '').slice(0, 800)) : []),
    `机器人：${String(reply ?? '').slice(0, 800)}`,
  ].filter((part) => part !== '').join('\n')
  if (context === '') return
  const system = [
    '你负责从 QQ 群聊片段中提取可持续的语义兴趣/话题。',
    '只输出 JSON：{"interests":[{"label":"2-12字的具体主题","aliases":["最多4个同义说法"],"summary":"一句话说明","weight":0.0-1.0,"confidence":0.0-1.0,"ttlHours":1-720}]}。',
    '要求：label 必须是具体话题/名词，不要泛词、不要逐字片段、不要整句；aliases 是可选的同义表达；最多 3 项；没有明确兴趣输出 {"interests":[]}。',
  ].join('\n')
  try {
    let text = ''
    for await (const chunk of llm.stream({
      provider: selection.provider,
      model: selection.model,
      system,
      messages: [{ role: 'user', content: [{ type: 'text', text: `【群聊片段】\n${context}` }] }],
      maxTokens: 500,
      temperature: 0.2,
    })) {
      if (chunk?.type === 'text-delta' && typeof chunk.text === 'string') text += chunk.text
    }
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    if (start < 0 || end <= start) return
    const parsed = JSON.parse(text.slice(start, end + 1))
    await store.merge(groupId, Array.isArray(parsed?.interests) ? parsed.interests : [], now)
    logger.info('语义兴趣已更新：%s', groupId)
  } catch (error) {
    logger.warn('语义兴趣抽取失败：%s', String(error?.message ?? error))
  }
}
