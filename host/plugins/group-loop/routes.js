/** HTTP contract for the group listener loop. */
import { only, readBody, sendJson } from '../../kernel/http.js'
import { validateAnalyze, validateCompose, validateStateUpdate } from '../../services/group-loop/contracts.js'

function bodyOf(req, res, validate, run) {
  return only(req, res, ['POST'], async () => {
    const parsed = validate(await readBody(req, 32 * 1024 * 1024))
    if (parsed.ok !== true) {
      sendJson(res, 400, { ok: false, code: parsed.code ?? 'BAD_REQUEST', error: parsed.error })
      return
    }
    sendJson(res, 200, await run(parsed.value))
  })
}

export function routes(api, loop) {
  return [
    { path: '/qqbot/group/analyze', handler: (req, res) => bodyOf(req, res, validateAnalyze, (body) => loop.analyze(body)) },
    { path: '/qqbot/group/compose', handler: (req, res) => bodyOf(req, res, validateCompose, (body) => loop.compose(body)) },
    { path: '/qqbot/group/state-update', handler: (req, res) => bodyOf(req, res, validateStateUpdate, (body) => loop.stateUpdate(body)) },
    {
      path: '/qqbot/group/dashboard',
      handler: (req, res) => only(req, res, ['GET'], async () => {
        const groupId = new URL(req.url ?? '/', 'http://localhost').searchParams.get('groupId')
        sendJson(res, 200, { ok: true, data: await loop.dashboard(groupId) })
      }),
    },
  ]
}
