/**
 * NapCat manager: detect, install, configure and control the macOS QQ client
 * that NapCat patches.
 *
 * The module deliberately keeps every side effect behind a small injectable
 * dependency seam (`run`, `http`, `fs`, `platform`, `sleep`, `processKill`,
 * `now`, `download`, `fetch`) so the unit tests never touch the real QQ
 * process, the real NapCat configuration or the network.
 *
 * Security rules enforced here:
 * - every external command is executed with an argument array (no shell),
 * - tokens never leave the process in logs or status payloads (`maskToken`),
 * - failures are returned as `{ ok:false, error, message }` instead of thrown,
 *   except for programmer errors in the pure helpers (bad argument types).
 *
 * @module lib/napcat
 */

import { promises as fsp } from 'node:fs'
import { dirname, join } from 'node:path'
import {
  QQ_APP_PATH,
  detectNapcat,
  detectQq,
  findProcess,
  resolveSettings,
} from './platform.js'
import {
  ensureDir,
  existsSync,
  expandHome,
  httpJson,
  maskToken,
  readJson,
  run as execFileRun,
  sha256Hex,
  sleep as sleepFor,
  writeFileAtomic,
} from './util.js'

/** Latest NapCat macOS installer release (GitHub API requires a User-Agent). */
const GITHUB_LATEST_RELEASE = 'https://api.github.com/repos/NapNeko/NapCat-Mac-Installer/releases/latest'

/** Headers the GitHub API requires. */
const GITHUB_HEADERS = Object.freeze({
  'user-agent': 'dsh-qqbot',
  accept: 'application/vnd.github+json',
})

/** QQ executable matched by `ps` when looking for the running client. */
const QQ_EXECUTABLE = `${QQ_APP_PATH}/Contents/MacOS/QQ`

/** Name of the reverse WebSocket client this plugin owns in NapCat configs. */
const WS_CLIENT_NAME = 'koishi'

/** Fields written for the managed `koishi` reverse WebSocket client. */
const WS_CLIENT_DEFAULTS = Object.freeze({
  name: WS_CLIENT_NAME,
  enable: true,
  url: '',
  messagePostFormat: 'array',
  reportSelfMessage: false,
  reconnectInterval: 5000,
  token: '',
  debug: false,
  heartInterval: 30000,
})

/** WebUI credentials are cached for ten minutes; any 401 drops the cache. */
const CREDENTIAL_TTL_MS = 10 * 60 * 1000

/** Delay between poll iterations for start/stop. */
const POLL_INTERVAL_MS = 500

/** How long `stop()` waits for a graceful SIGTERM exit before escalating. */
const STOP_TIMEOUT_MS = 10_000

/** How long `stop()` waits after SIGKILL before declaring failure. */
const SIGKILL_GRACE_MS = 2_000

/** Default login wait for `start()`. */
const START_TIMEOUT_MS = 30_000

/**
 * @typedef {object} NapcatStatus
 * @property {boolean} installed
 * @property {string|null} installDir
 * @property {string|null} configDir
 * @property {string|null} version
 * @property {boolean} running
 * @property {number|null} pid
 * @property {boolean} loggedIn
 * @property {string|null} qq
 * @property {string|null} nickname
 * @property {{ port: number, tokenMasked: string|null, reachable: boolean }} webui
 * @property {Array<{ uin: string, configPath: string, wsClients: Array<{name:string,url:string,enable:boolean}>, applied: boolean }>} accounts
 * @property {boolean} configApplied
 * @property {{ downloaded: boolean, appPath: string|null, version: string|null }} installer
 * @property {string} [error]
 */

/** Default filesystem seam; tests may override individual members. */
const defaultFs = {
  existsSync,
  ensureDir,
  readJson,
  readdir: async (path) => {
    try {
      return await fsp.readdir(expandHome(path))
    } catch {
      return []
    }
  },
  writeFile: async (path, data) => {
    await fsp.writeFile(expandHome(path), data)
  },
  writeFileAtomic,
}

/** Default platform seam; read-only detection helpers from lib/platform.js. */
const defaultPlatform = { detectNapcat, detectQq, findProcess }

// --------------------------------------------------------------- pure helpers --

/**
 * Whether `value` is a non-array object.
 * @param {unknown} value
 * @returns {value is Record<string, any>}
 */
function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/**
 * JSON-safe deep clone. OneBot configs are pure JSON, so this is lossless for
 * every value the manager actually handles.
 * @template T
 * @param {T} value
 * @returns {T}
 */
function deepClone(value) {
  return JSON.parse(JSON.stringify(value))
}

/**
 * Ensure the OneBot config contains a reverse WebSocket client for Koishi.
 *
 * The input object is never mutated: a deep copy is returned. An existing
 * client with the same `name` is updated in place (extra keys such as
 * `verifyCertificate` are preserved, so re-running is idempotent); all other
 * clients are left untouched.
 *
 * @param {Record<string, any>} onebotConfig parsed `onebot11_<uin>.json`
 * @param {{ url: string, name?: string, token?: string }} options
 * @returns {{ config: Record<string, any>, changed: boolean }}
 */
export function upsertWebsocketClient(onebotConfig, options = {}) {
  if (!isPlainObject(onebotConfig)) throw new TypeError('onebotConfig must be an object')
  const url = options.url
  if (typeof url !== 'string' || url === '') throw new TypeError('options.url must be a non-empty string')
  const name = typeof options.name === 'string' && options.name !== '' ? options.name : WS_CLIENT_NAME
  const token = typeof options.token === 'string' ? options.token : ''

  const config = deepClone(onebotConfig)
  if (!isPlainObject(config.network)) config.network = {}
  if (!Array.isArray(config.network.websocketClients)) config.network.websocketClients = []
  const clients = config.network.websocketClients
  const desired = { ...WS_CLIENT_DEFAULTS, name, url, token }
  const index = clients.findIndex((client) => isPlainObject(client) && client.name === name)
  if (index === -1) {
    clients.push(desired)
  } else {
    clients[index] = { ...clients[index], ...desired }
  }
  return { config, changed: JSON.stringify(config) !== JSON.stringify(onebotConfig) }
}

