/**
 * Access HTTP routes: read or replace the policy document.
 */

import { only, readBody, sendJson } from '../../kernel/http.js'

/** @param {object} api plugin API @param {object} access access service */
export function routes(api, access) {
  return [
    {
      path: '/qqbot/access',
      handler: (req, res) => only(req, res, ['GET', 'POST'], async () => {
        if (req.method === 'GET') {
          const { policy, exists, error } = await access.read()
          sendJson(res, 200, { ok: true, data: policy, exists, ...(error ? { warning: error } : {}) })
          return
        }
        const body = await readBody(req)
        const policy = await api.serialize(() => access.write(body))
        sendJson(res, 200, { ok: true, data: policy })
      }),
    },
  ]
}
