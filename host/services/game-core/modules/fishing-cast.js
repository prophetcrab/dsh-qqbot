/** Fishing cast and collect loop, including rod/bait effects. */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { FISH_STATS, LEGENDARY_BAIT_EFFECTS, NORMAL_BAIT_COEFFICIENTS } from '../fishing-data.js'
import { ROD_INFO } from './fishing-rod.js'
import { renderCatchCard } from '../render/catch-card.js'

export const castHelp = Object.freeze([
  ['/钓鱼 抛竿 [鱼饵名]', '抛竿，未指定鱼饵时随机使用仓库鱼饵'],
  ['/钓鱼 收竿', '收下当前钓到的鱼'],
])

const PACKAGE_ASSETS = fileURLToPath(new URL('../../../../assets/', import.meta.url))
const SPECIAL_RATE = 0.03
const SPECIAL_SPLIT = { low: 0.7, high: 0.3 }

function readCatalog(assetsDir, name, key) {
  const parsed = JSON.parse(readFileSync(join(assetsDir, name, 'catalog.json'), 'utf8'))
  if (!Array.isArray(parsed[key])) throw new Error(`invalid catalog: ${name}`)
  return parsed[key]
}
function rand(random) {
  const value = Number(random())
  return Number.isFinite(value) ? Math.min(0.999999, Math.max(0, value)) : 0
}
function pick(items, random) { return items[Math.min(items.length - 1, Math.floor(rand(random) * items.length))] }
function round(value, digits = 2) { return Math.round(value * 10 ** digits) / 10 ** digits }
function tierLabel(tier) { return `Lv.${tier}` }
function shanghaiDate(now) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now)
  const get = (type) => parts.find((part) => part.type === type)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}
export function ensureFishing(player) {
  if (player.fishing === null || typeof player.fishing !== 'object') player.fishing = {}
  const f = player.fishing
  f.cast = f.cast !== null && typeof f.cast === 'object' ? f.cast : null
  f.rodDaily = f.rodDaily !== null && typeof f.rodDaily === 'object' ? f.rodDaily : {}
  f.castCount = Number.isSafeInteger(f.castCount) ? f.castCount : 0
  f.fishWarehouse = Array.isArray(f.fishWarehouse) ? f.fishWarehouse : []
  f.fishSeq = Number.isSafeInteger(f.fishSeq) ? f.fishSeq : 0
  for (const fish of f.fishWarehouse) {
    if (!Number.isSafeInteger(fish.id)) {
      f.fishSeq += 1
      fish.id = f.fishSeq
    } else {
      f.fishSeq = Math.max(f.fishSeq, fish.id)
    }
  }
  f.specials = f.specials !== null && typeof f.specials === 'object' ? f.specials : {}
  if (f.tickets === null || typeof f.tickets !== 'object') f.tickets = {}
  f.tickets.singleTickets = Number.isSafeInteger(f.tickets.singleTickets) ? f.tickets.singleTickets : 0
  f.tickets.tenTickets = Number.isSafeInteger(f.tickets.tenTickets) ? f.tickets.tenTickets : 0
  if (f.rods === null || typeof f.rods !== 'object') f.rods = {}
  f.rods.owned = Array.isArray(f.rods.owned) ? f.rods.owned : []
  if (typeof f.rods.equipped !== 'string') f.rods.equipped = null
  if (f.baits === null || typeof f.baits !== 'object') f.baits = {}
  if (f.baits.counts === null || typeof f.baits.counts !== 'object') f.baits.counts = {}
  return f
}
function chooseTier(weights, random) {
  const total = weights.reduce((sum, value) => sum + value, 0)
  let cursor = rand(random) * total
  for (let index = 0; index < weights.length; index += 1) {
    cursor -= weights[index]
    if (cursor < 0) return index + 1
  }
  return 5
}
function addSpecial(fishing, item) {
  if (item.category === 'ticket') {
    if (item.id === 'single_draw_ticket') fishing.tickets.singleTickets += 1
    else if (item.id === 'ten_draw_ticket') fishing.tickets.tenTickets += 1
  } else {
    fishing.specials[item.id] = (Number.isSafeInteger(fishing.specials[item.id]) ? fishing.specials[item.id] : 0) + 1
  }
}
function addBait(fishing, id) {
  fishing.baits.counts[id] = (Number.isSafeInteger(fishing.baits.counts[id]) ? fishing.baits.counts[id] : 0) + 1
}

