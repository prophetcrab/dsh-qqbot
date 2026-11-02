/**
 * Features plugin: aggregates the built-in feature cards and exposes the
 * feature endpoints + client tab.
 */

import { BUILTIN_FEATURES } from './builtins.js'
import { routes } from './routes.js'

export const name = 'features'
export const version = '1.0.0'

export default {
  id: 'qqbot-features',
  name,
  version,
  inject: ['platform', 'napcat', 'koishi', 'koishiPlugins', 'access', 'lifecycle'],
  provides: ['features'],
  description: 'Built-in feature cards (overview/lifecycle/setup/plugins/access) and their actions.',
  async apply(api) {
    for (const feature of BUILTIN_FEATURES) api.registerFeature(feature)
    api.registerRoutes(routes(api))
    api.registerClientTab({ id: 'features', title: { zh: '功能', en: 'Features' }, order: 5 })
  },
}
