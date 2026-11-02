/**
 * Message feed plugin: recent inbound/outbound messages from the Koishi health
 * endpoint's ring buffer.
 */

import { fetchMessages } from './data.js'
import { clampInt, only, sendJson, urlParam } from '../../kernel/http.js'

export const name = 'messages'
export const version = '1.0.0'

export default {
  id: 'qqbot-messages',
  name,
  version,
  inject: ['koishi'],
  provides: [],
  description: 'Read-only message feed proxied from the Koishi health plugin.',
  async apply(api) {
    api.registerRoutes([
      {
        path: '/qqbot/messages',
        handler: (req, res) => only(req, res, ['GET'], async () => {
          const limit = clampInt(urlParam(req, 'limit'), 50, 1, 200)
          const feed = await fetchMessages(api.settings, { limit })
          sendJson(res, 200, { ok: feed.ok, data: feed, ...(feed.ok ? {} : { error: feed.error }) })
        }),
      },
    ])
    api.registerClientTab({ id: 'messages', title: { zh: '消息', en: 'Messages' }, order: 2 })
  },
}
