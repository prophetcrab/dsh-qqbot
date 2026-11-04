/** Shared deterministic player/account core. Fishing is a separate plugin. */
import { PlayerStore } from './player-store.js'
import { GameRegistry } from './registry.js'
import { playersModule } from './modules/players.js'

const GROUP_ID = /^[0-9A-Za-z_-]{1,64}$/u
const PLAYER_ID = /^[0-9]{1,20}$/u
const COMMAND = /^\/(注册|签到|账号背包|help|帮助)$/u

export class GameCore {
  constructor({ projectDir, logger, random = Math.random, now = () => new Date() }) {
    this.logger = logger
    this.random = random
    this.now = now
    this.store = new PlayerStore({ projectDir, logger })
    this.registry = new GameRegistry([playersModule])
    this.helpSources = new Map()
  }

  registerHelp(id, entries) {
    if (!Array.isArray(entries)) return
    this.helpSources.set(String(id), Object.freeze(entries.map((entry) => [...entry])))
  }

  helpText() {
    const lines = [this.registry.helpText()]
    for (const entries of this.helpSources.values()) {
      for (const [command, description] of entries) lines.push(`${command}  ${description}`)
    }
    lines.push('/help  查看所有命令（等同 /帮助）')
    return [...new Set(lines)].join('\n')
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
        return { ok: true, replies: [this.helpText()] }
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
