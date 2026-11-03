/** Account-level inventory, independent from per-group player records. */
import { join } from 'node:path'
import { readJsonFile, SerialQueue, writeJsonAtomic } from '../group-loop/atomic.js'

const ACCOUNT_ID = /^[0-9]{1,20}$/u

function emptyAccount(qq) {
  return {
    version: 1,
    qq: String(qq),
    createdAt: null,
    updatedAt: null,
    bag: { coins: 0, items: {} },
    checkin: { lastDate: null, count: 0, lastAt: null },
  }
}

export class AccountStore {
  constructor({ projectDir, logger }) {
    this.root = join(projectDir, 'data', 'state', 'games', 'accounts')
    this.logger = logger
    this.queues = new Map()
  }

  path(qq) {
    if (!ACCOUNT_ID.test(String(qq))) throw new Error('invalid account id')
    return join(this.root, `${qq}.json`)
  }

  async read(qq) {
    const path = this.path(qq)
    const state = await readJsonFile(path, null)
    if (state === null || typeof state !== 'object') return null
    return {
      ...emptyAccount(String(qq)),
      ...state,
      bag: { ...emptyAccount(String(qq)).bag, ...(state.bag ?? {}), items: { ...(state.bag?.items ?? {}) } },
      checkin: { ...emptyAccount(String(qq)).checkin, ...(state.checkin ?? {}) },
    }
  }

  async mutate(qq, task) {
    const id = String(qq)
    this.path(id)
    const previous = this.queues.get(id) ?? Promise.resolve()
    const next = previous.then(async () => {
      const current = (await this.read(id)) ?? emptyAccount(id)
      const result = await task(current)
      current.updatedAt = new Date().toISOString()
      current.createdAt ??= current.updatedAt
      await writeJsonAtomic(this.path(id), current)
      return result
    })
    this.queues.set(id, next.catch(() => {}))
    return next
  }

  static isAccountId(value) {
    return ACCOUNT_ID.test(String(value))
  }
}