export class FishingCastService {
  constructor({ projectDir, logger, assetsDir, castDurationMs = 300000 }) {
    this.logger = logger
    this.castDurationMs = castDurationMs
    this.assetsDir = assetsDir ?? (existsSync(join(projectDir, 'assets', 'rods', 'catalog.json')) ? join(projectDir, 'assets') : PACKAGE_ASSETS)
    this.loaded = false
    this.rods = new Map()
    this.baits = []
    this.baitById = new Map()
    this.fishByTier = { 1: [], 2: [], 3: [], 4: [], 5: [] }
    this.specialLow = []
    this.specialHigh = []
  }

  load() {
    if (this.loaded) return
    for (const rod of readCatalog(this.assetsDir, 'rods', 'rods')) {
      if (ROD_INFO[rod.id] !== undefined) this.rods.set(rod.id, { ...rod, ...ROD_INFO[rod.id] })
    }
    this.baits = readCatalog(this.assetsDir, 'baits', 'baits')
    this.baitById = new Map(this.baits.map((bait) => [bait.id, bait]))
    for (const fish of readCatalog(this.assetsDir, 'fish', 'fish')) this.fishByTier[fish.tier].push(fish)
    for (const item of readCatalog(this.assetsDir, 'items', 'items')) {
      if (item.category === 'special_low') this.specialLow.push(item)
      else if (item.category === 'special_high' || item.category === 'ticket') this.specialHigh.push(item)
    }
    this.loaded = true
  }

  async execute({ rawCommand, groupId, userId, store, random, now }) {
    const parts = String(rawCommand).trim().split(/\s+/u)
    if (parts[0] !== '/钓鱼' || (parts[1] !== '抛竿' && parts[1] !== '收竿')) return null
    try { this.load() } catch (error) {
      this.logger?.warn?.('fishing catalog failed: %s', String(error?.message ?? error))
      return { ok: false, error: 'fishing catalog unavailable' }
    }
    if (parts[1] === '收竿') {
      if (parts.length !== 2) return { ok: true, replies: ['用法：/钓鱼 收竿'] }
      return this.collect({ groupId, userId, store, random, now })
    }
    if (parts.length > 3) return { ok: true, replies: ['用法：/钓鱼 抛竿 [鱼饵名]'] }
    return this.cast({ groupId, userId, baitName: parts[2] ?? null, store, random, now })
  }

