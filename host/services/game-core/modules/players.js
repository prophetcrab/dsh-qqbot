/** Per-group player registration, bag and daily check-in: deterministic, no LLM. */
import { PlayerStore } from '../player-store.js'

const COMMANDS = Object.freeze(['/注册', '/签到', '/账号背包'])

function cleanNickname(value, fallback) {
  const cleaned = String(value ?? '').replace(/[\u0000-\u001f\u007f]/gu, ' ').replace(/\s+/gu, ' ').trim().slice(0, 24)
  return cleaned === '' ? String(fallback) : cleaned
}

function shanghaiDate(now) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now)
  const get = (type) => parts.find((part) => part.type === type)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

function checkinGain(random) {
  const value = Number(random())
  const normalized = Number.isFinite(value) ? Math.min(0.999999, Math.max(0, value)) : 0
  return 10 + Math.floor(normalized * 21)
}

function bagReply(player, fallbackName) {
  const coins = Math.max(0, Math.floor(Number(player?.coins) || 0))
  const fishingCoins = Math.max(0, Math.floor(Number(player?.fishingCoins) || 0))
  const items = Object.keys(player?.items ?? {})
  return {
    ok: true,
    replies: [[
      `${cleanNickname(player?.nickname, fallbackName)}的账号背包`,
      `金币：${coins}`,
      `钓鱼币：${fishingCoins}`,
      items.length === 0 ? '物品：暂无' : `物品：${items.join('、')}`,
    ].join('\n')],
  }
}

export const playersModule = {
  id: 'players',
  version: 2,
  commands: COMMANDS,
  help: {
    '/注册': '在当前群注册玩家',
    '/签到': '每天在本群签到一次，随机获得 10–30 金币',
    '/账号背包': '查看当前群的账号背包',
  },

  async execute({ command, groupId, userId, nickname, store, random, now }) {
    if (!PlayerStore.isPlayerId(userId)) return { ok: false, error: 'invalid player id' }
    const at = now instanceof Date ? now : new Date()
    const date = shanghaiDate(at)
    return store.mutate(groupId, (state) => {
      const player = state.players[userId]
      if (command === '/注册') {
        if (player !== undefined) {
          return { ok: true, replies: [`你已经在册，当前金币 ${player.coins}。发送 /账号背包 查看本群背包。`] }
        }
        const safeName = cleanNickname(nickname, userId)
        state.players[userId] = {
          qq: userId,
          nickname: safeName,
          coins: 0,
          fishingCoins: 0,
          items: {},
          registeredAt: at.toISOString(),
          checkinCount: 0,
          lastCheckinDate: null,
          lastCheckinAt: null,
        }
        return { ok: true, replies: [`注册成功，${safeName}。发送 /签到 领取本群每日金币，发送 /账号背包 查看本群背包。`] }
      }
      if (player === undefined) return { ok: true, replies: ['你还没有在本群注册，先发送 /注册。'] }
      if (command === '/账号背包') return bagReply(player, nickname)
      if (player.lastCheckinDate === date) {
        return { ok: true, replies: [`今天已经签到过了，当前金币 ${player.coins}。`] }
      }
      const gain = checkinGain(random)
      player.coins += gain
      player.checkinCount += 1
      player.lastCheckinDate = date
      player.lastCheckinAt = at.toISOString()
      return { ok: true, replies: [`签到成功，+${gain} 金币，当前金币 ${player.coins}。发送 /账号背包 查看本群背包。`] }
    })
  },
}

export { COMMANDS }
