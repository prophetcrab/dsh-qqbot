/** Per-group player storage for deterministic game commands. */
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { readJsonFile, SerialQueue, writeJsonAtomic } from '../group-loop/atomic.js'

const GROUP_ID = /^[0-9A-Za-z_-]{1,64}$/u
const PLAYER_ID = /^[0-9]{1,20}$/u

function emptyGroup(groupId) {
  return { version: 1, groupId, updatedAt: null, players: {} }
}

export class PlayerStore {
  constructor({ projectDir, logger }) {
    this.root = join(projectDir, 'data', 'state', 'games', 'players')
    this.logger = logger
    this.queues = new Map()
  }

  async listGroupIds() {
    try {
      const entries = await readdir(this.root, { withFileTypes: true })
      return entries
        .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
        .map((entry) => entry.name.slice(0, -5))
        .filter((id) => GROUP_ID.test(id))
        .sort()
    } catch (error) {
      if (error?.code === 'ENOENT') return []
      throw error
    }
  }

  path(groupId) {
    if (!GROUP_ID.test(String(groupId))) throw new Error('invalid group id')
    return join(this.root, `${groupId}.json`)
  }

  async read(groupId) {
    const state = await readJsonFile(this.path(groupId), emptyGroup(String(groupId)))
    if (state === null || typeof state !== 'object' || typeof state.players !== 'object' || state.players === null || Array.isArray(state.players)) {
      return emptyGroup(String(groupId))
    }
    return { ...emptyGroup(String(groupId)), ...state, players: { ...state.players } }
  }

  /** Serialize writes for one group; different groups remain independent. */
  async mutate(groupId, task) {
    const id = String(groupId)
    // Validate before creating a queue entry.
    this.path(id)
    const previous = this.queues.get(id) ?? Promise.resolve()
    const next = previous.then(async () => {
      const state = await this.read(id)
      const result = await task(state)
      state.updatedAt = new Date().toISOString()
      await writeJsonAtomic(this.path(id), state)
      return result
    })
    this.queues.set(id, next.catch(() => {}))
    return next
  }

  static isPlayerId(value) {
    return PLAYER_ID.test(String(value))
  }
}
