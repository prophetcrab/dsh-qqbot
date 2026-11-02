/** Small section header used to group the AI tab into clear areas. */
export function renderSectionHead(panel, titleKey, hintKey) {
  const { h, t } = panel
  return h('div', { className: 'qqbot-section-head', 'data-testid': 'qqbot-ai-section', 'data-section': titleKey },
    h('h2', { className: 'qqbot-section-title' }, t(titleKey)),
    h('p', { className: 'qqbot-section-hint' }, t(hintKey)))
}
