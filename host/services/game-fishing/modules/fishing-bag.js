/** Read-only fishing item library command and image response. */
import { catalogFor, resolveAssetsDir } from '../catalog.js'
import { ensureFishing } from './fishing-state.js'
import { renderBagCard } from '../render/bag-card.js'

export const bagHelp = Object.freeze([
  ['/钓鱼 道具库', '查看鱼竿、鱼饵和抽卡券长图'],
])

function number(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : 0
}

export class FishingBagService {
  constructor({ projectDir, logger, assetsDir }) {
    this.logger = logger
    this.catalog = catalogFor(resolveAssetsDir(projectDir, assetsDir))
  }

  async execute({ rawCommand, groupId, userId, store }) {
    if (String(rawCommand).trim() !== '/钓鱼 道具库') return null
    let catalog
    try {
      catalog = this.catalog.assertReady(['rods', 'baits'])
    } catch (error) {
      this.logger?.warn?.('fishing bag catalog failed: %s', String(error?.message ?? error))
      return { ok: false, error: 'fishing bag catalog unavailable' }
    }
    const state = await store.read(groupId)
    const player = state.players[userId]
    if (player === undefined) return { ok: true, replies: ['你还没有在本群注册，先发送 /注册。'] }
    const fishing = ensureFishing(player)
    const sortByTier = (a, b) => a.tier - b.tier || a.name.localeCompare(b.name, 'zh')
    const allRods = fishing.rods.owned
      .map((id) => catalog.rodById.get(id))
      .filter((rod) => rod !== undefined)
      .sort(sortByTier)
      .map((rod) => ({ ...rod, badge: rod.id === fishing.rods.equipped ? '装备中' : null }))
    const allBaits = Object.entries(fishing.baits.counts)
      .map(([id, count]) => {
        const bait = catalog.baitById.get(id)
        return bait === undefined || number(count) <= 0 ? null : { ...bait, count: number(count), badge: id === fishing.baits.selected ? '已选' : null }
      })
      .filter((bait) => bait !== null)
      .sort(sortByTier)
    const equipped = fishing.rods.equipped === null ? null : catalog.rodById.get(fishing.rods.equipped)
    const selected = fishing.baits.selected === null ? null : catalog.baitById.get(fishing.baits.selected)
    const data = {
      rods: allRods,
      baits: allBaits,
      tickets: fishing.tickets,
      fishingCoins: number(player.fishingCoins),
      equippedName: equipped?.name ?? null,
      selectedName: selected?.name ?? null,
      totalRods: allRods.length,
      totalBaits: allBaits.length,
    }
    const text = `钓鱼道具库\n鱼竿 ${allRods.length} 把 · 鱼饵 ${allBaits.length} 种 · 单抽券 ${data.tickets.singleTickets} · 十连券 ${data.tickets.tenTickets}`
    let image
    try {
      image = await renderBagCard({ nickname: player.nickname || userId, data, assetsDir: this.catalog.assetsDir })
    } catch (error) {
      this.logger?.warn?.('fishing bag image failed: %s', String(error?.message ?? error))
    }
    return { ok: true, replies: [text], ...(image === undefined ? {} : { image }) }
  }
}
