/** Fishing game package: services, admin snapshot and command metadata. */
import { FishingBagService, bagHelp } from './modules/fishing-bag.js'
import { FishingCastService, castHelp } from './modules/fishing-cast.js'
import { FishingPoolService, poolHelp } from './modules/fishing-pool.js'
import { FishingRodService, rodHelp } from './modules/fishing-rod.js'
import { FishingStorageService, storageHelp } from './modules/fishing-storage.js'
import { GachaService, gachaHelp } from './modules/gacha.js'
import { exchangeHelp } from './modules/exchange.js'
import { GameAdminService } from './admin.js'
import { UpStore } from './up-store.js'

export const FISHING_GAME = Object.freeze({
  id: 'fishing',
  name: { zh: '钓鱼', en: 'Fishing' },
  description: { zh: '抛竿、收竿、鱼仓与抽卡。', en: 'Cast, collect, warehouse and gacha.' },
})

export const FISHING_HELP = Object.freeze([
  ...exchangeHelp,
  ...gachaHelp,
  ...bagHelp,
  ...rodHelp,
  ...poolHelp,
  ...castHelp,
  ...storageHelp,
])

export class FishingGame {
  constructor({ projectDir, assetsDir, logger, castDurationMs = 300000, store = null }) {
    this.id = FISHING_GAME.id
    this.name = FISHING_GAME.name
    this.description = FISHING_GAME.description
    this.help = FISHING_HELP
    this.up = new UpStore({ projectDir, logger })
    this.gacha = new GachaService({ projectDir, assetsDir, logger, upStore: this.up })
    this.bag = new FishingBagService({ projectDir, assetsDir, logger })
    this.rod = new FishingRodService({ projectDir, assetsDir, logger })
    this.pool = new FishingPoolService({ projectDir, assetsDir, logger, upStore: this.up })
    this.cast = new FishingCastService({ projectDir, assetsDir, logger, castDurationMs })
    this.storage = new FishingStorageService({ projectDir, assetsDir, logger })
    this.admin = new GameAdminService({ projectDir, assetsDir, logger, store, upStore: this.up })
  }
}
