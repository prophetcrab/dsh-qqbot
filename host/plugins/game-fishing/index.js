/** Independent fishing game plugin: routes, admin UI and game command dispatch. */
import { FishingGame } from '../../services/game-fishing/index.js'
import { routes } from './routes.js'

export const name = 'game-fishing'
export const version = '1.0.0'

export default {
  id: 'qqbot-game-fishing',
  name,
  version,
  inject: ['gameCore'],
  provides: ['gameFishing'],
  description: 'Standalone fishing game: cast, warehouse, equipment and gacha.',
  async apply(api) {
    const core = api.get('gameCore')
    const fishing = new FishingGame({
      projectDir: api.settings.projectDir,
      logger: api.logger,
      store: core.store,
    })
    api.provide('gameFishing', fishing)
    core.registerHelp(fishing.id, fishing.help)
    api.registerRoutes(routes(api, fishing))
    api.registerClientTab({ id: 'games', title: { zh: '小游戏', en: 'Mini Games' }, order: 7 })
  },
}
