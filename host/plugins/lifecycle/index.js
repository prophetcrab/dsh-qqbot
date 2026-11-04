/**
 * Lifecycle plugin: the aggregated status route, one-click start/stop and the
 * first-run bootstrap. This is the "assembly" plugin of the control center.
 */

import { bootstrap } from './bootstrap.js'
import { installIdentitySync } from './identity-sync.js'
import { routes } from './routes.js'
import { createStatusProvider } from './status.js'
import { startLifecycleWatchdog, stopLifecycleWatchdog } from '../../services/lifecycle/guard.js'
import { stopAll } from '../../services/lifecycle/index.js'

export const name = 'lifecycle'
export const version = '1.0.0'

export default {
  id: 'qqbot-lifecycle',
  name,
  version,
  inject: ['platform', 'napcat', 'koishi', 'setup'],
  provides: ['lifecycle'],
  description: 'Status snapshot, one-click start/stop, first-run bootstrap and DSH-exit cleanup.',
  async apply(api) {
    api.registerRoutes(routes(api))
    api.registerStatusProvider(createStatusProvider(api))
    api.registerClientTab({ id: 'overview', title: { zh: '总览', en: 'Overview' }, order: 0 })

    // Tie both services to this DSH host. The watchdog covers a hard kill; the
    // effect disposer covers a normal plugin unload/DSH shutdown.
    const napcat = api.get('napcat')
    const koishi = api.get('koishi')
    const watchdog = startLifecycleWatchdog(api.settings)
    let shuttingDown = false
    const shutdown = async () => {
      if (shuttingDown) return
      shuttingDown = true
      try {
        if (napcat !== undefined && koishi !== undefined) {
          await api.serialize(() => stopAll({ napcat, koishi }))
        }
      } catch {
        // best effort during shutdown
      } finally {
        stopLifecycleWatchdog(watchdog)
      }
    }
    if (typeof api.ctx?.effect === 'function') api.ctx.effect(() => () => { void shutdown() })

    if (api.settings.bootstrap === false) return
    // Never blocks plugin activation; every step is retryable from the panel.
    void bootstrap(api)
    if (typeof api.ctx?.effect === 'function') api.ctx.effect(() => installIdentitySync(api))
    else installIdentitySync(api)
  },
}
