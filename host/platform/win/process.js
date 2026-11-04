/**
 * Process execution and probing for the Windows host platform.
 *
 * Every external command is passed as an argv array (never a shell string).
 * Read-only probes (CIM/netstat) live here together with the kill helper so the
 * service and plugin layers never touch `child_process` directly.
 */

import { execFile, execFileSync, spawn } from 'node:child_process'

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
 * Run a fixed shell command through `cmd.exe /c`. Only for constant strings
 * that never contain caller-provided values.
 *
 * @param {string} command
 * @param {{ cwd?: string, timeoutMs?: number }} [options]
 * @returns {Promise<{ code: number, stdout: string, stderr: string }>}
 */
export async function runShell(command, options = {}) {
  return run('cmd.exe', ['/c', command], options)
}

/**
 * Find a running process whose full command line contains `pattern` through
 * CIM. Read-only; never matches the current Node process.
 *
 * @param {string} pattern
 * @returns {{ running: boolean, pid: number|null }}
 */
export function findProcess(pattern) {
  if (typeof pattern !== 'string' || pattern === '') return { running: false, pid: null }
  let output = ''
  try {
    output = execFileSync('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      'Get-CimInstance Win32_Process | Select-Object ProcessId,CommandLine | ConvertTo-Json -Compress',
    ], { encoding: 'utf8', timeout: 6000, maxBuffer: 8 * 1024 * 1024 })
  } catch {
    return { running: false, pid: null }
  }
  try {
    const parsed = JSON.parse(output.trim() === '' ? '[]' : output)
    const list = Array.isArray(parsed) ? parsed : [parsed]
    for (const item of list) {
      const command = String(item?.CommandLine ?? '')
      const pid = Number(item?.ProcessId)
      if (!Number.isInteger(pid) || pid === process.pid) continue
      if (command.includes(pattern)) return { running: true, pid }
    }
  } catch {
    return { running: false, pid: null }
  }
  return { running: false, pid: null }
}

/** PID listening on a TCP port via `netstat -ano`. */
export async function portPid(port) {
  const target = Number(port)
  if (!Number.isInteger(target) || target <= 0) return null
  const result = await run('netstat', ['-ano', '-p', 'tcp'], { timeoutMs: 8000 })
  if (result.code !== 0) return null
  return parseNetstatPid(result.stdout, target)
}

/** Parse a listening PID from `netstat -ano` output. */
export function parseNetstatPid(output, port) {
  const target = Number(port)
  if (!Number.isInteger(target) || target <= 0) return null
  for (const line of String(output ?? '').split(/\r?\n/u)) {
    const match = /^\s*TCP\s+\S+:(\d+)\s+\S+\s+LISTENING\s+(\d+)/iu.exec(line)
    if (match === null) continue
    if (Number(match[1]) === target) return Number(match[2])
  }
  return null
}

/** Stop a Windows process tree with `taskkill` (graceful, then `/F`). */
export async function killPid(pid, { force = false } = {}) {
  const target = Number(pid)
  if (!Number.isInteger(target) || target <= 0) return { ok: false, error: 'invalid-pid' }
  const args = ['/PID', String(target), '/T']
  if (force) args.push('/F')
  const result = await run('taskkill', args, { timeoutMs: 8000 })
  return result.code === 0 ? { ok: true } : { ok: false, error: result.stderr || `taskkill exit ${result.code}` }
}

/** npm executable name on Windows. */
export function npmExecutable() {
  return 'npm.cmd'
}

/**
 * Launch a detached GUI/background process (Docker Desktop, ...) and return
 * immediately. Never throws.
 *
 * @param {string} file
 * @param {string[]} [args]
 * @param {object} [options]
 * @returns {boolean} whether the process was spawned
 */
export function launchDetached(file, args = [], options = {}) {
  try {
    const child = spawn(file, args, { detached: true, stdio: 'ignore', windowsHide: true, ...options })
    if (typeof child.unref === 'function') child.unref()
    return true
  } catch {
    return false
  }
}

/**
 * Build an npm invocation for Windows. `.cmd` files cannot be spawned/executed
 * directly (EINVAL since CVE-2024-27980), so npm always runs via `cmd.exe /c`.
 *
 * @param {string[]} [args] npm arguments, without the leading `npm`
 * @param {string} [_executable] ignored on Windows
 * @returns {{ file: string, args: string[] }}
 */
export function npmCommand(args = [], _executable = 'npm') {
  return { file: 'cmd.exe', args: ['/c', 'npm', ...(Array.isArray(args) ? args.map((arg) => String(arg)) : [])] }
}
