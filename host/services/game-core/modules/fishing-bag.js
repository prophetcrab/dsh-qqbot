/** Read-only fishing item library command and image response. */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { renderBagCard } from '../render/bag-card.js'

export const bagHelp = Object.freeze([
  ['/钓鱼 道具库 [页码]', '查看鱼竿、鱼饵和抽卡券，超过 14 件自动分页'],
])

const PACKAGE_ASSETS = fileURLToPath(new URL('../../../../assets/', import.meta.url))
const ROD_PAGE_SIZE = 14
const BAIT_PAGE_SIZE = 14

function readCatalog(assetsDir, name, key) {
  const parsed = JSON.parse(readFileSync(join(assetsDir, name, 'catalog.json'), 'utf8'))
  if (!Array.isArray(parsed[key])) throw new Error(`invalid catalog: ${name}`)
  return parsed[key]
}

function number(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : 0
}

function normalizeFishing(player) {
  const fishing = player.fishing !== null && typeof player.fishing === 'object' ? player.fishing : {}
  const tickets = fishing.tickets !== null && typeof fishing.tickets === 'object' ? fishing.tickets : {}
  const rods = fishing.rods !== null && typeof fishing.rods === 'object' ? fishing.rods : {}
  const baits = fishing.baits !== null && typeof fishing.baits === 'object' ? fishing.baits : {}
  return {
    tickets: { singleTickets: number(tickets.singleTickets), tenTickets: number(tickets.tenTickets) },
    ownedRods: Array.isArray(rods.owned) ? rods.owned.filter((id) => typeof id === 'string') : [],
    equippedRod: typeof rods.equipped === 'string' ? rods.equipped : null,
    baitCounts: baits.counts !== null && typeof baits.counts === 'object' ? baits.counts : {},
    selectedBait: typeof baits.selected === 'string' ? baits.selected : null,
  }
}

export class FishingBagService {
  constructor({ projectDir, logger, assetsDir }) {
    this.logger = logger
    this.assetsDir = assetsDir ?? (existsSync(join(projectDir, 'assets', 'rods', 'catalog.json')) ? join(projectDir, 'assets') : PACKAGE_ASSETS)
    this.loaded = false
    this.rods = new Map()
    this.baits = new Map()
  }

  load() {
    if (this.loaded) return
    for (const rod of readCatalog(this.assetsDir, 'rods', 'rods')) this.rods.set(rod.id, rod)
    for (const bait of readCatalog(this.assetsDir, 'baits', 'baits')) this.baits.set(bait.id, bait)
    this.loaded = true
  }

  async execute({ rawCommand, groupId, userId, store }) {
    const match = String(rawCommand).trim().match(/^\/钓鱼\s+道具库(?:\s+(\d+))?$/u)
    if (match === null) return null
    const page = match[1] === undefined ? 1 : Number(match[1])
    if (!Number.isSafeInteger(page) || page < 1) return { ok: true, replies: ['用法：/钓鱼 道具库 [页码]'] }
    try { this.load() } catch (error) {
      this.logger?.warn?.('fishing bag catalog failed: %s', String(error?.message ?? error))
      return { ok: false, error: 'fishing bag catalog unavailable' }
    }
    const state = await store.read(groupId)
    const player = state.players[userId]
    if (player === undefined) return { ok: true, replies: ['你还没有在本群注册，先发送 /注册。'] }
    const normalized = normalizeFishing(player)
    const allRods = normalized.ownedRods
      .map((id) => this.rods.get(id))
      .filter((rod) => rod !== undefined)
      .sort((a, b) => a.tier - b.tier || a.name.localeCompare(b.name, 'zh'))
      .map((rod) => ({ ...rod, badge: rod.id === normalized.equippedRod ? '装备中' : null }))
    const allBaits = Object.entries(normalized.baitCounts)
      .map(([id, count]) => {
        const bait = this.baits.get(id)
        return bait === undefined || number(count) <= 0 ? null : { ...bait, count: number(count), badge: id === normalized.selectedBait ? '已选' : null }
      })
      .filter((bait) => bait !== null)
      .sort((a, b) => a.tier - b.tier || a.name.localeCompare(b.name, 'zh'))
    const equipped = normalized.equippedRod === null ? null : this.rods.get(normalized.equippedRod)
    const selected = normalized.selectedBait === null ? null : this.baits.get(normalized.selectedBait)
    const totalPages = Math.max(1, Math.ceil(allRods.length / ROD_PAGE_SIZE), Math.ceil(allBaits.length / BAIT_PAGE_SIZE))
    if (page > totalPages) return { ok: true, replies: [`道具库只有 ${totalPages} 页。`] }
    const rods = allRods.slice((page - 1) * ROD_PAGE_SIZE, page * ROD_PAGE_SIZE)
    const baits = allBaits.slice((page - 1) * BAIT_PAGE_SIZE, page * BAIT_PAGE_SIZE)
    const data = {
      rods,
      baits,
      tickets: normalized.tickets,
      fishingCoins: number(player.fishingCoins),
      equippedName: equipped?.name ?? null,
      selectedName: selected?.name ?? null,
      page,
      totalPages,
      totalRods: allRods.length,
      totalBaits: allBaits.length,
    }
    const text = `钓鱼道具库 · 第 ${page}/${totalPages} 页\n鱼竿 ${allRods.length} 把 · 鱼饵 ${allBaits.length} 种 · 单抽券 ${data.tickets.singleTickets} · 十连券 ${data.tickets.tenTickets}`
    let image
    try {
      image = await renderBagCard({ nickname: player.nickname || userId, data, assetsDir: this.assetsDir })
    } catch (error) {
      this.logger?.warn?.('fishing bag image failed: %s', String(error?.message ?? error))
    }
    return { ok: true, replies: [text], ...(image === undefined ? {} : { image }) }
  }
}