/**
 * List reverse WebSocket clients for display: only non-sensitive fields.
 *
 * @param {Record<string, any>|null|undefined} onebotConfig
 * @returns {Array<{ name: string, url: string, enable: boolean }>}
 */
export function listWebsocketClients(onebotConfig) {
  const clients = isPlainObject(onebotConfig)
    && isPlainObject(onebotConfig.network)
    && Array.isArray(onebotConfig.network.websocketClients)
    ? onebotConfig.network.websocketClients
    : []
  return clients
    .filter((client) => isPlainObject(client))
    .map((client) => ({
      name: typeof client.name === 'string' ? client.name : '',
      url: typeof client.url === 'string' ? client.url : '',
      enable: client.enable !== false,
    }))
}

/** Keys whose values must never reach the UI. */
const SENSITIVE_KEYS = new Set(['token', 'accessToken', 'access_token', 'secret', 'password'])

/**
 * Mask every token-like value in an OneBot config before it is shown to the UI.
 * The input object is not mutated.
 *
 * @param {Record<string, any>|null|undefined} onebotConfig
 * @returns {Record<string, any>|null}
 */
export function maskOnebotConfig(onebotConfig) {
  if (!isPlainObject(onebotConfig)) return null
  return maskSecrets(deepClone(onebotConfig))
}

/**
 * Recursively replace token-like values with their masked form.
 * @param {any} value
 * @returns {any}
 */
function maskSecrets(value) {
  if (Array.isArray(value)) return value.map((item) => maskSecrets(item))
  if (!isPlainObject(value)) return value
  const masked = {}
  for (const [key, item] of Object.entries(value)) {
    if (SENSITIVE_KEYS.has(key)) {
      masked[key] = maskToken(typeof item === 'string' ? item : '')
    } else {
      masked[key] = maskSecrets(item)
    }
  }
  return masked
}

/**
 * Extract the meaningful payload from a NapCat WebUI API envelope.
 * @param {any} payload
 * @returns {any}
 */
function unwrapData(payload) {
  if (!isPlainObject(payload)) return payload
  if (isPlainObject(payload.data)) return payload.data
  return payload
}

/**
 * Coerce a NapCat boolean-ish API field.
 * @param {any} value
 * @returns {boolean}
 */
function toBoolean(value) {
  return value === true || value === 1 || value === 'true' || value === '1'
}

/**
 * First non-empty string value among `keys` of `data`.
 * @param {any} data
 * @param {string[]} keys
 * @returns {string|null}
 */
function firstString(data, keys) {
  if (!isPlainObject(data)) return null
  for (const key of keys) {
    const value = data[key]
    if (typeof value === 'string' && value !== '') return value
    if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  }
  return null
}

/**
 * Structured failure payload shared by the action methods.
 * @param {string} error
 * @param {string} message
 * @returns {{ ok: false, error: string, message: string }}
 */
function failure(error, message) {
  return { ok: false, error, message }
}

/**
 * Normalize a logger to the three methods used here.
 * @param {{ info?: Function, warn?: Function, error?: Function }|null|undefined} logger
 */
function normalizeLogger(logger) {
  const noop = () => {}
  return {
    info: typeof logger?.info === 'function' ? logger.info.bind(logger) : noop,
    warn: typeof logger?.warn === 'function' ? logger.warn.bind(logger) : noop,
    error: typeof logger?.error === 'function' ? logger.error.bind(logger) : noop,
  }
}

/**
 * Human-readable detail from a `run()` result.
 * @param {{ stdout?: string, stderr?: string, error?: string }} result
 * @returns {string}
 */
function runDetail(result) {
  const detail = String(result?.stderr ?? '').trim() || String(result?.error ?? '').trim()
  return detail
}

// ------------------------------------------------------------------- manager --

/**
 * Owns every NapCat side effect for the QQ bot control center.
 */
export class NapcatManager {
  /**
   * @param {object} options
   * @param {ReturnType<typeof resolveSettings>} options.settings
   * @param {{ info: Function, warn: Function, error: Function }} options.logger
   * @param {{
   *   run?: Function,
   *   http?: Function,
   *   fs?: object,
   *   platform?: object,
   *   sleep?: Function,
   *   processKill?: Function,
   *   now?: Function,
   *   download?: (url: string, zipPath: string) => Promise<void>,
   *   fetch?: Function,
   * }} [options.deps] test seam
   */
  constructor(options = {}) {
    const source = isPlainObject(options) ? options : {}
    this.settings = resolveSettings(isPlainObject(source.settings) ? source.settings : {})
    this.logger = normalizeLogger(source.logger)
    this.deps = isPlainObject(source.deps) ? source.deps : {}
    this.fs = { ...defaultFs, ...(isPlainObject(this.deps.fs) ? this.deps.fs : {}) }
    this.platform = { ...defaultPlatform, ...(isPlainObject(this.deps.platform) ? this.deps.platform : {}) }
    this.run = typeof this.deps.run === 'function' ? this.deps.run : execFileRun
    this.http = typeof this.deps.http === 'function' ? this.deps.http : httpJson
    this.sleep = typeof this.deps.sleep === 'function' ? this.deps.sleep : sleepFor
    this.now = typeof this.deps.now === 'function' ? this.deps.now : Date.now
    this.processKill = typeof this.deps.processKill === 'function'
      ? this.deps.processKill
      : (pid, signal) => process.kill(pid, signal)
    this.download = typeof this.deps.download === 'function' ? this.deps.download : null
    this.fetch = typeof this.deps.fetch === 'function'
      ? this.deps.fetch
      : (typeof globalThis.fetch === 'function' ? globalThis.fetch.bind(globalThis) : null)
    /** @type {{ credential: string, port: number, tokenHash: string, expiresAt: number }|null} */
    this.auth = null
    /** Whether the last WebUI API call reached the server at all. */
    this.webuiReachable = false
    /** @type {{ zipPath: string, appPath: string, version: string }|null} */
    this.lastInstaller = null
  }

