
/**
 * AI status card: connection state, provider/model/endpoint and the local
 * self-test against the DSH bridge.
 */
export function renderAiCard(panel) {
  const { t, snapshot, aiReply, aiError, busyOf, testAi, h } = panel
  const ai = (snapshot && snapshot.ai) || {}
  const available = ai.available === true
  const ready = ai.ready === true
  const provider = typeof ai.provider === 'string' ? ai.provider : ''
  const model = typeof ai.model === 'string' ? ai.model : ''
  const endpoint = typeof ai.endpoint === 'string' ? ai.endpoint : ''
  const sourceLabel = ai.source === 'config'
    ? t('aiSourceConfig')
    : ai.source === 'harness-default' ? t('aiSourceHarness') : ai.source === 'fallback' ? t('aiSourceFallback') : ''
  const statusText = available
    ? `${t('aiConnected')} · ${provider || '—'}/${model || '—'}${sourceLabel !== '' ? ` · ${sourceLabel}` : ''}`
    : t('aiUnavailable')
  const working = busyOf('ai-test')
  const detail = (testid, label, value, mono) => h('div', { className: 'qqbot-row-item' },
    h('span', { className: 'qqbot-row-label' }, label),
    h('span', {
      className: `qqbot-row-value${mono ? ' qqbot-mono' : ''}`,
      'data-testid': testid,
    }, value !== '' ? value : '—'))
  return h('section', { className: 'qqbot-card qqbot-ai-card', 'data-testid': 'qqbot-ai-card' },
    h('div', { className: 'qqbot-card-head' },
      h('div', null,
        h('h2', { className: 'qqbot-card-title' }, t('aiTitle')),
        h('span', { className: 'qqbot-card-sub' }, t('aiStatusSubtitle'))),
      h('span', {
        className: `qqbot-pill qqbot-pill-${available ? 'ok' : 'warn'}`,
        'data-testid': 'qqbot-ai-state',
      },
        h('i', { className: 'qqbot-pill-dot' }),
        h('span', { className: 'qqbot-pill-text' }, available ? t('aiStateReady') : t('aiStateUnavailable')))),
    h('div', { className: 'qqbot-ai-status', 'data-testid': 'qqbot-ai-status' },
      h('span', { className: `qqbot-pill qqbot-pill-${available ? 'ok' : 'warn'}` },
        h('i', { className: 'qqbot-pill-dot' }),
        h('span', { className: 'qqbot-pill-text' }, statusText))),
    h('div', { className: 'qqbot-rows qqbot-ai-status-grid' },
      detail('qqbot-ai-provider', t('aiProviderLabel'), provider),
      detail('qqbot-ai-model', t('aiModelLabel'), model),
      detail('qqbot-ai-endpoint', t('aiEndpointLabel'), endpoint, true),
      detail('qqbot-ai-source', t('aiSourceLabel'), sourceLabel),
      detail('qqbot-ai-ready', t('aiReadyLabel'), ready ? t('aiYes') : t('aiNo'))),
    h('p', { className: 'qqbot-hint' }, t('aiHint')),
    h('div', { className: 'qqbot-btns' },
      h('button', {
        type: 'button',
        className: 'qqbot-btn qqbot-btn-primary',
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
