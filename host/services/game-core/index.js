/** Deterministic game command service. Commands never enter the LLM loop. */
import { PlayerStore } from './player-store.js'
import { GameRegistry } from './registry.js'
import { FISHING_HELP, FishingGame } from './games/fishing/index.js'
import { executeExchange } from './games/fishing/modules/exchange.js'
import { playersModule } from './modules/players.js'

const GROUP_ID = /^[0-9A-Za-z_-]{1,64}$/u
const PLAYER_ID = /^[0-9]{1,20}$/u
const COMMAND = /^\/(注册|签到|账号背包|help|帮助)$/u

export class GameCore {
  constructor({ projectDir, assetsDir, logger, random = Math.random, now = () => new Date(), castDurationMs = 300000 }) {
    this.logger = logger
    this.random = random
    this.now = now
    this.store = new PlayerStore({ projectDir, logger })
    this.registry = new GameRegistry([playersModule])
    this.fishing = new FishingGame({ projectDir, assetsDir, logger, castDurationMs, store: this.store })
    this.up = this.fishing.up
    this.gacha = this.fishing.gacha
    this.bag = this.fishing.bag
    this.rod = this.fishing.rod
    this.pool = this.fishing.pool
    this.cast = this.fishing.cast
    this.storage = this.fishing.storage
    this.admin = this.fishing.admin
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
        const extras = FISHING_HELP.map(([command, description]) => `${command}  ${description}`).join('\n')
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
      const bag = await this.bag.execute({ rawCommand, groupId, userId, store: this.store })
      if (bag !== null) return bag
      const rod = await this.rod.execute({ rawCommand, groupId, userId, store: this.store })
      if (rod !== null) return rod
      const pool = await this.pool.execute({ rawCommand, groupId, userId, store: this.store })
      if (pool !== null) return pool
      const cast = await this.cast.execute({ rawCommand, groupId, userId, store: this.store, random: this.random, now: this.now() })
      if (cast !== null) return cast
      const storage = await this.storage.execute({ rawCommand, groupId, userId, store: this.store })
      if (storage !== null) return storage
      if (rawCommand === '/钓鱼' || rawCommand.startsWith('/钓鱼 ')) {
        return { ok: true, replies: ['用法：\n/钓鱼 抛竿 [鱼饵名]\n/钓鱼 收竿\n/钓鱼 鱼仓\n/钓鱼 卖鱼 编号\n/钓鱼 抽卡\n/钓鱼 十连\n/钓鱼 卡池\n/钓鱼 道具库\n/钓鱼 查看鱼竿\n/钓鱼 更换鱼竿 鱼竿名\n/钓鱼 兑换金币 数量'] }
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