  /**
   * Full read-only snapshot for the panel. Never throws: a failure is reported
   * through `error` and the remaining fields keep empty defaults.
   *
   * @returns {Promise<NapcatStatus>}
   */
  async status() {
    /** @type {NapcatStatus} */
    const status = {
      installed: false,
      installDir: null,
      configDir: null,
      version: null,
      running: false,
      pid: null,
      loggedIn: false,
      qq: null,
      nickname: null,
      webui: { port: this.settings.napcatPort, tokenMasked: null, reachable: false },
      accounts: [],
      configApplied: false,
      installer: { downloaded: false, appPath: null, version: null },
    }
    try {
      const detected = this.#detect()
      status.installed = detected.installed === true
      status.installDir = typeof detected.installDir === 'string' ? detected.installDir : null
      status.configDir = typeof detected.configDir === 'string' ? detected.configDir : null
      status.version = typeof detected.version === 'string' ? detected.version : null

      const processInfo = this.#processInfo()
      status.running = processInfo.running === true
      status.pid = Number.isInteger(processInfo.pid) ? processInfo.pid : null

      const probe = await this.#loginProbe(detected)
      status.loggedIn = probe.loggedIn
      status.qq = probe.qq
      status.nickname = probe.nickname
      status.webui = {
        port: probe.port,
        tokenMasked: probe.tokenMasked,
        reachable: probe.reachable,
      }

      status.accounts = await this.#accountStatuses(detected)
      status.configApplied = status.accounts.length > 0 && status.accounts.every((account) => account.applied)
      status.installer = await this.#installerInfo()
    } catch (error) {
      status.error = String(error?.message ?? error)
      this.logger.warn('NapCat 状态检测失败: %s', status.error)
    }
    return status
  }

  /**
   * Download the official NapCat macOS installer and open it (GUI part stays
   * manual: authorisation and QQ login are performed by the user).
   *
   * @returns {Promise<{ ok: boolean, appPath?: string, version?: string, zipPath?: string, message?: string, error?: string }>}
   */
  async install() {
    if (process.platform !== 'darwin') return failure('unsupported-platform', 'NapCat 安装器仅支持 macOS')
    const downloaded = await this.downloadInstaller()
    if (downloaded.ok !== true) {
      return {
        ok: false,
        error: downloaded.error ?? 'install-failed',
        message: downloaded.message ?? '下载 NapCat 安装器失败',
      }
    }
    try {
      const opened = await this.run('/usr/bin/open', [downloaded.appPath], { timeoutMs: 20_000 })
      if (opened.code !== 0) {
        const detail = runDetail(opened)
        return {
          ok: false,
          error: 'open-failed',
          appPath: downloaded.appPath,
          version: downloaded.version,
          message: `无法打开 NapCat 安装器${detail === '' ? '' : `：${detail}`}`,
        }
      }
      this.logger.info('NapCat 安装器已打开: %s (v%s)', downloaded.appPath, downloaded.version)
      return {
        ok: true,
        appPath: downloaded.appPath,
        version: downloaded.version,
        zipPath: downloaded.zipPath,
        message: '安装器已打开，请按提示授权并切换入口',
      }
    } catch (error) {
      return failure('open-failed', `无法打开 NapCat 安装器：${String(error?.message ?? error)}`)
    }
  }

  /**
   * Download the latest NapCat-Mac-Installer release into `settings.installerDir`
   * and extract it. When `deps.download` is injected the download step is
   * replaced (tests never hit the network).
   *
   * @returns {Promise<{ ok: boolean, zipPath?: string, appPath?: string, version?: string, error?: string, message?: string }>}
   */
  async downloadInstaller() {
    try {
      const response = await this.http(GITHUB_LATEST_RELEASE, {
        headers: { ...GITHUB_HEADERS },
        timeoutMs: 20_000,
      })
      if (response?.ok !== true || !isPlainObject(response.data)) {
        const reason = response?.error ?? (response?.status ? `HTTP ${response.status}` : '未知错误')
        return failure('github-api-failed', `获取 NapCat 安装器发布信息失败：${reason}`)
      }
      const release = response.data
      const assets = Array.isArray(release.assets)
        ? release.assets.filter((asset) => isPlainObject(asset) && typeof asset.browser_download_url === 'string' && asset.browser_download_url !== '')
        : []
      const asset = assets.find((item) => /^NapCatInstaller_.*\.zip$/iu.test(String(item.name ?? '')))
        ?? assets.find((item) => /\.zip$/iu.test(String(item.name ?? '')))
      if (asset === undefined) {
        return failure('installer-asset-missing', '发布中未找到 NapCatInstaller 压缩包')
      }
      const version = String(release.tag_name ?? release.name ?? 'latest').replace(/^v/iu, '')
      const targetDir = join(expandHome(this.settings.installerDir), version)
      const zipPath = join(targetDir, 'NapCatInstaller.zip')
      const extractDir = join(targetDir, 'extracted')
      await this.fs.ensureDir(extractDir)

      const downloaded = await this.#downloadFile(asset.browser_download_url, zipPath)
      if (downloaded.ok !== true) {
        return failure('download-failed', `下载 NapCat 安装器失败：${downloaded.error ?? '未知错误'}`)
      }
      const extractError = await this.#extractZip(zipPath, extractDir)
      if (extractError !== null) return failure('extract-failed', extractError)
      const appPath = await this.#findInstallerApp(extractDir)
      if (appPath === null) {
        return failure('installer-app-missing', '解压后未找到 NapCatInstaller.app')
      }
      this.lastInstaller = { zipPath, appPath, version }
      this.logger.info('NapCat 安装器已下载: %s (v%s)', zipPath, version)
      return { ok: true, zipPath, appPath, version }
    } catch (error) {
      return failure('download-failed', `下载 NapCat 安装器失败：${String(error?.message ?? error)}`)
    }
  }

