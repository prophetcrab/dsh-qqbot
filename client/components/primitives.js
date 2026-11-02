/**
 * Tiny element builders shared by every tab. They read `h`, the translator
 * and the busy map off the panel context so call sites stay terse.
 */
export function row(panel, label, value, tone, mono) {
  const { h } = panel
  return h('div', { key: label, className: 'qqbot-row-item' },
    h('span', { className: 'qqbot-row-label' }, label),
    h('span', { className: `qqbot-row-value${tone ? ` is-${tone}` : ''}${mono ? ' qqbot-mono' : ''}` }, value))
}

export function pill(panel, testid, label, text, tone) {
  const { h } = panel
  return h('span', {
    className: `qqbot-pill qqbot-pill-${tone}`,
    'data-testid': testid,
    'aria-label': `${label}: ${text}`,
  },
    h('i', { className: 'qqbot-pill-dot' }),
    h('span', { className: 'qqbot-pill-label' }, label),
    h('span', { className: 'qqbot-pill-text' }, text))
}

export function actionButton(panel, id, label, tone, handler, options) {
  const { h, t, busyOf } = panel
  const extra = options || {}
  const key = extra.busyKey || id
  const working = busyOf(key)
  return h('button', {
    key: `action-${id}`,
    type: 'button',
    className: `qqbot-btn${tone ? ` qqbot-btn-${tone}` : ''}`,
    'data-testid': `qqbot-action-${id}`,
    'aria-label': extra.ariaLabel || label,
    title: extra.title,
    'aria-busy': working ? 'true' : undefined,
    disabled: extra.disabled === true || working,
    onClick: handler,
  }, working ? t('working') : label)
}
