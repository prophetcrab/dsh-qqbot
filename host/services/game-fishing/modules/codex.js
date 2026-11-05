/** `/钓鱼 图鉴`: collection overview for rods, baits and fish. */
import { catalogFor, resolveAssetsDir } from '../catalog.js'
import { ensureFishing } from './fishing-state.js'
import { renderCodexCard } from '../render/codex-card.js'

export const codexHelp = Object.freeze([
  ['/钓鱼 图鉴', '查看鱼竿、鱼饵和鱼的全图鉴长图'],
])

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function count(value) {
  return Number.isSafeInteger(value) && value > 0 ? value : 0
}

/** ISO timestamp -> `YYYY-MM-DD` in Asia/Shanghai, or null. */
export function formatAcquiredAt(value) {
  if (typeof value !== 'string' || value === '') return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(date)
  } catch {
    return value.slice(0, 10)
  }
}

/** Trim a kg value to at most two decimals; `1.50` -> `1.5`, `10.00` -> `10`. */
export function formatWeight(value) {
  const weight = Number(value)
  if (!Number.isFinite(weight) || weight <= 0) return null
  return String(Math.round(weight * 100) / 100)
}

function sortByTierAndName(items) {
  return items.slice().sort((left, right) => {
    const tier = Number(left.tier) - Number(right.tier)
    if (tier !== 0 && Number.isFinite(tier)) return tier
    return String(left.name ?? '').localeCompare(String(right.name ?? ''), 'zh')
  })
}

/** Heaviest weight per fish id currently sitting in the warehouse. */
function warehouseMax(fishWarehouse) {
  const result = new Map()
  for (const fish of Array.isArray(fishWarehouse) ? fishWarehouse : []) {
    const id = typeof fish?.fishId === 'string' ? fish.fishId : ''
    const weight = Number(fish?.weightKg)
    if (id === '' || !Number.isFinite(weight) || weight <= 0) continue
    const previous = result.get(id) ?? 0
    if (weight > previous) result.set(id, weight)
  }
  return result
}

/**
 * Build the renderer-facing codex snapshot.
 *
 * Legacy saves are merged in: rods in `rods.owned`, baits with a positive
 * stock count and fish still in the warehouse all count as obtained, with an
 * unknown acquisition date where the codex has no record yet.
 *
 * @param {{ fishing: any, rods: any[], baits: any[], fish: any[] }} input
 */
export function buildCodex({ fishing, rods, baits, fish }) {
  const state = object(fishing)
  const codex = object(state.codex)
  const codexRods = object(codex.rods)
  const codexBait = object(codex.baits)
  const codexFish = object(codex.fish)
  const ownedRods = new Set(Array.isArray(state.rods?.owned) ? state.rods.owned : [])
  const baitCounts = object(state.baits?.counts)
  const stockedFish = warehouseMax(state.fishWarehouse)

  const rodRows = sortByTierAndName(Array.isArray(rods) ? rods : []).map((rod) => {
    const record = object(codexRods[rod.id])
    const owned = codexRods[rod.id] !== undefined || ownedRods.has(rod.id)
    const acquiredAt = typeof record.at === 'string' ? record.at : null
    return {
      id: rod.id,
      name: String(rod.name ?? rod.id),
      tier: Number(rod.tier) || 1,
      asset: String(rod.asset ?? ''),
      owned,
      acquiredAt,
      acquiredLabel: owned ? (formatAcquiredAt(acquiredAt) ?? '时间未知') : null,
    }
  })

  const baitRows = sortByTierAndName(Array.isArray(baits) ? baits : []).map((bait) => {
    const record = object(codexBait[bait.id])
    const owned = codexBait[bait.id] !== undefined || count(baitCounts[bait.id]) > 0
    const acquiredAt = typeof record.at === 'string' ? record.at : null
    return {
      id: bait.id,
      name: String(bait.name ?? bait.id),
      tier: Number(bait.tier) || 1,
      asset: String(bait.asset ?? ''),
      owned,
      acquiredAt,
      acquiredLabel: owned ? (formatAcquiredAt(acquiredAt) ?? '时间未知') : null,
    }
  })

  const fishRows = sortByTierAndName(Array.isArray(fish) ? fish : []).map((item) => {
    const record = object(codexFish[item.id])
    const recorded = Number(record.maxWeightKg)
    const stored = stockedFish.get(item.id)
    const best = Number.isFinite(recorded) && recorded > 0
      ? recorded
      : (stored !== undefined && stored > 0 ? stored : null)
    return {
      id: item.id,
      name: String(item.name ?? item.id),
      tier: Number(item.tier) || 1,
      asset: String(item.asset ?? ''),
      owned: best !== null,
      maxWeightKg: best,
      maxWeightLabel: best === null ? null : `${formatWeight(best)}kg`,
    }
  })

  const summary = {
    rodsOwned: rodRows.filter((row) => row.owned).length,
    rodsTotal: rodRows.length,
    baitsOwned: baitRows.filter((row) => row.owned).length,
    baitsTotal: baitRows.length,
    fishOwned: fishRows.filter((row) => row.owned).length,
    fishTotal: fishRows.length,
  }
  return { summary, rods: rodRows, baits: baitRows, fish: fishRows }
}

export class FishingCodexService {
  constructor({ projectDir, logger, assetsDir }) {
    this.logger = logger
    this.catalog = catalogFor(resolveAssetsDir(projectDir, assetsDir))
  }

  async execute({ rawCommand, groupId, userId, store }) {
    const parts = String(rawCommand).trim().split(/\s+/u)
    if (parts[0] !== '/钓鱼' || parts[1] !== '图鉴') return null
    if (parts.length !== 2) return { ok: true, replies: ['用法：/钓鱼 图鉴'] }
    let catalog
    try {
      catalog = this.catalog.assertReady(['rods', 'baits', 'fish'])
    } catch (error) {
      this.logger?.warn?.('codex catalog failed: %s', String(error?.message ?? error))
      return { ok: false, error: 'codex catalog unavailable' }
    }
    const state = await store.read(groupId)
    const player = state.players[userId]
    if (player === undefined) return { ok: true, replies: ['你还没有在本群注册，先发送 /注册。'] }
    const fishing = ensureFishing(player)
    const data = buildCodex({ fishing, rods: catalog.rods, baits: catalog.baits, fish: catalog.fish })
    const text = [
      '钓鱼图鉴',
      `鱼竿 ${data.summary.rodsOwned}/${data.summary.rodsTotal} · 鱼饵 ${data.summary.baitsOwned}/${data.summary.baitsTotal} · 鱼 ${data.summary.fishOwned}/${data.summary.fishTotal}`,
    ].join('\n')
    let image
    try {
      image = await renderCodexCard({ nickname: player.nickname || userId, data, assetsDir: this.catalog.assetsDir })
    } catch (error) {
      this.logger?.warn?.('codex image failed: %s', String(error?.message ?? error))
    }
    return { ok: true, replies: [text], ...(image === undefined ? {} : { image }) }
  }
}
