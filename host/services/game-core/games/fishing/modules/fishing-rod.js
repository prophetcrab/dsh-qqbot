/** Equipped fishing rod view and change commands. */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { renderRodCard } from '../render/rod-card.js'

export const rodHelp = Object.freeze([
  ['/钓鱼 查看鱼竿', '查看当前装备的鱼竿'],
  ['/钓鱼 更换鱼竿 <鱼竿名>', '更换为已拥有的鱼竿'],
])

const PACKAGE_ASSETS = fileURLToPath(new URL('../../../../../../assets/', import.meta.url))

export const ROD_INFO = Object.freeze({
  bamboo_hand: { weights: [60, 30, 8, 2, 0], sellPrice: 3, effect: '无特殊效果' },
  fiberglass_hand: { weights: [58, 31, 8, 3, 0], sellPrice: 4, effect: '无特殊效果' },
  fiberglass_surf: { weights: [62, 28, 8, 2, 0], sellPrice: 3, effect: '无特殊效果' },
  carbon_hand: { weights: [35, 35, 20, 8, 2], sellPrice: 7, effect: '无特殊效果' },
  carbon_iso: { weights: [30, 38, 22, 8, 2], sellPrice: 8, effect: '无特殊效果' },
  carbon_lure: { weights: [40, 32, 18, 8, 2], sellPrice: 7, effect: '无特殊效果' },
  high_carbon_hand: { weights: [13, 25, 32, 20, 10], sellPrice: 15, effect: '无特殊效果' },
  high_carbon_lure: { weights: [10, 23, 33, 22, 12], sellPrice: 18, effect: '无特殊效果' },
  high_carbon_surf: { weights: [15, 25, 31, 19, 10], sellPrice: 16, effect: '无特殊效果' },
  taigong: { weights: [3, 14, 30, 32, 21], sellPrice: 100, effect: '每日第一次钓鱼不消耗鱼饵，并随机获得一种传奇鱼饵效果' },
  ziling: { weights: [2, 12, 30, 34, 22], sellPrice: 120, effect: '全天鱼获重量 +15%' },
  walton: { weights: [2, 13, 31, 33, 21], sellPrice: 110, effect: '每日第一次钓鱼的那条鱼重量翻倍' },
  grey: { weights: [1, 10, 28, 36, 25], sellPrice: 140, effect: '每次钓鱼保底 Lv.3+ 鱼' },
  hemingway: { weights: [1, 7, 24, 38, 30], sellPrice: 160, effect: '每 20 次钓鱼，本次保底 Lv.5 鱼' },
})

function readCatalog(assetsDir) {
  const parsed = JSON.parse(readFileSync(join(assetsDir, 'rods', 'catalog.json'), 'utf8'))
  if (!Array.isArray(parsed.rods)) throw new Error('invalid rod catalog')
  return parsed.rods
}

function ensureFishing(player) {
  if (player.fishing === null || typeof player.fishing !== 'object') player.fishing = {}
  if (player.fishing.rods === null || typeof player.fishing.rods !== 'object') player.fishing.rods = {}
  player.fishing.rods.owned = Array.isArray(player.fishing.rods.owned) ? player.fishing.rods.owned : []
  if (typeof player.fishing.rods.equipped !== 'string') player.fishing.rods.equipped = null
  return player.fishing
}

function describe(rod) {
  return `概率组：Lv1 ${rod.weights[0]} / Lv2 ${rod.weights[1]} / Lv3 ${rod.weights[2]} / Lv4 ${rod.weights[3]} / Lv5 ${rod.weights[4]}\n特殊效果：${rod.effect}`
}

export class FishingRodService {
  constructor({ projectDir, logger, assetsDir }) {
    this.logger = logger
    this.assetsDir = assetsDir ?? (existsSync(join(projectDir, 'assets', 'rods', 'catalog.json')) ? join(projectDir, 'assets') : PACKAGE_ASSETS)
    this.loaded = false
    this.rods = new Map()
  }

  load() {
    if (this.loaded) return
    for (const item of readCatalog(this.assetsDir)) {
      const info = ROD_INFO[item.id]
      if (info === undefined) continue
      this.rods.set(item.id, { ...item, ...info })
    }
    this.loaded = true
  }

  async execute({ rawCommand, groupId, userId, store }) {
    const parts = String(rawCommand).trim().split(/\s+/u)
    if (parts[0] !== '/钓鱼' || (parts[1] !== '查看鱼竿' && parts[1] !== '更换鱼竿')) return null
    try { this.load() } catch (error) {
      this.logger?.warn?.('rod catalog failed: %s', String(error?.message ?? error))
      return { ok: false, error: 'rod catalog unavailable' }
    }
    if (parts[1] === '查看鱼竿') {
      if (parts.length !== 2) return { ok: true, replies: ['用法：/钓鱼 查看鱼竿'] }
      return this.view({ groupId, userId, store })
    }
    if (parts.length !== 3) return { ok: true, replies: ['用法：/钓鱼 更换鱼竿 鱼竿名'] }
    return this.change({ groupId, userId, name: parts[2], store })
  }

  async view({ groupId, userId, store }) {
    const state = await store.read(groupId)
    const player = state.players[userId]
    if (player === undefined) return { ok: true, replies: ['你还没有在本群注册，先发送 /注册。'] }
    const fishing = ensureFishing(player)
    const equipped = fishing.rods.equipped === null ? null : this.rods.get(fishing.rods.equipped)
    if (equipped === undefined || equipped === null) {
      return { ok: true, replies: ['当前没有装备鱼竿。使用 /钓鱼 道具库 查看已拥有鱼竿。'] }
    }
    return this.card({ player, rod: equipped, title: '当前鱼竿' })
  }

  async change({ groupId, userId, name, store }) {
    return store.mutate(groupId, async (state) => {
      const player = state.players[userId]
      if (player === undefined) return { ok: true, replies: ['你还没有在本群注册，先发送 /注册。'] }
      const fishing = ensureFishing(player)
      const target = [...this.rods.values()].find((rod) => rod.name === name)
      if (target === undefined) return { ok: true, replies: [`没有叫「${name}」的鱼竿。`] }
      if (!fishing.rods.owned.includes(target.id)) return { ok: true, replies: [`你还没有「${name}」，不能装备。`] }
      if (fishing.rods.equipped === target.id) return { ok: true, replies: [`当前已经装备「${name}」。`] }
      fishing.rods.equipped = target.id
      const card = await this.card({ player, rod: target, title: '已更换鱼竿' })
      return { ...card, replies: [`已更换为「${name}」。\n${describe(target)}`] }
    })
  }

  async card({ player, rod, title }) {
    const text = `${title}：${rod.name}\n${describe(rod)}`
    let image
    try {
      image = await renderRodCard({ nickname: player.nickname || player.qq, title, rod, assetsDir: this.assetsDir })
    } catch (error) {
      this.logger?.warn?.('rod image failed: %s', String(error?.message ?? error))
    }
    return { ok: true, replies: [text], ...(image === undefined ? {} : { image }) }
  }
}
