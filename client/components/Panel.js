import React from 'react'
import { useStore, deriveStatus } from '../runtime/store.js'
import { row, pill, actionButton } from './primitives.js'
import { renderHero, renderTabs, renderBanner, renderPollWarn, renderFooter } from './Shell.js'

const h = React.createElement

/** Bind a plugin's `(panel, ...args)` handlers onto the flat panel context. */
function bindHandlers(panel, handlers) {
  for (const name of Object.keys(handlers)) {
    panel[name] = (...args) => handlers[name](panel, ...args)
  }
}

/**
 * The composition root: owns the shared state store, calls every registered
 * plugin hook in a fixed order, then renders the active plugin's view inside
 * the shared chrome.
 */
export function Panel(props) {
  const t = typeof (props && props.t) === 'function' ? props.t : (key) => String(key)
  const lang = t('__lang') === 'zh' ? 'zh' : 'en'
  const plugins = props.plugins || []

  const store = useStore(t)
  const status = deriveStatus(store.snapshot, t, store.loggedInRef)
  const panel = { h, t, lang, ...store, ...status }
  panel.tabPlugins = plugins
  panel.row = (...args) => row(panel, ...args)
  panel.pill = (...args) => pill(panel, ...args)
  panel.actionButton = (...args) => actionButton(panel, ...args)
  for (const plugin of plugins) bindHandlers(panel, plugin.handlers || {})

  const renderers = plugins.map((plugin) => plugin.use(panel))

  // Both tabs that show contact names keep the list fresh while visible.
  const { tab, loadContacts } = panel
  React.useEffect(() => {
    if (tab !== 'messages' && tab !== 'access') return undefined
    loadContacts()
    const timer = setInterval(() => { loadContacts() }, 30000)
    return () => { clearInterval(timer) }
  }, [tab])

  const index = Math.max(0, plugins.findIndex((plugin) => plugin.id === tab))
  const body = renderers[index]()

  return h('div', { className: 'qqbot-page', 'data-testid': 'qqbot-panel' },
    renderHero(panel),
    renderBanner(panel),
    renderPollWarn(panel),
    renderTabs(panel),
    h('div', {
      className: 'qqbot-body',
      role: 'tabpanel',
      id: `qqbot-tabpanel-${tab}`,
      'aria-label': t('title'),
    }, body),
    renderFooter(panel))
}
