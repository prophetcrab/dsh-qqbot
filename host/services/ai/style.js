/** Soft style guidance for chat rhythm; never truncates or rewrites the reply. */

export function replyStylePrompt(mode) {
  if (mode === 'short') return '【本次表达方式】像群友随手接一句，优先 1 句话，尽量 40 字内；不要完整解释，不要总结。'
  if (mode === 'reaction') return '【本次表达方式】只给一个很短的反应、吐槽或反问，尽量 20 字内，不要展开。'
  if (mode === 'casual') return '【本次表达方式】像群聊自然接话，1–2 句；可以分两段；不要客服式总结。'
  if (mode === 'normal') return '【本次表达方式】自然回答，最多 2–3 句；保持人设，不列清单，不写客服腔。'
  return ''
}

export function recentRepliesPrompt(replies) {
  const list = Array.isArray(replies)
    ? replies.filter((item) => typeof item === 'string' && item.trim() !== '').slice(-6)
    : []
  if (list.length === 0) return ''
  return [
    '【近期回复（只用于避免完全重复）】',
    ...list.map((reply) => `- ${reply.slice(0, 240)}`),
    '不要逐字复用整句；保留人设口癖和语气，不要为了去重变得不像角色。',
  ].join('\n')
}
