/**
 * Koishi HTTP routes: project lifecycle, logs and plugin-tree management.
 */

import { clampInt, only, readBody, sendJson, stringField, urlParam } from '../../kernel/http.js'

/** @param {object} api plugin API @param {object} koishi KoishiManager @param {object} plugins KoishiPluginsManager */
export function routes(api, koishi, plugins) {
  return [
    {
      path: '/qqbot/logs',
      handler: (req, res) => only(req, res, ['GET'], async () => {
        const source = urlParam(req, 'source') ?? 'koishi'
        const lines = clampInt(urlParam(req, 'lines'), api.settings.logLines, 1, 2000)
        if (source === 'napcat') {
          // NapCat's console output is not captured by this plugin; its own WebUI
          // exposes logs. Return a hint instead of inventing content.
          sendJson(res, 200, { ok: true, lines: [], note: 'NapCat 日志请打开 NapCat WebUI → 日志 查看' })
          return
        }
        sendJson(res, 200, { ok: true, lines: await koishi.logs(lines) })
      }),
    },
    {
      path: '/qqbot/koishi/install-deps',
      handler: (req, res) => only(req, res, ['POST'], async () => {
        sendJson(res, 200, await api.serialize(() => koishi.installDeps()))
      }),
    },
    {
      path: '/qqbot/koishi/start',
      handler: (req, res) => only(req, res, ['POST'], async () => {
        sendJson(res, 200, await api.serialize(() => koishi.start()))
      }),
    },
    {
      path: '/qqbot/koishi/stop',
      handler: (req, res) => only(req, res, ['POST'], async () => {
        sendJson(res, 200, await api.serialize(() => koishi.stop()))
      }),
    },
    {
      path: '/qqbot/koishi/restart',
      handler: (req, res) => only(req, res, ['POST'], async () => {
        sendJson(res, 200, await api.serialize(() => koishi.restart()))
      }),
    },
    {
      path: '/qqbot/koishi/plugins',
      handler: (req, res) => only(req, res, ['GET'], async () => {
        sendJson(res, 200, { ok: true, data: await plugins.list() })
      }),
    },
    {
      path: '/qqbot/koishi/plugins/toggle',
      handler: (req, res) => only(req, res, ['POST'], async () => {
        const body = await readBody(req)
        const key = stringField(body, 'key')
        if (key === '') {
          sendJson(res, 400, { ok: false, error: 'key is required' })
          return
        }
        const enabled = body.enabled !== false
        const restart = body.restart === true
        sendJson(res, 200, await api.serialize(() => plugins.toggle(key, enabled, { restart })))
      }),
    },
    {
      path: '/qqbot/koishi/plugins/install',
      handler: (req, res) => only(req, res, ['POST'], async () => {
        const body = await readBody(req)
        const spec = stringField(body, 'spec')
        if (spec === '') {
          sendJson(res, 400, { ok: false, error: 'spec is required' })
          return
        }
        const restart = body.restart === true
        sendJson(res, 200, await api.serialize(() => plugins.install(spec, { restart })))
      }),
    },
    {
      path: '/qqbot/koishi/plugins/uninstall',
      handler: (req, res) => only(req, res, ['POST'], async () => {
        const body = await readBody(req)
        const key = stringField(body, 'key')
        if (key === '') {
          sendJson(res, 400, { ok: false, error: 'key is required' })
          return
        }
        const restart = body.restart === true
        sendJson(res, 200, await api.serialize(() => plugins.uninstall(key, { restart })))
      }),
    },
  ]
}
