/**
 * dsh-qqbot — browser half entry point.
 *
 * Registers the locale dictionaries, the panel stylesheet, the main control
 * center seat, the sidebar row and the external tab-registry bridge.
 *
 * The built-in tabs register themselves as a side effect of being imported
 * (`plugins/<name>/index.js` -> `runtime/tab-registry.js`), so this entry
 * point no longer owns a static tab list: the Host decides which tabs render.
 */
import React from 'react'
import { Panel } from './components/Panel.js'
import { QqbotIcon } from './components/Icon.js'
import { NS, en, zh } from './runtime/locale.js'
import { CSS } from './runtime/styles.js'
import { registerClientTabApi } from './runtime/tab-registry.js'
import './plugins/overview/index.js'
import './plugins/ai/index.js'
import './plugins/messages/index.js'
import './plugins/access/index.js'
import './plugins/plugins/index.js'
import './plugins/features/index.js'
import './plugins/logs/index.js'
import './plugins/games/index.js'
import './plugins/tokens/index.js'

const h = React.createElement

const NSID = 'qqbot'
const PANEL_ID = 'qqbot'
const SIDEBAR_ID = 'qqbot'

export default {
  inject: ['slots', 'locale'],
  apply(ctx) {
    // Expose the tab bridge before the panel mounts, so external client
    // plugins can contribute tabs from their own apply().
    registerClientTabApi()
    ctx.effect(() => ctx.locale.register(NS, { en, zh }), 'dsh-qqbot: dictionaries')
    // One plugin-owned stylesheet: hover, focus and breakpoints are not
    // expressible inline; the tokens keep dark and light themes working.
    ctx.effect(() => {
      const style = document.createElement('style')
      style.dataset.plugin = 'qqbot'
      style.textContent = CSS
      document.head.appendChild(style)
      return () => { style.remove() }
    }, 'dsh-qqbot: stylesheet')
    const t = ctx.locale.bind(NSID)
    // The main seat passes no locale binding, so bind it here and hand the
    // translator down; a missing one used to crash the render.
    const ConnectedPanel = (props) => h(Panel, { ...props, t })
    ctx.effect(() => ctx.slots.inject('main', () => ctx.slots.register({
      name: 'main',
      key: PANEL_ID,
    }, ConnectedPanel)), 'dsh-qqbot: main panel')
    ctx.effect(() => ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
      name: 'sidebar.panellist',
      id: SIDEBAR_ID,
      order: 30,
      label: () => t('title'),
    }, QqbotIcon)), 'dsh-qqbot: sidebar row')
  },
}
