/**
 * Static chrome of the panel: hero, pills, tab strip, banner and footer.
 * These render from the flat panel context and never own state.
 */
import { formatTime } from '../runtime/api.js'

export function renderHero(panel) {
  const {
    h, t, pill, platformLabel, platformBadgeText, napcatText, napcatTone, koishiText, koishiTone, botText,
    botTone, loadStatus
  } = panel
    return h('header', { className: 'qqbot-hero' },
    h('div', { className: 'qqbot-hero-main' },
      h('span', { className: 'qqbot-eyebrow' }, h('i', { className: 'qqbot-eyebrow-dot' }), t('eyebrow')),
      h('h1', { className: 'qqbot-title' }, t('title')),
      h('p', { className: 'qqbot-sub' }, t('subtitle'))),
    h('div', { className: 'qqbot-hero-side' },
      h('span', {
        className: 'qqbot-platform-badge',
        'data-testid': 'qqbot-platform-badge',
        title: platformLabel,
      }, platformBadgeText),
      h('div', { className: 'qqbot-pills' },
        pill('qqbot-pill-napcat', t('pillNapcat'), napcatText, napcatTone),
        pill('qqbot-pill-koishi', t('pillKoishi'), koishiText, koishiTone),
        pill('qqbot-pill-bot', t('pillBot'), botText, botTone)),
      h('div', { className: 'qqbot-btns' },
        h('button', {
          type: 'button',
          className: 'qqbot-btn',
          'data-testid': 'qqbot-status-refresh',
          'aria-label': t('refresh'),
          onClick: () => { loadStatus() },
        }, t('refresh')))))
}

export function renderTabs(panel) {
  const { h, t, tab, setTab, tabPlugins } = panel
  const tabItems = tabPlugins.map((plugin) => ({ id: plugin.id, label: t(plugin.labelKey) }))
  return h('div', { className: 'qqbot-tabs', role: 'tablist', 'aria-label': t('title') },
    ...tabItems.map((item) => h('button', {
      key: item.id,
      type: 'button',
      role: 'tab',
      className: `qqbot-tab${tab === item.id ? ' active' : ''}`,
      'data-testid': `qqbot-tab-${item.id}`,
      'aria-label': item.label,
      'aria-selected': tab === item.id ? 'true' : 'false',
      'aria-controls': `qqbot-tabpanel-${item.id}`,
      onClick: () => { setTab(item.id) },
      onKeyDown: (event) => {
        if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
          event.preventDefault()
          setTab(item.id)
        }
      },
    }, item.label)))
}

export function renderBanner(panel) {
  const { h, banner } = panel
    return banner === null ? null : h('div', {
    className: `qqbot-banner qqbot-banner-${banner.kind}`,
    role: banner.kind === 'error' ? 'alert' : 'status',
    'data-testid': 'qqbot-banner',
  }, banner.text)
}

export function renderPollWarn(panel) {
  const { h, t, loadError, hasSnapshot } = panel
  return loadError !== null && hasSnapshot
    ? h('div', { className: 'qqbot-warn' }, `${t('loadFail')}: ${loadError}`)
    : null
}

export function renderFooter(panel) {
  const { h, t, hasSnapshot, snapshot, settings } = panel
    return hasSnapshot ? h('footer', { className: 'qqbot-foot' },
    typeof snapshot.updatedAt === 'string'
      ? h('span', null, `${t('updated')} ${formatTime(snapshot.updatedAt)}`)
      : null,
    h('span', null, `Node ${snapshot.platform && snapshot.platform.node ? snapshot.platform.node : '—'}`),
    h('span', null, `${t('lblPort')} · ${settings.koishiPort || '—'}`)) : null
}
