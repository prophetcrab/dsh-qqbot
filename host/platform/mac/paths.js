/**
 * Filesystem and small shared primitives for the macOS host platform.
 *
 * Everything here is dependency-free and safe to import from tests. This is the
 * only generic file in the platform layer: services never hand-roll file I/O or
 * path expansion themselves.
 */

import { createHash } from 'node:crypto'
import { existsSync as fsExistsSync, promises as fsp } from 'node:fs'
import { homedir } from 'node:os'
import { dirname } from 'node:path'
import { run } from './process.js'

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

/** List a directory (missing/unreadable -> []). */
export async function readdir(path) {
  try {
    return await fsp.readdir(expandHome(path))
  } catch {
    return []
  }
}

/** Last modification time (ISO) of a file, or null. */
export async function fileMtime(path) {
  try {
    const info = await fsp.stat(expandHome(path))
    return info.mtime.toISOString()
  } catch {
    return null
  }
}
