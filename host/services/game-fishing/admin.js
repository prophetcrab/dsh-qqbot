/** Read-only group/game snapshots and UP controls for the client console. */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const PACKAGE_ASSETS = fileURLToPath(new URL('../../../assets/', import.meta.url))
const GAMES = Object.freeze([
  {
    id: 'fishing',
    name: { zh: '钓鱼', en: 'Fishing' },
    description: { zh: '抛竿、收竿、鱼仓与抽卡。', en: 'Cast, collect, warehouse and gacha.' },
  },
])

function readCatalog(assetsDir, name, key) {
  const parsed = JSON.parse(readFileSync(join(assetsDir, name, 'catalog.json'), 'utf8'))
  if (!Array.isArray(parsed[key])) throw new Error(`invalid catalog: ${name}`)
  return parsed[key]
}
function num(value) {
  return Number.isSafeInteger(value) ? value : 0
}
function ensureFishing(player) {
  if (player.fishing === null || typeof player.fishing !== 'object') player.fishing = {}
  const f = player.fishing
  if (f.rods === null || typeof f.rods !== 'object') f.rods = {}
  f.rods.owned = Array.isArray(f.rods.owned) ? f.rods.owned : []
  if (typeof f.rods.equipped !== 'string') f.rods.equipped = null
  if (f.baits === null || typeof f.baits !== 'object') f.baits = {}
  if (f.baits.counts === null || typeof f.baits.counts !== 'object') f.baits.counts = {}
  if (typeof f.baits.selected !== 'string') f.baits.selected = null
  if (f.tickets === null || typeof f.tickets !== 'object') f.tickets = {}
  f.tickets.singleTickets = num(f.tickets.singleTickets)
  f.tickets.tenTickets = num(f.tickets.tenTickets)
  if (f.gacha === null || typeof f.gacha !== 'object') f.gacha = {}
  f.gacha.rodPity = num(f.gacha.rodPity)
  f.gacha.lv3RodPity = num(f.gacha.lv3RodPity)
  f.gacha.legendaryBaitPity = num(f.gacha.legendaryBaitPity)
  f.gacha.legendaryRodPity = num(f.gacha.legendaryRodPity)
  f.fishWarehouse = Array.isArray(f.fishWarehouse) ? f.fishWarehouse : []
  if (f.cast === undefined) f.cast = null
  return f
}

export class GameAdminService {
  constructor({ projectDir, assetsDir, logger, store, upStore }) {
    this.logger = logger
    this.assetsDir = assetsDir ?? (existsSync(join(projectDir, 'assets', 'rods', 'catalog.json')) ? join(projectDir, 'assets') : PACKAGE_ASSETS)
    this.store = store
    this.upStore = upStore
    this.loaded = false
    this.rods = []
    this.baits = []
    this.rodById = new Map()
    this.baitById = new Map()
  }

  load() {
    if (this.loaded) return
    this.rods = readCatalog(this.assetsDir, 'rods', 'rods')
    this.baits = readCatalog(this.assetsDir, 'baits', 'baits')
    this.rodById = new Map(this.rods.map((item) => [item.id, item]))
    this.baitById = new Map(this.baits.map((item) => [item.id, item]))
    this.loaded = true
  }

  catalogOptions() {
    return {
      rods: this.rods.filter((item) => item.tier === 4).map((item) => ({ id: item.id, name: item.name, tier: item.tier })),
      baits: this.baits.filter((item) => item.tier === 4).map((item) => ({ id: item.id, name: item.name, tier: item.tier })),
    }
  }

  async listGroups() {
    this.load()
    const ids = await this.store.listGroupIds()
    const groups = []
    for (const groupId of ids) {
      const state = await this.store.read(groupId)
      const players = Object.values(state.players)
      groups.push({
        groupId,
        userCount: players.length,
        totalCoins: players.reduce((sum, player) => sum + num(player.coins), 0),
        totalFishingCoins: players.reduce((sum, player) => sum + num(player.fishingCoins), 0),
        updatedAt: state.updatedAt,
        games: this.gameEntries(players),
      })
    }
    return { groups, games: GAMES }
  }

  gameEntries(players) {
    return GAMES.map((entry) => ({
      id: entry.id,
      name: entry.name,
      description: entry.description,
      playerCount: players.length,
    }))
  }

