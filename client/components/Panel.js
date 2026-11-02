import React from 'react'
import { useStore, deriveStatus } from '../runtime/store.js'
import { pickText } from '../runtime/api.js'
import { listTabs, resolveVisibleTabs } from '../runtime/tab-registry.js'
import { row, pill, actionButton } from './primitives.js'
import { renderHero, renderTabs, renderBanner, renderPollWarn, renderFooter } from './Shell.js'

const h = React.createElement

/** Bind a tab's `(panel, ...args)` handlers onto the flat panel context. */
function bindHandlers(panel, handlers) {
  for (const name of Object.keys(handlers)) {
    panel[name] = (...args) => handlers[name](panel, ...args)
  }
}

/**
 * The composition root: owns the shared state store, calls every registered
 * tab hook, then renders the Host-approved tabs inside the shared chrome.
 *
 * Hook order is the registry's stable order, never the Host tab list, so a
 * changed tab list can reorder the strip without reordering React hooks. The
 * Host only decides which registered tabs are visible and in what order.
 */
export function Panel(props) {
  const t = typeof (props && props.t) === 'function' ? props.t : (key) => String(key)
  const lang = t('__lang') === 'zh' ? 'zh' : 'en'

  const store = useStore(t)
  const status = deriveStatus(store.snapshot, t, store.loggedInRef)
  const panel = { h, t, lang, ...store, ...status }

  const registryTabs = listTabs()
  const hostTabs = store.snapshot !== null && Array.isArray(store.snapshot.clientTabs)
    ? store.snapshot.clientTabs
    : null
  const visibleTabs = resolveVisibleTabs(hostTabs)
  const hostById = new Map()
  if (Array.isArray(hostTabs)) {
    for (const hostTab of hostTabs) {
      if (hostTab !== null && typeof hostTab === 'object'
        && typeof hostTab.id === 'string' && !hostById.has(hostTab.id)) {
        hostById.set(hostTab.id, hostTab)
      }
    }
  }

  // Built-in tabs translate their labelKey; external tabs fall back to the
  // Host title for the same id when their key is not in the dictionary.
  const labelOf = (entry) => {
    const localized = t(entry.labelKey)
    if (localized !== entry.labelKey) return localized
    const hostTab = hostById.get(entry.id)
    const hostLabel = hostTab !== undefined && hostTab.title !== undefined ? pickText(hostTab.title, lang) : ''
    return hostLabel !== '' ? hostLabel : entry.labelKey
  }

  panel.row = (...args) => row(panel, ...args)
  panel.pill = (...args) => pill(panel, ...args)
  panel.actionButton = (...args) => actionButton(panel, ...args)
  for (const tab of registryTabs) bindHandlers(panel, tab.handlers)

  const renderers = new Map()
  for (const tab of registryTabs) {
    const render = tab.use(panel)
    renderers.set(tab.id, typeof render === 'function' ? render : () => null)
  }

  const tab = store.tab
  const visibleIds = new Set(visibleTabs.map((entry) => entry.id))
  const activeTabId = visibleIds.has(tab) ? tab : (visibleTabs.length > 0 ? visibleTabs[0].id : tab)
  const activeRenderer = renderers.get(activeTabId)
  panel.tabItems = visibleTabs.map((entry) => ({ id: entry.id, label: labelOf(entry) }))
  panel.activeTabId = activeTabId

  // Both tabs that show contact names keep the list fresh while visible.
  const { loadContacts } = panel
  React.useEffect(() => {
    if (tab !== 'messages' && tab !== 'access') return undefined
    loadContacts()
    const timer = setInterval(() => { loadContacts() }, 30000)
    return () => { clearInterval(timer) }
  }, [tab])

  const body = activeRenderer === undefined ? null : activeRenderer()

  return h('div', { className: 'qqbot-page', 'data-testid': 'qqbot-panel' },
    renderHero(panel),
    renderBanner(panel),
    renderPollWarn(panel),
    renderTabs(panel),
    h('div', {
      className: 'qqbot-body',
      role: 'tabpanel',
      id: `qqbot-tabpanel-${activeTabId}`,
      'aria-label': t('title'),
    }, body),
    renderFooter(panel))
}
