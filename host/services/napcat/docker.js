/**
 * Docker-backed NapCat manager: Linux QQ + NapCat in a container, controlled
 * through `docker compose`.
 *
 * This backend is intentionally separate from the macOS `NapcatManager`: it
 * keeps the same public surface (status/install/configure/start/stop/login*)
 * so plugins, routes and the panel do not need to know which backend is used.
 * The container talks OneBot back to the host through `host.docker.internal`
 * (configurable via `dockerNapcatHost`), so the host's own QQ client is never
 * touched or killed.
 *
 * All commands are argv arrays; every side effect is behind the same injectable
 * `run`/`http`/`fs` seams as the macOS backend, so tests never start Docker.
 */

import { randomBytes } from 'node:crypto'
import { join } from 'node:path'
import {
  ensureDir,
  existsSync,
  fileMtime,
  hostPlatform as detectHostPlatform,
  httpJson,
  launchDetached,
  readJson,
  readdir,
  readText,
  run as execFileRun,
  sleep as sleepFor,
  writeFileAtomic,
  resolveSettings,
} from '../../platform/index.js'
import { failure, isPlainObject, normalizeLogger } from './common.js'
import { autoConfigure, configure } from './configure.js'
import { loginState as webuiLoginState, loginStatus as webuiLoginStatus, refreshQr as webuiRefreshQr } from './webui.js'
import { status as snapshotStatus } from './snapshot.js'
import { START_TIMEOUT_MS, STOP_TIMEOUT_MS, waitForLogin } from './lifecycle.js'

/** Pulling the NapCat image can take a while on a fresh machine. */
const COMPOSE_PULL_TIMEOUT_MS = 900_000
/** `docker compose up -d` may need to pull first. */
const COMPOSE_UP_TIMEOUT_MS = 900_000
/** Regular compose/stop/inspect commands. */
const COMPOSE_TIMEOUT_MS = 60_000
/** Container/image inspection is cheap. */
const INSPECT_TIMEOUT_MS = 15_000
/** `docker info` preflight / readiness check. */
const ENGINE_INFO_TIMEOUT_MS = 15_000
/** How often to poll after launching Docker Desktop. */
const ENGINE_POLL_MS = 2000

/** Files under the bind-mounted NapCat config directory. */
const ONEBOT_CONFIG_RE = /^onebot11_(\d+)\.json$/u
const PROTOCOL_CONFIG_RE = /^napcat_protocol_(\d+)\.json$/u

/** Default filesystem seam; tests may override individual members. */
const defaultFs = {
  existsSync,
  ensureDir,
  readJson,
  readdir,
  readText,
  writeFileAtomic,
}

/**
 * Validate values interpolated into the generated compose file.
 * @param {string} value
 * @param {string} label
 */
function composeSafe(value, label) {
  const text = String(value ?? '')
  if (text === '' || /[\r\n]/u.test(text)) throw new Error(`${label} must be a non-empty single-line string`)
  return text
}

/** First useful line of a command result for user-facing messages. */
function commandDetail(result) {
  const text = String(result?.stderr ?? '').trim() || String(result?.error ?? '').trim() || String(result?.stdout ?? '').trim()
  return text.split(/\r?\n/u)[0].slice(0, 300)
}

/**
 * Owns the NapCat Docker lifecycle. Public methods mirror `NapcatManager`.
 */
