/** Deterministic game command service. Commands never enter the LLM loop. */
import { PlayerStore } from './player-store.js'
import { GameRegistry } from './registry.js'
import { exchangeHelp, executeExchange } from './modules/exchange.js'
import { GachaService, gachaHelp } from './modules/gacha.js'
import { playersModule } from './modules/players.js'

const GROUP_ID = /^[0-9A-Za-z_-]{1,64}$/u
const PLAYER_ID = /^[0-9]{1,20}$/u
const COMMAND = /^\/(注册|签到|账号背包|help|帮助)$/u

export class GameCore {
  constructor({ projectDir, assetsDir, logger, random = Math.random, now = () => new Date() }) {
    this.logger = logger
    this.random = random
    this.now = now
    this.store = new PlayerStore({ projectDir, logger })
    this.registry = new GameRegistry([playersModule])
    this.gacha = new GachaService({ projectDir, assetsDir, logger })
  }

  async command(input) {
    const groupId = String(input?.groupId ?? '')
    const userId = String(input?.userId ?? '')
    const rawCommand = String(input?.command ?? '').slice(0, 120).trim()
    if (!GROUP_ID.test(groupId) || !PLAYER_ID.test(userId)) {
      return { ok: false, error: 'invalid command' }
    }
    try {
      if (rawCommand === '/help' || rawCommand === '/帮助') {
        const extras = [...exchangeHelp, ...gachaHelp].map(([command, description]) => `${command}  ${description}`).join('\n')
        return { ok: true, replies: [`${this.registry.helpText()}\n${extras}\n/help  查看所有命令（等同 /帮助）`] }
      }
      const exchange = await executeExchange({
        rawCommand, groupId, userId, nickname: String(input?.nickname ?? ''), store: this.store,
      })
      if (exchange !== null) return exchange
      const gacha = await this.gacha.execute({
        rawCommand, groupId, userId, store: this.store, random: this.random, now: this.now(),
      })
      if (gacha !== null) return gacha
      if (rawCommand === '/钓鱼' || rawCommand.startsWith('/钓鱼 ')) {
        return { ok: true, replies: ['用法：\n/钓鱼 抽卡\n/钓鱼 十连\n/钓鱼 兑换金币 数量'] }
      }
      if (!COMMAND.test(rawCommand)) return { ok: false, error: 'invalid command' }
      return await this.registry.dispatch(rawCommand, {
        groupId,
        userId,
        nickname: String(input?.nickname ?? ''),
        store: this.store,
        random: this.random,
        now: this.now(),
      })
    } catch (error) {
      this.logger?.warn?.('game command failed: %s', String(error?.message ?? error))
      return { ok: false, error: 'game state unavailable' }
    }
  }
}