  /**
   * Write the OneBot reverse WebSocket client into every account config and
   * hot-apply it through the NapCat WebUI API. When the API is unreachable the
   * files are still written and the caller is told to restart NapCat.
   *
   * @param {{ uin?: string }} [options]
   * @returns {Promise<{ ok: boolean, accounts?: Array<{ uin: string, path: string, changed: boolean, applied: boolean, error?: string }>, message: string, error?: string }>}
   */
  async configure(options = {}) {
    if (options !== null && typeof options !== 'object') throw new TypeError('configure options must be an object')
    const requested = options?.uin
    const uin = typeof requested === 'string'
      ? requested.trim()
      : (typeof requested === 'number' && Number.isFinite(requested) ? String(requested) : '')
    try {
      if (process.platform !== 'darwin') return failure('unsupported-platform', 'NapCat 配置仅支持 macOS')
      const detected = this.#detect()
      const configDir = typeof detected.configDir === 'string' && detected.configDir !== '' ? detected.configDir : null
      if (configDir === null) {
        return failure('napcat-config-missing', '未找到 NapCat 配置目录，请先安装 NapCat 并登录 QQ')
      }
      const selected = await this.#resolveAccounts(detected, configDir, uin)
      if (selected.ok !== true) return selected

      const url = this.#websocketUrl()
      const webui = await this.#webuiInfo(detected)
      /** @type {Array<{ uin: string, path: string, changed: boolean, applied: boolean, error?: string }>} */
      const accounts = []
      let hardFailures = 0
      for (const account of selected.accounts) {
        const current = await this.#safeReadJson(account.configPath)
        if (current === null) {
          hardFailures += 1
          accounts.push({ uin: account.uin, path: account.configPath, changed: false, applied: false, error: 'invalid-config' })
          continue
        }
        const { config, changed } = upsertWebsocketClient(current, {
          url,
          name: WS_CLIENT_NAME,
          token: this.settings.napcatToken,
        })
        if (changed) {
          try {
            await this.fs.writeFileAtomic(account.configPath, `${JSON.stringify(config, null, 2)}\n`)
          } catch (error) {
            hardFailures += 1
            this.logger.warn('NapCat 配置写入失败 (%s): %s', account.configPath, String(error?.message ?? error))
            accounts.push({ uin: account.uin, path: account.configPath, changed: false, applied: false, error: 'write-failed' })
            continue
          }
        }
        const applied = webui === null ? false : await this.#hotApply(webui, config, account.configPath)
        accounts.push({ uin: account.uin, path: account.configPath, changed, applied })
      }

      let message
      if (accounts.length === 0) {
        message = '没有可配置的 QQ 账号'
      } else if (hardFailures > 0) {
        message = '部分账号的 NapCat 配置写入失败，请检查配置目录权限'
      } else if (accounts.every((account) => account.applied)) {
        message = `已写入并热应用 ${accounts.length} 个账号的 OneBot 配置`
      } else {
        message = '已写入文件，重启 NapCat 生效'
      }
      this.logger.info('NapCat OneBot 配置: %s', message)
      return { ok: accounts.length > 0 && hardFailures === 0, accounts, message }
    } catch (error) {
      const message = String(error?.message ?? error)
      this.logger.error('NapCat 配置失败: %s', message)
      return failure('configure-failed', `写入 NapCat 配置失败：${message}`)
    }
  }

  /**
   * Launch QQ with NapCat injection (`open --args --no-sandbox`) and wait until
   * NapCat reports a logged-in QQ account.
   *
   * The `--no-sandbox` argument is what makes QQ's `loadNapCat.js` entry load
   * NapCat instead of the original client. `-n` forces a new instance when a
   * plain QQ client is already running. A timeout is not a hard failure: the
   * user can scan the QR code, so `ok` stays true with `loggedIn:false`.
   *
   * @param {{ timeoutMs?: number }} [options]
   * @returns {Promise<{ ok: boolean, loggedIn?: boolean, qq?: string|null, nickname?: string|null, timedOut?: boolean, message: string, error?: string }>}
   */
  async start(options = {}) {
    const requestedTimeout = Number(options?.timeoutMs)
    const timeoutMs = Number.isFinite(requestedTimeout) && requestedTimeout > 0 ? requestedTimeout : START_TIMEOUT_MS
    try {
      if (process.platform !== 'darwin') return failure('unsupported-platform', 'NapCat 仅支持 macOS')
      const qq = this.#detectQq()
      if (qq.installed !== true) return failure('qq-not-installed', '未找到 QQ.app，请先安装 QQ')
      const appPath = typeof qq.path === 'string' && qq.path !== '' ? qq.path : QQ_APP_PATH

      // Already up (logged in or waiting for a QR scan): never launch a second
      // instance, just report the current state.
      const probeBefore = await this.loginStatus()
      if (probeBefore.loggedIn === true) {
        return {
          ok: true,
          alreadyRunning: true,
          loggedIn: true,
          qq: probeBefore.qq,
          nickname: probeBefore.nickname,
          message: `NapCat 已在运行${probeBefore.qq ? `（QQ ${probeBefore.qq}）` : ''}`,
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
          message: 'NapCat 已在运行，请在 QQ 窗口中完成扫码登录',
        }
      }

      const running = this.#processInfo()
      const args = running.running === true
        ? ['-n', '-a', appPath, '--args', '--no-sandbox']
        : ['-a', appPath, '--args', '--no-sandbox']
      const opened = await this.run('/usr/bin/open', args, { timeoutMs: 20_000 })
      if (opened.code !== 0) {
        const detail = runDetail(opened)
        return failure('open-failed', `启动 QQ 失败${detail === '' ? '' : `：${detail}`}`)
      }
      const deadline = this.now() + timeoutMs
      let probe = await this.loginStatus()
      while (probe.loggedIn !== true && this.now() < deadline) {
        await this.sleep(POLL_INTERVAL_MS)
        probe = await this.loginStatus()
      }
      if (probe.loggedIn === true) {
        this.logger.info('NapCat 已启动并登录 QQ %s', probe.qq ?? '')
        return {
          ok: true,
          loggedIn: true,
          qq: probe.qq,
          nickname: probe.nickname,
          message: `NapCat 已启动${probe.qq ? `（QQ ${probe.qq}）` : ''}`,
        }
      }
      this.logger.warn('QQ 已启动，%dms 内未检测到登录，等待用户扫码', timeoutMs)
      return {
        ok: true,
        loggedIn: false,
        timedOut: true,
        qq: null,
        nickname: null,
        message: 'NapCat 已启动，请在 QQ 窗口中完成扫码登录',
      }
    } catch (error) {
      return failure('start-failed', `启动 NapCat 失败：${String(error?.message ?? error)}`)
    }
  }

