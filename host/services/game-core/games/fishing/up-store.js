/** Per-group current gacha UP overrides, persisted outside player state. */
import { join } from 'node:path'
import { readJsonFile, SerialQueue, writeJsonAtomic } from '../../../group-loop/atomic.js'
import { CURRENT_UP } from './gacha-config.js'

const GROUP_ID = /^[0-9A-Za-z_-]{1,64}$/u

function normalizeGroup(value) {
  const id = String(value ?? '')
  return GROUP_ID.test(id) ? id : ''
}

export class UpStore {
  constructor({ projectDir, logger }) {
    this.logger = logger
    this.path = join(projectDir, 'data', 'config', 'games', 'up.json')
    this.queue = new SerialQueue()
  }

  async readAll() {
    const parsed = await readJsonFile(this.path, { version: 1, groups: {} })
    if (parsed === null || typeof parsed !== 'object' || parsed.groups === null || typeof parsed.groups !== 'object' || Array.isArray(parsed.groups)) {
      return { version: 1, groups: {} }
    }
    return { version: 1, groups: { ...parsed.groups } }
  }

  async get(groupId) {
    const id = normalizeGroup(groupId)
    if (id === '') return { rod: CURRENT_UP.rod, bait: CURRENT_UP.bait, updatedAt: null }
    const data = await this.readAll()
    const entry = data.groups[id]
    if (entry === null || typeof entry !== 'object') return { rod: CURRENT_UP.rod, bait: CURRENT_UP.bait, updatedAt: null }
    return {
      rod: typeof entry.rod === 'string' && entry.rod !== '' ? entry.rod : CURRENT_UP.rod,
      bait: typeof entry.bait === 'string' && entry.bait !== '' ? entry.bait : CURRENT_UP.bait,
      updatedAt: typeof entry.updatedAt === 'string' ? entry.updatedAt : null,
    }
  }

  async set(groupId, { rod, bait }) {
    const id = normalizeGroup(groupId)
    if (id === '') throw new Error('invalid group id')
    return this.queue.run(async () => {
      const data = await this.readAll()
      data.groups[id] = { rod, bait, updatedAt: new Date().toISOString() }
      await writeJsonAtomic(this.path, data)
      return this.get(id)
    })
  }
}
