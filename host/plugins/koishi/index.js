/**
 * Koishi plugin: manage the local Koishi project and its plugin tree.
 */

import { KoishiManager } from '../../services/koishi/index.js'
import { KoishiPluginsManager } from '../../services/koishi/plugins.js'
import { routes } from './routes.js'
import { tools } from './tools.js'
import { createStatusProvider } from './status.js'

export const name = 'koishi'
export const version = '1.0.0'

export default {
  id: 'qqbot-koishi',
  name,
  version,
  inject: ['platform'],
  provides: ['koishi', 'koishiPlugins'],
  description: 'Koishi project lifecycle, health probing, logs and plugin management.',
  async apply(api) {
    const koishi = new KoishiManager({
      settings: api.settings,
      logger: api.logger,
    })
    const plugins = new KoishiPluginsManager({
      koishi,
      settings: api.settings,
      logger: api.logger,
    })
    api.provide('koishi', koishi)
    api.provide('koishiPlugins', plugins)
    api.registerRoutes(routes(api, koishi, plugins))
    for (const tool of tools(api, plugins)) api.registerTool(tool)
    api.registerStatusProvider(createStatusProvider(koishi))
    api.registerClientTab({ id: 'plugins', title: { zh: '插件', en: 'Plugins' }, order: 4 })
  },
}
