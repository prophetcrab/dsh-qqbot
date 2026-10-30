/**
 * Koishi project management: status, dependency installation, process
 * lifecycle, health probing and managed-process logs.
 *
 * Every external command is passed as an argv array through {@link run} (or an
 * injected executor in tests), so no shell string is ever built. Port/process
 * probes and lifecycle commands delegate to lib/platform.js (`portPid`,
 * `killPid`, `npmExecutable`), which picks `lsof`/SIGTERM on POSIX and
 * `netstat`/`taskkill` on Windows. Windows cannot spawn `.cmd` files directly
 * (EINVAL since CVE-2024-27980), so npm runs through `cmd.exe /c npm ...`.
 *
 * @module dsh-qqbot/lib/koishi
 */

import { spawn as spawnProcess } from 'node:child_process'
import { connect } from 'node:net'
import {
  DEFAULT_SETTINGS,
  detectKoishiProject,
  hostPlatform as platformHostPlatform,
  killPid as platformKillPid,
  npmExecutable as platformNpmExecutable,
  portPid as platformPortPid,
} from './platform.js'
import {
  RingLog,
  expandHome,
  httpJson,
  run,
  sleep as defaultSleep,
} from './util.js'

/** Absolute lsof path on macOS; used by the legacy (injected exec) PID path. */
const LSOF = '/usr/sbin/lsof'

/** Fallback Koishi port (`settings.koishiPort` wins). */
const DEFAULT_PORT = 5140

/** Health endpoint served by the Koishi `health` plugin. */
const HEALTH_PATH = '/api/qqbot/health'

const DEFAULT_START_TIMEOUT_MS = 30_000
const DEFAULT_STOP_TIMEOUT_MS = 5_000
const DEFAULT_KILL_TIMEOUT_MS = 2_000
const DEFAULT_POLL_INTERVAL_MS = 500
const DEFAULT_HEALTH_TIMEOUT_MS = 4_000
const DEFAULT_INSTALL_TIMEOUT_MS = 300_000
const DEFAULT_LOG_LIMIT = 400

