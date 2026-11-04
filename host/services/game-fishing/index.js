/** Fishing game package: services, admin snapshot and command metadata. */
import { FishingBagService, bagHelp } from './modules/fishing-bag.js'
import { FishingCastService, castHelp } from './modules/fishing-cast.js'
import { FishingPoolService, poolHelp } from './modules/fishing-pool.js'
import { FishingRodService, rodHelp } from './modules/fishing-rod.js'
import { FishingStorageService, storageHelp } from './modules/fishing-storage.js'
import { GachaService, gachaHelp } from './modules/gacha.js'
import { exchangeHelp, executeExchange } from './modules/exchange.js'
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
  constructor({ projectDir, assetsDir, logger, castDurationMs = 300000, store = null, random = Math.random, now = () => new Date() }) {
    this.random = random
    this.now = now
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

  async command(input) {
    const rawCommand = String(input?.command ?? '').slice(0, 120).trim()
    const groupId = String(input?.groupId ?? '')
    const userId = String(input?.userId ?? '')
    if (groupId === '' || userId === '') return { ok: false, error: 'invalid command' }
    const exchange = await executeExchange({
      rawCommand, groupId, userId, nickname: String(input?.nickname ?? ''), store: this.admin.store,
    })
    if (exchange !== null) return exchange
    const gacha = await this.gacha.execute({
      rawCommand, groupId, userId, store: this.admin.store, random: this.random, now: this.now(),
    })
    if (gacha !== null) return gacha
    const bag = await this.bag.execute({ rawCommand, groupId, userId, store: this.admin.store })
    if (bag !== null) return bag
    const rod = await this.rod.execute({ rawCommand, groupId, userId, store: this.admin.store })
    if (rod !== null) return rod
    const pool = await this.pool.execute({ rawCommand, groupId, userId, store: this.admin.store })
    if (pool !== null) return pool
    const cast = await this.cast.execute({ rawCommand, groupId, userId, store: this.admin.store, random: this.random, now: this.now() })
    if (cast !== null) return cast
    const storage = await this.storage.execute({ rawCommand, groupId, userId, store: this.admin.store })
    if (storage !== null) return storage
    if (rawCommand === '/钓鱼' || rawCommand.startsWith('/钓鱼 ')) {
      return { ok: true, replies: ['用法：\n/钓鱼 抛竿 [鱼饵名]\n/钓鱼 收竿\n/钓鱼 鱼仓\n/钓鱼 卖鱼 编号\n/钓鱼 抽卡\n/钓鱼 十连\n/钓鱼 卡池\n/钓鱼 道具库\n/钓鱼 查看鱼竿\n/钓鱼 更换鱼竿 鱼竿名\n/钓鱼 兑换金币 数量'] }
    }
    return { ok: false, error: 'invalid command' }
  }
}
