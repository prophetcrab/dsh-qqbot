/**
 * Install plugin: GitHub environment reinstall, Koishi scaffolding and one-click setup.
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
  description: 'GitHub environment reinstall: Koishi template sync, dependencies, NapCat Docker and OneBot config.',
  async apply(api) {
    const setup = new SetupManager({
      settings: api.settings,
      logger: api.logger,
      deps: { services: { napcat: api.get('napcat'), koishi: api.get('koishi') } },
    })
    api.provide('setup', setup)
    api.registerRoutes(routes(api, setup))
    api.registerClientTab({ id: 'logs', title: { zh: '日志', en: 'Logs' }, order: 6 })
  },
}
