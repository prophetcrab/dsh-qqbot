/** Durable token usage statistics for the group loop. */
import { join } from 'node:path'
import { readJsonFile, SerialQueue, writeJsonAtomic } from './atomic.js'

const RECENT_LIMIT = 100
const EMPTY = () => ({
  version: 1,
  updatedAt: null,
  startedAt: null,
  totals: bucket(),
  groups: {},
  days: {},
  recent: [],
})

function bucket() {
  return { calls: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: 0, total: 0, missing: 0 }
}
function integer(value) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? Math.trunc(number) : 0
}
function dayKey(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now)
  const get = (type) => parts.find((part) => part.type === type)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}
export function normalizeUsage(value) {
  const source = value !== null && typeof value === 'object' ? value : {}
  const input = integer(source.input ?? source.inputTokens ?? source.input_tokens ?? source.promptTokens ?? source.prompt_tokens)
  const output = integer(source.output ?? source.outputTokens ?? source.output_tokens ?? source.completionTokens ?? source.completion_tokens)
  const cacheRead = integer(source.cacheRead ?? source.cacheReadTokens ?? source.cache_read_tokens ?? source.cache_read_input_tokens ?? source.cachedTokens ?? source.cached_tokens ?? source.prompt_tokens_details?.cached_tokens)
  const cacheWrite = integer(source.cacheWrite ?? source.cacheWriteTokens ?? source.cache_write_tokens ?? source.cache_creation_input_tokens ?? source.cache_write_input_tokens)
  const reasoning = integer(source.reasoning ?? source.reasoningTokens ?? source.reasoning_tokens)
  const total = integer(source.total ?? source.totalTokens ?? source.total_tokens) || input + output
  return { input, output, cacheRead, cacheWrite, reasoning, total }
}
function add(bucketValue, usage) {
  bucketValue.calls += 1
  bucketValue.input += usage.input
  bucketValue.output += usage.output
  bucketValue.cacheRead += usage.cacheRead
  bucketValue.cacheWrite += usage.cacheWrite
  bucketValue.reasoning += usage.reasoning
  bucketValue.total += usage.total
  if (usage.input === 0 && usage.output === 0) bucketValue.missing += 1
}
function decorate(bucketValue) {
  const value = bucketValue ?? bucket()
  return {
    ...value,
    cacheHitRate: value.input > 0 ? value.cacheRead / value.input : 0,
    avgTotal: value.calls > 0 ? value.total / value.calls : 0,
    avgOutput: value.calls > 0 ? value.output / value.calls : 0,
  }
}
function normalizeState(raw) {
  const base = EMPTY()
  if (raw === null || typeof raw !== 'object') return base
  return {
    ...base,
    ...raw,
    totals: { ...base.totals, ...(raw.totals ?? {}) },
    groups: raw.groups !== null && typeof raw.groups === 'object' ? raw.groups : {},
    days: raw.days !== null && typeof raw.days === 'object' ? raw.days : {},
    recent: Array.isArray(raw.recent) ? raw.recent.slice(-RECENT_LIMIT) : [],
  }
}

export class TokenStatsStore {
  constructor({ projectDir, logger }) {
    this.logger = logger
    this.path = join(projectDir, 'data', 'state', 'token-stats.json')
    this.queue = new SerialQueue()
  }

  async read() {
    return normalizeState(await readJsonFile(this.path, null))
  }

  async record({ groupId = '', loopId = '', kind = 'unknown', usage = null, provider = '', model = '', recent = false }) {
    return this.queue.run(async () => {
      const state = await this.read()
      const normalized = normalizeUsage(usage)
      const now = new Date()
      const at = now.toISOString()
      const date = dayKey(now)
      const group = String(groupId)
      const day = String(date)
      add(state.totals, normalized)
      if (group !== '') {
        state.groups[group] = state.groups[group] ?? bucket()
        add(state.groups[group], normalized)
      }
      state.days[day] = state.days[day] ?? bucket()
      add(state.days[day], normalized)
      if (recent === true) {
        state.recent.push({
          at, loopId: String(loopId), groupId: group, kind: String(kind),
          input: normalized.input, output: normalized.output,
          cacheRead: normalized.cacheRead, cacheWrite: normalized.cacheWrite,
          reasoning: normalized.reasoning, total: normalized.total,
          provider: String(provider), model: String(model),
        })
        if (state.recent.length > RECENT_LIMIT) state.recent = state.recent.slice(-RECENT_LIMIT)
      }
      state.updatedAt = at
      state.startedAt = state.startedAt ?? at
      await writeJsonAtomic(this.path, state)
      return normalized
    })
  }

  async snapshot() {
    const state = await this.read()
    const today = dayKey()
    return {
      totals: decorate(state.totals),
      today: decorate(state.days[today] ?? bucket()),
      groups: Object.entries(state.groups)
        .map(([groupId, value]) => ({ groupId, ...decorate(value) }))
        .sort((a, b) => b.total - a.total),
      recent: state.recent.slice(-RECENT_LIMIT).reverse(),
      startedAt: state.startedAt,
      updatedAt: state.updatedAt,
      recentLimit: RECENT_LIMIT,
    }
  }

  async clear() {
    return this.queue.run(async () => {
      const state = EMPTY()
      state.startedAt = new Date().toISOString()
      state.updatedAt = state.startedAt
      await writeJsonAtomic(this.path, state)
      return this.snapshot()
    })
  }
}
