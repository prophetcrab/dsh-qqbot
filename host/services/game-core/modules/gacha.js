/** Fishing gacha: deterministic state changes, no LLM involvement. */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

export const gachaHelp = Object.freeze([
  ['/钓鱼 抽卡', '单抽，优先消耗单抽券，否则 10 钓鱼币'],
  ['/钓鱼 十连', '十连，优先十连券，其次单抽券，最后 90 钓鱼币'],
])

const SINGLE_COST = 10
const TEN_COST = 90
const SINGLE_TICKET = 'singleTicket'
const TEN_TICKET = 'tenTicket'
const COIN = 'coin'

const ROD_SELL_PRICE = Object.freeze({
  bamboo_hand: 3, fiberglass_hand: 4, fiberglass_surf: 3,
  carbon_hand: 7, carbon_iso: 8, carbon_lure: 7,
  high_carbon_hand: 15, high_carbon_lure: 18, high_carbon_surf: 16,
  taigong: 100, ziling: 120, walton: 110, grey: 140, hemingway: 160,
})

const CATEGORY_WEIGHTS = Object.freeze([
  { kind: 'bait', tier: 1, weight: 37.5 },
  { kind: 'bait', tier: 2, weight: 30.0 },
  { kind: 'bait', tier: 3, weight: 20.0 },
  { kind: 'bait', tier: 4, weight: 2.5 },
  { kind: 'rod', tier: 1, weight: 5.0 },
  { kind: 'rod', tier: 2, weight: 2.857 },
  { kind: 'rod', tier: 3, weight: 1.786 },
  { kind: 'rod', tier: 4, weight: 0.357 },
].map((entry) => ({ ...entry })))

const PITY = Object.freeze({
  rod: 10,
  lv3Rod: 50,
  legendaryBait: 60,
  legendaryRod: 150,
})

function readCatalog(assetsDir, name, key) {
  const path = join(assetsDir, name, 'catalog.json')
  const parsed = JSON.parse(readFileSync(path, 'utf8'))
  if (!Array.isArray(parsed[key])) throw new Error(`invalid catalog: ${path}`)
  return parsed[key]
}

function cleanPlayerId(value) {
  return String(value ?? '')
}

function ensureFishing(player) {
  if (player.fishing === null || typeof player.fishing !== 'object') player.fishing = {}
  const fishing = player.fishing
  if (fishing.tickets === null || typeof fishing.tickets !== 'object') fishing.tickets = {}
  fishing.tickets.singleTickets = Number.isSafeInteger(fishing.tickets.singleTickets) ? fishing.tickets.singleTickets : 0
  fishing.tickets.tenTickets = Number.isSafeInteger(fishing.tickets.tenTickets) ? fishing.tickets.tenTickets : 0
  if (fishing.rods === null || typeof fishing.rods !== 'object') fishing.rods = {}
  fishing.rods.owned = Array.isArray(fishing.rods.owned) ? fishing.rods.owned : []
  if (typeof fishing.rods.equipped !== 'string') fishing.rods.equipped = null
  if (fishing.baits === null || typeof fishing.baits !== 'object') fishing.baits = {}
  if (fishing.baits.counts === null || typeof fishing.baits.counts !== 'object') fishing.baits.counts = {}
  if (typeof fishing.baits.selected !== 'string') fishing.baits.selected = null
  if (fishing.gacha === null || typeof fishing.gacha !== 'object') fishing.gacha = {}
  const gacha = fishing.gacha
  gacha.rodPity = Number.isSafeInteger(gacha.rodPity) ? gacha.rodPity : 0
  gacha.lv3RodPity = Number.isSafeInteger(gacha.lv3RodPity) ? gacha.lv3RodPity : 0
  gacha.legendaryBaitPity = Number.isSafeInteger(gacha.legendaryBaitPity) ? gacha.legendaryBaitPity : 0
  gacha.legendaryRodPity = Number.isSafeInteger(gacha.legendaryRodPity) ? gacha.legendaryRodPity : 0
  gacha.totalDraws = Number.isSafeInteger(gacha.totalDraws) ? gacha.totalDraws : 0
  gacha.history = Array.isArray(gacha.history) ? gacha.history.slice(-50) : []
  return fishing
}

function tierLabel(tier) {
  return tier >= 4 ? 'Legendary' : `Lv.${tier}`
}

function clampRandom(random) {
  const value = Number(random())
  if (!Number.isFinite(value)) return 0
  return Math.min(0.999999999, Math.max(0, value))
}

function pick(items, random) {
  return items[Math.min(items.length - 1, Math.floor(clampRandom(random) * items.length))]
}

