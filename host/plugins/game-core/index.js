/** Deterministic game core: per-group player state and slash commands. */
import { GameCore } from '../../services/game-core/index.js'
import { routes } from './routes.js'

export const name = 'game-core'
export const version = '1.0.0'

export default {
  id: 'qqbot-game-core',
  name,
  version,
  provides: ['gameCore'],
  description: 'Per-group player library, deterministic commands and future mini-game modules.',
  async apply(api) {
    const game = new GameCore({ projectDir: api.settings.projectDir, logger: api.logger })
    api.provide('gameCore', game)
    api.registerRoutes(routes(api, game))
  },
}