  async cast({ groupId, userId, baitName, store, random, now }) {
    return store.mutate(groupId, (state) => {
      const player = state.players[userId]
      if (player === undefined) return { ok: true, replies: ['你还没有在本群注册，先发送 /注册。'] }
      const fishing = ensureFishing(player)
      if (fishing.cast !== null) return { ok: true, replies: ['正在钓鱼，请等待收竿。'] }
      const rod = fishing.rods.equipped === null ? null : this.rods.get(fishing.rods.equipped)
      if (rod === null || rod === undefined) return { ok: true, replies: ['还没有装备鱼竿，先使用 /钓鱼 更换鱼竿 鱼竿名。'] }

      const date = shanghaiDate(now)
      const taigongFree = rod.id === 'taigong' && fishing.rodDaily.taigong !== date
      let bait = null
      if (baitName !== null) {
        bait = this.baits.find((item) => item.name === baitName)
        if (bait === undefined) return { ok: true, replies: [`没有叫「${baitName}」的鱼饵。`] }
        if (!taigongFree && (Number.isSafeInteger(fishing.baits.counts[bait.id]) ? fishing.baits.counts[bait.id] : 0) <= 0) {
          return { ok: true, replies: [`仓库里没有「${baitName}」了。`] }
        }
      } else if (!taigongFree) {
        const available = this.baits.filter((item) => (Number.isSafeInteger(fishing.baits.counts[item.id]) ? fishing.baits.counts[item.id] : 0) > 0)
        if (available.length === 0) return { ok: true, replies: ['仓库里没有鱼饵，钓鱼失败。'] }
        bait = pick(available, random)
      }
      if (bait === null && !taigongFree) return { ok: true, replies: ['仓库里没有鱼饵，钓鱼失败。'] }

      if (taigongFree) fishing.rodDaily.taigong = date
      else if (bait !== null) fishing.baits.counts[bait.id] -= 1
      fishing.castCount += 1
      const effects = []
      if (bait !== null && LEGENDARY_BAIT_EFFECTS.includes(bait.id)) effects.push(bait.id)
      if (taigongFree) effects.push(pick(LEGENDARY_BAIT_EFFECTS, random))
      const waltonFirst = rod.id === 'walton' && fishing.rodDaily.walton !== date
      const forceFive = rod.id === 'hemingway' && fishing.castCount % 20 === 0
      const duration = effects.includes('mepps_aglia') ? this.castDurationMs / 1.5 : this.castDurationMs
      fishing.cast = {
        rodId: rod.id,
        rodName: rod.name,
        baitId: bait?.id ?? null,
        baitName: bait?.name ?? null,
        effects,
        normalCoefficient: bait === null ? null : NORMAL_BAIT_COEFFICIENTS[bait.id] ?? null,
        startedAt: now.toISOString(),
        readyAt: new Date(now.getTime() + duration).toISOString(),
        castNo: fishing.castCount,
        waltonFirst,
        forceFive,
      }
      return { ok: true, replies: ['正在钓鱼。使用 /钓鱼 收竿 收鱼。'] }
    })
  }

  async collect({ groupId, userId, store, random, now }) {
    return store.mutate(groupId, async (state) => {
      const player = state.players[userId]
      if (player === undefined) return { ok: true, replies: ['你还没有在本群注册，先发送 /注册。'] }
      const fishing = ensureFishing(player)
      if (fishing.cast === null) return { ok: true, replies: ['当前没有在钓鱼，先发送 /钓鱼 抛竿。'] }
      const readyAt = new Date(fishing.cast.readyAt).getTime()
      const remaining = Math.ceil((readyAt - now.getTime()) / 1000)
      if (remaining > 0) {
        const wait = remaining >= 60 ? `${Math.floor(remaining / 60)} 分 ${remaining % 60} 秒` : `${remaining} 秒`
        return { ok: true, replies: [`正在钓鱼，还需约 ${wait}，使用 /钓鱼 收竿 收鱼。`] }
      }
      const cast = fishing.cast
      fishing.cast = null
      const result = this.resolve({ fishing, cast, random, now })
      if (result.kind === 'fish') {
        for (let i = 0; i < (result.copies ?? 1); i += 1) {
          fishing.fishSeq += 1
          fishing.fishWarehouse.push({
            id: fishing.fishSeq,
            fishId: result.item.id,
            name: result.item.name,
            tier: result.tier,
            weightKg: result.weightKg,
            basePricePerKg: result.basePricePerKg,
            pricePerKg: result.pricePerKg,
            value: result.value,
            caughtAt: now.toISOString(),
          })
        }
        if (result.extraSpecial !== undefined) addSpecial(fishing, result.extraSpecial)
        if (result.extraBait !== undefined) addBait(fishing, result.extraBait)
      } else {
        addSpecial(fishing, result.item)
        if (result.extraSpecial !== undefined) addSpecial(fishing, result.extraSpecial)
      }
      if (result.extraBait === undefined && cast.effects.includes('adams_dry_fly')) {
        const others = this.baits.filter((bait) => bait.tier === 4 && bait.id !== 'adams_dry_fly')
        if (others.length > 0) addBait(fishing, pick(others, random).id)
      }
      const text = this.describe({ result, cast })
      let image
      try {
        image = await renderCatchCard({
          nickname: player.nickname || userId,
          result,
          rodName: cast.rodName,
          baitName: cast.baitName,
          assetsDir: this.assetsDir,
        })
      } catch (error) {
        this.logger?.warn?.('catch image failed: %s', String(error?.message ?? error))
      }
      return { ok: true, replies: [text], ...(image === undefined ? {} : { image }) }
    })
  }

