import { formatTime } from '../../runtime/api.js'

export function renderFullPromptCard(panel) {
  const { t, lastPromptState, fullPromptOpen, setFullPromptOpen, loadLastPrompt, h } = panel
  const state = lastPromptState
  const prompt = state.prompt
  const loading = state.phase === 'loading'
  const messages = prompt !== null && prompt !== undefined && Array.isArray(prompt.messages) ? prompt.messages : []
  const mentionParts = []
  if (prompt !== null && prompt !== undefined) {
    if (prompt.mentionSelf === true) mentionParts.push(t('fullPromptMentionSelf'))
    if (Array.isArray(prompt.mentionOthers) && prompt.mentionOthers.length > 0) {
      mentionParts.push(`@${prompt.mentionOthers.map((item) => String(item)).join(' @')}`)
    }
    if (prompt.mentionAll === true) mentionParts.push(t('fullPromptMentionAll'))
  }
  const meta = prompt === null || prompt === undefined ? null : h('div', {
    className: 'qqbot-full-prompt-meta',
    'data-testid': 'qqbot-full-prompt-meta',
  },
    h('span', null, `${t('fullPromptTime')} ${formatTime(prompt.at) || '—'}`),
    h('span', null, `${prompt.provider || '—'}/${prompt.model || '—'}`),
    h('span', null, `${t('fullPromptGroup')} ${prompt.groupId || '—'}`),
    h('span', null, `${t('fullPromptUser')} ${prompt.userName || prompt.userId || '—'}`),
    h('span', null, `${t('fullPromptMentions')} ${mentionParts.length > 0 ? mentionParts.join(' · ') : '—'}`),
    h('span', null, `${t('fullPromptReplyToBot')} ${prompt.replyToBot === true ? t('fullPromptYes') : t('fullPromptNo')}`),
    h('span', null, `${t('fullPromptImages')} ${Number(prompt.imageCount) || 0}`),
    prompt.maxTokens !== undefined && prompt.maxTokens !== null ? h('span', null, `maxTokens ${prompt.maxTokens}`) : null,
    prompt.temperature !== undefined && prompt.temperature !== null ? h('span', null, `temperature ${prompt.temperature}`) : null)
  const body = prompt === null || prompt === undefined
    ? null
    : (fullPromptOpen
      ? h('div', { className: 'qqbot-stack' },
        h('span', { className: 'qqbot-field-label' }, t('fullPromptSystem')),
        h('pre', {
          className: 'qqbot-pre qqbot-full-prompt-system',
          'data-testid': 'qqbot-full-prompt-system',
        }, typeof prompt.system === 'string' ? prompt.system : ''),
        h('span', { className: 'qqbot-field-label' }, t('fullPromptMessages')),
        h('div', { className: 'qqbot-full-prompt-messages', 'data-testid': 'qqbot-full-prompt-messages' },
          messages.length === 0
            ? h('p', { className: 'qqbot-hint' }, t('fullPromptNoMessages'))
            : null,
          ...messages.map((message, index) => h('div', {
            key: `full-prompt-message-${index}`,
            className: 'qqbot-full-prompt-message',
            'data-testid': 'qqbot-full-prompt-message',
          },
            h('div', { className: 'qqbot-full-prompt-message-head' },
              h('span', { className: 'qqbot-badge' }, message.role || 'user'),
              Number(message.imageCount) > 0
                ? h('span', { className: 'qqbot-card-sub' }, `${t('fullPromptImages')} ${message.imageCount}`)
                : null),
            h('div', { className: 'qqbot-full-prompt-message-text' },
              typeof message.text === 'string' ? message.text : '')))))
      : null)
  return h('section', { className: 'qqbot-card qqbot-full-prompt-card', 'data-testid': 'qqbot-full-prompt-card' },
    h('div', { className: 'qqbot-card-head' },
      h('h2', { className: 'qqbot-card-title' }, t('fullPromptTitle')),
      h('div', { className: 'qqbot-btns' },
        h('button', {
          type: 'button',
          className: 'qqbot-btn',
          'data-testid': 'qqbot-full-prompt-refresh',
          'aria-label': t('fullPromptRefresh'),
          disabled: loading,
          onClick: () => { loadLastPrompt() },
        }, loading ? t('working') : t('refresh')),
        prompt !== null && prompt !== undefined
          ? h('button', {
            type: 'button',
            className: 'qqbot-btn',
            'data-testid': 'qqbot-full-prompt-toggle',
            'aria-label': fullPromptOpen ? t('fullPromptHide') : t('fullPromptShow'),
            onClick: () => { setFullPromptOpen((previous) => !previous) },
          }, fullPromptOpen ? t('fullPromptHide') : t('fullPromptShow'))
          : null)),
    state.error !== null
      ? h('p', { className: 'qqbot-error', 'data-testid': 'qqbot-full-prompt-error' }, `${t('fullPromptError')}: ${state.error}`)
      : null,
    state.phase === 'loading' && prompt === null && state.error === null
      ? h('p', { className: 'qqbot-hint' }, t('fullPromptLoading'))
      : null,
    prompt === null && state.error === null && state.phase !== 'loading' && state.phase !== 'idle'
      ? h('div', { className: 'qqbot-empty' }, t('fullPromptEmpty'))
      : null,
    meta,
    body)
}