  /**
   * Stop the QQ process: SIGTERM first, then SIGKILL after the grace period.
   * `findProcess` is used instead of a broad `pkill` match.
   *
   * @param {{ timeoutMs?: number }} [options]
   * @returns {Promise<{ ok: boolean, alreadyStopped?: boolean, forced?: boolean, pid?: number, message: string, error?: string }>}
   */
  async stop(options = {}) {
    const requestedTimeout = Number(options?.timeoutMs)
    const timeoutMs = Number.isFinite(requestedTimeout) && requestedTimeout > 0 ? requestedTimeout : STOP_TIMEOUT_MS
    try {
      if (process.platform !== 'darwin') return failure('unsupported-platform', 'NapCat 仅支持 macOS')
      const initial = this.#processInfo()
      if (initial.running !== true) {
        return { ok: true, alreadyStopped: true, message: 'NapCat 未在运行' }
      }
      const pid = initial.pid
      if (!Number.isInteger(pid)) return failure('pid-not-found', '未能获取 NapCat 进程号')

      const termError = this.#kill(pid, 'SIGTERM')
      if (termError !== null && termError.code !== 'ESRCH') {
        return failure('kill-failed', `无法结束 NapCat 进程：${String(termError.message ?? termError)}`)
      }
      if (termError !== null || await this.#waitForExit(pid, timeoutMs)) {
        this.logger.info('NapCat 已停止 (pid %d)', pid)
        return { ok: true, pid, message: 'NapCat 已停止' }
      }

      this.logger.warn('NapCat 未在 %dms 内退出，发送 SIGKILL (pid %d)', timeoutMs, pid)
      const killError = this.#kill(pid, 'SIGKILL')
      if (killError !== null && killError?.code !== 'ESRCH') {
        return failure('kill-failed', `无法强制结束 NapCat 进程：${String(killError?.message ?? killError)}`)
      }
      if (killError === null && await this.#waitForExit(pid, SIGKILL_GRACE_MS)) {
        this.logger.info('NapCat 已强制停止 (pid %d)', pid)
        return { ok: true, pid, forced: true, message: 'NapCat 已强制停止' }
      }
      return failure('kill-failed', 'NapCat 进程未能在超时内退出')
    } catch (error) {
      return failure('stop-failed', `停止 NapCat 失败：${String(error?.message ?? error)}`)
    }
  }

  /**
   * Read the QQ login state through the NapCat WebUI API. The credential is
   * cached (10 minutes) so polling is cheap.
   *
   * @returns {Promise<{ loggedIn: boolean, qq: string|null, nickname: string|null }>}
   */
  async loginStatus() {
    try {
      const probe = await this.#loginProbe()
      return { loggedIn: probe.loggedIn, qq: probe.qq, nickname: probe.nickname }
    } catch (error) {
      this.logger.warn('NapCat 登录状态读取失败: %s', String(error?.message ?? error))
      return { loggedIn: false, qq: null, nickname: null }
    }
  }

  /**
   * Login state for the panel: QR phase, cached QR image availability and the
   * logged-in account. Never throws.
   *
   * @returns {Promise<{ reachable: boolean, loggedIn: boolean, qq: string|null, nickname: string|null, phase: string|null, qrUrl: string|null, coreReady: boolean, webuiPort: number, qrAvailable: boolean }>}
   */
  async loginState() {
    try {
      const probe = await this.#loginProbe()
      return {
        reachable: probe.reachable === true,
        loggedIn: probe.loggedIn === true,
        qq: probe.qq,
        nickname: probe.nickname,
        phase: probe.phase ?? null,
        qrUrl: probe.qrUrl ?? null,
        coreReady: probe.coreReady === true,
        webuiPort: probe.port,
        qrAvailable: this.fs.existsSync(this.qrImagePath()),
      }
    } catch (error) {
      this.logger.warn('NapCat 登录状态读取失败: %s', String(error?.message ?? error))
      return {
        reachable: false,
        loggedIn: false,
        qq: null,
        nickname: null,
        phase: null,
        qrUrl: null,
        coreReady: false,
        webuiPort: this.settings.napcatPort,
        qrAvailable: false,
      }
    }
  }

