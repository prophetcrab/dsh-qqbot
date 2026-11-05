/** Read-only group/game snapshots and UP controls for the client console. */
import { catalogFor, resolveAssetsDir } from './catalog.js'
import { ensureFishing } from './modules/fishing-state.js'

const GAMES = Object.freeze([
  {
    id: 'fishing',
    name: { zh: '钓鱼', en: 'Fishing' },
    description: { zh: '抛竿、收竿、鱼仓与抽卡。', en: 'Cast, collect, warehouse and gacha.' },
  },
])

function num(value) {
  return Number.isSafeInteger(value) ? value : 0
}

export class GameAdminService {
  constructor({ projectDir, assetsDir, store, upStore }) {
    this.catalog = catalogFor(resolveAssetsDir(projectDir, assetsDir))
    this.store = store
    this.upStore = upStore
  }

  catalogOptions() {
    const catalog = this.catalog.assertReady()
    const legendaries = (items) => items
      .filter((item) => item.tier === 4)
      .map((item) => ({ id: item.id, name: item.name, tier: item.tier }))
    return { rods: legendaries(catalog.rods), baits: legendaries(catalog.baits) }
  }

  async listGroups() {
    this.catalog.assertReady()
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
    this.catalog.assertReady()
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
    this.catalog.assertReady()
    if (gameId !== 'fishing') throw new Error('unknown game')
    const state = await this.store.read(groupId)
    const players = state.players
    const entries = Object.entries(players).map(([qq, player]) => this.fishingRow(qq, player))
    const up = await this.upStore.get(groupId)
    const upRod = this.catalog.rodById.get(up.rod)
    const upBait = this.catalog.baitById.get(up.bait)
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
    const rods = f.rods.owned.map((id) => ({ id, name: this.catalog.rodById.get(id)?.name ?? id }))
    const baits = Object.entries(f.baits.counts)
      .filter(([, count]) => num(count) > 0)
      .map(([id, count]) => ({ id, name: this.catalog.baitById.get(id)?.name ?? id, count: num(count) }))
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
    this.catalog.assertReady()
    if (gameId !== 'fishing') throw new Error('unknown game')
    const rod = this.catalog.rodById.get(rodId)
    const bait = this.catalog.baitById.get(baitId)
    if (rod === undefined || rod.tier !== 4) throw new Error('UP rod must be legendary')
    if (bait === undefined || bait.tier !== 4) throw new Error('UP bait must be legendary')
    await this.upStore.set(groupId, { rod: rod.id, bait: bait.id })
    return this.getGame(groupId, gameId)
  }
}
