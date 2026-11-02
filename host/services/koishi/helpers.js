/**
 * Helpers, seams and constants shared by the Koishi service.
 *
 * Kept out of index.js so the manager stays readable: executor normalizers,
 * PID probes, output formatting and small clamps all live here.
 */

import { connect } from 'node:net'
import {
  hostPlatform as platformHostPlatform,
  httpJson,
  portPid as platformPortPid,
  run,
} from '../../platform/mac/index.js'

/** Absolute lsof path on macOS; used by the legacy (injected exec) PID path. */
export const LSOF = '/usr/sbin/lsof'

/** Fallback Koishi port (`settings.koishiPort` wins). */
export const DEFAULT_PORT = 5140

/** Health endpoint served by the Koishi `health` plugin. */
export const HEALTH_PATH = '/api/qqbot/health'

export const DEFAULT_START_TIMEOUT_MS = 30_000
export const DEFAULT_STOP_TIMEOUT_MS = 5_000
export const DEFAULT_KILL_TIMEOUT_MS = 2_000
export const DEFAULT_POLL_INTERVAL_MS = 500
export const DEFAULT_HEALTH_TIMEOUT_MS = 4_000
export const DEFAULT_INSTALL_TIMEOUT_MS = 300_000
export const DEFAULT_LOG_LIMIT = 400

/** Logger used when the host does not supply one (tests, scripts). */
export const QUIET_LOGGER = {
  info() {},
  warn() {},
  error() {},
  debug() {},
}

/**
 * Normalize the injectable executor to a `(file, args, options)` function.
 *
 * @param {unknown} exec function, `{ run }` bag, or undefined for util.run
 * @returns {(file: string, args?: string[], options?: object) => Promise<{ code: number, stdout: string, stderr: string, error?: string }>}
 */
export function normalizeExec(exec) {
  if (typeof exec === 'function') return exec
  if (exec !== null && typeof exec === 'object' && typeof exec.run === 'function') {
    return exec.run.bind(exec)
  }
  return run
}

/** @param {unknown} logger */
export function normalizeLogger(logger) {
  if (logger === null || logger === undefined || typeof logger !== 'object') return QUIET_LOGGER
  return {
    info: typeof logger.info === 'function' ? logger.info.bind(logger) : QUIET_LOGGER.info,
    warn: typeof logger.warn === 'function' ? logger.warn.bind(logger) : QUIET_LOGGER.warn,
    error: typeof logger.error === 'function' ? logger.error.bind(logger) : QUIET_LOGGER.error,
    debug: typeof logger.debug === 'function' ? logger.debug.bind(logger) : QUIET_LOGGER.debug,
  }
}

/** Accept a hostPlatform function or a platform id string. */
export function normalizeHostPlatform(value) {
  if (typeof value === 'function') return value
  if (typeof value === 'string' && value !== '') return () => value
  return null
}

/** Coerce a candidate into a valid TCP port, else fallback. */
export function toPort(value, fallback) {
  const port = Number(value)
  return Number.isInteger(port) && port > 0 && port < 65536 ? port : fallback
}

/** @param {unknown} error */
export function errorText(error) {
  return String(error?.message ?? error ?? 'unknown error')
}

/** Combine npm stdout/stderr for user-facing output. */
export function combineOutput(result) {
  if (result === null || result === undefined) return ''
  const stdout = String(result.stdout ?? '')
  const stderr = String(result.stderr ?? '')
  return [stdout.trim(), stderr.trim()].filter((part) => part !== '').join('\n')
}

/** Keep output panels responsive by capping captured npm output. */
export function truncateOutput(text, limit = 4000) {
  const value = String(text ?? '')
  if (value.length <= limit) return value
  return `${value.slice(0, limit)}\n…（输出已截断）`
}

/** Default SIGTERM/SIGKILL sender. EPERM means the process exists but is not ours. */
export function defaultProcessKill(pid, signal) {
  try {
    process.kill(pid, signal)
    return true
  } catch (error) {
    return error?.code === 'EPERM' ? true : false
  }
}

