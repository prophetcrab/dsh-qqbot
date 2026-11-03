/** Deterministic game command service. Commands never enter the LLM loop. */
import { PlayerStore } from './player-store.js'
import { GameRegistry } from './registry.js'
import { playersModule } from './modules/players.js'

const GROUP_ID = /^[0-9A-Za-z_-]{1,64}$/u
const PLAYER_ID = /^[0-9]{1,20}$/u
const COMMAND = /^\/(注册|签到)$/u

export class GameCore {
  constructor({ projectDir, logger, random = Math.random, now = () => new Date() }) {
    this.logger = logger
    this.random = random
    this.now = now
    this.store = new PlayerStore({ projectDir, logger })
    this.registry = new GameRegistry([playersModule])
  }

  async command(input) {
    const groupId = String(input?.groupId ?? '')
    const userId = String(input?.userId ?? '')
    const rawCommand = String(input?.command ?? '').trim()
    if (!GROUP_ID.test(groupId) || !PLAYER_ID.test(userId) || !COMMAND.test(rawCommand)) {
      return { ok: false, error: 'invalid command' }
    }
    try {
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