export class DockerNapcatManager {
  /**
   * @param {object} options
   * @param {object} [options.settings] resolved plugin settings
   * @param {object} [options.logger]
   * @param {object} [options.deps] test seam: { run, http, fs, sleep, now, docker }
   */
  constructor(options = {}) {
    const source = isPlainObject(options) ? options : {}
    this.settings = resolveSettings(isPlainObject(source.settings) ? source.settings : {})
    this.logger = normalizeLogger(source.logger)
    this.deps = isPlainObject(source.deps) ? source.deps : {}
    this.fs = { ...defaultFs, ...(isPlainObject(this.deps.fs) ? this.deps.fs : {}) }
    this.run = typeof this.deps.run === 'function' ? this.deps.run : execFileRun
    this.http = typeof this.deps.http === 'function' ? this.deps.http : httpJson
    this.sleep = typeof this.deps.sleep === 'function' ? this.deps.sleep : sleepFor
    this.now = typeof this.deps.now === 'function' ? this.deps.now : Date.now
    this.docker = typeof this.deps.docker === 'string' && this.deps.docker !== '' ? this.deps.docker : 'docker'
    this.launch = typeof this.deps.launch === 'function' ? this.deps.launch : launchDetached
    this.hostOs = detectHostPlatform()

    const dataDir = typeof this.settings.dockerNapcatDataDir === 'string' ? this.settings.dockerNapcatDataDir : ''
    this.baseDir = dataDir !== '' ? dataDir : join(this.settings.projectDir, 'runtime', 'napcat-docker')
    this.composePath = join(this.baseDir, 'compose.yaml')
    this.configDir = join(this.baseDir, 'data', 'napcat-config')
    this.qqDir = join(this.baseDir, 'data', 'qq')
    this.cacheDir = join(this.baseDir, 'data', 'napcat-cache')
    this.tokenPath = join(this.baseDir, 'webui-token.txt')
    this.container = composeSafe(this.settings.dockerNapcatContainer || 'dsh-qqbot-napcat', 'dockerNapcatContainer')
    this.image = composeSafe(this.settings.dockerNapcatImage || 'mlikiowa/napcat-docker:latest', 'dockerNapcatImage')
    this.reverseUrl = `ws://${composeSafe(this.settings.dockerNapcatHost || 'host.docker.internal', 'dockerNapcatHost')}:${this.settings.koishiPort}${this.settings.reversePath}`

    /** Runtime container/image facts refreshed by {@link refresh}. */
    this.state = { checked: false, imagePresent: false, containerExists: false, containerRunning: false, accountUins: [] }
    /** Cached detection payload for the sync `detect()` seam. */
    this.detected = null
    /** WebUI token comes from settings or the generated token file. */
    this.cachedToken = typeof this.settings.dockerNapcatToken === 'string' && this.settings.dockerNapcatToken !== ''
      ? this.settings.dockerNapcatToken
      : null
    /** WebUI credentials cached by webui.js. */
    this.auth = null
    this.webuiReachable = false
    /** The container reaches the host WebUI on this port. */
    this.webuiLocalPort = this.settings.napcatPort
    /** OneBot reverse-WS URL the container should use (overrides detect.js). */
    this.onebotUrl = this.reverseUrl

    /** Platform seam consumed by the shared detect/snapshot/webui modules. */
    this.platform = {
      hostPlatform: () => 'docker',
      detectNapcat: () => this.detect(),
      detectQq: () => ({ installed: true, path: null, version: null }),
      findProcess: () => ({ running: this.state.containerRunning, pid: null }),
      napcatQrPath: () => this.qrImagePath(),
      killPid: async () => ({ ok: true }),
    }
  }

  // ------------------------------------------------------------- public API --

  /** Full read-only snapshot for the panel. */
  async status() {
    await this.refresh()
    return snapshotStatus(this)
  }

  /**
   * Make sure the image is available. Unlike the macOS backend this does not
   * install anything into QQ; it only pulls the pinned Docker image.
   */
  async install() {
    try {
      await this.ensureCompose()
      const engine = await this.ensureEngine()
      if (engine.ok !== true) return engine
      const image = await this.#docker(['image', 'inspect', '--format', '{{.Id}}', this.image], { timeoutMs: INSPECT_TIMEOUT_MS })
      if (image.code === 0) {
        return { ok: true, backend: 'docker', reused: true, version: this.image, message: `NapCat Docker 镜像已就绪（${this.image}）` }
      }
      const pulled = await this.#compose(['pull'], { timeoutMs: COMPOSE_PULL_TIMEOUT_MS })
      if (pulled.code !== 0) {
        return failure('docker-pull-failed', `拉取 NapCat Docker 镜像失败：${commandDetail(pulled)}`)
      }
      await this.refresh()
      return { ok: true, backend: 'docker', version: this.image, message: `NapCat Docker 镜像已拉取（${this.image}）` }
    } catch (error) {
      return failure('docker-unavailable', `Docker 不可用：${String(error?.message ?? error)}`)
    }
  }