  resolve({ fishing, cast, random, now }) {
    if (rand(random) < SPECIAL_RATE) return this.resolveSpecial(fishing, cast, random)
    const rod = this.rods.get(cast.rodId)
    let weights = [...rod.weights]
    if (cast.normalCoefficient !== null) weights = weights.map((weight, index) => weight * cast.normalCoefficient[index])
    if (weights.every((weight) => weight === 0)) weights = [1, 1, 1, 1, 1]
    let tier = chooseTier(weights, random)
    if (cast.rodId === 'grey') tier = Math.max(3, tier)
    if (cast.forceFive) tier = 5
    if (cast.effects.includes('adams_dry_fly')) tier = Math.min(5, tier + 1)
    const fish = pick(this.fishByTier[tier], random)
    const stats = FISH_STATS[fish.id]
    if (stats === undefined) throw new Error(`missing fish stats: ${fish.id}`)
    let weightKg = stats.minKg + rand(random) * (stats.maxKg - stats.minKg)
    if (cast.rodId === 'ziling') weightKg *= 1.15
    if (cast.waltonFirst && fishing.rodDaily.walton !== shanghaiDate(now)) {
      weightKg *= 2
      fishing.rodDaily.walton = shanghaiDate(now)
    }
    weightKg = round(weightKg, 2)
    const ratio = Math.max(0, Math.min(1, (weightKg - stats.minKg) / (stats.maxKg - stats.minKg)))
    const pricePerKg = Math.round(stats.basePricePerKg * (1 + ratio * stats.weightBonus))
    let value = Math.round(weightKg * pricePerKg)
    if (cast.effects.includes('royal_coachman')) value = Math.round(value * 1.5)
    const copies = cast.effects.includes('rapala_floater') ? 2 : 1
    let extraSpecial
    if (cast.effects.includes('dardevle')) extraSpecial = this.specialItem(random)
    let extraBait
    let extraBaitName
    if (cast.effects.includes('adams_dry_fly')) {
      const others = this.baits.filter((bait) => bait.tier === 4 && bait.id !== 'adams_dry_fly')
      if (others.length > 0) {
        const extra = pick(others, random)
        extraBait = extra.id
        extraBaitName = extra.name
      }
    }
    return { kind: 'fish', item: fish, tier, weightKg, basePricePerKg: stats.basePricePerKg, pricePerKg, value, copies, extraSpecial, extraBait, extraBaitName }
  }

  resolveSpecial(fishing, cast, random) {
    const tier = rand(random) < SPECIAL_SPLIT.low ? 'low' : 'high'
    const item = this.specialItem(random, tier)
    let extraSpecial
    if (cast.effects.includes('dardevle')) extraSpecial = this.specialItem(random)
    return { kind: 'special', item, tier, extraSpecial }
  }

  specialItem(random, forcedTier) {
    const tier = forcedTier ?? (rand(random) < SPECIAL_SPLIT.low ? 'low' : 'high')
    return pick(tier === 'low' ? this.specialLow : this.specialHigh, random)
  }

  describe({ result, cast }) {
    if (result.kind === 'special') {
      return `收竿！钓到特殊物品「${result.item.name}」。${result.extraSpecial ? `\n额外获得「${result.extraSpecial.name}」。` : ''}`
    }
    const lines = [
      `收竿！钓到「${result.item.name}」（${tierLabel(result.tier)}）`,
      `${result.weightKg}kg × ${result.pricePerKg} 钓鱼币/kg = ${result.value} 钓鱼币`,
      result.copies > 1 ? `拉帕拉效果：本次鱼获复制 ${result.copies} 份` : '',
      cast.effects.includes('royal_coachman') ? '皇家教练羽饵：本次鱼获价值 +50%' : '',
      cast.effects.includes('adams_dry_fly') ? `亚当斯干蝇：本次上鱼等级 +1，返还「${result.extraBaitName ?? '传奇鱼饵'}」` : '',
      result.extraSpecial ? `达德维尔效果：额外获得「${result.extraSpecial.name}」` : '',
    ]
    return lines.filter(Boolean).join('\n')
  }
}
