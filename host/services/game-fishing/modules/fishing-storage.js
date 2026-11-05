/** Fish warehouse view and sell-by-id commands. */
import { catalogFor, resolveAssetsDir } from '../catalog.js'
import { ensureFishing, recordFishCaught } from './fishing-state.js'
import { renderWarehouseCard } from '../render/warehouse-card.js'

export const storageHelp = Object.freeze([
  ['/钓鱼 鱼仓', '查看鱼仓长图，每条鱼带纯数字编号'],
  ['/钓鱼 卖鱼 编号', '按编号出售鱼获'],
])

function money(value) {
  return Number.isSafeInteger(value) ? value : 0
}

export class FishingStorageService {
  constructor({ projectDir, logger, assetsDir }) {
    this.logger = logger
    this.catalog = catalogFor(resolveAssetsDir(projectDir, assetsDir))
  }

  async execute({ rawCommand, groupId, userId, store }) {
    const parts = String(rawCommand).trim().split(/\s+/u)
    if (parts[0] !== '/钓鱼' || (parts[1] !== '鱼仓' && parts[1] !== '卖鱼')) return null
    try {
      this.catalog.assertReady(['fish'])
    } catch (error) {
      this.logger?.warn?.('fish warehouse catalog failed: %s', String(error?.message ?? error))
      return { ok: false, error: 'fish warehouse catalog unavailable' }
    }
    if (parts[1] === '鱼仓') {
      if (parts.length !== 2) return { ok: true, replies: ['用法：/钓鱼 鱼仓'] }
      return this.view({ groupId, userId, store })
    }
    if (parts.length !== 3 || !/^[0-9]+$/u.test(parts[2])) return { ok: true, replies: ['用法：/钓鱼 卖鱼 编号'] }
    return this.sell({ groupId, userId, id: Number(parts[2]), store })
  }

  async view({ groupId, userId, store }) {
    const state = await store.read(groupId)
    const player = state.players[userId]
    if (player === undefined) return { ok: true, replies: ['你还没有在本群注册，先发送 /注册。'] }
    const fishing = ensureFishing(player)
    const entries = [...fishing.fishWarehouse].sort((a, b) => a.id - b.id)
    const total = entries.reduce((sum, entry) => sum + money(entry.value), 0)
    const text = `钓鱼鱼仓\n共有 ${entries.length} 条鱼 · 总价值 ${total} 钓鱼币\n使用 /钓鱼 卖鱼 编号 出售`
    let image
    try {
      image = await renderWarehouseCard({
        nickname: player.nickname || userId,
        entries,
        fishById: this.catalog.fishById,
        assetsDir: this.catalog.assetsDir,
      })
    } catch (error) {
      this.logger?.warn?.('warehouse image failed: %s', String(error?.message ?? error))
    }
    return { ok: true, replies: [text], ...(image === undefined ? {} : { image }) }
  }

  async sell({ groupId, userId, id, store }) {
    return store.mutate(groupId, (state) => {
      const player = state.players[userId]
      if (player === undefined) return { ok: true, replies: ['你还没有在本群注册，先发送 /注册。'] }
      const fishing = ensureFishing(player)
      const index = fishing.fishWarehouse.findIndex((entry) => entry.id === id)
      if (index < 0) return { ok: true, replies: [`鱼仓里没有 #${id}。`] }
      const [fish] = fishing.fishWarehouse.splice(index, 1)
      // Selling must not erase the codex record of the heaviest catch.
      recordFishCaught(fishing, fish.fishId, fish.weightKg, typeof fish.caughtAt === 'string' ? fish.caughtAt : null)
      const value = money(fish.value)
      player.fishingCoins = money(player.fishingCoins) + value
      return { ok: true, replies: [`已卖出 #${id}「${fish.name}」${fish.weightKg}kg，+${value} 钓鱼币。当前钓鱼币 ${player.fishingCoins}。`] }
    })
  }
}