/**
 * Coerce a candidate into a positive integer PID, else `null`.
 * @param {unknown} value
 * @returns {number|null}
 */
export function toPid(value) {
  const pid = Number(value)
  return Number.isInteger(pid) && pid > 0 ? pid : null
}

/**
 * Resolve the listening PID for a TCP port.
 *
 * Priority:
 * 1. an injected `portPid` (tests, custom hosts);
 * 2. an injected `exec`, parsed from legacy `lsof` output (backwards compatible);
 * 3. `platform.portPid` — macOS `lsof`.
 *
 * Kept async because every probe is asynchronous; callers must await.
 *
 * @param {number} port
 * @param {{ exec?: unknown, portPid?: Function }} [options] test seams
 * @returns {Promise<number|null>}
 */
export async function findPidByPort(port, options = {}) {
  const target = toPort(port, 0)
  if (target === 0) return null

  if (typeof options.portPid === 'function') {
    return toPid(await options.portPid(target))
  }

  if (options.exec !== undefined && options.exec !== null) {
    const exec = normalizeExec(options.exec)
    const result = await exec(LSOF, ['-nP', `-iTCP:${target}`, '-sTCP:LISTEN'], { timeoutMs: 8000 })
    if (result === null || result === undefined || result.code !== 0) return null
    const output = String(result.stdout ?? '')
    for (const line of output.split(/\r?\n/u)) {
      if (line.trim() === '') continue
      const match = /^\s*\S+\s+(\d+)\s/u.exec(line)
      if (match === null) continue
      const pid = toPid(match[1])
      if (pid !== null) return pid
    }
    return null
  }

  return toPid(await platformPortPid(target))
}

/** TCP connect probe used when lsof is unavailable. */
export function probePort(port, timeoutMs = 800) {
  return new Promise((resolvePromise) => {
    let settled = false
    const socket = connect({ host: '127.0.0.1', port })
    const finish = (value) => {
      if (settled) return
      settled = true
      socket.destroy()
      resolvePromise(value)
    }
    socket.setTimeout(timeoutMs, () => finish(false))
    socket.once('connect', () => finish(true))
    socket.once('error', () => finish(false))
  })
}

/** Pick display values from the health endpoint's bots array. */
export function pickBot(bots) {
  const list = Array.isArray(bots) ? bots.filter((bot) => bot !== null && typeof bot === 'object') : []
  const chosen = list.find((bot) => bot.online === true) ?? list[0] ?? null
  return {
    selfId: chosen?.selfId !== undefined && chosen?.selfId !== null ? String(chosen.selfId) : null,
    platform: typeof chosen?.platform === 'string' && chosen.platform !== '' ? chosen.platform : null,
  }
}

/** Clamp a line count to the 1..2000 range the routes accept. */
export function boundLines(count) {
  const value = Number(count)
  if (!Number.isFinite(value)) return 200
  return Math.min(2000, Math.max(1, Math.floor(value)))
}

/** Positive finite number fallback helper. */
export function numberOr(value, fallback) {
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? number : fallback
}

export async function requestJson(manager, url, options = {}) {
  if (manager.fetch === null) return httpJson(url, { timeoutMs: options.timeoutMs })
  const timeoutMs = options.timeoutMs ?? manager.healthTimeoutMs
  try {
    const response = await manager.fetch(url, {
      method: 'GET',
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
    })
    const status = Number(response?.status ?? 0)
    let data = null
    if (typeof response?.text === 'function') {
      const text = await response.text()
      if (typeof text === 'string' && text !== '') {
        try {
          data = JSON.parse(text)
        } catch {
          data = text
        }
      }
    } else if (typeof response?.json === 'function') {
      try {
        data = await response.json()
      } catch {
        data = null
      }
    }
    return {
      ok: response?.ok === true || (status >= 200 && status < 300),
      status,
      data,
    }
  } catch (error) {
    return { ok: false, status: 0, data: null, error: errorText(error) }
  }
}
