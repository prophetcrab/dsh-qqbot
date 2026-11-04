import { only, readBody, sendJson, stringField } from '../../kernel/http.js'

export function routes(api, game) {
  return [{
    path: '/qqbot/game/command',
    handler: (req, res) => only(req, res, ['POST'], async () => {
      const body = await readBody(req)
      const result = await game.command({
        groupId: stringField(body, 'groupId'),
        userId: stringField(body, 'userId'),
        nickname: stringField(body, 'nickname'),
        command: stringField(body, 'command'),
      })
      sendJson(res, result.ok === false ? 400 : 200, result)
    }),
  }]
}
