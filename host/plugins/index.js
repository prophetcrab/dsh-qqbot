/**
 * Built-in host plugin list.
 *
 * Adding a capability means adding a plugin directory and one line here — the
 * kernel resolves order from each manifest's `inject`/`provides` declarations.
 */

import access from './access/index.js'
import ai from './ai/index.js'
import features from './features/index.js'
import install from './install/index.js'
import koishi from './koishi/index.js'
import lifecycle from './lifecycle/index.js'
import messages from './messages/index.js'
import napcat from './napcat/index.js'
import persona from './persona/index.js'
import tools from './tools/index.js'

/** @type {any[]} */
export const BUILTIN_PLUGINS = [
  access,
  ai,
  features,
  install,
  koishi,
  lifecycle,
  messages,
  napcat,
  persona,
  tools,
]
