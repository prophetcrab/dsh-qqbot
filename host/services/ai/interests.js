/**
 * Semantic group interests maintained by the AI host.
 *
 * The extractor is an LLM prompt; this module only stores, merges, decays and
 * expires the resulting topic records. Koishi reads the same JSON file and
 * matches these curated labels/aliases instead of learning raw message
 * fragments.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

export const INTEREST_DEFAULTS = Object.freeze({
  halfLifeMs: 7 * 24 * 60 * 60 * 1000,
  minWeight: 0.05,
})

export function normalizeInterest(input, now = Date.now()) {
  const source = input !== null && typeof input === 'object' ? input : {}
  const label = typeof source.label === 'string' ? source.label.trim().slice(0, 40) : ''
  if (label === '') return null
  const aliases = Array.isArray(source.aliases)
    ? [...new Set(source.aliases.filter((item) => typeof item === 'string').map((item) => item.trim().slice(0, 40)).filter((item) => item !== ''))].slice(0, 6)
    : []
  const ttlHours = Number(source.ttlHours)
  const ttl = Number.isFinite(ttlHours) ? Math.min(24 * 30, Math.max(1, ttlHours)) : 72
  return {
    label,
    aliases,
    summary: typeof source.summary === 'string' ? source.summary.trim().slice(0, 200) : '',
    weight: clamp(Number(source.weight) || 0.5),
    confidence: clamp(Number(source.confidence) || 0.6),
    ttlHours: ttl,
    expiresAt: now + ttl * 60 * 60 * 1000,
    lastSeenAt: now,
    source: 'llm',
  }
}

function clamp(value) {
  return Math.min(1, Math.max(0.05, value))
}

function keyOf(groupId, label) {
  return `${groupId}|${String(label).trim().toLowerCase()}`
}

export class InterestStore {
  constructor(path, options = {}) {
    this.path = typeof path === 'string' ? path : null
    this.halfLifeMs = options.halfLifeMs ?? INTEREST_DEFAULTS.halfLifeMs
    this.minWeight = options.minWeight ?? INTEREST_DEFAULTS.minWeight
    this.groups = new Map()
    this.loaded = false
    this.queue = Promise.resolve()
    this.extractionAt = new Map()
  }

  /** Throttle expensive LLM extraction per group. */
  shouldExtract(groupId, now = Date.now(), minIntervalMs = 10 * 60 * 1000) {
    const last = this.extractionAt.get(groupId) ?? 0
    if (now - last < minIntervalMs) return false
    this.extractionAt.set(groupId, now)
    return true
  }

  async load() {
    if (this.loaded || this.path === null) return
    this.loaded = true
    try {
      const parsed = JSON.parse(await readFile(this.path, 'utf8'))
      const list = Array.isArray(parsed?.interests) ? parsed.interests : []
      for (const item of list) {
        if (item === null || typeof item !== 'object' || typeof item.groupId !== 'string') continue
        const key = keyOf(item.groupId, item.label)
        this.groups.set(key, { ...item, groupId: item.groupId })
      }
    } catch {
      // missing or corrupt state starts empty
    }
  }

  async merge(groupId, candidates, now = Date.now()) {
    if (this.path === null || typeof groupId !== 'string' || groupId === '') return []
    await this.load()
    this.prune(now)
    const accepted = []
    for (const raw of Array.isArray(candidates) ? candidates : []) {
      const candidate = normalizeInterest(raw, now)
      if (candidate === null) continue
      const key = keyOf(groupId, candidate.label)
      const existing = this.groups.get(key)
      if (existing === undefined) {
        this.groups.set(key, { ...candidate, groupId })
        accepted.push(candidate.label)
        continue
      }
      existing.weight = clamp(Math.max(existing.weight, candidate.weight) + 0.05)
      existing.confidence = clamp(Math.max(existing.confidence, candidate.confidence))
      existing.aliases = [...new Set([...(existing.aliases ?? []), ...candidate.aliases])].slice(0, 6)
      if (candidate.summary !== '') existing.summary = candidate.summary
      existing.lastSeenAt = now
      existing.expiresAt = candidate.expiresAt
      existing.ttlHours = candidate.ttlHours
      accepted.push(existing.label)
    }
    await this.save(now)
    return accepted
  }

  prune(now = Date.now()) {
    for (const [key, interest] of this.groups) {
      if (Number(interest.expiresAt) > 0 && now >= Number(interest.expiresAt)) {
        this.groups.delete(key)
        continue
      }
      const idle = Math.max(0, now - Number(interest.lastSeenAt || now))
      interest.weight = clamp(Number(interest.weight) * Math.pow(0.5, idle / this.halfLifeMs))
      if (interest.weight < this.minWeight) this.groups.delete(key)
    }
  }

  snapshot() {
    return [...this.groups.values()].map((item) => ({ ...item, aliases: [...(item.aliases ?? [])] }))
  }

  async save(now = Date.now()) {
    if (this.path === null) return
    const payload = { version: 1, updatedAt: new Date(now).toISOString(), interests: this.snapshot() }
    this.queue = this.queue.then(async () => {
      await mkdir(dirname(this.path), { recursive: true })
      await writeFile(this.path, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
    }).catch(() => {})
    await this.queue
  }
}
