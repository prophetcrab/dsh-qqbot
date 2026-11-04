/** Gacha pool info command and image. */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CURRENT_UP } from '../gacha-config.js'
import { renderPoolCard } from '../render/pool-card.js'

export const poolHelp = Object.freeze([
  ['/钓鱼 卡池', '查看卡池物品、分类出率和保底进度'],
])

const PACKAGE_ASSETS = fileURLToPath(new URL('../../../../assets/', import.meta.url))
const CATEGORY_RATES = Object.freeze({
  bait: { 1: 37.5, 2: 30, 3: 20, 4: 2.5 },
  rod: { 1: 5, 2: 2.857, 3: 1.786, 4: 0.357 },
})
const PITY = Object.freeze({ rod: 10, lv3Rod: 50, legendaryBait: 60, legendaryRod: 150 })

function readCatalog(assetsDir, name, key) {
  const parsed = JSON.parse(readFileSync(join(assetsDir, name, 'catalog.json'), 'utf8'))
  if (!Array.isArray(parsed[key])) throw new Error(`invalid catalog: ${name}`)
  return parsed[key]
}

function number(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : 0
}

function normalizePity(player) {
  const g = player?.fishing?.gacha ?? {}
  return {
    rod: number(g.rodPity),
    lv3Rod: number(g.lv3RodPity),
    legendaryBait: number(g.legendaryBaitPity),
    legendaryRod: number(g.legendaryRodPity),
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
  constructor({ projectDir, logger, assetsDir }) {
    this.logger = logger
    this.assetsDir = assetsDir ?? (existsSync(join(projectDir, 'assets', 'rods', 'catalog.json')) ? join(projectDir, 'assets') : PACKAGE_ASSETS)
    this.loaded = false
    this.rods = []
    this.baits = []
  }

  load() {
    if (this.loaded) return
    this.rods = withRates(readCatalog(this.assetsDir, 'rods', 'rods').slice().sort((a, b) => a.tier - b.tier || a.name.localeCompare(b.name, 'zh')), 'rod', CURRENT_UP.rod)
    this.baits = withRates(readCatalog(this.assetsDir, 'baits', 'baits').slice().sort((a, b) => a.tier - b.tier || a.name.localeCompare(b.name, 'zh')), 'bait', CURRENT_UP.bait)
    this.loaded = true
  }

  async execute({ rawCommand, groupId, userId, store }) {
    if (String(rawCommand).trim() !== '/钓鱼 卡池') return null
    try { this.load() } catch (error) {
      this.logger?.warn?.('pool catalog failed: %s', String(error?.message ?? error))
      return { ok: false, error: 'pool catalog unavailable' }
    }
    const state = await store.read(groupId)
    const player = state.players[userId]
    const pity = normalizePity(player)
    const upRod = this.rods.find((item) => item.isUp)
    const upBait = this.baits.find((item) => item.isUp)
    const text = [
      '钓鱼卡池',
      `当前 UP：${upRod?.name ?? '无'} / ${upBait?.name ?? '无'}`,
      '单抽 10 钓鱼币 · 十连 90 钓鱼币',
      `保底进度：鱼竿 ${pity.rod}/${PITY.rod} · Lv3 ${pity.lv3Rod}/${PITY.lv3Rod} · 传奇饵 ${pity.legendaryBait}/${PITY.legendaryBait} · 传奇竿 ${pity.legendaryRod}/${PITY.legendaryRod}`,
    ].join('\n')
    let image
    try {
      image = await renderPoolCard({
        nickname: player?.nickname || userId,
        pool: {
          rods: this.rods,
          baits: this.baits,
          pity,
          categoryRates: CATEGORY_RATES,
          up: { rod: upRod, bait: upBait },
        },
        assetsDir: this.assetsDir,
      })
    } catch (error) {
      this.logger?.warn?.('pool image failed: %s', String(error?.message ?? error))
    }
    return { ok: true, replies: [text], ...(image === undefined ? {} : { image }) }
  }
}
