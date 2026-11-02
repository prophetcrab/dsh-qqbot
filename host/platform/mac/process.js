/**
 * Process execution and probing for the macOS host platform.
 *
 * Every external command is passed as an argv array (never a shell string).
 * Read-only probes (ps/lsof) live here together with the kill helper so the
 * service and plugin layers never touch `child_process` directly.
 */

import { execFile, execFileSync } from 'node:child_process'

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

/**
 * Find a running process whose full command contains `pattern`.
 * Read-only (uses `ps`), never matches itself.
 *
 * @param {string} pattern
 * @returns {{ running: boolean, pid: number|null }}
 */
export function findProcess(pattern) {
  if (typeof pattern !== 'string' || pattern === '') return { running: false, pid: null }
  let output = ''
  try {
    output = execFileSync('/bin/ps', ['-axo', 'pid=,command='], { encoding: 'utf8', timeout: 4000, maxBuffer: 4 * 1024 * 1024 })
  } catch {
    return { running: false, pid: null }
  }
  for (const line of output.split('\n')) {
    const trimmed = line.trim()
    if (trimmed === '') continue
    const space = trimmed.indexOf(' ')
    if (space <= 0) continue
    const pid = Number(trimmed.slice(0, space))
    if (!Number.isInteger(pid) || pid === process.pid) continue
    if (trimmed.includes(pattern)) return { running: true, pid }
  }
  return { running: false, pid: null }
}

/** PID listening on a TCP port via macOS lsof. */
export async function portPid(port) {
  const target = Number(port)
  if (!Number.isInteger(target) || target <= 0) return null
  const result = await run('/usr/sbin/lsof', ['-nP', `-iTCP:${target}`, '-sTCP:LISTEN', '-t'], { timeoutMs: 8000 })
  if (result.code !== 0) return null
  const pid = Number(result.stdout.trim().split('\n')[0])
  return Number.isInteger(pid) && pid > 0 ? pid : null
}

/** Stop a PID using SIGTERM/SIGKILL. */
export async function killPid(pid, { force = false, group = false } = {}) {
  const target = Number(pid)
  if (!Number.isInteger(target) || target <= 0) return { ok: false, error: 'invalid-pid' }
  try {
    process.kill(group ? -target : target, force ? 'SIGKILL' : 'SIGTERM')
    return { ok: true }
  } catch (error) {
    return { ok: false, error: String(error?.message ?? error) }
  }
}

/** npm executable name for macOS. */
export function npmExecutable() {
  return 'npm'
}
