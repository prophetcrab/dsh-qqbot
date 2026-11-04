/**
 * Lifecycle HTTP routes: status + one-click start/stop. All mutation goes
 * through the kernel's shared serializer so two clicks cannot race.
 */

import { only, sendJson } from '../../kernel/http.js'
import { startAll, stopAll } from '../../services/lifecycle/index.js'

/**
 * Run one all-start/all-stop action with the registered services.
 *
 * @param {object} api plugin API
 * @param {'all-start'|'all-stop'} action
 */
async function runLifecycle(api, action) {
  const services = { napcat: api.get('napcat'), koishi: api.get('koishi') }
  if (services.napcat === undefined || services.koishi === undefined) {
    return { ok: false, steps: [], message: 'NapCat/Koishi 服务尚未加载' }
  }
  if (action === 'all-start') return startAll(services)
  if (action === 'all-stop') return stopAll(services)
  return { ok: false, steps: [], message: `未知的启停动作：${action}` }
}

/** @param {object} api plugin API */
export function routes(api) {
  return [
    {
      path: '/qqbot/status',
      handler: (req, res) => only(req, res, ['GET'], async () => {
        sendJson(res, 200, { ok: true, data: await api.kernel.statusSnapshot() })
      }),
    },
    {
      path: '/qqbot/all/start',
      handler: (req, res) => only(req, res, ['POST'], async () => {
        sendJson(res, 200, await api.serialize(() => runLifecycle(api, 'all-start')))
      }),
    },
    {
      path: '/qqbot/all/stop',
      handler: (req, res) => only(req, res, ['POST'], async () => {
        sendJson(res, 200, await api.serialize(() => runLifecycle(api, 'all-stop')))
      }),
    },
  ]
}
