/**
 * Install HTTP routes: setup status, Koishi dependency install, one-click
 * full setup and the managed log tail.
 */

import { only, readBody, sendJson } from '../../kernel/http.js'
import { runFullSetup } from './full-setup.js'

/** @param {object} api plugin API @param {object} setup SetupManager */
export function routes(api, setup) {
  return [
    {
      path: '/qqbot/setup',
      handler: (req, res) => only(req, res, ['GET'], async () => {
        sendJson(res, 200, { ok: true, data: await setup.status() })
      }),
    },
    {
      path: '/qqbot/setup/koishi',
      handler: (req, res) => only(req, res, ['POST'], async () => {
        const body = await readBody(req)
        sendJson(res, 200, await api.serialize(() => setup.installDeps({ force: body.force === true })))
      }),
    },
    {
      path: '/qqbot/setup/full',
      handler: (req, res) => only(req, res, ['POST'], async () => {
        sendJson(res, 200, await api.serialize(() => runFullSetup({ api, setup })))
      }),
    },
  ]
}