  /**
   * Ask NapCat's WebUI to refresh the login QR code.
   *
   * @returns {Promise<{ ok: boolean, qrUrl?: string|null, message?: string, error?: string }>}
   */
  async refreshQr() {
    if (process.platform !== 'darwin') return failure('unsupported-platform', 'NapCat 仅支持 macOS')
    try {
      const detected = this.#detect()
      const webui = await this.#webuiInfo(detected)
      if (webui === null) return failure('webui-unavailable', 'NapCat WebUI 不可达，请先启动 NapCat')
      const credential = await this.#credential(webui)
      if (credential === null) return failure('auth-failed', 'NapCat WebUI 认证失败')
      const response = await this.http(`${webui.baseUrl}/api/QQLogin/RefreshQRcode`, {
        method: 'POST',
        headers: { authorization: `Bearer ${credential}`, 'content-type': 'application/json' },
        body: {},
        timeoutMs: 10_000,
      })
      if (response?.ok !== true) {
        if (response?.status === 401 || response?.status === 403) this.auth = null
        return failure('refresh-failed', `刷新二维码失败：HTTP ${response?.status ?? 0}`)
      }
      const payload = unwrapData(response.data)
      const qrUrl = typeof payload?.qrcodeurl === 'string' && payload.qrcodeurl !== '' ? payload.qrcodeurl : null
      this.logger.info('NapCat 登录二维码已刷新')
      return { ok: true, qrUrl, message: '二维码已刷新' }
    } catch (error) {
      return failure('refresh-failed', `刷新二维码失败：${String(error?.message ?? error)}`)
    }
  }

  /**
   * Path of NapCat's cached login QR image (`.../NapCat/cache/qrcode.png`).
   * The panel serves this file instead of asking the user to switch windows.
   *
   * @returns {string}
   */
  qrImagePath() {
    const detected = this.#detect()
    const configDir = typeof detected?.configDir === 'string' ? detected.configDir : ''
    if (configDir !== '') return join(dirname(configDir), 'cache', 'qrcode.png')
    return expandHome('~/Library/Containers/com.tencent.qq/Data/Library/Application Support/QQ/NapCat/cache/qrcode.png')
  }

  // ------------------------------------------------------------- internals --

