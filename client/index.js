/**
 * dsh-qqbot — browser half entry point.
 *
 * Registers the locale dictionaries, the panel stylesheet, the main control
 * center seat and the sidebar row. Everything else is a plugin: each tab
 * lives under `plugins/<name>/` and contributes its own hooks and view.
 */
import React from 'react'
import { Panel } from './components/Panel.js'
import { QqbotIcon } from './components/Icon.js'
import { NS, en, zh } from './runtime/locale.js'
import { CSS } from './runtime/styles.js'
import * as overview from './plugins/overview/index.js'
import * as ai from './plugins/ai/index.js'
import * as messages from './plugins/messages/index.js'
import * as access from './plugins/access/index.js'
import * as plugins from './plugins/plugins/index.js'
import * as features from './plugins/features/index.js'
import * as logs from './plugins/logs/index.js'

const h = React.createElement

const NSID = 'qqbot'
const PANEL_ID = 'qqbot'
const SIDEBAR_ID = 'qqbot'

/** Tab plugin order; the first one is the default view. */
const PLUGINS = [overview, ai, messages, access, plugins, features, logs]

export default {
  inject: ['slots', 'locale'],
  apply(ctx) {
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
    const ConnectedPanel = (props) => h(Panel, { ...props, t, plugins: PLUGINS })
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
