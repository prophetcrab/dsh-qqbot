/** Equipped fishing rod view and change commands. */
import { ROD_INFO } from '../data.js'
import { catalogFor, resolveAssetsDir } from '../catalog.js'
import { ensureFishing } from './fishing-state.js'
import { renderRodCard } from '../render/rod-card.js'

export const rodHelp = Object.freeze([
  ['/钓鱼 查看鱼竿', '查看当前装备的鱼竿'],
  ['/钓鱼 更换鱼竿 <鱼竿名>', '更换为已拥有的鱼竿'],
])

/** Merge catalog art fields with the static gameplay data. */
function rodWithInfo(item) {
  if (item === undefined) return undefined
  const info = ROD_INFO[item.id]
  return info === undefined ? undefined : { ...item, ...info }
}

function describe(rod) {
  const weights = Array.isArray(rod.weights) ? rod.weights : [0, 0, 0, 0, 0]
  return `概率组：Lv1 ${weights[0]} / Lv2 ${weights[1]} / Lv3 ${weights[2]} / Lv4 ${weights[3]} / Lv5 ${weights[4]}\n特殊效果：${rod.effect ?? '未配置'}`
}

export class FishingRodService {
  constructor({ projectDir, logger, assetsDir }) {
    this.logger = logger
    this.catalog = catalogFor(resolveAssetsDir(projectDir, assetsDir))
  }

  async execute({ rawCommand, groupId, userId, store }) {
    const parts = String(rawCommand).trim().split(/\s+/u)
    if (parts[0] !== '/钓鱼' || (parts[1] !== '查看鱼竿' && parts[1] !== '更换鱼竿')) return null
    try {
      this.catalog.assertReady(['rods'])
    } catch (error) {
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
    const equipped = fishing.rods.equipped === null ? undefined : rodWithInfo(this.catalog.rodById.get(fishing.rods.equipped))
    if (equipped === undefined) {
      return { ok: true, replies: ['当前没有装备鱼竿。使用 /钓鱼 道具库 查看已拥有鱼竿。'] }
    }
    return this.card({ player, rod: equipped, title: '当前鱼竿' })
  }

  async change({ groupId, userId, name, store }) {
    return store.mutate(groupId, async (state) => {
      const player = state.players[userId]
      if (player === undefined) return { ok: true, replies: ['你还没有在本群注册，先发送 /注册。'] }
      const fishing = ensureFishing(player)
      const target = this.catalog.rods.find((rod) => rod.name === name)
      if (target === undefined) return { ok: true, replies: [`没有叫「${name}」的鱼竿。`] }
      const rod = rodWithInfo(target)
      if (rod === undefined) return { ok: true, replies: [`「${name}」缺少鱼竿数值配置，暂不能装备。`] }
      if (!fishing.rods.owned.includes(rod.id)) return { ok: true, replies: [`你还没有「${name}」，不能装备。`] }
      if (fishing.rods.equipped === rod.id) return { ok: true, replies: [`当前已经装备「${name}」。`] }
      fishing.rods.equipped = rod.id
      const card = await this.card({ player, rod, title: '已更换鱼竿' })
      return { ...card, replies: [`已更换为「${name}」。\n${describe(rod)}`] }
    })
  }

  async card({ player, rod, title }) {
    const text = `${title}：${rod.name}\n${describe(rod)}`
    let image
    try {
      image = await renderRodCard({ nickname: player.nickname || player.qq, title, rod, assetsDir: this.catalog.assetsDir })
    } catch (error) {
      this.logger?.warn?.('rod image failed: %s', String(error?.message ?? error))
    }
    return { ok: true, replies: [text], ...(image === undefined ? {} : { image }) }
  }
}