function weightedPick(entries, random) {
  const total = entries.reduce((sum, entry) => sum + entry.weight, 0)
  let cursor = clampRandom(random) * total
  for (const entry of entries) {
    cursor -= entry.weight
    if (cursor < 0) return entry
  }
  return entries[entries.length - 1]
}

function paymentFor(fishing, coins, size) {
  const tickets = fishing.tickets
  if (size === 1) {
    if (tickets.singleTickets > 0) return { ok: true, singleTickets: 1, tenTickets: 0, coins: 0, sources: [SINGLE_TICKET] }
    if (coins >= SINGLE_COST) return { ok: true, singleTickets: 0, tenTickets: 0, coins: SINGLE_COST, sources: [COIN] }
    return { ok: false, message: `单抽失败：需要 1 张单抽券或 ${SINGLE_COST} 钓鱼币。当前单抽券 ${tickets.singleTickets}，钓鱼币 ${coins}。` }
  }

  if (tickets.tenTickets > 0) {
    return { ok: true, singleTickets: 0, tenTickets: 1, coins: 0, sources: Array(10).fill(TEN_TICKET) }
  }
  const useSingles = Math.min(10, tickets.singleTickets)
  const coinDraws = 10 - useSingles
  const coinCost = coinDraws * SINGLE_COST
  if (coins >= coinCost) {
    return {
      ok: true,
      singleTickets: useSingles,
      tenTickets: 0,
      coins: coinCost,
      sources: [...Array(useSingles).fill(SINGLE_TICKET), ...Array(coinDraws).fill(COIN)],
    }
  }
  return {
    ok: false,
    message: `十连失败：需要 1 张十连券、10 张单抽券或 ${TEN_COST} 钓鱼币。当前十连券 ${tickets.tenTickets}，单抽券 ${tickets.singleTickets}，钓鱼币 ${coins}。`,
  }
}

function pay(fishing, coins, payment) {
  fishing.tickets.singleTickets -= payment.singleTickets
  fishing.tickets.tenTickets -= payment.tenTickets
  return coins - payment.coins
}

function pityDraw(gacha, rods, baits, random) {
  if (gacha.legendaryRodPity >= PITY.legendaryRod) {
    gacha.legendaryRodPity = 0
    return { kind: 'rod', tier: 4, item: pick(rods[4], random), pityTriggered: 'legendaryRod' }
  }
  if (gacha.lv3RodPity >= PITY.lv3Rod) {
    gacha.lv3RodPity = 0
    return { kind: 'rod', tier: 3, item: pick(rods[3], random), pityTriggered: 'lv3Rod' }
  }
  if (gacha.legendaryBaitPity >= PITY.legendaryBait) {
    gacha.legendaryBaitPity = 0
    return { kind: 'bait', tier: 4, item: pick(baits[4], random), pityTriggered: 'legendaryBait' }
  }
  if (gacha.rodPity >= PITY.rod) {
    gacha.rodPity = 0
    const tier = clampRandom(random) < 5 / 7.857 ? 1 : 2
    return { kind: 'rod', tier, item: pick(rods[tier], random), pityTriggered: 'rod' }
  }
  return null
}

function baseDraw(rods, baits, random) {
  const entry = weightedPick(CATEGORY_WEIGHTS, random)
  const pool = entry.kind === 'rod' ? rods[entry.tier] : baits[entry.tier]
  return { kind: entry.kind, tier: entry.tier, item: pick(pool, random), pityTriggered: null }
}

function applyNaturalReset(gacha, result) {
  if (result.kind === 'rod') {
    gacha.rodPity = 0
    if (result.tier >= 3) gacha.lv3RodPity = 0
    if (result.tier >= 4) gacha.legendaryRodPity = 0
  } else if (result.kind === 'bait' && result.tier >= 4) {
    gacha.legendaryBaitPity = 0
  }
}

function storeResult(player, fishing, result, drawNo, source, now) {
  let duplicateSold = 0
  if (result.kind === 'rod') {
    const id = result.item.id
    if (fishing.rods.owned.includes(id)) {
      duplicateSold = ROD_SELL_PRICE[id] ?? 0
      player.fishingCoins = (Number.isSafeInteger(player.fishingCoins) ? player.fishingCoins : 0) + duplicateSold
    } else {
      fishing.rods.owned.push(id)
      if (fishing.rods.equipped === null) fishing.rods.equipped = id
    }
  } else {
    fishing.baits.counts[result.item.id] = (Number.isSafeInteger(fishing.baits.counts[result.item.id]) ? fishing.baits.counts[result.item.id] : 0) + 1
    if (fishing.baits.selected === null) fishing.baits.selected = result.item.id
  }

  fishing.gacha.totalDraws += 1
  fishing.gacha.history.push({
    at: now.toISOString(),
    drawNo,
    source,
    itemId: result.item.id,
    itemName: result.item.name,
    kind: result.kind,
    rarity: tierLabel(result.tier),
    pityTriggered: result.pityTriggered,
    duplicateSold,
  })
  fishing.gacha.history = fishing.gacha.history.slice(-50)
  return { ...result, duplicateSold }
}

