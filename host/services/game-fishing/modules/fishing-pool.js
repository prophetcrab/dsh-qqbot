/** Gacha pool info command and image. */
import { CATEGORY_RATES, PITY_LIMITS } from '../data.js'
import { CURRENT_UP } from '../gacha-config.js'
import { catalogFor, resolveAssetsDir } from '../catalog.js'
import { ensureFishing } from './fishing-state.js'
import { renderPoolCard } from '../render/pool-card.js'

export const poolHelp = Object.freeze([
  ['/钓鱼 卡池', '查看卡池物品、分类出率和保底进度'],
])

function number(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : 0
}

function pityProgress(player) {
  if (player === null || player === undefined) return { rod: 0, lv3Rod: 0, legendaryBait: 0, legendaryRod: 0 }
  const gacha = ensureFishing(player).gacha
  return {
    rod: number(gacha.rodPity),
    lv3Rod: number(gacha.lv3RodPity),
    legendaryBait: number(gacha.legendaryBaitPity),
    legendaryRod: number(gacha.legendaryRodPity),
  }
}

function formatRate(value) {
  const fixed = value < 1 ? value.toFixed(4) : value.toFixed(2)
  return fixed.replace(/0+$/u, '').replace(/\.$/u, '')
}

function withRates(items, kind, upId) {
  const counts = {}
  for (const item of items) counts[item.tier] = (counts[item.tier] ?? 0) + 1
  return items.map((item) => {
    const total = CATEGORY_RATES[kind][item.tier]
    let rate = total / counts[item.tier]
    if (item.tier === 4) {
      rate = item.id === upId ? total * 0.5 : (total * 0.5) / Math.max(1, counts[item.tier] - 1)
    }
    return { ...item, rate: formatRate(rate), isUp: item.id === upId }
  })
}

export class FishingPoolService {
  constructor({ projectDir, logger, assetsDir, upStore }) {
    this.logger = logger
    this.upStore = upStore
    this.catalog = catalogFor(resolveAssetsDir(projectDir, assetsDir))
  }

  async execute({ rawCommand, groupId, userId, store }) {
    if (String(rawCommand).trim() !== '/钓鱼 卡池') return null
    let catalog
    try {
      catalog = this.catalog.assertReady()
    } catch (error) {
      this.logger?.warn?.('pool catalog failed: %s', String(error?.message ?? error))
      return { ok: false, error: 'pool catalog unavailable' }
    }
    const state = await store.read(groupId)
    const player = state.players[userId]
    const pity = pityProgress(player)
    const up = this.upStore === undefined ? CURRENT_UP : await this.upStore.get(groupId)
    const sorted = (items) => items.slice().sort((a, b) => a.tier - b.tier || a.name.localeCompare(b.name, 'zh'))
    const rods = withRates(sorted(catalog.rods), 'rod', up.rod)
    const baits = withRates(sorted(catalog.baits), 'bait', up.bait)
    const upRod = rods.find((item) => item.isUp)
    const upBait = baits.find((item) => item.isUp)
    const text = [
      '钓鱼卡池',
      `当前 UP：${upRod?.name ?? '无'} / ${upBait?.name ?? '无'}`,
      '单抽 10 钓鱼币 · 十连 90 钓鱼币',
      `保底进度：鱼竿 ${pity.rod}/${PITY_LIMITS.rod} · Lv3 ${pity.lv3Rod}/${PITY_LIMITS.lv3Rod} · 传奇饵 ${pity.legendaryBait}/${PITY_LIMITS.legendaryBait} · 传奇竿 ${pity.legendaryRod}/${PITY_LIMITS.legendaryRod}`,
    ].join('\n')
    let image
    try {
      image = await renderPoolCard({
        nickname: player?.nickname || userId,
        pool: {
          rods,
          baits,
          pity,
          categoryRates: CATEGORY_RATES,
          up: { rod: upRod, bait: upBait },
        },
        assetsDir: this.catalog.assetsDir,
      })
    } catch (error) {
      this.logger?.warn?.('pool image failed: %s', String(error?.message ?? error))
    }
    return { ok: true, replies: [text], ...(image === undefined ? {} : { image }) }
  }
}
