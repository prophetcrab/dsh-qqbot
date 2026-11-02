/**
 * Install plugin: one-click environment setup (scaffold/deps/NapCat/OneBot).
 */

import { SetupManager } from '../../services/setup/index.js'
import { routes } from './routes.js'

export const name = 'install'
export const version = '1.0.0'

export default {
  id: 'qqbot-install',
  name,
  version,
  inject: ['platform', 'napcat', 'koishi'],
  provides: ['setup'],
  description: 'Koishi project scaffolding, offline dependency bundle and one-click setup.',
  async apply(api) {
    const setup = new SetupManager({
      settings: api.settings,
      logger: api.logger,
    })
    api.provide('setup', setup)
    api.registerRoutes(routes(api, setup))
    api.registerClientTab({ id: 'logs', title: { zh: '日志', en: 'Logs' }, order: 6 })
  },
}