function formatDraw(result, index) {
  const suffix = result.duplicateSold > 0 ? ` 重复，自动出售 +${result.duplicateSold} 钓鱼币` : ''
  const pity = result.pityTriggered === null ? '' : ' [保底]'
  return `${index === undefined ? '' : `${index + 1}. `}${result.item.name}（${tierLabel(result.tier)}）${suffix}${pity}`
}

function formatPity(gacha) {
  return `鱼竿 ${gacha.rodPity}/${PITY.rod} · Lv3 ${gacha.lv3RodPity}/${PITY.lv3Rod} · 传奇饵 ${gacha.legendaryBaitPity}/${PITY.legendaryBait} · 传奇竿 ${gacha.legendaryRodPity}/${PITY.legendaryRod}`
}

function formatCost(payment, size) {
  if (payment.tenTickets > 0) return '1 张十连券'
  if (size === 1) return payment.singleTickets > 0 ? '1 张单抽券' : `${SINGLE_COST} 钓鱼币`
  const parts = []
  if (payment.singleTickets > 0) parts.push(`${payment.singleTickets} 张单抽券`)
  if (payment.coins > 0) parts.push(`${payment.coins} 钓鱼币`)
  return parts.join(' + ')
}

export class GachaService {
  constructor({ projectDir, logger, assetsDir }) {
    this.logger = logger
    this.assetsDir = assetsDir ?? join(projectDir, 'assets')
    this.rods = { 1: [], 2: [], 3: [], 4: [] }
    this.baits = { 1: [], 2: [], 3: [], 4: [] }
    this.loaded = false
  }

  load() {
    if (this.loaded) return
    for (const rod of readCatalog(this.assetsDir, 'rods', 'rods')) this.rods[rod.tier].push(rod)
    for (const bait of readCatalog(this.assetsDir, 'baits', 'baits')) this.baits[bait.tier].push(bait)
    for (const tier of [1, 2, 3, 4]) {
      if (this.rods[tier].length === 0) throw new Error(`missing rod tier ${tier}`)
      if (this.baits[tier].length === 0) throw new Error(`missing bait tier ${tier}`)
    }
    this.loaded = true
  }

  async execute({ rawCommand, groupId, userId, store, random, now }) {
    const parts = String(rawCommand).trim().split(/\s+/u)
    if (parts[0] !== '/钓鱼' || (parts[1] !== '抽卡' && parts[1] !== '十连')) return null
    if (parts.length !== 2) return { ok: true, replies: ['用法：\n/钓鱼 抽卡\n/钓鱼 十连'] }
    try { this.load() } catch (error) { this.logger?.warn?.('gacha catalog failed: %s', String(error?.message ?? error)); return { ok: false, error: 'gacha catalog unavailable' } }
    const size = parts[1] === '十连' ? 10 : 1

    return store.mutate(groupId, (state) => {
      const player = state.players[userId]
      if (player === undefined) return { ok: true, replies: ['你还没有在本群注册，先发送 /注册。'] }
      const coins = Number.isSafeInteger(player.fishingCoins) ? player.fishingCoins : 0
      const fishing = ensureFishing(player)
      const payment = paymentFor(fishing, coins, size)
      if (!payment.ok) return { ok: true, replies: [payment.message] }

      player.fishingCoins = pay(fishing, coins, payment)
      const results = []
      for (let index = 0; index < size; index += 1) {
        fishing.gacha.rodPity += 1
        fishing.gacha.lv3RodPity += 1
        fishing.gacha.legendaryBaitPity += 1
        fishing.gacha.legendaryRodPity += 1
        const forced = pityDraw(fishing.gacha, this.rods, this.baits, random)
        const result = forced ?? baseDraw(this.rods, this.baits, random)
        if (forced === null) applyNaturalReset(fishing.gacha, result)
        results.push(storeResult(player, fishing, result, fishing.gacha.totalDraws + 1, payment.sources[index], now))
      }

      const lines = size === 1
        ? [formatDraw(results[0])]
        : results.map((result, index) => formatDraw(result, index))
      const header = size === 1 ? '单抽结果：' : '十连结果：'
      return {
        ok: true,
        replies: [
          `${header}\n${lines.join('\n')}\n消耗：${formatCost(payment, size)}\n当前：钓鱼币 ${player.fishingCoins}，单抽券 ${fishing.tickets.singleTickets}，十连券 ${fishing.tickets.tenTickets}\n保底进度：${formatPity(fishing.gacha)}`,
        ],
      }
    })
  }
}
