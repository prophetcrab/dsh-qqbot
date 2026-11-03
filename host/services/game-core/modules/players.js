/** Player registration, account bag and daily check-in: deterministic, no LLM involvement. */
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

/**
 * Older builds stored coins on the per-group player. Move them once into the
 * account bag, then zero the group balance. The group record remains the
 * membership source of truth.
 */
async function migrateLegacy(accountStore, userId, player) {
  if (player === null || typeof player !== 'object') return
  const legacyCoins = Number(player.coins)
  const legacyDate = player.lastCheckinDate
  if ((!Number.isFinite(legacyCoins) || legacyCoins <= 0) && !legacyDate) return
  await accountStore.mutate(userId, (account) => {
    if (Number.isFinite(legacyCoins) && legacyCoins > 0) account.bag.coins += Math.floor(legacyCoins)
    if (legacyDate && !account.checkin.lastDate) account.checkin.lastDate = String(legacyDate)
    if (Number.isFinite(player.checkinCount) && player.checkinCount > account.checkin.count) account.checkin.count = Math.floor(player.checkinCount)
    player.coins = 0
  })
}

function bagReply(account, nickname) {
  const coins = Math.max(0, Math.floor(Number(account?.bag?.coins) || 0))
  const items = Object.keys(account?.bag?.items ?? {})
  const lines = [`${cleanNickname(nickname, account.qq)}的账号背包`, `金币：${coins}`]
  lines.push(items.length === 0 ? '物品：暂无' : `物品：${items.join('、')}`)
  return { ok: true, replies: [lines.join('\n')] }
}

export const playersModule = {
  id: 'players',
  version: 1,
  commands: COMMANDS,

  async execute({ command, groupId, userId, nickname, store, accounts, random, now }) {
    if (!PlayerStore.isPlayerId(userId)) return { ok: false, error: 'invalid player id' }
    const at = now instanceof Date ? now : new Date()
    const date = shanghaiDate(at)
    if (command === '/账号背包') {
      return store.mutate(groupId, async (state) => {
        const player = state.players[userId]
        await migrateLegacy(accounts, userId, player)
        const account = (await accounts.read(userId)) ?? { bag: { coins: 0, items: {} }, qq: userId }
        return bagReply(account, player?.nickname ?? nickname)
      })
    }

    return store.mutate(groupId, async (state) => {
      const player = state.players[userId]
      if (command === '/注册') {
        if (player !== undefined) {
          await migrateLegacy(accounts, userId, player)
          const account = (await accounts.read(userId)) ?? { bag: { coins: 0 } }
          return { ok: true, replies: [`你已经在册，当前金币 ${account.bag.coins}。发送 /账号背包 查看账号背包。`] }
        }
        const safeName = cleanNickname(nickname, userId)
        state.players[userId] = {
          qq: userId,
          nickname: safeName,
          coins: 0,
          registeredAt: at.toISOString(),
          checkinCount: 0,
          lastCheckinDate: null,
          lastCheckinAt: null,
        }
        const account = await accounts.read(userId)
        if (account === null) await accounts.mutate(userId, () => {})
        return { ok: true, replies: [`注册成功，${safeName}。发送 /签到 领取每日金币，发送 /账号背包 查看背包。`] }
      }

      if (player === undefined) return { ok: true, replies: ['你还没有注册，先发送 /注册。'] }
      await migrateLegacy(accounts, userId, player)
      const outcome = await accounts.mutate(userId, (account) => {
        if (account.checkin.lastDate === date) {
          return { ok: true, replies: [`今天已经签到过了，当前金币 ${account.bag.coins}。`] }
        }
        const gain = checkinGain(random)
        account.bag.coins += gain
        account.checkin.count += 1
        account.checkin.lastDate = date
        account.checkin.lastAt = at.toISOString()
        player.lastCheckinDate = date
        player.lastCheckinAt = at.toISOString()
        player.checkinCount = account.checkin.count
        return { ok: true, replies: [`签到成功，+${gain} 金币，账号金币 ${account.bag.coins}。`] }
      })
      return outcome
    })
  },
}

export { COMMANDS }