  /**
   * Make sure the Docker engine is reachable. If it is not and
   * `dockerAutoStart` is enabled, launch Docker Desktop and poll `docker info`
   * until it is ready (or the configured timeout expires).
   */
  async ensureEngine() {
    if (await this.#engineReady()) return { ok: true, started: false }
    const launched = await this.#launchDocker()
    if (launched.ok !== true) return launched
    const timeoutMs = this.settings.dockerEngineTimeoutMs
    const deadline = this.now() + timeoutMs
    this.logger.info('Docker Desktop 已启动，等待 Docker 引擎就绪…')
    while (this.now() < deadline) {
      await this.sleep(ENGINE_POLL_MS)
      if (await this.#engineReady()) {
        this.logger.info('Docker 引擎已就绪')
        return { ok: true, started: true, message: 'Docker Desktop 已启动' }
      }
    }
    return failure('docker-engine-timeout', `Docker Desktop 启动超时（${Math.round(timeoutMs / 1000)}s）：请确认 Docker Desktop 已安装、允许 WSL2 启动，或在配置中调整 dockerEngineTimeoutMs`)
  }

  /** Whether `docker info` talks to a live engine. */
  async #engineReady() {
    const result = await this.#docker(['info', '--format', '{{.ServerVersion}}'], { timeoutMs: ENGINE_INFO_TIMEOUT_MS })
    return result.code === 0
  }

