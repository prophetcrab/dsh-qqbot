/** Fishing currency exchange: deterministic, server-owned balances. */
import { PlayerStore } from '../../../player-store.js'

export const EXCHANGE_RATE = 10
export const exchangeHelp = Object.freeze([
  ['/兑换钓鱼币 <金币数量>', '金币兑换钓鱼币，1 金币 = 10 钓鱼币'],
  ['/钓鱼 兑换金币 <钓鱼币数量>', '钓鱼币兑换金币，10 钓鱼币 = 1 金币，自动向下取整'],
])

const GOLD_TO_FISHING = '/兑换钓鱼币'
const FISHING_TO_GOLD = '/钓鱼'

function parseAmount(value) {
  if (typeof value !== 'string' || !/^[0-9]+$/u.test(value)) return null
  const amount = Number(value)
  return Number.isSafeInteger(amount) && amount > 0 ? amount : null
}

function usage() {
  return { ok: true, replies: ['用法：\n/兑换钓鱼币 金币数量\n/钓鱼 兑换金币 钓鱼币数量'] }
}

function wallet(player) {
  const gold = Number.isSafeInteger(player?.coins) ? player.coins : 0
  const fishingCoins = Number.isSafeInteger(player?.fishingCoins) ? player.fishingCoins : 0
  return { gold, fishingCoins }
}

/**
 * Handle only the two exchange command shapes:
 *   /兑换钓鱼币 <gold>
 *   /钓鱼 兑换金币 <fishingCoins>
 * Returns null for anything else so future fishing subcommands can be routed.
 */
export async function executeExchange({ rawCommand, groupId, userId, nickname, store }) {
  const parts = String(rawCommand).trim().split(/\s+/u)
  const isGoldToFishing = parts[0] === GOLD_TO_FISHING
  const isFishingToGold = parts[0] === FISHING_TO_GOLD
  if (!isGoldToFishing && !isFishingToGold) return null
  if (isGoldToFishing && parts.length !== 2) return usage()
  if (isFishingToGold && parts[1] !== '兑换金币') return null
  if (isFishingToGold && parts.length !== 3) return usage()
  const amount = parseAmount(parts[parts.length - 1])
  if (amount === null) return { ok: true, replies: ['数量必须是正整数。'] }

  return store.mutate(groupId, (state) => {
    const player = state.players[userId]
    if (player === undefined) return { ok: true, replies: ['你还没有在本群注册，先发送 /注册。'] }
    const balance = wallet(player)
    player.coins = balance.gold
    player.fishingCoins = balance.fishingCoins

    if (isGoldToFishing) {
      if (balance.gold < amount) {
        return { ok: true, replies: [`金币不足，当前金币 ${balance.gold}。`] }
      }
      const gain = amount * EXCHANGE_RATE
      player.coins -= amount
      player.fishingCoins += gain
      return { ok: true, replies: [`兑换成功，-${amount} 金币，+${gain} 钓鱼币。当前金币 ${player.coins}，钓鱼币 ${player.fishingCoins}。`] }
    }

    const spendable = Math.min(amount, balance.fishingCoins)
    const goldGain = Math.floor(spendable / EXCHANGE_RATE)
    if (goldGain <= 0) {
      return { ok: true, replies: [`钓鱼币不足 10，当前钓鱼币 ${balance.fishingCoins}。`] }
    }
    const spent = goldGain * EXCHANGE_RATE
    player.fishingCoins -= spent
    player.coins += goldGain
    return { ok: true, replies: [`兑换成功，-${spent} 钓鱼币，+${goldGain} 金币。当前金币 ${player.coins}，钓鱼币 ${player.fishingCoins}。`] }
  })
}