  /** `ws://127.0.0.1:<koishiPort><reversePath>` expected by Koishi. */
  #websocketUrl() {
    return `ws://127.0.0.1:${this.settings.koishiPort}${this.settings.reversePath}`
  }

  /** Safe wrapper around the injected platform detector. */
  #detect() {
    try {
      const detected = this.platform.detectNapcat(this.settings)
      return isPlainObject(detected) ? detected : {}
    } catch (error) {
      this.logger.warn('NapCat 检测失败: %s', String(error?.message ?? error))
      return {}
    }
  }

  /** Safe wrapper around the injected QQ detector. */
  #detectQq() {
    try {
      const qq = this.platform.detectQq()
      return isPlainObject(qq) ? qq : { installed: false, path: null, version: null }
    } catch {
      return { installed: false, path: null, version: null }
    }
  }

  /** Safe wrapper around the injected process finder. */
  #processInfo() {
    try {
      const found = this.platform.findProcess(QQ_EXECUTABLE)
      return isPlainObject(found) ? found : { running: false, pid: null }
    } catch {
      return { running: false, pid: null }
    }
  }

  /**
   * Per-account config summary for `status()`.
   * @param {Record<string, any>} detected
   */
  async #accountStatuses(detected) {
    const configDir = typeof detected.configDir === 'string' && detected.configDir !== '' ? detected.configDir : null
    const expectedUrl = this.#websocketUrl()
    const rawAccounts = Array.isArray(detected.accounts) ? detected.accounts : []
    /** @type {Array<{ uin: string, configPath: string, wsClients: Array<{name:string,url:string,enable:boolean}>, applied: boolean }>} */
    const accounts = []
    for (const account of rawAccounts) {
      if (!isPlainObject(account) || typeof account.uin !== 'string' || account.uin === '') continue
      const configPath = typeof account.configPath === 'string' && account.configPath !== ''
        ? account.configPath
        : (configDir === null ? '' : join(configDir, `onebot11_${account.uin}.json`))
      if (configPath === '') continue
      const config = await this.#safeReadJson(configPath)
      const wsClients = listWebsocketClients(config)
      const applied = wsClients.some((client) => client.name === WS_CLIENT_NAME && client.url === expectedUrl)
      accounts.push({ uin: account.uin, configPath, wsClients, applied })
    }
    return accounts
  }

  /**
   * Resolve `webui.json` for API calls. Returns null when no token is found.
   * @param {Record<string, any>} [detected]
   * @returns {Promise<{ port: number, token: string, baseUrl: string }|null>}
   */
  async #webuiInfo(detected = undefined) {
    const info = isPlainObject(detected) ? detected : this.#detect()
    const configDir = typeof info.configDir === 'string' && info.configDir !== '' ? info.configDir : null
    const candidates = configDir === null
      ? []
      : [join(configDir, 'webui.json'), join(dirname(configDir), 'webui.json')]
    for (const candidate of candidates) {
      const data = await this.#safeReadJson(candidate)
      if (isPlainObject(data) && typeof data.token === 'string' && data.token !== '') {
        return this.#makeWebui(data, data.port)
      }
    }
    const webui = info.webui
    if (isPlainObject(webui) && typeof webui.token === 'string' && webui.token !== '') {
      return this.#makeWebui(webui, webui.port)
    }
    return null
  }

  /**
   * Normalize a webui descriptor.
   * @param {Record<string, any>} source
   * @param {unknown} portCandidate
   * @returns {{ port: number, token: string, baseUrl: string }}
   */
  #makeWebui(source, portCandidate) {
    const port = Number.isInteger(portCandidate) ? portCandidate : this.settings.napcatPort
    return { port, token: source.token, baseUrl: `http://127.0.0.1:${port}` }
  }

  /**
   * Log in to the WebUI and return a cached credential (or null on failure).
   * @param {{ port: number, token: string, baseUrl: string }} webui
   * @returns {Promise<string|null>}
   */
  async #credential(webui) {
    const now = this.now()
    const tokenHash = sha256Hex(webui.token)
    if (
      this.auth !== null
      && this.auth.port === webui.port
      && this.auth.tokenHash === tokenHash
      && this.auth.expiresAt > now
    ) {
      return this.auth.credential
    }
    const response = await this.http(`${webui.baseUrl}/api/auth/login`, {
      method: 'POST',
      body: { hash: sha256Hex(`${webui.token}.napcat`) },
      timeoutMs: 3000,
    })
    if (response?.ok !== true) {
      // status 0 means the connection failed; any HTTP status means the API is up.
      this.webuiReachable = Number(response?.status) > 0
      return null
    }
    this.webuiReachable = true
    const payload = unwrapData(response.data)
    const credential = typeof payload?.Credential === 'string'
      ? payload.Credential
      : (typeof payload?.credential === 'string' ? payload.credential : null)
    if (credential === null || credential === '') return null
    this.auth = { credential, port: webui.port, tokenHash, expiresAt: now + CREDENTIAL_TTL_MS }
    return credential
  }

  /**
   * Probe NapCat login state; also reports whether the WebUI answered.
   * @param {Record<string, any>} [detected]
   * @returns {Promise<{ loggedIn: boolean, qq: string|null, nickname: string|null, reachable: boolean, port: number, tokenMasked: string|null, phase: string|null, qrUrl: string|null, coreReady: boolean }>}
   */
  async #loginProbe(detected = undefined) {
    const info = isPlainObject(detected) ? detected : this.#detect()
    const webui = await this.#webuiInfo(info)
    /** @type {{ loggedIn: boolean, qq: string|null, nickname: string|null, reachable: boolean, port: number, tokenMasked: string|null, phase: string|null, qrUrl: string|null, coreReady: boolean }} */
    const fallback = {
      loggedIn: false,
      qq: null,
      nickname: null,
      reachable: false,
      port: Number.isInteger(info?.webui?.port) ? info.webui.port : this.settings.napcatPort,
      tokenMasked: null,
      phase: null,
      qrUrl: null,
      coreReady: false,
    }
    if (webui === null) return fallback
    fallback.port = webui.port
    fallback.tokenMasked = maskToken(webui.token)
    try {
      const credential = await this.#credential(webui)
      if (credential === null) return { ...fallback, reachable: this.webuiReachable }
      const headers = { authorization: `Bearer ${credential}` }
      const check = await this.http(`${webui.baseUrl}/api/QQLogin/CheckLoginStatus`, {
        method: 'POST',
        headers,
        body: {},
        timeoutMs: 2500,
      })
      if (check?.ok !== true) {
        if (check?.status === 401 || check?.status === 403) this.auth = null
        const reachable = Number(check?.status) > 0
        this.webuiReachable = reachable
        return { ...fallback, reachable }
      }
      this.webuiReachable = true
      const checkPayload = unwrapData(check.data)
      const loggedIn = toBoolean(checkPayload?.isLogin ?? checkPayload?.loggedIn)
      const extra = {
        phase: typeof checkPayload?.loginPhase === 'string' ? checkPayload.loginPhase : null,
        qrUrl: typeof checkPayload?.qrcodeurl === 'string' ? checkPayload.qrcodeurl : null,
        coreReady: checkPayload?.coreReady === true,
      }
      if (!loggedIn) return { ...fallback, reachable: true, ...extra }
      let qq = null
      let nickname = null
      const infoResponse = await this.http(`${webui.baseUrl}/api/QQLogin/GetQQLoginInfo`, {
        method: 'POST',
        headers,
        body: {},
        timeoutMs: 2500,
      })
      if (infoResponse?.ok === true) {
        const loginInfo = unwrapData(infoResponse.data)
        qq = firstString(loginInfo, ['uin', 'user_id', 'userId', 'uid', 'qq'])
        nickname = firstString(loginInfo, ['nick', 'nickname', 'nickName', 'name'])
      }
      return { loggedIn: true, qq, nickname, reachable: true, port: webui.port, tokenMasked: maskToken(webui.token), ...extra }
    } catch (error) {
      this.logger.warn('NapCat WebUI 探测失败: %s', String(error?.message ?? error))
      return fallback
    }
  }

  /**
   * Hot-apply one account config through the WebUI `SetConfig` API.
   * @param {{ port: number, token: string, baseUrl: string }} webui
   * @param {Record<string, any>} config
   * @param {string} configPath only used for log context
   * @returns {Promise<boolean>}
   */
  async #hotApply(webui, config, configPath) {
    try {
      const credential = await this.#credential(webui)
      if (credential === null) return false
      const response = await this.http(`${webui.baseUrl}/api/OB11Config/SetConfig`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${credential}`,
          'content-type': 'application/json',
        },
        body: { config: JSON.stringify(config) },
        timeoutMs: 10_000,
      })
      if (response?.ok !== true) {
        if (response?.status === 401 || response?.status === 403) this.auth = null
        this.logger.warn('NapCat WebUI 热应用失败 (%s): HTTP %s', configPath, response?.status ?? 0)
        return false
      }
      if (isPlainObject(response.data)) {
        if (typeof response.data.code === 'number' && response.data.code !== 0) return false
        if (response.data.ok === false) return false
      }
      return true
    } catch (error) {
      this.logger.warn('NapCat WebUI 热应用异常 (%s): %s', configPath, String(error?.message ?? error))
      return false
    }
  }

  /**
   * Select the accounts to configure.
   * @param {Record<string, any>} detected
   * @param {string} configDir
   * @param {string} uin empty for all accounts
   * @returns {Promise<{ ok: true, accounts: Array<{ uin: string, configPath: string }> } | { ok: false, error: string, message: string }>}
   */
  async #resolveAccounts(detected, configDir, uin) {
    const rawAccounts = Array.isArray(detected.accounts) ? detected.accounts : []
    const accounts = []
    for (const account of rawAccounts) {
      if (!isPlainObject(account) || typeof account.uin !== 'string' || account.uin === '') continue
      const configPath = typeof account.configPath === 'string' && account.configPath !== ''
        ? account.configPath
        : join(configDir, `onebot11_${account.uin}.json`)
      accounts.push({ uin: account.uin, configPath })
    }
    if (uin !== '') {
      const matched = accounts.filter((account) => account.uin === uin)
      if (matched.length > 0) return { ok: true, accounts: matched }
      // The detector may miss a config created moments ago; check the file directly.
      const explicit = join(configDir, `onebot11_${uin}.json`)
      if (await this.#safeReadJson(explicit) !== null) {
        return { ok: true, accounts: [{ uin, configPath: explicit }] }
      }
      return failure('account-not-found', `未找到 QQ 账号 ${uin} 的 NapCat 配置，请先在 NapCat 中登录该账号`)
    }
    if (accounts.length === 0) {
      return failure('no-accounts', '未发现 QQ 账号，请先登录 QQ 并完成 NapCat 安装')
    }
    return { ok: true, accounts }
  }

  /**
   * Download a file to `zipPath` using the injected downloader/fetch.
   * @param {string} url
   * @param {string} zipPath
   * @returns {Promise<{ ok: boolean, error?: string }>}
   */
  async #downloadFile(url, zipPath) {
    try {
      if (this.download !== null) {
        await this.download(url, zipPath)
        return { ok: true }
      }
      if (this.fetch === null) return { ok: false, error: '当前环境没有可用的 fetch' }
      const hasSignalTimeout = typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
      const response = await this.fetch(url, {
        headers: { 'user-agent': GITHUB_HEADERS['user-agent'] },
        signal: hasSignalTimeout ? AbortSignal.timeout(120_000) : undefined,
      })
      if (response?.ok !== true) return { ok: false, error: `HTTP ${response?.status ?? 0}` }
      const buffer = Buffer.from(await response.arrayBuffer())
      await this.fs.writeFile(zipPath, buffer)
      return { ok: true }
    } catch (error) {
      return { ok: false, error: String(error?.message ?? error) }
    }
  }

  /**
   * Extract the installer zip with `ditto`, falling back to `unzip`.
   * @param {string} zipPath
   * @param {string} extractDir
   * @returns {Promise<string|null>} error message, or null on success
   */
  async #extractZip(zipPath, extractDir) {
    const ditto = await this.run('/usr/bin/ditto', ['-x', '-k', zipPath, extractDir], { timeoutMs: 120_000 })
    if (ditto.code === 0) return null
    const unzip = await this.run('/usr/bin/unzip', ['-o', zipPath, '-d', extractDir], { timeoutMs: 120_000 })
    if (unzip.code === 0) return null
    const detail = runDetail(unzip) || runDetail(ditto)
    return `解压 NapCat 安装器失败${detail === '' ? '' : `：${detail}`}`
  }

  /**
   * Find `NapCatInstaller.app` inside the extracted directory.
   * @param {string} extractDir
   * @returns {Promise<string|null>}
   */
  async #findInstallerApp(extractDir) {
    const direct = join(extractDir, 'NapCatInstaller.app')
    if (this.fs.existsSync(direct)) return direct
    const entries = await this.fs.readdir(extractDir)
    const list = Array.isArray(entries) ? entries : []
    for (const entry of list) {
      if (typeof entry !== 'string' || entry === '') continue
      const app = join(extractDir, entry, 'NapCatInstaller.app')
      if (this.fs.existsSync(app)) return app
    }
    for (const entry of list) {
      if (typeof entry === 'string' && entry.endsWith('.app')) {
        const app = join(extractDir, entry)
        if (this.fs.existsSync(app)) return app
      }
    }
    return null
  }

  /** Downloaded-installer summary for `status()`. */
  async #installerInfo() {
    /** @type {{ downloaded: boolean, appPath: string|null, version: string|null }} */
    const empty = { downloaded: false, appPath: null, version: null }
    try {
      if (this.lastInstaller !== null && this.fs.existsSync(this.lastInstaller.appPath)) {
        return { downloaded: true, appPath: this.lastInstaller.appPath, version: this.lastInstaller.version }
      }
      const installerDir = expandHome(this.settings.installerDir)
      if (!this.fs.existsSync(installerDir)) return empty
      const entries = await this.fs.readdir(installerDir)
      for (const entry of Array.isArray(entries) ? entries : []) {
        if (typeof entry !== 'string' || entry === '') continue
        const candidates = [
          join(installerDir, entry, 'extracted', 'NapCatInstaller.app'),
          join(installerDir, entry, 'NapCatInstaller.app'),
        ]
        for (const candidate of candidates) {
          if (this.fs.existsSync(candidate)) return { downloaded: true, appPath: candidate, version: entry }
        }
      }
      return empty
    } catch {
      return empty
    }
  }

  /**
   * Poll until the QQ process disappears (or the timeout elapses).
   * @param {number} pid
   * @param {number} timeoutMs
   * @returns {Promise<boolean>}
   */
  async #waitForExit(pid, timeoutMs) {
    const deadline = this.now() + timeoutMs
    while (this.now() < deadline) {
      const info = this.#processInfo()
      if (info.running !== true) return true
      if (Number.isInteger(info.pid) && info.pid !== pid) return true
      await this.sleep(POLL_INTERVAL_MS)
    }
    const finalInfo = this.#processInfo()
    return finalInfo.running !== true || (Number.isInteger(finalInfo.pid) && finalInfo.pid !== pid)
  }

  /**
   * Send a signal to a pid without throwing.
   * @param {number} pid
   * @param {NodeJS.Signals} signal
   * @returns {Error|null}
   */
  #kill(pid, signal) {
    try {
      this.processKill(pid, signal)
      return null
    } catch (error) {
      return error instanceof Error ? error : new Error(String(error))
    }
  }

  /**
   * Read a JSON object, returning null for missing/unparsable files.
   * @param {string} path
   * @returns {Promise<Record<string, any>|null>}
   */
  async #safeReadJson(path) {
    try {
      const value = await this.fs.readJson(path, null)
      return isPlainObject(value) ? value : null
    } catch {
      return null
    }
  }
}
