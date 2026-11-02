/** HTTP contract for the group listener loop. */
import { only, readBody, sendJson } from '../../kernel/http.js'

export function routes(api, loop) {
  const post = (path, run) => ({
    path,
    handler: (req, res) => only(req, res, ['POST'], async () => {
      const body = await readBody(req, 1024 * 1024)
      sendJson(res, 200, await run(body))
    }),
  })
  return [
    post('/qqbot/group/analyze', (body) => loop.analyze(body)),
    post('/qqbot/group/compose', (body) => loop.compose(body)),
    post('/qqbot/group/state-update', (body) => loop.stateUpdate(body)),
    {
      path: '/qqbot/group/dashboard',
      handler: (req, res) => only(req, res, ['GET'], async () => {
        sendJson(res, 200, { ok: true, data: await loop.dashboard() })
      }),
    },
  ]
}
