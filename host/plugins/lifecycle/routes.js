/**
 * Lifecycle HTTP routes: status + one-click start/stop. All mutation goes
 * through the kernel's shared serializer so two clicks cannot race.
 */

import { only, sendJson } from '../../kernel/http.js'

/** Run a lifecycle feature action, reporting a missing feature as a failure. */
async function runFeature(api, action) {
  try {
    const result = await api.kernel.featureRegistry.run('lifecycle', action, {})
    return { ok: result?.ok !== false, steps: result?.steps ?? [], message: result?.message }
  } catch (error) {
    return { ok: false, steps: [], message: String(error?.message ?? error) }
  }
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
        sendJson(res, 200, await api.serialize(() => runFeature(api, 'all-start')))
      }),
    },
    {
      path: '/qqbot/all/stop',
      handler: (req, res) => only(req, res, ['POST'], async () => {
        sendJson(res, 200, await api.serialize(() => runFeature(api, 'all-stop')))
      }),
    },
  ]
}