  /** Resolve the Docker Desktop executable/app bundle for this host. */
  #dockerDesktopPath() {
    const configured = this.settings.dockerDesktopPath
    if (typeof configured === 'string' && configured !== '') return configured
    if (this.hostOs === 'windows') {
      const bases = [
        process.env.ProgramFiles,
        process.env.ProgramW6432,
        process.env['ProgramFiles(x86)'],
        process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'Programs') : null,
        process.env.LOCALAPPDATA,
      ]
      for (const base of bases) {
        if (typeof base !== 'string' || base === '') continue
        for (const candidate of [
          join(base, 'Docker', 'Docker', 'Docker Desktop.exe'),
          join(base, 'Docker', 'Docker Desktop.exe'),
        ]) {
          if (existsSync(candidate)) return candidate
        }
      }
      return null
    }
    if (this.hostOs === 'macos') return '/Applications/Docker.app'
    return null
  }

  /** Launch Docker Desktop (Windows executable or macOS app bundle). */
  async #launchDocker() {
    if (this.settings.dockerAutoStart !== true) {
      return failure('docker-engine-unavailable', 'Docker 引擎未运行；请先启动 Docker Desktop，或开启 dockerAutoStart 配置')
    }
    const target = this.#dockerDesktopPath()
    if (target === null || target === '') {
      return failure('docker-desktop-missing', '未找到 Docker Desktop：请安装 Docker Desktop，或在配置中设置 dockerDesktopPath')
    }
    if (!existsSync(target)) {
      return failure('docker-desktop-missing', `Docker Desktop 不存在：${target}；请安装或修正 dockerDesktopPath`)
    }
    const launched = this.hostOs === 'macos'
      ? this.launch('open', ['-a', target])
      : this.hostOs === 'windows'
        ? this.launch(target, [])
        : false
    if (launched !== true) {
      return failure('docker-desktop-launch-failed', `无法启动 Docker Desktop：${target}`)
    }
    this.logger.info('已启动 Docker Desktop：%s', target)
    return { ok: true }
  }

  /** Write the OneBot reverse WebSocket client into every account config. */
  async configure(options = {}) {
    return configure(this, options)
  }

  /** Start the container and wait until NapCat reports a logged-in account. */
  async start(options = {}) {
    const requestedTimeout = Number(options?.timeoutMs)
    const timeoutMs = Number.isFinite(requestedTimeout) && requestedTimeout > 0 ? requestedTimeout : START_TIMEOUT_MS
    try {
      await this.ensureCompose()
      const engine = await this.ensureEngine()
      if (engine.ok !== true) return engine
      await this.refresh()
      if (this.state.containerRunning) {
        const probe = await this.loginStatus()
        if (probe.loggedIn === true) {
          return {
            ok: true,
            alreadyRunning: true,
            loggedIn: true,
            qq: probe.qq,
            nickname: probe.nickname,
            message: `NapCat 容器已在运行${probe.qq ? `（QQ ${probe.qq}）` : ''}`,
          }
        }
        if (this.webuiReachable === true) {
          return {
            ok: true,
            alreadyRunning: true,
            loggedIn: false,
            timedOut: true,
            qq: null,
            nickname: null,
            message: 'NapCat 容器已在运行，请用手机扫描二维码登录 QQ',
          }
        }
      }
      const up = await this.#compose(['up', '-d'], { timeoutMs: COMPOSE_UP_TIMEOUT_MS })
      if (up.code !== 0) {
        return failure('docker-up-failed', `启动 NapCat 容器失败：${commandDetail(up)}`)
      }
      await this.refresh()
      const started = await waitForLogin(this, timeoutMs)
      if (started?.ok === true && started.loggedIn === true) {
        await this.refresh()
        if (await autoConfigure(this)) started.configured = true
      }
      return started
    } catch (error) {
      return failure('docker-unavailable', `启动 NapCat 容器失败：${String(error?.message ?? error)}`)
    }
  }

  /** Stop the container (the bind-mounted QQ/config data stays on disk). */
  async stop(options = {}) {
    const requestedTimeout = Number(options?.timeoutMs)
    const timeoutMs = Number.isFinite(requestedTimeout) && requestedTimeout > 0 ? requestedTimeout : STOP_TIMEOUT_MS
    try {
      await this.refresh()
      if (!this.state.containerExists) {
        return { ok: true, alreadyStopped: true, message: 'NapCat 容器未运行' }
      }
      if (!this.state.containerRunning) {
        return { ok: true, alreadyStopped: true, message: 'NapCat 容器已停止' }
      }
      const stopped = await this.#compose(['stop'], { timeoutMs: Math.max(60_000, timeoutMs) })
      await this.refresh()
      if (!this.state.containerRunning) {
        // Docker may exit non-zero while a container is still stopping; the
        // final state is authoritative.
        if (stopped.code !== 0) {
          this.logger.warn('docker compose stop 返回 %s，但容器已停止：%s', stopped.code, commandDetail(stopped))
        }
        this.logger.info('NapCat 容器已停止（%s）', this.container)
        return { ok: true, message: 'NapCat 容器已停止' }
      }
      if (stopped.code !== 0) {
        return failure('docker-stop-failed', `停止 NapCat 容器失败：${commandDetail(stopped)}`)
      }
      return failure('docker-stop-failed', 'NapCat 容器未能在超时内停止')
    } catch (error) {
      return failure('docker-unavailable', `停止 NapCat 容器失败：${String(error?.message ?? error)}`)
    }
  }

  /** Read the QQ login state through the NapCat WebUI API. */
  async loginStatus() {
    return webuiLoginStatus(this)
  }

  /** Login state for the panel: QR phase, QR availability and account. */
  async loginState() {
    return webuiLoginState(this)
  }

  /** Ask NapCat's WebUI to refresh the login QR code. */
  async refreshQr() {
    return webuiRefreshQr(this)
  }

  /** Path of the cached login QR image (bind-mounted from the container). */
  qrImagePath() {
    return join(this.cacheDir, 'qrcode.png')
  }

  // ------------------------------------------------------------- internals --

  /**
   * Cached detection payload for the shared detect/snapshot/webui modules.
   * Callers that need fresh state use {@link refresh} first (status/start/stop).
   */
  detect() {
    return this.detected ?? {
      installed: this.state.imagePresent || this.state.containerExists,
      installDir: this.baseDir,
      configDir: this.configDir,
      version: this.image,
      accounts: [],
      webui: { port: this.settings.napcatPort, token: this.cachedToken },
    }
  }

  /** Refresh image/container facts and the host-side account list. */
  async refresh() {
    const [image, container] = await Promise.all([
      this.#docker(['image', 'inspect', '--format', '{{.Id}}', this.image], { timeoutMs: INSPECT_TIMEOUT_MS }),
      this.#docker(['inspect', '--format', '{{.State.Running}}|{{.Id}}', this.container], { timeoutMs: INSPECT_TIMEOUT_MS }),
    ])
    const containerOutput = String(container.stdout ?? '').trim()
    this.state = {
      checked: true,
      imagePresent: image.code === 0,
      containerExists: container.code === 0,
      containerRunning: container.code === 0 && containerOutput.startsWith('true'),
      accountUins: [],
    }
    const entries = await this.fs.readdir(this.configDir)
    const uins = new Set()
    for (const entry of Array.isArray(entries) ? entries : []) {
      if (typeof entry !== 'string') continue
      const match = ONEBOT_CONFIG_RE.exec(entry) ?? PROTOCOL_CONFIG_RE.exec(entry)
      if (match !== null) uins.add(match[1])
    }
    const accounts = [...uins].sort().map((uin) => ({ uin, configPath: join(this.configDir, `onebot11_${uin}.json`) }))
    const token = await this.#readToken()
    this.detected = {
      installed: this.state.imagePresent || this.state.containerExists,
      installDir: this.baseDir,
      configDir: this.configDir,
      version: this.image,
      accounts,
      webui: { port: this.settings.napcatPort, token },
    }
    this.state.accountUins = accounts.map((account) => account.uin)
    return this.state
  }

  /**
   * Create the data directories and (re)write `compose.yaml` when it changed.
   * The WebUI token is generated once and persisted next to the compose file.
   */
  async ensureCompose() {
    await Promise.all([this.fs.ensureDir(this.configDir), this.fs.ensureDir(this.qqDir), this.fs.ensureDir(this.cacheDir)])
    const token = await this.#ensureToken()
    const compose = this.#composeSource(token)
    const current = await this.fs.readText(this.composePath)
    if (current !== compose) await this.fs.writeFileAtomic(this.composePath, compose)
    return { composePath: this.composePath, token }
  }

  /** Generate or load the WebUI token. */
  async #ensureToken() {
    if (this.cachedToken !== null && this.cachedToken !== '') return this.cachedToken
    const saved = await this.fs.readText(this.tokenPath)
    if (typeof saved === 'string' && saved.trim() !== '') {
      this.cachedToken = saved.trim()
      return this.cachedToken
    }
    const generated = randomBytes(18).toString('hex')
    await this.fs.writeFileAtomic(this.tokenPath, generated)
    this.cachedToken = generated
    return generated
  }

  /** Current WebUI token (container webui.json first, then generated token). */
  async #readToken() {
    const data = await this.fs.readJson(join(this.configDir, 'webui.json'), null)
    if (isPlainObject(data) && typeof data.token === 'string' && data.token !== '') {
      this.cachedToken = data.token
      return data.token
    }
    if (this.cachedToken !== null && this.cachedToken !== '') return this.cachedToken
    const saved = await this.fs.readText(this.tokenPath)
    if (typeof saved === 'string' && saved.trim() !== '') {
      this.cachedToken = saved.trim()
      return this.cachedToken
    }
    return null
  }

  /** Compose file contents for the current settings. */
  #composeSource(token) {
    const lines = [
      '# Generated by dsh-qqbot. Manual edits are overwritten; use the plugin config instead.',
      'services:',
      '  napcat:',
      `    image: ${JSON.stringify(this.image)}`,
      `    container_name: ${JSON.stringify(this.container)}`,
      '    restart: "no"',
      '    environment:',
      '      MODE: "reverse_ws"',
      `      ONEBOT_URL: ${JSON.stringify(this.reverseUrl)}`,
      `      WEBUI_TOKEN: ${JSON.stringify(token)}`,
      '      NAPCAT_UID: "0"',
      '      NAPCAT_GID: "0"',
      '    ports:',
      `      - "127.0.0.1:${this.settings.napcatPort}:6099"`,
      '    volumes:',
      '      - "./data/napcat-config:/app/napcat/config"',
      '      - "./data/qq:/app/.config/QQ"',
      '      - "./data/napcat-cache:/app/napcat/cache"',
      '',
    ]
    return lines.join('\n')
  }

  /** Run one docker CLI command. */
  #docker(args, options = {}) {
    return this.run(this.docker, args, { timeoutMs: options.timeoutMs ?? COMPOSE_TIMEOUT_MS })
  }

  /** Run one `docker compose -f <compose> ...` command. */
  #compose(args, options = {}) {
    return this.run(this.docker, ['compose', '-f', this.composePath, ...args], { timeoutMs: options.timeoutMs ?? COMPOSE_TIMEOUT_MS })
  }
}