/** Logger used when the host does not supply one (tests, scripts). */
const QUIET_LOGGER = {
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
function normalizeExec(exec) {
  if (typeof exec === 'function') return exec
  if (exec !== null && typeof exec === 'object' && typeof exec.run === 'function') {
    return exec.run.bind(exec)
  }
  return run
}

/** @param {unknown} logger */
function normalizeLogger(logger) {
  if (logger === null || logger === undefined || typeof logger !== 'object') return QUIET_LOGGER
  return {
    info: typeof logger.info === 'function' ? logger.info.bind(logger) : QUIET_LOGGER.info,
    warn: typeof logger.warn === 'function' ? logger.warn.bind(logger) : QUIET_LOGGER.warn,
    error: typeof logger.error === 'function' ? logger.error.bind(logger) : QUIET_LOGGER.error,
    debug: typeof logger.debug === 'function' ? logger.debug.bind(logger) : QUIET_LOGGER.debug,
  }
}

/** Accept a hostPlatform function or a platform id string. */
function normalizeHostPlatform(value) {
  if (typeof value === 'function') return value
  if (typeof value === 'string' && value !== '') return () => value
  return null
}

/** Coerce a candidate into a valid TCP port, else fallback. */
function toPort(value, fallback) {
  const port = Number(value)
  return Number.isInteger(port) && port > 0 && port < 65536 ? port : fallback
}

/** @param {unknown} error */
function errorText(error) {
  return String(error?.message ?? error ?? 'unknown error')
}

/** Combine npm stdout/stderr for user-facing output. */
function combineOutput(result) {
  if (result === null || result === undefined) return ''
  const stdout = String(result.stdout ?? '')
  const stderr = String(result.stderr ?? '')
  return [stdout.trim(), stderr.trim()].filter((part) => part !== '').join('\n')
}

/** Keep output panels responsive by capping captured npm output. */
function truncateOutput(text, limit = 4000) {
  const value = String(text ?? '')
  if (value.length <= limit) return value
  return `${value.slice(0, limit)}\n…（输出已截断）`
}

/** Default SIGTERM/SIGKILL sender. EPERM means the process exists but is not ours. */
function defaultProcessKill(pid, signal) {
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
function toPid(value) {
  const pid = Number(value)
  return Number.isInteger(pid) && pid > 0 ? pid : null
}

/**
 * Resolve the listening PID for a TCP port.
 *
 * Priority:
 * 1. an injected `portPid` (tests, custom hosts);
 * 2. an injected `exec`, parsed from legacy `lsof` output (backwards compatible);
 * 3. `platform.portPid` — Windows `netstat -ano`, macOS/Linux `lsof`.
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
function probePort(port, timeoutMs = 800) {
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

/**
 * @typedef {object} KoishiStatus
 * @property {string} projectDir
 * @property {boolean} exists
 * @property {boolean} hasPackageJson
 * @property {boolean} depsInstalled
 * @property {boolean} running 健康检查可达或端口被监听
 * @property {boolean} managed 是否由本进程启动
 * @property {number|null} pid
 * @property {number} port
 * @property {boolean} online 健康检查 `ok`（机器人已上线）
 * @property {string|null} selfId
 * @property {string|null} platform
 * @property {object|null} stats
 * @property {string[]} logs
 * @property {string} [error]
 */

/**
 * Manage one local Koishi project: start/stop the `npm start` process, install
 * dependencies, probe its health endpoint and keep a bounded log ring.
 */
export class KoishiManager {
  /**
   * @param {object} options
   * @param {object} options.settings resolved plugin settings
   * @param {object} [options.logger]
   * @param {unknown} [options.exec] injectable execFile-style executor
   * @param {unknown} [options.spawn] injectable child_process.spawn
   * @param {unknown} [options.fetch] injectable fetch (health probe)
   * @param {Function} [options.sleep] injectable sleep
   * @param {Function} [options.processKill] injectable `(pid, signal) => boolean`
   * @param {Function|string} [options.hostPlatform] injectable platform id/function
   * @param {Function} [options.portPid] injectable `(port) => Promise<pid|null>`
   * @param {Function} [options.killPid] injectable `(pid, { force }) => Promise<{ ok, error? }>`
   * @param {Function} [options.npmExecutable] injectable `() => string`
   * @param {object} [options.deps] alternative dependency bag for the platform seams
   */
  constructor(options = {}) {
    const settings = options.settings ?? {}
    const injected = options.deps ?? {}
    this.settings = settings
    this.port = toPort(settings.koishiPort, DEFAULT_PORT)
    this.projectDir = expandHome(typeof settings.projectDir === 'string' && settings.projectDir !== ''
      ? settings.projectDir
      : DEFAULT_SETTINGS.projectDir)
    this.logger = normalizeLogger(options.logger)

    const injectedHostPlatform = normalizeHostPlatform(options.hostPlatform) ?? normalizeHostPlatform(injected.hostPlatform)
    const injectedPortPid = typeof options.portPid === 'function'
      ? options.portPid
      : (typeof injected.portPid === 'function' ? injected.portPid : null)
    const injectedKillPid = typeof options.killPid === 'function'
      ? options.killPid
      : (typeof injected.killPid === 'function' ? injected.killPid : null)
    const injectedNpmExecutable = typeof options.npmExecutable === 'function'
      ? options.npmExecutable
      : (typeof injected.npmExecutable === 'function' ? injected.npmExecutable : null)

    this.hostPlatform = injectedHostPlatform ?? platformHostPlatform
    this.portPid = injectedPortPid ?? platformPortPid
    this.hasInjectedPortPid = injectedPortPid !== null
    this.killPid = injectedKillPid ?? platformKillPid
    this.hasInjectedKillPid = injectedKillPid !== null
    // POSIX spawns/execs npm directly. Windows never executes `npm.cmd`
    // directly (EINVAL): npmStartCommand()/npmInstallCommand() go through
    // `cmd.exe /c npm ...` instead, so this stays the POSIX command name.
    this.npmExecutable = injectedNpmExecutable
      ?? (injectedHostPlatform === null
        ? platformNpmExecutable
        : () => (this.hostPlatform() === 'windows' ? 'npm.cmd' : 'npm'))

    this.exec = normalizeExec(options.exec)
    this.hasInjectedExec = typeof options.exec === 'function'
      || (options.exec !== null && options.exec !== undefined
        && typeof options.exec === 'object' && typeof options.exec.run === 'function')
    this.spawn = typeof options.spawn === 'function' ? options.spawn : spawnProcess
    this.fetch = typeof options.fetch === 'function' ? options.fetch : null
    this.sleep = typeof options.sleep === 'function' ? options.sleep : defaultSleep
    this.hasInjectedKill = typeof options.processKill === 'function'
    this.processKill = this.hasInjectedKill ? options.processKill : defaultProcessKill

    this.startTimeoutMs = numberOr(options.startTimeoutMs, DEFAULT_START_TIMEOUT_MS)
    this.stopTimeoutMs = numberOr(options.stopTimeoutMs, DEFAULT_STOP_TIMEOUT_MS)
    this.killTimeoutMs = numberOr(options.killTimeoutMs, DEFAULT_KILL_TIMEOUT_MS)
    this.pollIntervalMs = Math.max(10, numberOr(options.pollIntervalMs, DEFAULT_POLL_INTERVAL_MS))
    this.healthTimeoutMs = numberOr(options.healthTimeoutMs, DEFAULT_HEALTH_TIMEOUT_MS)
    this.installTimeoutMs = numberOr(options.installTimeoutMs, DEFAULT_INSTALL_TIMEOUT_MS)

    /** @type {RingLog} */
    this.logRing = new RingLog(numberOr(options.logLimit, DEFAULT_LOG_LIMIT))
    /** @type {import('node:child_process').ChildProcess|null} */
    this.managedChild = null
    /** @type {number|null} */
    this.managedPid = null
    /** @type {string|null} */
    this.startedAt = null
    /** @type {{ code: number|null, signal: string|null, at: string }|null} */
    this.childExit = null
  }

  /**
   * Command + arguments that launch Koishi (`npm start`).
   *
   * Windows cannot execute `.cmd` files with spawn/execFile directly
   * (EINVAL since CVE-2024-27980), so it goes through `cmd.exe /c npm start`.
   * POSIX spawns the npm executable directly.
   *
   * @returns {{ file: string, args: string[] }}
   */
  npmStartCommand() {
    if (this.isWindows()) return { file: 'cmd.exe', args: ['/c', 'npm', 'start'] }
    return { file: this.npmExecutable(), args: ['start'] }
  }

  /**
   * Command + arguments for `npm install --no-audit --no-fund`.
   * Windows uses `cmd.exe /c npm install ...` (see {@link npmStartCommand}).
   *
   * @returns {{ file: string, args: string[] }}
   */
  npmInstallCommand() {
    if (this.isWindows()) {
      return { file: 'cmd.exe', args: ['/c', 'npm', 'install', '--no-audit', '--no-fund'] }
    }
    return { file: this.npmExecutable(), args: ['install', '--no-audit', '--no-fund'] }
  }

  /**
   * Install dependencies with `npm install --no-audit --no-fund` in the project
   * directory (via `cmd.exe /c` on Windows).
   *
   * Matches the SPEC: dependencies are only installed when `node_modules` is
   * missing, unless `force` is passed.
   *
   * @param {{ force?: boolean }} [options]
   * @returns {Promise<{ ok: boolean, skipped?: boolean, output: string, error?: string }>}
   */
  async installDeps({ force = false } = {}) {
    const project = detectKoishiProject(this.settings)
    if (!project.exists) {
      return { ok: false, output: '', error: `Koishi 项目不存在：${project.projectDir}` }
    }
    if (!project.hasPackageJson) {
      return { ok: false, output: '', error: `Koishi 项目缺少 package.json：${project.projectDir}` }
    }
    if (project.hasNodeModules && force !== true) {
      return { ok: true, skipped: true, output: '依赖已安装（node_modules 存在），跳过 npm install；如需强制安装请传 force:true' }
    }
    this.logger.info('安装 Koishi 依赖：npm install')
    const command = this.npmInstallCommand()
    const result = await this.exec(command.file, command.args, {
      cwd: project.projectDir,
      timeoutMs: this.installTimeoutMs,
    })
    const output = truncateOutput(combineOutput(result))
    if (result.code !== 0) {
      return {
        ok: false,
        output,
        error: `npm install 失败（退出码 ${result.code}）${result.error ? `：${result.error}` : ''}`,
      }
    }
    return { ok: true, output }
  }

  /**
   * Resolve the PID listening on the Koishi port.
   *
   * Prefers an injected `portPid`, then a legacy injected `exec`/lsof path
   * (existing tests), then `platform.portPid` (Windows netstat, macOS lsof).
   *
   * @param {number} [port]
   * @returns {Promise<number|null>}
   */
  async findPortPid(port = this.port) {
    const target = toPort(port, this.port)
    if (this.hasInjectedPortPid) return findPidByPort(target, { portPid: this.portPid })
    if (this.hasInjectedExec) return findPidByPort(target, { exec: this.exec })
    return findPidByPort(target)
  }

  /** @returns {boolean} */
  isWindows() {
    return this.hostPlatform() === 'windows'
  }

  /**
   * Collect the full status snapshot used by the panel.
   *
   * Never throws: a missing project, a down health endpoint and a failing
   * port probe are all reported as fields.
   *
   * @returns {Promise<KoishiStatus>}
   */
  async status() {
    const project = detectKoishiProject(this.settings)
    const base = {
      projectDir: project.projectDir,
      exists: project.exists,
      hasPackageJson: project.hasPackageJson,
      depsInstalled: project.hasNodeModules,
      running: false,
      managed: this.isManaged(),
      pid: this.managedPid,
      port: this.port,
      online: false,
      selfId: null,
      platform: null,
      stats: null,
      logs: this.logs(30),
    }
    if (!project.exists) {
      return { ...base, logs: [], error: `Koishi 项目不存在：${project.projectDir}` }
    }

    const health = await this.health()
    const bot = pickBot(health.bots)
    let running = health.reachable === true
    let pid = this.managedPid
    if (pid === null) {
      const found = await this.findPortPid(this.port)
      if (found !== null) {
        pid = found
        running = true
      }
    } else {
      running = true
    }

    return {
      ...base,
      running,
      managed: this.isManaged(),
      pid,
      online: health.ok,
      selfId: bot.selfId,
      platform: bot.platform,
      stats: health.stats,
      logs: this.logs(30),
    }
  }

  /**
   * Probe `GET /api/qqbot/health`.
   *
   * `ok` mirrors the endpoint's `ok` field (at least one bot online);
   * `reachable` only means the HTTP request succeeded, which is what start()
   * uses to avoid spawning a second instance.
   *
   * @param {{ timeoutMs?: number }} [options]
   * @returns {Promise<{ ok: boolean, reachable: boolean, bots: object[]|null, stats: object|null, error?: string }>}
   */
  async health({ timeoutMs = this.healthTimeoutMs } = {}) {
    const url = `http://127.0.0.1:${this.port}${HEALTH_PATH}`
    const result = await this.requestJson(url, { timeoutMs })
    if (result.ok !== true) {
      return {
        ok: false,
        reachable: false,
        bots: null,
        stats: null,
        error: result.error ?? `健康检查失败（HTTP ${result.status}）`,
      }
    }
    const data = result.data
    const isObject = data !== null && typeof data === 'object'
    return {
      ok: isObject && data.ok === true,
      reachable: true,
      bots: isObject && Array.isArray(data.bots) ? data.bots : null,
      stats: isObject && data.stats !== null && typeof data.stats === 'object' ? data.stats : null,
    }
  }

  /**
   * Start Koishi with a detached `npm start` and poll health until online.
   *
   * @param {{ timeoutMs?: number }} [options]
   * @returns {Promise<{ ok: boolean, alreadyRunning?: boolean, online?: boolean, pid?: number|null, message?: string, error?: string, logs?: string[] }>}
   */
  async start({ timeoutMs = this.startTimeoutMs } = {}) {
    const project = detectKoishiProject(this.settings)
    if (!project.exists) {
      return { ok: false, error: `Koishi 项目不存在：${project.projectDir}` }
    }
    if (!project.hasPackageJson) {
      return { ok: false, error: `Koishi 项目缺少 package.json：${project.projectDir}` }
    }

    const current = await this.health()
    if (current.reachable) {
      return {
        ok: true,
        alreadyRunning: true,
        online: current.ok,
        pid: this.managedPid,
        message: current.ok ? 'Koishi 已在运行，机器人已上线' : 'Koishi 已在运行（机器人当前离线）',
      }
    }

    if (this.managedPid !== null) {
      const reachable = await this.waitForReachable(timeoutMs)
      if (reachable) {
        const health = await this.health()
        return {
          ok: true,
          online: health.ok === true,
          reachable: true,
          pid: this.managedPid,
          message: health.ok === true ? 'Koishi 已在运行，机器人已上线' : 'Koishi 已在运行（等待机器人上线）',
        }
      }
      return {
        ok: false,
        online: false,
        pid: this.managedPid,
        error: `Koishi 进程已在运行，但 HTTP 健康检查在 ${Math.round(timeoutMs / 1000)}s 内未通过`,
        logs: this.logRing.tail(30),
      }
    }

    const busyPid = await this.findPortPid(this.port)
    if (busyPid !== null) {
      return {
        ok: false,
        error: `端口 ${this.port} 已被进程 ${busyPid} 占用，但健康检查未通过；请先排查该进程`,
      }
    }

    this.logRing.clear()
    this.childExit = null
    const command = this.npmStartCommand()
    let child
    try {
      child = this.spawn(command.file, command.args, {
        cwd: project.projectDir,
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: process.env,
      })
    } catch (error) {
      return { ok: false, error: `启动 Koishi 失败：${errorText(error)}` }
    }
    if (child === null || child === undefined || typeof child !== 'object') {
      return { ok: false, error: '启动 Koishi 失败：无法创建子进程' }
    }

    this.trackChild(child)
    this.logger.info('已启动 Koishi（pid=%s，cwd=%s）', this.managedPid, project.projectDir)

    const reachable = await this.waitForReachable(timeoutMs)
    if (reachable) {
      const health = await this.health()
      return {
        ok: true,
        online: health.ok === true,
        reachable: true,
        pid: this.managedPid,
        message: health.ok === true ? 'Koishi 已启动，机器人已上线' : 'Koishi 已启动（等待机器人上线）',
      }
    }
    if (this.childExit !== null) {
      return {
        ok: false,
        error: `Koishi 进程已退出（code=${this.childExit.code ?? 'null'}${this.childExit.signal ? `, signal=${this.childExit.signal}` : ''}）`,
        logs: this.logRing.tail(30),
      }
    }
    return {
      ok: false,
      online: false,
      pid: this.managedPid,
      error: `Koishi 启动超时：${Math.round(timeoutMs / 1000)}s 内 HTTP 健康检查未通过`,
      logs: this.logRing.tail(30),
    }
  }

  /**
   * Stop Koishi: managed PID first, then the PID listening on the port.
   *
   * POSIX: SIGTERM the managed process group, poll, then SIGKILL.
   * Windows: `taskkill /PID <pid> /T` (never a negative PID), poll, then `/F`.
   *
   * @param {{ gracefulTimeoutMs?: number, killTimeoutMs?: number }} [options]
   * @returns {Promise<{ ok: boolean, message?: string, error?: string }>}
   */
  async stop({ gracefulTimeoutMs = this.stopTimeoutMs, killTimeoutMs = this.killTimeoutMs } = {}) {
    let pid = this.managedPid
    const wasManaged = pid !== null
    if (pid === null) {
      pid = await this.findPortPid(this.port)
    }
    if (pid === null) {
      const health = await this.health()
      if (health.reachable) {
        return {
          ok: false,
          error: `Koishi 正在端口 ${this.port} 上响应，但无法确定其 PID，无法安全停止`,
        }
      }
      this.clearManaged()
      return { ok: true, message: 'Koishi 未在运行' }
    }

    if (this.isWindows()) {
      return this.stopWindows(pid, { gracefulTimeoutMs, killTimeoutMs })
    }

    const signal = (sig) => this.signalProcess(pid, sig, wasManaged)
    if (!signal('SIGTERM')) {
      this.clearManaged()
      return { ok: true, message: 'Koishi 进程已不存在' }
    }
    let stopped = await this.waitForExit(pid, gracefulTimeoutMs)
    if (!stopped) {
      this.logger.warn('Koishi 未在 %dms 内响应 SIGTERM，发送 SIGKILL', gracefulTimeoutMs)
      signal('SIGKILL')
      stopped = await this.waitForExit(pid, killTimeoutMs)
    }
    this.clearManaged()
    if (!stopped) {
      return { ok: false, error: `无法停止 Koishi 进程 ${pid}（已发送 SIGKILL）` }
    }
    this.logger.info('Koishi 已停止（pid=%s）', pid)
    return { ok: true, message: `Koishi 已停止（pid=${pid}）` }
  }

  /**
   * Windows stop path: `killPid` is platform.killPid (taskkill /PID <pid> /T,
   * `/F` when forced). Never uses a negative PID or SIGTERM signals.
   *
   * @param {number} pid
   * @param {{ gracefulTimeoutMs: number, killTimeoutMs: number }} options
   * @returns {Promise<{ ok: boolean, message?: string, error?: string }>}
   */
  async stopWindows(pid, { gracefulTimeoutMs, killTimeoutMs }) {
    const graceful = await this.killPid(pid, { force: false })
    this.logger.info(
      'Windows 停止 Koishi（pid=%s）：taskkill /T%s',
      pid,
      graceful?.ok === false ? ' 失败（进程可能已退出）' : '',
    )
    let stopped = await this.waitForWindowsExit(pid, gracefulTimeoutMs)
    if (!stopped) {
      this.logger.warn('Koishi 未在 %dms 内响应 taskkill，发送 taskkill /F', gracefulTimeoutMs)
      await this.killPid(pid, { force: true })
      stopped = await this.waitForWindowsExit(pid, killTimeoutMs)
    }
    this.clearManaged()
    if (!stopped) {
      return { ok: false, error: `无法停止 Koishi 进程 ${pid}（已执行 taskkill /F）` }
    }
    this.logger.info('Koishi 已停止（pid=%s）', pid)
    return { ok: true, message: `Koishi 已停止（pid=${pid}）` }
  }

  /**
   * Poll until a Windows process exits. Liveness uses the injectable
   * `processKill(pid, 0)` probe; each poll also re-sends the graceful
   * `killPid(pid, { force: false })` until taskkill reports the PID is gone.
   *
   * @param {number} pid
   * @param {number} timeoutMs
   * @returns {Promise<boolean>}
   */
  async waitForWindowsExit(pid, timeoutMs) {
    if (!this.isAlive(pid)) return true
    const attempts = Math.max(1, Math.ceil(Math.max(0, timeoutMs) / this.pollIntervalMs))
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      await this.sleep(this.pollIntervalMs)
      if (this.childExit !== null) return true
      if (!this.isAlive(pid)) return true
      const probe = await this.killPid(pid, { force: false })
      if (probe?.ok === false) return true
    }
    return false
  }

  /**
   * Stop then start.
   *
   * @param {{ timeoutMs?: number, gracefulTimeoutMs?: number, killTimeoutMs?: number }} [options]
   * @returns {Promise<{ ok: boolean, alreadyRunning?: boolean, message?: string, error?: string }>}
   */
  async restart(options = {}) {
    const stopped = await this.stop(options)
    if (stopped.ok === false) {
      return { ok: false, message: stopped.error, error: stopped.error }
    }
    const started = await this.start(options)
    if (started.ok === false) {
      return {
        ok: false,
        message: `已停止，但启动失败：${started.error ?? '未知错误'}`,
        error: started.error,
      }
    }
    return { ...started, message: 'Koishi 已重启' }
  }

  /**
   * Tail the managed process log. Returns `[]` when this plugin did not start
   * the currently running process (matching the panel's "no logs" hint).
   *
   * @param {number} [count]
   * @returns {string[]}
   */
  logs(count = 200) {
    if (!this.isManaged()) return []
    return this.logRing.tail(boundLines(count))
  }

  /**
   * Whether a TCP port has a LISTEN socket.
   *
   * Windows: `platform.portPid` (netstat) reports a PID for the port.
   * POSIX: lsof, falling back to a TCP connect probe when lsof is unavailable.
   *
   * @param {number} [port]
   * @returns {Promise<boolean>}
   */
  async isPortListening(port = this.port) {
    const target = toPort(port, this.port)
    if (this.isWindows()) {
      return (await this.findPortPid(target)) !== null
    }
    const result = await this.exec(LSOF, ['-nP', `-iTCP:${target}`, '-sTCP:LISTEN'], { timeoutMs: 8000 })
    if (result !== null && result !== undefined) {
      if (result.code === 0) return String(result.stdout ?? '').trim() !== ''
      if (!result.error) return false
      if (typeof result.error === 'string' && /ENOENT|not found/iu.test(result.error)) {
        return probePort(target)
      }
      return false
    }
    return probePort(target)
  }

  /**
   * Is the process started by this manager still around?
   * @returns {boolean}
   */
  isManaged() {
    return this.managedPid !== null || this.managedChild !== null
  }

  /** Last known start timestamp of the managed process. */
  get managedSince() {
    return this.startedAt
  }

  /** Register a spawned child: capture streams into the ring and track its PID. */
  trackChild(child) {
    this.managedChild = child
    const pid = Number(child.pid)
    this.managedPid = Number.isInteger(pid) && pid > 0 ? pid : null
    this.startedAt = new Date().toISOString()
    if (typeof child.unref === 'function') child.unref()

    for (const stream of [child.stdout, child.stderr]) {
      if (stream === null || stream === undefined || typeof stream.on !== 'function') continue
      stream.on('data', (chunk) => this.logRing.append(chunk))
    }
    if (typeof child.on !== 'function') return
    child.on('error', (error) => {
      this.logRing.append(`[error] ${errorText(error)}`)
    })
    child.on('exit', (code, signal) => {
      this.childExit = {
        code: Number.isInteger(code) ? code : null,
        signal: signal === null || signal === undefined ? null : String(signal),
        at: new Date().toISOString(),
      }
      this.managedChild = null
      this.managedPid = null
      this.logRing.append(`[koishi] 进程已退出（code=${code ?? 'null'}${signal ? `, signal=${signal}` : ''}）`)
    })
  }

  /** Poll health until the HTTP endpoint answers (Koishi is up), the child exits, or timeout. */
  async waitForReachable(timeoutMs) {
    const timeout = numberOr(timeoutMs, this.startTimeoutMs)
    const maxAttempts = Math.max(1, Math.ceil(timeout / this.pollIntervalMs) + 1)
    const deadline = Date.now() + timeout
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const health = await this.health()
      if (health.reachable) return true
      if (this.childExit !== null) return false
      if (attempt === maxAttempts - 1 || Date.now() >= deadline) return false
      await this.sleep(this.pollIntervalMs)
    }
    return false
  }

  /** Poll health until the bot is online, the child exits, or timeout. */
  async waitForOnline(timeoutMs) {
    const timeout = numberOr(timeoutMs, this.startTimeoutMs)
    const maxAttempts = Math.max(1, Math.ceil(timeout / this.pollIntervalMs) + 1)
    const deadline = Date.now() + timeout
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const health = await this.health()
      if (health.ok) return true
      if (this.childExit !== null && health.reachable === false) return false
      if (attempt === maxAttempts - 1 || Date.now() >= deadline) return false
      await this.sleep(this.pollIntervalMs)
    }
    return false
  }

  /** Wait until the PID disappears (or timeout). */
  async waitForExit(pid, timeoutMs) {
    if (!this.isAlive(pid)) return true
    const attempts = Math.max(1, Math.ceil(Math.max(0, timeoutMs) / this.pollIntervalMs))
    for (let attempt = 0; attempt < attempts; attempt++) {
      await this.sleep(this.pollIntervalMs)
      if (!this.isAlive(pid)) return true
    }
    return false
  }

  /** @returns {boolean} */
  isAlive(pid) {
    if (!Number.isInteger(pid) || pid <= 0) return false
    return this.processKill(pid, 0) === true
  }

  /**
   * Send a signal to a PID (or its process group for managed detached children).
   * Never touches the real OS when a kill implementation was injected.
   */
  signalProcess(pid, signal, group = false) {
    if (group && !this.hasInjectedKill && process.platform !== 'win32') {
      try {
        process.kill(-pid, signal)
        return true
      } catch {
        // Fall back to the single PID (e.g. not a process-group leader).
      }
    }
    return this.processKill(pid, signal)
  }

  /** Forget managed-process state after a stop / exit. */
  clearManaged() {
    this.managedChild = null
    this.managedPid = null
  }

  /**
   * JSON request helper: util.httpJson in production, the injected fetch in
   * tests (same `{ ok, status, data, error }` contract).
   *
   * @param {string} url
   * @param {{ timeoutMs?: number }} [options]
   * @returns {Promise<{ ok: boolean, status: number, data: any, error?: string }>}
   */
  async requestJson(url, options = {}) {
    if (this.fetch === null) return httpJson(url, { timeoutMs: options.timeoutMs })
    const timeoutMs = options.timeoutMs ?? this.healthTimeoutMs
    try {
      const response = await this.fetch(url, {
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
}

/** Pick display values from the health endpoint's bots array. */
function pickBot(bots) {
  const list = Array.isArray(bots) ? bots.filter((bot) => bot !== null && typeof bot === 'object') : []
  const chosen = list.find((bot) => bot.online === true) ?? list[0] ?? null
  return {
    selfId: chosen?.selfId !== undefined && chosen?.selfId !== null ? String(chosen.selfId) : null,
    platform: typeof chosen?.platform === 'string' && chosen.platform !== '' ? chosen.platform : null,
  }
}

/** Clamp a line count to the 1..2000 range the routes accept. */
function boundLines(count) {
  const value = Number(count)
  if (!Number.isFinite(value)) return 200
  return Math.min(2000, Math.max(1, Math.floor(value)))
}

/** Positive finite number fallback helper. */
function numberOr(value, fallback) {
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? number : fallback
}
