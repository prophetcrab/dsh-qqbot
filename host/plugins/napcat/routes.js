/**
 * NapCat HTTP routes. Handlers only translate HTTP <-> service calls.
 */

import { readFile } from 'node:fs/promises'
import { only, readBody, sendJson, stringField } from '../../kernel/http.js'
import { fetchContacts } from './contacts.js'

/** @param {object} api plugin API @param {object} napcat NapcatManager */
export function routes(api, napcat) {
  return [
    {
      path: '/qqbot/contacts',
      handler: (req, res) => only(req, res, ['GET'], async () => {
        const contacts = await fetchContacts(api.settings)
        sendJson(res, 200, { ok: contacts.ok, ...contacts })
      }),
    },
    {
      path: '/qqbot/napcat/login',
      handler: (req, res) => only(req, res, ['GET'], async () => {
        sendJson(res, 200, { ok: true, data: await napcat.loginState() })
      }),
    },
    {
      path: '/qqbot/napcat/qr',
      handler: (req, res) => only(req, res, ['GET'], async () => {
        const file = napcat.qrImagePath()
        try {
          const buffer = await readFile(file)
          res.writeHead(200, {
            'content-type': 'image/png',
            'content-length': String(buffer.length),
            'cache-control': 'no-store',
          })
          res.end(buffer)
        } catch {
          sendJson(res, 404, { ok: false, error: '登录二维码尚未生成，请先启动 NapCat' })
        }
      }),
    },
    {
      path: '/qqbot/napcat/qr/refresh',
      handler: (req, res) => only(req, res, ['POST'], async () => {
        sendJson(res, 200, await api.serialize(() => napcat.refreshQr()))
      }),
    },
    {
      path: '/qqbot/napcat/install',
      handler: (req, res) => only(req, res, ['POST'], async () => {
        sendJson(res, 200, await api.serialize(() => napcat.install()))
      }),
    },
    {
      path: '/qqbot/napcat/configure',
      handler: (req, res) => only(req, res, ['POST'], async () => {
        const body = await readBody(req)
        const uin = stringField(body, 'uin')
        sendJson(res, 200, await api.serialize(() => napcat.configure(uin === '' ? {} : { uin })))
      }),
    },
    {
      path: '/qqbot/napcat/start',
      handler: (req, res) => only(req, res, ['POST'], async () => {
        sendJson(res, 200, await api.serialize(() => napcat.start()))
      }),
    },
    {
      path: '/qqbot/napcat/stop',
      handler: (req, res) => only(req, res, ['POST'], async () => {
        sendJson(res, 200, await api.serialize(() => napcat.stop()))
      }),
    },
  ]
}
