/**
 * NapCat plugin: install/configure/start/stop NapCat (the patched macOS QQ
 * client) and expose its login state, QR image and account contacts.
 */

import { NapcatManager } from '../../services/napcat/index.js'
import { routes } from './routes.js'
import { tools } from './tools.js'
import { createStatusProvider } from './status.js'

export const name = 'napcat'
export const version = '1.0.0'

export default {
  id: 'qqbot-napcat',
  name,
  version,
  inject: ['platform'],
  provides: ['napcat'],
  description: 'NapCat detection, offline install, OneBot config and QQ login lifecycle.',
  async apply(api) {
    const napcat = new NapcatManager({
      settings: api.settings,
      logger: api.logger,
    })
    api.provide('napcat', napcat)
    api.registerRoutes(routes(api, napcat))
    for (const tool of tools(api, napcat)) api.registerTool(tool)
    api.registerStatusProvider(createStatusProvider(napcat))
  },
}
