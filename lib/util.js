/**
 * Small shared primitives for the QQ bot plugin host: process execution, HTTP,
 * JSON files, token masking and a bounded log ring.
 *
 * Everything here is dependency-free and safe to import from tests.
 */

import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync as fsExistsSync, promises as fsp } from 'node:fs'
import { homedir } from 'node:os'
import { dirname } from 'node:path'

/** Expand a leading `~` to the current user's home directory. */
export function expandHome(path) {
  if (typeof path !== 'string' || path === '') return path
  if (path === '~') return homedir()
  if (path.startsWith('~/')) return `${homedir()}/${path.slice(2)}`
  return path
}

/** Synchronous existence check with `~` expansion. */
export function existsSync(path) {
  try {
    return fsExistsSync(expandHome(path))
  } catch {
    return false
  }
}

/**
 * Run a file without a shell. Never throws for a non-zero exit; resolves with
 * the captured streams so callers can report the failure instead of crashing.
 *
 * @param {string} file
 * @param {string[]} [args]
 * @param {{ cwd?: string, env?: Record<string, string>, timeoutMs?: number, input?: string }} [options]
 * @returns {Promise<{ code: number, stdout: string, stderr: string, error?: string }>}
 */
export function run(file, args = [], options = {}) {
  return new Promise((resolvePromise) => {
    let child
    try {
      child = execFile(
        file,
        args,
        {
          cwd: options.cwd,
          env: options.env ?? process.env,
          timeout: options.timeoutMs ?? 30_000,
          maxBuffer: 8 * 1024 * 1024,
          windowsHide: true,
        },
        (error, stdout, stderr) => {
          const code = error === null || error === undefined
            ? 0
            : typeof error.code === 'number' ? error.code : 1
          resolvePromise({
            code,
            stdout: String(stdout ?? ''),
            stderr: String(stderr ?? ''),
            error: error === null || error === undefined ? undefined : String(error.message ?? error),
          })
        },
      )
    } catch (error) {
      resolvePromise({ code: 1, stdout: '', stderr: '', error: String(error?.message ?? error) })
      return
    }
    if (typeof options.input === 'string' && child.stdin !== null) {
      child.stdin.end(options.input)
    }
  })
}

/**
 * Run a fixed shell command. Only for constant strings that never contain
 * caller-provided values; user input must go through {@link run}.
 *
 * @param {string} command
 * @param {{ cwd?: string, timeoutMs?: number }} [options]
 * @returns {Promise<{ code: number, stdout: string, stderr: string }>}
 */
export async function runShell(command, options = {}) {
  return run('/bin/sh', ['-c', command], options)
}

/** Create a directory (and parents) if missing. */
export async function ensureDir(path) {
  await fsp.mkdir(expandHome(path), { recursive: true })
}

/** Read a UTF-8 text file, returning `fallback` when it is missing/unreadable. */
export async function readText(path, fallback = undefined) {
  try {
    return await fsp.readFile(expandHome(path), 'utf8')
  } catch {
    return fallback
  }
}

/** Parse a JSON file, returning `fallback` on any error. */
export async function readJson(path, fallback = undefined) {
  const text = await readText(path)
  if (text === undefined) return fallback
  try {
    return JSON.parse(text)
  } catch {
    return fallback
  }
}

/** Atomically replace a file with `text` (write + rename). */
export async function writeFileAtomic(path, text) {
  const target = expandHome(path)
  await ensureDir(dirname(target))
  const temporary = `${target}.tmp-${process.pid}-${Date.now()}`
  await fsp.writeFile(temporary, text, 'utf8')
  await fsp.rename(temporary, target)
}

/** Whether a directory exists (alias kept for readability at call sites). */
export async function directoryExists(path) {
  try {
    const stat = await fsp.stat(expandHome(path))
    return stat.isDirectory()
  } catch {
    return false
  }
}

/**
 * JSON HTTP helper built on the global fetch. Network and HTTP errors are
 * reported in the result instead of thrown.
 *
 * @param {string} url
 * @param {{ method?: string, body?: unknown, headers?: Record<string,string>, timeoutMs?: number }} [options]
 * @returns {Promise<{ ok: boolean, status: number, data: any, error?: string }>}
 */
export async function httpJson(url, options = {}) {
  const method = options.method ?? 'GET'
  const headers = { accept: 'application/json', ...(options.headers ?? {}) }
  let body
  if (options.body !== undefined && options.body !== null) {
    headers['content-type'] ??= 'application/json'
    body = typeof options.body === 'string' ? options.body : JSON.stringify(options.body)
  }
  try {
    const response = await fetch(url, {
      method,
      headers,
      body,
      signal: AbortSignal.timeout(options.timeoutMs ?? 10_000),
    })
    const text = await response.text()
    let data = null
    if (text !== '') {
      try {
        data = JSON.parse(text)
      } catch {
        data = text
      }
    }
    return { ok: response.ok, status: response.status, data }
  } catch (error) {
    return { ok: false, status: 0, data: null, error: String(error?.message ?? error) }
  }
}

/** Hex SHA-256 digest. */
export function sha256Hex(text) {
  return createHash('sha256').update(String(text)).digest('hex')
}

/** Resolve an executable from PATH without a shell; returns null when missing. */
export async function findCommand(name) {
  const result = await run('/usr/bin/which', [name], { timeoutMs: 5000 })
  const path = result.stdout.trim().split('\n')[0]
  return result.code === 0 && path !== '' ? path : null
}

/** Mask a secret for logs/UI: keep only a short prefix. */
export function maskToken(value) {
  if (typeof value !== 'string' || value === '') return null
  return value.length <= 4 ? '****' : `${value.slice(0, 4)}…`
}

/** Promise-based sleep. */
export function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, Math.max(0, ms)))
}

/**
 * Bounded in-memory log buffer, line-oriented. Keeps the newest `limit` lines
 * and also exposes the raw tail for panels.
 */
export class RingLog {
  /** @param {number} [limit] */
  constructor(limit = 400) {
    this.limit = Math.max(10, limit)
    this.buffer = []
    this.remainder = ''
    this.bytes = 0
  }

  /** Append a chunk of stdout/stderr. */
  append(chunk) {
    if (chunk === undefined || chunk === null) return
    const text = String(chunk)
    this.bytes += text.length
    const lines = (this.remainder + text).split(/\r?\n/)
    this.remainder = lines.pop() ?? ''
    for (const line of lines) {
      if (line === '') continue
      this.buffer.push(line)
    }
    if (this.buffer.length > this.limit) this.buffer.splice(0, this.buffer.length - this.limit)
  }

  /** Last `count` complete lines (plus an unfinished remainder when present). */
  tail(count = 200) {
    const lines = this.buffer.slice(-Math.max(1, count))
    if (this.remainder !== '') lines.push(this.remainder)
    return lines
  }

  /** Clear every buffered line. */
  clear() {
    this.buffer = []
    this.remainder = ''
    this.bytes = 0
  }
}
