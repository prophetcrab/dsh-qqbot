/**
 * Feature HTTP routes: descriptor+status list, action execution and the client
 * tab contribution endpoint.
 */

import { only, readBody, sendJson, stringField } from '../../kernel/http.js'

/** @param {object} api plugin API */
export function routes(api) {
  return [
    {
      path: '/qqbot/features',
      handler: (req, res) => only(req, res, ['GET'], async () => {
        const featureStatus = await api.kernel.featureRegistry.statusAll()
        sendJson(res, 200, {
          ok: true,
          data: api.kernel.featureRegistry.list().map((feature) => ({
            ...feature,
            status: featureStatus[feature.id]?.status ?? null,
            error: featureStatus[feature.id]?.error ?? null,
          })),
        })
      }),
    },
    {
      path: '/qqbot/features/run',
      handler: (req, res) => only(req, res, ['POST'], async () => {
        const body = await readBody(req)
        const featureId = stringField(body, 'feature')
        const actionId = stringField(body, 'action')
        if (featureId === '' || actionId === '') {
          sendJson(res, 400, { ok: false, error: 'feature and action are required' })
          return
        }
        const result = await api.kernel.featureRegistry.run(featureId, actionId, body.params ?? {})
        sendJson(res, 200, { ok: result?.ok !== false, data: result })
      }),
    },
    {
      path: '/qqbot/client/tabs',
      handler: (req, res) => only(req, res, ['GET'], async () => {
        sendJson(res, 200, { ok: true, data: api.kernel.listClientTabs() })
      }),
    },
  ]
}