  async getGroup(groupId) {
    this.load()
    const state = await this.store.read(groupId)
    const players = state.players
    const users = Object.entries(players).map(([qq, player]) => this.accountRow(qq, player))
    return {
      groupId,
      updatedAt: state.updatedAt,
      users,
      games: this.gameEntries(Object.values(players)),
    }
  }

  accountRow(qq, player) {
    const fishing = player.fishing !== null && typeof player.fishing === 'object' ? player.fishing : {}
    return {
      qq,
      nickname: String(player.nickname ?? qq),
      coins: num(player.coins),
      fishingCoins: num(player.fishingCoins),
      registeredAt: typeof player.registeredAt === 'string' ? player.registeredAt : null,
      checkinCount: num(player.checkinCount),
      fishCount: Array.isArray(fishing.fishWarehouse) ? fishing.fishWarehouse.length : 0,
    }
  }

  async getGame(groupId, gameId) {
    this.load()
    if (gameId !== 'fishing') throw new Error('unknown game')
    const state = await this.store.read(groupId)
    const players = state.players
    const entries = Object.entries(players).map(([qq, player]) => this.fishingRow(qq, player))
    const up = await this.upStore.get(groupId)
    const upRod = this.rodById.get(up.rod)
    const upBait = this.baitById.get(up.bait)
    return {
      groupId,
      game: GAMES[0],
      updatedAt: state.updatedAt,
      users: entries,
      summary: {
        userCount: entries.length,
        activeCasts: entries.filter((entry) => entry.cast !== null).length,
        totalFishingCoins: entries.reduce((sum, entry) => sum + entry.fishingCoins, 0),
        totalFish: entries.reduce((sum, entry) => sum + entry.fishCount, 0),
        totalFishValue: entries.reduce((sum, entry) => sum + entry.fishValue, 0),
      },
      up: {
        rod: upRod?.name ?? up.rod,
        bait: upBait?.name ?? up.bait,
        rodId: up.rod,
        baitId: up.bait,
        updatedAt: up.updatedAt,
        options: this.catalogOptions(),
      },
    }
  }

  fishingRow(qq, player) {
    const f = ensureFishing(player)
    const rods = f.rods.owned.map((id) => ({ id, name: this.rodById.get(id)?.name ?? id }))
    const baits = Object.entries(f.baits.counts)
      .filter(([, count]) => num(count) > 0)
      .map(([id, count]) => ({ id, name: this.baitById.get(id)?.name ?? id, count: num(count) }))
    const cast = f.cast !== null && typeof f.cast === 'object' ? {
      rodName: typeof f.cast.rodName === 'string' ? f.cast.rodName : '',
      baitName: typeof f.cast.baitName === 'string' ? f.cast.baitName : '',
      readyAt: typeof f.cast.readyAt === 'string' ? f.cast.readyAt : null,
    } : null
    return {
      qq,
      nickname: String(player.nickname ?? qq),
      registeredAt: typeof player.registeredAt === 'string' ? player.registeredAt : null,
      coins: num(player.coins),
      fishingCoins: num(player.fishingCoins),
      rods,
      equippedRod: f.rods.equipped,
      baits,
      selectedBait: f.baits.selected,
      singleTickets: f.tickets.singleTickets,
      tenTickets: f.tickets.tenTickets,
      gacha: {
        rodPity: f.gacha.rodPity,
        lv3RodPity: f.gacha.lv3RodPity,
        legendaryBaitPity: f.gacha.legendaryBaitPity,
        legendaryRodPity: f.gacha.legendaryRodPity,
      },
      fishCount: f.fishWarehouse.length,
      fishValue: f.fishWarehouse.reduce((sum, fish) => sum + num(fish.value), 0),
      cast,
    }
  }

  async setGameUp(groupId, gameId, { rodId, baitId }) {
    this.load()
    if (gameId !== 'fishing') throw new Error('unknown game')
    const rod = this.rodById.get(rodId)
    const bait = this.baitById.get(baitId)
    if (rod === undefined || rod.tier !== 4) throw new Error('UP rod must be legendary')
    if (bait === undefined || bait.tier !== 4) throw new Error('UP bait must be legendary')
    await this.upStore.set(groupId, { rod: rod.id, bait: bait.id })
    return this.getGame(groupId, gameId)
  }
}
