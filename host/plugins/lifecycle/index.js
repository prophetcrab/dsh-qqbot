/**
 * Lifecycle plugin: the aggregated status route, one-click start/stop and the
 * first-run bootstrap. This is the "assembly" plugin of the control center.
 */

import { bootstrap } from './bootstrap.js'
import { installIdentitySync } from './identity-sync.js'
import { routes } from './routes.js'
import { createStatusProvider } from './status.js'

export const name = 'lifecycle'
export const version = '1.0.0'

export default {
  id: 'qqbot-lifecycle',
  name,
  version,
  inject: ['platform', 'napcat', 'koishi', 'setup'],
  provides: ['lifecycle'],
  description: 'Status snapshot, one-click start/stop and first-run bootstrap.',
  async apply(api) {
    api.registerRoutes(routes(api))
    api.registerStatusProvider(createStatusProvider(api))
    api.registerClientTab({ id: 'overview', title: { zh: '总览', en: 'Overview' }, order: 0 })
    if (api.settings.bootstrap === false) return
    // Never blocks plugin activation; every step is retryable from the panel.
    void bootstrap(api)
    if (typeof api.ctx?.effect === 'function') api.ctx.effect(() => installIdentitySync(api))
    else installIdentitySync(api)
  },
}
