/**
 * Koishi project management: status, dependency installation, process
 * lifecycle, health probing and managed-process logs.
 *
 * Every external command is passed as an argv array through the platform
 * `run` helper (or an injected executor in tests), so no shell string is built.
 *
 * @module host/services/koishi
 */
import { spawn as spawnProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import {
  DEFAULT_SETTINGS,
  RingLog,
  detectKoishiProject,
  expandHome,
  hostPlatform as platformHostPlatform,
  findProcess as platformFindProcess,
  httpJson,
  killPid as platformKillPid,
  npmCommand as platformNpmCommand, npmExecutable as platformNpmExecutable,
  portPid as platformPortPid,
  run,
  sleep as defaultSleep,
} from '../../platform/index.js'
import { adoptKoishiProcess } from './adopt.js'
import {
  DEFAULT_HEALTH_TIMEOUT_MS,
  DEFAULT_INSTALL_TIMEOUT_MS,
  DEFAULT_KILL_TIMEOUT_MS,
  DEFAULT_LOG_LIMIT,
  DEFAULT_POLL_INTERVAL_MS,
  DEFAULT_PORT,
  DEFAULT_START_TIMEOUT_MS,
  DEFAULT_STOP_TIMEOUT_MS,
  LSOF,
  QUIET_LOGGER,
  boundLines,
  combineOutput,
  defaultProcessKill,
  errorText,
  findPidByPort,
  killSupervisor,
  normalizeExec,
  normalizeHostPlatform,
  normalizeLogger,
  numberOr,
  probePort,
  refreshManagedPid,
  serviceStillListening,
  syncKoishiPort,
  syncManagedPid,
  terminatePid,
  toPort,
  trackChild,
  truncateOutput,
} from './helpers.js'
import { koishiHealth, koishiStatus } from './status.js'
export class KoishiManager {
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
    this.findProcess = typeof options.findProcess === 'function' ? options.findProcess : platformFindProcess
    this.killPid = injectedKillPid ?? platformKillPid
    this.hasInjectedKillPid = injectedKillPid !== null
    this.npmExecutable = injectedNpmExecutable ?? platformNpmExecutable

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

    this.logRing = new RingLog(numberOr(options.logLimit, DEFAULT_LOG_LIMIT))
    this.managedChild = null
    this.managedPid = null
    this.startedAt = null
    this.childExit = null
  }

  npmStartCommand() { return platformNpmCommand(['start'], this.npmExecutable()) }
  startCommand(projectDir) {
    const bin = join(projectDir, 'node_modules', 'koishi', 'bin.js')
    if (existsSync(bin)) {
      const env = { ...process.env }
      if (process.versions.electron !== undefined) env.ELECTRON_RUN_AS_NODE = '1'
      return { file: process.execPath, args: [bin, 'start', '-r', 'tsx/cjs'], env, local: true }
    }
    return this.npmStartCommand()
  }

  npmInstallCommand() { return platformNpmCommand(['install', '--no-audit', '--no-fund'], this.npmExecutable()) }

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

  async adoptExternal() { return adoptKoishiProcess({ manager: this, findPortPid: (port) => this.findPortPid(port), findProcess: (pattern) => this.findProcess(pattern), projectDir: this.projectDir, logger: this.logger }) }

  async findPortPid(port = this.port) {
    const target = toPort(port, this.port)
    return this.hasInjectedPortPid ? findPidByPort(target, { portPid: this.portPid }) : this.hasInjectedExec ? findPidByPort(target, { exec: this.exec }) : findPidByPort(target)
  }

  async status() {
    return koishiStatus(this)
  }

  async health(options = {}) {
    return koishiHealth(this, options)
  }

  async start({ timeoutMs = this.startTimeoutMs } = {}) {
    const project = detectKoishiProject(this.settings)
    if (!project.exists) {
      return { ok: false, error: `Koishi 项目不存在：${project.projectDir}` }
    }
    if (!project.hasPackageJson) {
      return { ok: false, error: `Koishi 项目缺少 package.json：${project.projectDir}` }
    }
    await syncKoishiPort(this, project.projectDir)
    await refreshManagedPid(this)

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
        await syncManagedPid(this)
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
    const command = this.startCommand(project.projectDir)
    let child
    try {
      child = this.spawn(command.file, command.args, {
        cwd: project.projectDir,
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: command.env ?? process.env,
      })
    } catch (error) {
      return { ok: false, error: `启动 Koishi 失败：${errorText(error)}` }
    }
    if (child === null || child === undefined || typeof child !== 'object') {
      return { ok: false, error: '启动 Koishi 失败：无法创建子进程' }
    }

    trackChild(this, child)
    this.logger.info('已启动 Koishi（pid=%s，cwd=%s）', this.managedPid, project.projectDir)

    const reachable = await this.waitForReachable(timeoutMs)
    if (reachable) {
      await syncManagedPid(this)
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

  async stop({ gracefulTimeoutMs = this.stopTimeoutMs, killTimeoutMs = this.killTimeoutMs } = {}) {
    await refreshManagedPid(this)
    let pid = this.managedPid
    if (pid === null) {
      const externalPid = await this.findPortPid(this.port)
      if (externalPid !== null) {
        if (!await this.adoptExternal()) {
          return { ok: false, error: `端口 ${this.port} 上的 Koishi 不是由当前面板启动的（pid=${externalPid}）；为防止误杀其他进程，面板不会自动停止它，请手动处理` }
        }
        pid = this.managedPid
      }
    }
    const wasManaged = pid !== null
    if (pid === null) {
      const health = await this.health()
      if (health.reachable) return { ok: false, error: `Koishi 正在端口 ${this.port} 上响应，但无法确定其 PID，无法安全停止` }
      this.clearManaged()
      return { ok: true, message: 'Koishi 未在运行' }
    }

    await killSupervisor(this)
    const stopped = await terminatePid(this, pid, wasManaged, gracefulTimeoutMs, killTimeoutMs)
    this.clearManaged()
    if (!stopped.ok) {
      return { ok: false, error: `无法停止 Koishi 进程 ${pid}（已发送 SIGKILL）` }
    }

    // On Windows/Electron a launcher process can exit while a detached Koishi
    // worker keeps the HTTP port open. Re-check the port and stop that worker
    // too, but only after proving it belongs to this project.
    if (await serviceStillListening(this)) {
      await killSupervisor(this)
      if (!await this.adoptExternal()) {
        return { ok: false, error: `Koishi 进程 ${pid} 已停止，但端口 ${this.port} 仍在响应且无法确认归属；为避免误杀，请手动检查` }
      }
      const workerPid = this.managedPid
      const workerStopped = await terminatePid(this, workerPid, true, gracefulTimeoutMs, killTimeoutMs)
      this.clearManaged()
      await killSupervisor(this)
      if (workerStopped.ok && !await serviceStillListening(this)) {
        return { ok: true, message: `Koishi 已停止（pid=${workerPid}）` }
      }
      return { ok: false, error: `Koishi 的残留进程 ${workerPid ?? '未知'} 未能停止` }
    }
    this.logger.info('Koishi 已停止（pid=%s）', pid)
    return { ok: true, message: `Koishi 已停止（pid=${pid}）` }
  }

  async restart(options = {}) {
    let stopped = await this.stop(options)
    if (stopped.ok === false) {
      // A panel reload loses managedChild state. Adopt only a PID whose command
      // is the Koishi CLI under this exact project directory, then retry.
      if (await this.adoptExternal()) stopped = await this.stop(options)
    }
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

  logs(count = 200) {
    if (!this.isManaged()) return []
    return this.logRing.tail(boundLines(count))
  }

  async isPortListening(port = this.port) {
    const target = toPort(port, this.port)
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

  isManaged() {
    return this.managedPid !== null || this.managedChild !== null
  }

  get managedSince() {
    return this.startedAt
  }

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

  async waitForExit(pid, timeoutMs) {
    if (!this.isAlive(pid)) return true
    const attempts = Math.max(1, Math.ceil(Math.max(0, timeoutMs) / this.pollIntervalMs))
    for (let attempt = 0; attempt < attempts; attempt++) {
      await this.sleep(this.pollIntervalMs)
      if (!this.isAlive(pid)) return true
    }
    return false
  }

  isAlive(pid) {
    if (!Number.isInteger(pid) || pid <= 0) return false
    return this.processKill(pid, 0) === true
  }

  signalProcess(pid, signal, group = false) {
    if (group && !this.hasInjectedKill) {
      try {
        process.kill(-pid, signal)
        return true
      } catch {
        // Fall back to the single PID (e.g. not a process-group leader).
      }
    }
    return this.processKill(pid, signal)
  }

  clearManaged() {
    this.managedChild = null
    this.managedPid = null
  }

}
