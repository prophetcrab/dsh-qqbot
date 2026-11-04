/** Client-console routes for groups, games and per-group UP. */
import { only, readBody, sendJson, stringField, urlParam } from '../../kernel/http.js'

function bad(res, error) {
  sendJson(res, 400, { ok: false, error })
}

export function adminRoutes(api, game) {
  return [
    {
      path: '/qqbot/game/admin/groups',
      handler: (req, res) => only(req, res, ['GET'], async () => {
        const data = await game.admin.listGroups()
        sendJson(res, 200, { ok: true, data })
      }),
    },
    {
      path: '/qqbot/game/admin/group',
      handler: (req, res) => only(req, res, ['GET'], async () => {
        const groupId = urlParam(req, 'groupId') ?? ''
        if (groupId === '') return bad(res, 'groupId is required')
        const data = await game.admin.getGroup(groupId)
        sendJson(res, 200, { ok: true, data })
      }),
    },
    {
      path: '/qqbot/game/admin/game',
      handler: (req, res) => only(req, res, ['GET'], async () => {
        const groupId = urlParam(req, 'groupId') ?? ''
        const gameId = urlParam(req, 'gameId') ?? 'fishing'
        if (groupId === '') return bad(res, 'groupId is required')
        const data = await game.admin.getGame(groupId, gameId)
        sendJson(res, 200, { ok: true, data })
      }),
    },
    {
      path: '/qqbot/game/admin/up',
      handler: (req, res) => only(req, res, ['POST'], async () => {
        const body = await readBody(req)
        const groupId = stringField(body, 'groupId')
        const gameId = stringField(body, 'gameId') || 'fishing'
        const rodId = stringField(body, 'rodId')
        const baitId = stringField(body, 'baitId')
        if (groupId === '' || rodId === '' || baitId === '') return bad(res, 'groupId, rodId and baitId are required')
        const data = await game.admin.setGameUp(groupId, gameId, { rodId, baitId })
        sendJson(res, 200, { ok: true, data })
      }),
    },
  ]
}
