

export function renderAiCard(panel) {
  const { t, snapshot, aiReply, aiError, busyOf, testAi, h } = panel
  const ai = (snapshot && snapshot.ai) || {}
  const available = ai.available === true
  const provider = typeof ai.provider === 'string' ? ai.provider : ''
  const model = typeof ai.model === 'string' ? ai.model : ''
  const sourceLabel = ai.source === 'config'
    ? t('aiSourceConfig')
    : ai.source === 'harness-default' ? t('aiSourceHarness') : ai.source === 'fallback' ? t('aiSourceFallback') : ''
  const statusText = available
    ? `${t('aiConnected')} · ${provider || '—'}/${model || '—'}${sourceLabel !== '' ? ` · ${sourceLabel}` : ''}`
    : t('aiUnavailable')
  const working = busyOf('ai-test')
  return h('section', { className: 'qqbot-card qqbot-ai-card', 'data-testid': 'qqbot-ai-card' },
    h('div', { className: 'qqbot-card-head' },
      h('h2', { className: 'qqbot-card-title' }, t('aiTitle')),
      h('span', { className: available ? 'qqbot-ai-state is-ok' : 'qqbot-ai-state is-bad' }, available ? '✓' : '✕')),
    h('div', { className: 'qqbot-ai-status', 'data-testid': 'qqbot-ai-status' },
      h('span', { className: `qqbot-pill qqbot-pill-${available ? 'ok' : 'warn'}` },
        h('i', { className: 'qqbot-pill-dot' }),
        h('span', { className: 'qqbot-pill-text' }, statusText))),
    h('p', { className: 'qqbot-hint' }, t('aiHint')),
    h('div', { className: 'qqbot-btns' },
      h('button', {
        type: 'button',
        className: 'qqbot-btn',
        'data-testid': 'qqbot-ai-test',
        'aria-label': t('aiTest'),
        'aria-busy': working ? 'true' : undefined,
        disabled: !available || working,
        onClick: () => { testAi() },
      }, working ? t('working') : t('aiTest'))),
    aiReply !== null
      ? h('div', { className: 'qqbot-ai-reply-wrap' },
        h('span', { className: 'qqbot-field-label' }, t('aiReply')),
        h('pre', { className: 'qqbot-pre qqbot-ai-reply', 'data-testid': 'qqbot-ai-reply' }, aiReply))
      : null,
    aiError !== null ? h('p', { className: 'qqbot-error', 'data-testid': 'qqbot-ai-error' }, aiError) : null)
}
