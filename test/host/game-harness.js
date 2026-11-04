/** Test-only composition of the shared game core and the standalone fishing plugin. */
import { GameCore } from '../../host/services/game-core/index.js'
import { FishingGame } from '../../host/services/game-fishing/index.js'

export function createGame(options) {
  const core = new GameCore(options)
  const fishing = new FishingGame({ ...options, store: core.store })
  core.registerHelp(fishing.id, fishing.help)
  const sharedCommand = core.command.bind(core)
  const command = async (input) => {
    const result = await sharedCommand(input)
    if (result.ok !== false || result.error !== 'invalid command') return result
    const fish = await fishing.command(input)
    if (fish.ok !== false || fish.error !== 'invalid command') return fish
    return result
  }
  return Object.assign(core, {
    fishing,
    command,
    admin: fishing.admin,
    up: fishing.up,
    cast: fishing.cast,
    gacha: fishing.gacha,
    bag: fishing.bag,
    rod: fishing.rod,
    pool: fishing.pool,
    storage: fishing.storage,
  })
}
