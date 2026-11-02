/**
 * QQ bot access policy: which groups may talk to the bot (inbound) and which
 * groups the bot may send to (outbound). The policy lives in the Koishi
 * project's `data/access.json`, where the companion Koishi plugin
 * `plugins/access-control` watches it.
 */

import { join } from 'node:path'
import { readText, writeFileAtomic } from '../../platform/mac/index.js'

/** Allowed scope modes. */
export const MODES = ['all', 'whitelist', 'blacklist']

/** Default policy: allow everything, no quiet mode. */
export function defaultPolicy() {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    inbound: {
      groups: { mode: 'all', ids: [] },
      private: { mode: 'all', ids: [] },
      quiet: { enabled: false, prefixes: ['/'] },
    },
    outbound: {
      groups: { mode: 'all', ids: [] },
      private: { mode: 'all', ids: [] },
    },
  }
}

/** Path of the policy file inside the configured Koishi project. */
export function accessPath(settings) {
  return join(settings.projectDir, 'data', 'access.json')
}

/**
 * Normalize an arbitrary policy object into the canonical shape.
 * Unknown modes fall back to `all`; ids are trimmed, deduplicated and sorted.
 *
 * @param {unknown} raw
 * @param {{ stamp?: boolean }} [options]
 */
export function normalizePolicy(raw, options = {}) {
  const source = raw !== null && typeof raw === 'object' ? raw : {}
  const inbound = source.inbound !== null && typeof source.inbound === 'object' ? source.inbound : {}
  const outbound = source.outbound !== null && typeof source.outbound === 'object' ? source.outbound : {}
  const quiet = inbound.quiet !== null && typeof inbound.quiet === 'object' ? inbound.quiet : {}
  const policy = {
    version: 1,
    updatedAt: options.stamp
      ? new Date().toISOString()
      : typeof source.updatedAt === 'string' ? source.updatedAt : new Date().toISOString(),
    inbound: {
      groups: normalizeScope(inbound.groups),
      private: normalizeScope(inbound.private),
      quiet: {
        enabled: quiet.enabled === true,
        prefixes: normalizePrefixes(quiet.prefixes),
      },
    },
    outbound: {
      groups: normalizeScope(outbound.groups),
      private: normalizeScope(outbound.private),
    },
  }
  return policy
}

/**
 * Read the policy file, falling back to the default when it is missing or
 * malformed. Never throws.
 *
 * @param {string} file
 * @param {{ defaultPolicy?: () => object, readText?: typeof readText }} [deps]
 * @returns {Promise<{ policy: object, exists: boolean, error?: string }>}
 */
export async function readPolicy(file, deps = {}) {
  const reader = deps.readText ?? readText
  const fallback = (deps.defaultPolicy ?? defaultPolicy)()
  const text = await reader(file, undefined)
  if (text === undefined) {
    return { policy: normalizePolicy(fallback), exists: false }
  }
  try {
    return { policy: normalizePolicy(JSON.parse(text)), exists: true }
  } catch (error) {
    return { policy: normalizePolicy(fallback), exists: true, error: String(error?.message ?? error) }
  }
}

/**
 * Validate, stamp and atomically write a policy.
 *
 * @param {string} file
 * @param {unknown} raw
 * @param {{ write?: typeof writeFileAtomic }} [deps]
 * @returns {Promise<object>} the written policy
 */
export async function writePolicy(file, raw, deps = {}) {
  const writer = deps.write ?? writeFileAtomic
  const policy = normalizePolicy(raw, { stamp: true })
  await writer(file, `${JSON.stringify(policy, null, 2)}\n`)
  return policy
}

/**
 * Parse a textarea-style list of QQ ids. Accepts newlines, spaces, commas and
 * the full-width variants; keeps 5-15 digit ids only.
 *
 * @param {unknown} text
 * @returns {string[]}
 */
export function parseIdList(text) {
  if (typeof text !== 'string' || text.trim() === '') return []
  const parts = text.split(/[\s,，、;；]+/u)
  const ids = new Set()
  for (const part of parts) {
    const id = part.trim()
    if (/^\d{5,15}$/u.test(id)) ids.add(id)
  }
  return [...ids].sort()
}

/**
 * Human/UI summary of a policy.
 * @param {object} policy
 */
export function summarizePolicy(policy) {
  const normalized = normalizePolicy(policy)
  return {
    inbound: {
      groups: normalized.inbound.groups.mode,
      groupCount: normalized.inbound.groups.ids.length,
      private: normalized.inbound.private.mode,
      privateCount: normalized.inbound.private.ids.length,
      quiet: normalized.inbound.quiet.enabled,
      prefixes: normalized.inbound.quiet.prefixes,
    },
    outbound: {
      groups: normalized.outbound.groups.mode,
      groupCount: normalized.outbound.groups.ids.length,
      private: normalized.outbound.private.mode,
      privateCount: normalized.outbound.private.ids.length,
    },
    updatedAt: normalized.updatedAt,
  }
}

/** Normalize a `{ mode, ids }` scope block. */
function normalizeScope(value) {
  const source = value !== null && typeof value === 'object' ? value : {}
  const mode = MODES.includes(source.mode) ? source.mode : 'all'
  const ids = Array.isArray(source.ids)
    ? [...new Set(source.ids.map((item) => String(item).trim()).filter((item) => /^\d{5,15}$/u.test(item)))].sort()
    : []
  return { mode, ids }
}

/** Normalize quiet-mode prefixes; an empty list falls back to `/`. */
function normalizePrefixes(value) {
  if (!Array.isArray(value)) return ['/']
  const prefixes = [...new Set(value.map((item) => String(item).trim()).filter((item) => item !== ''))]
  return prefixes.length === 0 ? ['/'] : prefixes
}

/**
 * Render a policy summary as plain text for the `qqbot_access` agent tool.
 *
 * @param {ReturnType<typeof summarizePolicy>} summary
 * @param {string} file
 * @param {boolean} exists
 */
export function describePolicySummary(summary, file, exists) {
  return [
    `接收：群=${describeScope(summary.inbound)}，私聊=${summary.inbound.private}`,
    `发送：群=${describeScope(summary.outbound)}，私聊=${summary.outbound.private}`,
    `安静模式：${summary.inbound.quiet ? `开启（前缀 ${summary.inbound.prefixes.join(' ')}）` : '关闭'}`,
    `策略文件：${file}${exists ? '' : '（尚未创建，默认全部放行）'}`,
  ].join('\n')
}

/**
 * Render one access scope (mode + count) for status text.
 * @param {{ groups?: string, groupCount?: number }|null|undefined} scope
 */
export function describeScope(scope) {
  if (scope === undefined || scope === null) return '未知'
  const labels = { all: '全部', whitelist: '白名单', blacklist: '黑名单' }
  const label = labels[scope.groups] ?? String(scope.groups ?? '未知')
  const count = Number(scope.groupCount ?? 0)
  return count === 0 ? label : `${label}(${count})`
}
