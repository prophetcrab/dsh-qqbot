/**
 * NapCat manager: detect, install, configure and control the macOS / Windows
 * QQ client that NapCat patches.
 *
 * The module deliberately keeps every side effect behind a small injectable
 * dependency seam (`run`, `http`, `fs`, `platform`, `sleep`, `processKill`,
 * `now`, `download`, `fetch`) so the unit tests never touch the real QQ
 * process, the real NapCat configuration or the network.
 *
 * Platform differences (macOS vs Windows) are resolved through
 * `lib/platform.js` (`hostPlatform`, `detectQq`, `detectNapcat`, `findProcess`,
 * `killPid`, `napcatQrPath`) which keeps the manager free of direct
 * `process.platform` checks.
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
  hostPlatform,
  killPid,
  napcatQrPath,
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
import {
  defaultVendorDir,
  extractZip,
  installMacOffline,
  installWindowsOffline,
  readManifest,
  verifyArchive,
} from './offline.js'

/** Latest NapCat macOS installer release (GitHub API requires a User-Agent). */
const GITHUB_MAC_INSTALLER_RELEASE = 'https://api.github.com/repos/NapNeko/NapCat-Mac-Installer/releases/latest'

/** Latest NapCatQQ release: contains the Windows OneKey installer zip. */
const GITHUB_WINDOWS_RELEASE = 'https://api.github.com/repos/NapNeko/NapCatQQ/releases/latest'

/** Headers the GitHub API requires. */
const GITHUB_HEADERS = Object.freeze({
  'user-agent': 'dsh-qqbot',
  accept: 'application/vnd.github+json',
})

/** QQ executable matched by `ps` when looking for the running macOS client. */
const QQ_EXECUTABLE = `${QQ_APP_PATH}/Contents/MacOS/QQ`

/** Asset/file names for the two supported installer flavours. */
const MAC_INSTALLER_ZIP = 'NapCatInstaller.zip'
const MAC_INSTALLER_APP = 'NapCatInstaller.app'
const WINDOWS_INSTALLER_ZIP = 'NapCat.Shell.Windows.OneKey.zip'
const WINDOWS_INSTALLER_EXE = 'NapCatInstaller.exe'

/** Windows launcher scripts, in priority order (NapCat detection uses these too). */
const WINDOWS_LAUNCHERS = ['napcat.bat', 'launcher-win10.bat', 'launcher.bat']

/** Stable user-facing messages for unsupported hosts. */
const UNSUPPORTED_INSTALL = '当前平台暂不支持 NapCat 自动安装'
const UNSUPPORTED_CONTROL = '当前平台暂不支持 NapCat 启动/停止'
const UNSUPPORTED_CONFIGURE = '当前平台暂不支持 NapCat 配置'
const UNSUPPORTED_STATUS = '当前平台暂不支持 NapCat（仅支持 macOS / Windows）'

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

/** Default platform seam; read-only helpers from lib/platform.js. */
const defaultPlatform = { detectNapcat, detectQq, findProcess, hostPlatform, killPid, napcatQrPath }

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

/**
 * Whether NapCat actions are supported on a normalized platform id.
 * @param {string} platform `macos` | `windows` | `linux` | `other`
 * @returns {boolean}
 */
function isSupportedPlatform(platform) {
  return platform === 'macos' || platform === 'windows'
}

/**
 * Quote a literal for a PowerShell single-quoted string.
 * @param {string} value
 * @returns {string}
 */
function powershellQuote(value) {
  return `'${String(value).replace(/'/gu, "''")}'`
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
   *   platform?: {
   *     detectNapcat?: Function,
   *     detectQq?: Function,
   *     findProcess?: Function,
   *     hostPlatform?: Function,
   *     killPid?: Function,
   *     napcatQrPath?: Function,
   *   },
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
    /** @type {{ zipPath: string, appPath: string, version: string, installDir?: string }|null} */
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
      if (!isSupportedPlatform(this.#platformId())) {
        status.error = UNSUPPORTED_STATUS
        return status
      }
      const detected = this.#detect()
      status.installed = detected.installed === true
      status.installDir = typeof detected.installDir === 'string' ? detected.installDir : null
      status.configDir = typeof detected.configDir === 'string' ? detected.configDir : null
      status.version = typeof detected.version === 'string' ? detected.version : null

      const processInfo = this.#processInfo()
      const probe = await this.#loginProbe(detected)
      status.running = processInfo.running === true || probe.reachable === true
      status.pid = Number.isInteger(processInfo.pid) ? processInfo.pid : null
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
      const installer = await this.#installerInfo()
      status.installer = {
        downloaded: installer.downloaded,
        appPath: installer.appPath,
        version: installer.version,
      }
    } catch (error) {
      status.error = String(error?.message ?? error)
      this.logger.warn('NapCat 状态检测失败: %s', status.error)
    }
    return status
  }

  /**
   * Download the official NapCat installer for the current platform and open
   * it (GUI part stays manual: authorisation and QQ login are performed by the
   * user).
   *
   * - macOS: open `NapCatInstaller.app` from NapNeko/NapCat-Mac-Installer.
   * - Windows: `cmd /c start "" NapCatInstaller.exe` from the NapCatQQ OneKey zip.
   *
   * @returns {Promise<{ ok: boolean, appPath?: string, version?: string, zipPath?: string, message?: string, error?: string }>}
   */
  async install() {
    const platform = this.#platformId()
    if (!isSupportedPlatform(platform)) return failure('unsupported-platform', UNSUPPORTED_INSTALL)
    const downloaded = await this.downloadInstaller()
    if (downloaded.ok !== true) {
      return {
        ok: false,
        error: downloaded.error ?? 'install-failed',
        message: downloaded.message ?? '下载 NapCat 安装器失败',
      }
    }
    if (downloaded.offline === true) {
      if (typeof downloaded.appPath === 'string' && downloaded.appPath !== '') {
        const opened = await this.run('/usr/bin/open', [downloaded.appPath], { timeoutMs: 20_000 })
        if (opened.code !== 0) {
          return failure('open-failed', `无法打开离线 NapCat 安装器：${runDetail(opened)}`)
        }
        return {
          ok: true,
          offline: true,
          appPath: downloaded.appPath,
          version: downloaded.version,
          message: '已打开离线安装器，请按提示授权并完成安装',
        }
      }
      const configured = await this.#autoConfigure()
      return {
        ok: true,
        offline: true,
        installDir: downloaded.installDir,
        version: downloaded.version,
        zipPath: downloaded.zipPath,
        configured,
        message: configured
          ? 'NapCat 已离线安装并写入 OneBot 配置，请启动并扫码登录'
          : 'NapCat 已离线安装，登录 QQ 后将自动写入 OneBot 配置',
      }
    }
    try {
      if (platform === 'windows') {
        const launchError = await this.#launchWindowsInstaller(downloaded.appPath)
        if (launchError !== null) {
          return {
            ok: false,
            error: 'open-failed',
            appPath: downloaded.appPath,
            version: downloaded.version,
            message: `无法启动 NapCat 安装器${launchError === '' ? '' : `：${launchError}`}`,
          }
        }
        this.logger.info('NapCat Windows 安装器已启动: %s (v%s)', downloaded.appPath, downloaded.version)
        return {
          ok: true,
          appPath: downloaded.appPath,
          version: downloaded.version,
          zipPath: downloaded.zipPath,
          message: '安装器已启动，请按提示完成安装',
        }
      }
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
      return failure('open-failed', `打开 NapCat 安装器失败：${String(error?.message ?? error)}`)
    }
  }

  /**
   * Download the latest NapCat installer for the current platform into
   * `settings.installerDir` and extract it. An already downloaded installer is
   * reused so plugin restarts do not re-download. When `deps.download` is
   * injected the download step is replaced (tests never hit the network).
   *
   * - macOS: NapNeko/NapCat-Mac-Installer `NapCatInstaller_*.zip` → ditto.
   * - Windows: NapNeko/NapCatQQ `NapCat.Shell.Windows.OneKey.zip` → tar/Expand-Archive.
   *
   * @returns {Promise<{ ok: boolean, zipPath?: string, appPath?: string, version?: string, error?: string, message?: string }>}
   */
  async downloadInstaller() {
    const platform = this.#platformId()
    if (!isSupportedPlatform(platform)) return failure('unsupported-platform', UNSUPPORTED_INSTALL)
    const offline = await this.#offlineInstaller(platform)
    if (offline !== null) return offline
    try {
      const cached = await this.#installerInfo()
      if (cached.downloaded === true && typeof cached.appPath === 'string') {
        this.lastInstaller = {
          zipPath: cached.zipPath ?? this.#installerZipPath(cached.version, platform),
          appPath: cached.appPath,
          version: String(cached.version ?? 'latest'),
        }
        return { ok: true, ...this.lastInstaller }
      }
      const latest = await this.#fetchLatestRelease(platform)
      if (latest.ok !== true) {
        return failure('github-api-failed', `获取 NapCat 安装器发布信息失败：${latest.reason}`)
      }
      const release = latest.release
      if (!isPlainObject(release)) {
        return failure('github-api-failed', '获取 NapCat 安装器发布信息失败：返回内容无效')
      }
      const assets = Array.isArray(release.assets)
        ? release.assets.filter((asset) => isPlainObject(asset) && typeof asset.browser_download_url === 'string' && asset.browser_download_url !== '')
        : []
      const asset = platform === 'windows'
        ? assets.find((item) => /NapCat\.Shell\.Windows\.OneKey\.zip/iu.test(String(item.name ?? '')))
        : (assets.find((item) => /^NapCatInstaller_.*\.zip$/iu.test(String(item.name ?? '')))
          ?? assets.find((item) => /\.zip$/iu.test(String(item.name ?? ''))))
      if (asset === undefined) {
        return failure(
          'installer-asset-missing',
          platform === 'windows'
            ? '发布中未找到 NapCat.Shell.Windows.OneKey.zip'
            : '发布中未找到 NapCatInstaller 压缩包',
        )
      }
      const version = String(release.tag_name ?? release.name ?? 'latest').replace(/^v/iu, '')
      const zipPath = this.#installerZipPath(version, platform)
      const extractDir = join(expandHome(this.settings.installerDir), version, 'extracted')
      await this.fs.ensureDir(extractDir)

      const downloaded = await this.#downloadFile(asset.browser_download_url, zipPath, platform)
      if (downloaded.ok !== true) {
        return failure('download-failed', `下载 NapCat 安装器失败：${downloaded.error ?? '未知错误'}`)
      }
      const extractError = await this.#extractZip(zipPath, extractDir, platform)
      if (extractError !== null) return failure('extract-failed', extractError)
      const appPath = platform === 'windows'
        ? await this.#findInstallerExe(extractDir)
        : await this.#findInstallerApp(extractDir)
      if (appPath === null) {
        return failure(
          'installer-app-missing',
          platform === 'windows' ? '解压后未找到 NapCatInstaller.exe' : '解压后未找到 NapCatInstaller.app',
        )
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
      if (!isSupportedPlatform(this.#platformId())) return failure('unsupported-platform', UNSUPPORTED_CONFIGURE)
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
   * Launch NapCat and wait until it reports a logged-in QQ account.
   *
   * - macOS: `open -n -a QQ.app --args --no-sandbox`.
   * - Windows: `cmd /c start "" napcat.bat` in the detected NapCat dir
   *   (falling back to `QQ.exe --no-sandbox`).
   *
   * The `--no-sandbox` argument is what makes QQ's `loadNapCat.js` entry load
   * NapCat instead of the original client. A timeout is not a hard failure: the
   * user can scan the QR code, so `ok` stays true with `loggedIn:false`.
   *
   * @param {{ timeoutMs?: number }} [options]
   * @returns {Promise<{ ok: boolean, loggedIn?: boolean, qq?: string|null, nickname?: string|null, timedOut?: boolean, message: string, error?: string }>}
   */
  async start(options = {}) {
    const requestedTimeout = Number(options?.timeoutMs)
    const timeoutMs = Number.isFinite(requestedTimeout) && requestedTimeout > 0 ? requestedTimeout : START_TIMEOUT_MS
    try {
      const platform = this.#platformId()
      if (!isSupportedPlatform(platform)) return failure('unsupported-platform', UNSUPPORTED_CONTROL)
      const qq = this.#detectQq()

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

      const started = platform === 'windows'
        ? await this.#startWindows(timeoutMs, qq)
        : await this.#startMac(timeoutMs, qq)
      if (started?.ok === true && started.loggedIn === true && await this.#autoConfigure()) {
        started.configured = true
      }
      return started
    } catch (error) {
      return failure('start-failed', `启动 NapCat 失败：${String(error?.message ?? error)}`)
    }
  }

  /**
   * Stop the QQ process.
   *
   * - macOS: SIGTERM first, then SIGKILL after the grace period.
   * - Windows: `taskkill /PID <pid> /T`, then `/F` after the grace period.
   *
   * `findProcess` is used instead of a broad `pkill`/`taskkill /IM` match.
   *
   * @param {{ timeoutMs?: number }} [options]
   * @returns {Promise<{ ok: boolean, alreadyStopped?: boolean, forced?: boolean, pid?: number, message: string, error?: string }>}
   */
  async stop(options = {}) {
    const requestedTimeout = Number(options?.timeoutMs)
    const timeoutMs = Number.isFinite(requestedTimeout) && requestedTimeout > 0 ? requestedTimeout : STOP_TIMEOUT_MS
    try {
      const platform = this.#platformId()
      if (!isSupportedPlatform(platform)) return failure('unsupported-platform', UNSUPPORTED_CONTROL)
      const initial = this.#processInfo()
      if (initial.running !== true) {
        // The helper process may already be gone while the injected QQ chain
        // still serves the WebUI; only report "already stopped" when it is gone.
        const reachable = platform === 'windows' ? await this.#napcatStillReachable() : false
        if (!reachable) {
          return { ok: true, alreadyStopped: true, message: 'NapCat 未在运行' }
        }
      }
      const pid = Number.isInteger(initial.pid) ? initial.pid : null
      if (platform !== 'windows') {
        if (pid === null) return failure('pid-not-found', '未能获取 NapCat 进程号')
        return await this.#stopMac(pid, timeoutMs)
      }
      return await this.#stopWindows(pid, timeoutMs)
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
   * @returns {Promise<{ reachable: boolean, loggedIn: boolean, qq: string|null, nickname: string|null, phase: string|null, qrUrl: string|null, coreReady: boolean, webuiPort: number, qrAvailable: boolean, qrUpdatedAt: string|null }>}
   */
  async loginState() {
    try {
      const probe = await this.#loginProbe()
      const qrPath = this.qrImagePath()
      let qrUpdatedAt = null
      try {
        const stat = await fsp.stat(qrPath)
        qrUpdatedAt = stat.mtime.toISOString()
      } catch {
        qrUpdatedAt = null
      }
      return {
        reachable: probe.reachable === true,
        loggedIn: probe.loggedIn === true,
        qq: probe.qq,
        nickname: probe.nickname,
        phase: probe.phase ?? null,
        qrUrl: probe.qrUrl ?? null,
        coreReady: probe.coreReady === true,
        webuiPort: probe.port,
        qrAvailable: qrUpdatedAt !== null,
        qrUpdatedAt,
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
        qrUpdatedAt: null,
      }
    }
  }

  /**
   * Ask NapCat's WebUI to refresh the login QR code.
   *
   * @returns {Promise<{ ok: boolean, qrUrl?: string|null, message?: string, error?: string }>}
   */
  async refreshQr() {
    if (!isSupportedPlatform(this.#platformId())) return failure('unsupported-platform', UNSUPPORTED_CONFIGURE)
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
   * Path of NapCat's cached login QR image. Delegates to the platform helper
   * `napcatQrPath(detected)`, which points at `<configDir>/../cache/qrcode.png`
   * on both macOS and Windows.
   *
   * @returns {string}
   */
  qrImagePath() {
    const detected = this.#detect()
    try {
      const resolved = this.platform.napcatQrPath(detected)
      if (typeof resolved === 'string' && resolved !== '') return resolved
    } catch (error) {
      this.logger.warn('NapCat 二维码路径解析失败: %s', String(error?.message ?? error))
    }
    const configDir = typeof detected?.configDir === 'string' ? detected.configDir : ''
    if (configDir !== '') return join(dirname(configDir), 'cache', 'qrcode.png')
    return expandHome('~/Library/Containers/com.tencent.qq/Data/Library/Application Support/QQ/NapCat/cache/qrcode.png')
  }

  // ------------------------------------------------------------- internals --

  /**
   * Normalized platform id via the injected platform seam.
   * @returns {'macos'|'windows'|'linux'|'other'}
   */
  #platformId() {
    try {
      const id = this.platform.hostPlatform()
      if (id === 'macos' || id === 'windows' || id === 'linux' || id === 'other') return id
      return 'other'
    } catch {
      return 'other'
    }
  }

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
      const qq = this.platform.detectQq(this.settings)
      return isPlainObject(qq) ? qq : { installed: false, path: null, version: null }
    } catch {
      return { installed: false, path: null, version: null }
    }
  }

  /**
   * Process command-line fragment used to find the running QQ client.
   * On Windows the NapCat launcher helper (`NapCatWinBootMain.exe`) is the
   * process that owns the injected QQ chain, so it is matched first; when it
   * is absent (OneKey/QR restarts) the QQ executable is used as fallback.
   * @returns {string}
   */
  #processPattern() {
    if (this.#platformId() !== 'windows') return QQ_EXECUTABLE
    const detected = this.#detect()
    if (typeof detected.installDir === 'string' && detected.installDir !== '') return detected.installDir
    const qq = this.#detectQq()
    if (qq.installed === true && typeof qq.path === 'string' && qq.path !== '') return qq.path
    return 'QQ.exe'
  }

  /** Safe wrapper around the injected process finder. */
  #processInfo() {
    try {
      const found = this.platform.findProcess(this.#processPattern())
      return isPlainObject(found) ? found : { running: false, pid: null }
    } catch {
      return { running: false, pid: null }
    }
  }

  /**
   * macOS launch path: `open -n -a QQ.app --args --no-sandbox`, then poll login.
   * @param {number} timeoutMs
   * @param {{ installed: boolean, path?: string|null }} qq
   */
  async #startMac(timeoutMs, qq) {
    if (qq.installed !== true) return failure('qq-not-installed', '未找到 QQ.app，请先安装 QQ')
    const appPath = typeof qq.path === 'string' && qq.path !== '' ? qq.path : QQ_APP_PATH
    const running = this.#processInfo()
    const args = running.running === true
      ? ['-n', '-a', appPath, '--args', '--no-sandbox']
      : ['-a', appPath, '--args', '--no-sandbox']
    const opened = await this.run('/usr/bin/open', args, { timeoutMs: 20_000 })
    if (opened.code !== 0) {
      const detail = runDetail(opened)
      return failure('open-failed', `启动 QQ 失败${detail === '' ? '' : `：${detail}`}`)
    }
    return this.#waitForLogin(timeoutMs)
  }

  /**
   * Windows launch path: close any running QQ client, then start NapCat from a
   * launcher script inside the detected install dir (falling back to
   * `QQ.exe --no-sandbox`).
   *
   * NapCat can only hook a freshly started QQ: when the user already has QQ
   * open, the injected instance immediately exits and the launch looks
   * successful while nothing is actually running. QQ must therefore be
   * terminated first (QQ protects its main process, so the kill is forced).
   *
   * @param {number} timeoutMs
   * @param {{ installed: boolean, path?: string|null }} qq
   */
  async #startWindows(timeoutMs, qq) {
    // Check prerequisites before touching a running QQ: a missing install must
    // produce an actionable error instead of killing the user's QQ client.
    if (qq.installed !== true) {
      return failure('qq-not-installed', '未找到 QQ，请先安装 QQ（非标准安装路径请在插件配置里设置 qqPath）')
    }
    const detected = this.#detect()
    const installDir = typeof detected.installDir === 'string' && detected.installDir !== '' ? detected.installDir : null
    if (installDir === null) {
      // OneKey-style installs patch QQ itself, so launching QQ is enough there.
      if ((await this.#qqHasNapcatLoader(qq)) !== true) {
        return failure('napcat-not-installed', '未检测到 NapCat，请先安装 NapCat（非标准安装路径请在插件配置里设置 napcatDir）')
      }
      return this.#launchWindowsQq(timeoutMs, qq)
    }
    const launcher = this.#findWindowsLauncher(installDir)
    if (launcher === null) {
      return failure('launch-failed', `NapCat 安装目录缺少启动脚本（napcat.bat / launcher-win10.bat / launcher.bat）：${installDir}`)
    }
    const loader = await this.#ensureWindowsLoader(installDir, qq)
    // A missing NapCat loader or an unknown QQ layout is not fatal: OneKey-style
    // installs already patch QQ, and older QQ layouts may not need the repair.
    // A write attempt that failed, however, means NapCat will not load.
    if (loader.ok !== true && loader.error !== 'qq-app-dir-not-found' && loader.error !== 'napcat-loader-missing') {
      return failure(
        'loader-missing',
        `无法把 loadNapCat.js 写入 QQ 应用目录${loader.error === undefined ? '' : `（${loader.error}）`}，请以管理员身份重试，或改用 NapCat OneKey 安装器`,
      )
    }
    const closed = await this.#stopRunningQq()
    if (closed.ok !== true) {
      return failure(
        'qq-running',
        `已有 QQ 进程在运行且无法结束${closed.error === undefined ? '' : `：${closed.error}`}，请手动退出 QQ 后再启动 NapCat`,
      )
    }
    if (this.settings.launchHidden !== false) {
      const hidden = await this.#launchWindowsHidden(installDir, launcher)
      if (hidden.ok === true) {
        return this.#verifyWindowsStart(await this.#waitForLogin(timeoutMs))
      }
      this.logger.warn('隐藏启动 NapCat 失败，回退到可见窗口启动：%s', String(hidden.error ?? '未知错误'))
    }
    const launched = await this.run('cmd.exe', ['/c', 'start', '', launcher], { cwd: installDir, timeoutMs: 20_000 })
    if (launched.code !== 0) {
      const detail = runDetail(launched)
      return failure('launch-failed', `启动 NapCat 失败${detail === '' ? '' : `：${detail}`}`)
    }
    return this.#verifyWindowsStart(await this.#waitForLogin(timeoutMs))
  }

  /**
   * Launch NapCat without leaving a console window on the desktop: generate a
   * PowerShell helper that elevates via UAC and starts the launcher with a
   * hidden console window. The helper exits immediately; NapCat keeps running.
   *
   * @param {string} installDir NapCat install directory (helper location)
   * @param {string} launcher launcher script path
   * @returns {Promise<{ ok: boolean, scriptPath?: string, error?: string }>}
   */
  async #launchWindowsHidden(installDir, launcher) {
    const scriptPath = join(installDir, 'launch-napcat-hidden.ps1')
    const lines = [
      "$ErrorActionPreference = 'Stop'",
      `$launcher = ${powershellQuote(launcher)}`,
      "$arguments = @('/c', ('\"' + $launcher + '\"'))",
      "$process = Start-Process -FilePath 'cmd.exe' -ArgumentList $arguments -Verb RunAs -WindowStyle Hidden -PassThru",
      'if (-not $process) { exit 1 }',
      'exit 0',
      '',
    ]
    try {
      await this.fs.writeFile(scriptPath, lines.join('\r\n'))
    } catch (error) {
      return { ok: false, error: String(error?.message ?? error) }
    }
    try {
      const result = await this.run(
        'powershell.exe',
        ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath],
        { cwd: installDir, timeoutMs: 60_000 },
      )
      if (result.code !== 0) {
        return { ok: false, scriptPath, error: runDetail(result) || `powershell exit ${result.code}` }
      }
      return { ok: true, scriptPath }
    } catch (error) {
      return { ok: false, scriptPath, error: String(error?.message ?? error) }
    }
  }

  /**
   * Launch QQ directly for OneKey-style installs where QQ already loads the
   * NapCat entry itself (no NapCat launcher script is needed).
   *
   * @param {number} timeoutMs
   * @param {{ installed: boolean, path?: string|null }} qq
   */
  async #launchWindowsQq(timeoutMs, qq) {
    const exe = typeof qq.path === 'string' && qq.path !== '' ? qq.path : null
    if (exe === null) return failure('qq-not-installed', '未找到 QQ 可执行文件，请先安装 QQ')
    const closed = await this.#stopRunningQq()
    if (closed.ok !== true) {
      return failure(
        'qq-running',
        `已有 QQ 进程在运行且无法结束${closed.error === undefined ? '' : `：${closed.error}`}，请手动退出 QQ 后再启动 NapCat`,
      )
    }
    const launched = await this.run(exe, ['--no-sandbox'], { timeoutMs: 20_000 })
    if (launched.code !== 0) {
      const detail = runDetail(launched)
      return failure('launch-failed', `启动 QQ 失败${detail === '' ? '' : `：${detail}`}`)
    }
    return this.#verifyWindowsStart(await this.#waitForLogin(timeoutMs))
  }

  /**
   * Whether QQ already carries a NapCat loader (OneKey/injected install).
   * @param {{ installed: boolean, path?: string|null }} qq
   * @returns {Promise<boolean>}
   */
  async #qqHasNapcatLoader(qq) {
    const dirs = await this.#windowsAppDirs(qq)
    return dirs.some((dir) => this.fs.existsSync(join(dir, 'loadNapCat.js')))
  }

  /**
   * Turn a "timed out waiting for login" result into a real failure when the
   * QQ process is not alive either: that means the launcher exited without
   * starting NapCat, and the user must not be told to scan a QR code.
   *
   * @param {{ ok: boolean, loggedIn?: boolean, message: string, error?: string, [key: string]: any }} probe
   */
  #verifyWindowsStart(probe) {
    if (probe.loggedIn === true || this.webuiReachable === true) return probe
    const info = this.#processInfo()
    if (info.running === true) return probe
    return failure(
      'launch-failed',
      'NapCat 未能启动：QQ 进程已退出。请确认 QQ 未被占用、NapCat 与 QQ 版本匹配，或查看 NapCat 控制台日志',
    )
  }

  /**
   * Close a running QQ client on Windows so NapCat can attach to a fresh one.
   * Never throws; a failed termination is reported back to `start()`.
   *
   * @param {number} [timeoutMs]
   * @returns {Promise<{ ok: boolean, stopped?: boolean, pid?: number, error?: string }>}
   */
  async #stopRunningQq(timeoutMs = STOP_TIMEOUT_MS) {
    try {
      const qq = this.#detectQq()
      const pattern = qq.installed === true && typeof qq.path === 'string' && qq.path !== '' ? qq.path : 'QQ.exe'
      const info = this.platform.findProcess(pattern)
      if (info?.running !== true || !Number.isInteger(info.pid)) return { ok: true, stopped: false }
      const pid = info.pid
      this.logger.info('检测到 QQ 正在运行，先结束进程 %d 再启动 NapCat', pid)
      const killed = await this.#windowsForceKill(pid)
      if (killed.ok !== true) return { ok: false, error: killed.error ?? 'taskkill 失败' }
      if (await this.#waitForExit(pid, timeoutMs)) return { ok: true, stopped: true, pid }
      return { ok: false, error: 'QQ 进程未能在超时内退出' }
    } catch (error) {
      return { ok: false, error: String(error?.message ?? error) }
    }
  }

  /**
   * Windows Shell injection redirects QQ's Electron entry to
   * `<QQ version>/resources/app/loadNapCat.js`. The bundled launcher normally
   * lets the hook create that file, but on some QQ 9.9.31+ layouts it is never
   * written, so the QQ main process dies with "Cannot find module
   * ...resources\app\loadNapCat.js" before NapCat can start. Copy the loader
   * from the NapCat directory into QQ's application directory first.
   *
   * @param {string} installDir detected NapCat directory
   * @param {{ installed: boolean, path?: string|null }} qq
   * @returns {Promise<{ ok: boolean, copied: boolean, target: string|null, error?: string }>}
   */
  async #ensureWindowsLoader(installDir, qq) {
    const source = join(installDir, 'loadNapCat.js')
    if (!this.fs.existsSync(source)) {
      return { ok: false, copied: false, target: null, error: 'napcat-loader-missing' }
    }
    let loader
    try {
      loader = await fsp.readFile(source, 'utf8')
    } catch (error) {
      return { ok: false, copied: false, target: null, error: String(error?.message ?? error) }
    }
    const appDirs = await this.#windowsAppDirs(qq)
    if (appDirs.length === 0) {
      return { ok: false, copied: false, target: null, error: 'qq-app-dir-not-found' }
    }
    let lastError = null
    let attempted = false
    for (const appDir of appDirs) {
      // Only repair an application directory that actually exists; unknown
      // layouts (no directory) are not an error, the launcher may not need it.
      if (!this.fs.existsSync(appDir)) continue
      attempted = true
      const target = join(appDir, 'loadNapCat.js')
      try {
        const current = await fsp.readFile(target, 'utf8')
        if (current === loader) return { ok: true, copied: false, target }
      } catch {
        // missing or unreadable: (re)write it below
      }
      try {
        await this.fs.writeFile(target, loader)
        this.logger.info('已补齐 QQ 侧的 loadNapCat.js：%s', target)
        return { ok: true, copied: true, target }
      } catch (error) {
        lastError = error
      }
    }
    if (!attempted) {
      return { ok: false, copied: false, target: null, error: 'qq-app-dir-not-found' }
    }
    this.logger.warn('补齐 QQ 侧的 loadNapCat.js 失败，NapCat 可能无法启动：%s', String(lastError?.message ?? lastError))
    return { ok: false, copied: false, target: null, error: String(lastError?.message ?? lastError) }
  }

  /**
   * Candidate QQ application directories that hold the Electron entry
   * (`package.json` / `application.asar`): the versioned layout used by recent
   * QQNT releases plus the legacy `resources/app` layout.
   *
   * @param {{ installed: boolean, path?: string|null }} qq
   * @returns {Promise<string[]>}
   */
  async #windowsAppDirs(qq) {
    const exe = qq?.installed === true && typeof qq.path === 'string' && qq.path !== '' ? qq.path : null
    if (exe === null) return []
    const root = dirname(exe)
    const versionRoot = join(root, 'versions')
    const dirs = []
    const config = await this.#safeReadJson(join(versionRoot, 'config.json'))
    const version = config !== null && typeof config === 'object'
      ? (typeof config.curVersion === 'string' ? config.curVersion : (typeof config.baseVersion === 'string' ? config.baseVersion : null))
      : null
    if (version !== null && version !== '') dirs.push(join(versionRoot, version, 'resources', 'app'))
    const entries = await this.fs.readdir(versionRoot)
    for (const entry of Array.isArray(entries) ? entries : []) {
      if (typeof entry === 'string' && entry !== '') dirs.push(join(versionRoot, entry, 'resources', 'app'))
    }
    dirs.push(join(root, 'resources', 'app'))
    return [...new Set(dirs)]
  }

  /**
   * First existing Windows NapCat launcher script in priority order.
   * @param {string} installDir
   * @returns {string|null}
   */
  #findWindowsLauncher(installDir) {
    for (const name of WINDOWS_LAUNCHERS) {
      const candidate = join(installDir, name)
      try {
        if (this.fs.existsSync(candidate)) return candidate
      } catch {
        // keep looking
      }
    }
    return null
  }

  /**
   * Poll `loginStatus()` until logged in or timed out. Mirrors the historic
   * macOS semantics (a timeout is not a hard failure).
   * @param {number} timeoutMs
   */
  async #waitForLogin(timeoutMs) {
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
  }

  /**
   * macOS stop path: SIGTERM → SIGKILL.
   * @param {number} pid
   * @param {number} timeoutMs
   */
  async #stopMac(pid, timeoutMs) {
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
  }

  /**
   * Windows stop path. `taskkill /T` is tried first, then `/F`. Whatever the
   * first attempt targets (the launcher helper or one QQ process), the whole
   * remaining NapCat chain is force-stopped and the WebUI is probed again so a
   * half-killed chain can no longer be reported as "stopped".
   *
   * @param {number|null} pid process found by `stop()` (may be null)
   * @param {number} timeoutMs
   */
  async #stopWindows(pid, timeoutMs) {
    let target = Number.isInteger(pid) ? pid : this.#windowsQqPid()
    if (target !== null) {
      const graceful = await this.#killPid(target, false)
      const exited = await this.#waitForExit(target, timeoutMs)
      if (graceful.ok === true && exited && (await this.#napcatStillReachable()) !== true) {
        this.logger.info('NapCat 已停止 (pid %d)', target)
        return { ok: true, pid: target, message: 'NapCat 已停止' }
      }
      // `taskkill` without /F cannot close QQ (the client ignores WM_CLOSE and
      // only reports "只能强制终止此进程"), so a failed graceful kill must still
      // escalate — otherwise stop() can never terminate a running QQ.
      if (graceful.ok !== true) {
        this.logger.warn('优雅结束 NapCat 失败 (pid %d): %s', target, String(graceful.error ?? 'taskkill 失败'))
      } else {
        this.logger.warn('NapCat 未在 %dms 内完全退出，强制结束 (pid %d)', timeoutMs, target)
      }
      const forced = await this.#windowsForceKill(target)
      if (forced.ok !== true) {
        return failure('kill-failed', `无法强制结束 NapCat 进程：${forced.error ?? 'taskkill /F 失败'}`)
      }
      await this.#waitForExit(target, SIGKILL_GRACE_MS)
    }
    // Killing the helper (or a single QQ child) can leave the injected QQ chain
    // running; force-stop the rest and confirm the WebUI is actually gone.
    await this.#forceStopWindowsChains()
    const remaining = this.#processInfo()
    if (remaining.running === true && target !== null && remaining.pid === target) {
      return failure('kill-failed', 'NapCat 进程未能在超时内退出')
    }
    if (await this.#napcatStillReachable()) {
      return failure('kill-failed', 'NapCat 仍在运行：WebUI 仍可访问，请手动结束 QQ 后重试')
    }
    this.logger.info('NapCat 已强制停止')
    return { ok: true, pid: target ?? undefined, forced: true, message: 'NapCat 已强制停止' }
  }

  /** QQ process that currently hosts NapCat (first match of the QQ executable). */
  #windowsQqPid() {
    const qq = this.#detectQq()
    const pattern = qq.installed === true && typeof qq.path === 'string' && qq.path !== '' ? qq.path : 'QQ.exe'
    const info = this.platform.findProcess(pattern)
    return info?.running === true && Number.isInteger(info.pid) ? info.pid : null
  }

  /**
   * Force-stop remaining NapCat chains, bounded to a few rounds. Only kills a
   * QQ process while the NapCat WebUI still answers (or the launcher helper is
   * present), so an unrelated desktop QQ is left untouched once NapCat is down.
   */
  async #forceStopWindowsChains(rounds = 4) {
    for (let round = 0; round < rounds; round += 1) {
      const detected = this.#detect()
      const installDir = typeof detected.installDir === 'string' && detected.installDir !== '' ? detected.installDir : null
      let target = null
      if (installDir !== null) {
        const helper = this.platform.findProcess(installDir)
        if (helper?.running === true && Number.isInteger(helper.pid)) target = helper.pid
      }
      if (target === null) {
        if ((await this.#napcatStillReachable()) !== true) return
        target = this.#windowsQqPid()
      }
      if (target === null) return
      const result = await this.#windowsForceKill(target)
      if (result.ok !== true) {
        this.logger.warn('强制结束 NapCat 进程 %d 失败：%s', target, String(result.error ?? 'taskkill /F 失败'))
      }
      await this.sleep(500)
    }
  }

  /** Whether NapCat's WebUI still answers (a reliable "still running" signal). */
  async #napcatStillReachable() {
    try {
      const probe = await this.loginStatus()
      return probe.loggedIn === true || this.webuiReachable === true
    } catch {
      return false
    }
  }

  /**
   * Call the injected `platform.killPid` without throwing.
   * @param {number} pid
   * @param {boolean} force
   * @returns {Promise<{ ok: boolean, error?: string }>}
   */
  async #killPid(pid, force) {
    try {
      const result = await this.platform.killPid(pid, { force })
      return isPlainObject(result) ? result : { ok: true }
    } catch (error) {
      return { ok: false, error: String(error?.message ?? error) }
    }
  }

  /**
   * Force-stop a Windows process tree. NapCat is started through an elevated
   * launcher, so the non-admin plugin host often cannot terminate the resulting
   * QQ chain directly; in that case retry `taskkill /T /F` through a hidden
   * elevated helper (UAC). The direct path stays first so no prompt is needed
   * when DSH itself already runs elevated or the process is user-owned.
   *
   * @param {number} pid
   * @returns {Promise<{ ok: boolean, error?: string }>}
   */
  async #windowsForceKill(pid) {
    const direct = await this.#killPid(pid, true)
    if (direct.ok === true) return direct
    const command = [
      `$process = Start-Process -FilePath 'taskkill.exe' -ArgumentList @('/PID', '${pid}', '/T', '/F') -Verb RunAs -WindowStyle Hidden -Wait -PassThru`,
      'if (-not $process) { exit 1 }',
      'exit $process.ExitCode',
    ].join('; ')
    try {
      const result = await this.run(
        'powershell.exe',
        ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command],
        { timeoutMs: 30_000 },
      )
      if (result.code !== 0) {
        return { ok: false, error: runDetail(result) || `taskkill exit ${result.code}` }
      }
      return { ok: true }
    } catch (error) {
      return { ok: false, error: String(error?.message ?? error) }
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
   * Try the bundled offline payload before any network access. Returns `null`
   * when offline installation is disabled or the bundle is unusable, so the
   * caller can fall back to the GitHub download path.
   * @param {string} platform
   * @returns {Promise<{ ok: true, offline: true, installDir: string, version: string, zipPath: string, message: string } | null>}
   */
  async #offlineInstaller(platform) {
    if (this.settings.offlineInstall === false) return null
    const vendorDir = this.settings.offlineVendorDir !== '' ? this.settings.offlineVendorDir : defaultVendorDir()
    const pinned = this.settings.offlineNapcatVersion
    try {
      const result = platform === 'windows'
        ? await installWindowsOffline({
          vendorDir,
          version: pinned === '' ? undefined : pinned,
          targetDir: this.settings.napcatDir === '' ? undefined : this.settings.napcatDir,
          run: this.run,
          logger: this.logger,
        })
        : await installMacOffline({
          vendorDir,
          appPath: QQ_APP_PATH,
          run: this.run,
          logger: this.logger,
        })
      if (result.ok !== true) {
        if (platform === 'macos') {
          const fallback = await this.#bundledMacInstaller(vendorDir)
          if (fallback !== null) return fallback
        }
        this.logger.info('离线 NapCat 包不可用（%s），回退到 GitHub 下载', result.message ?? result.error ?? 'unknown')
        return null
      }
      this.lastInstaller = {
        zipPath: typeof result.zipPath === 'string' ? result.zipPath : '',
        appPath: '',
        version: String(result.version ?? 'latest'),
        installDir: result.installDir,
      }
      return {
        ok: true,
        offline: true,
        installDir: result.installDir,
        version: this.lastInstaller.version,
        zipPath: this.lastInstaller.zipPath,
        message: result.reused === true
          ? `已使用离线包（NapCat ${this.lastInstaller.version} 已安装）`
          : `离线包已解压安装（NapCat ${this.lastInstaller.version}）`,
      }
    } catch (error) {
      this.logger.info('离线 NapCat 包不可用（%s），回退到 GitHub 下载', String(error?.message ?? error))
      return null
    }
  }

  /**
   * Write the OneBot reverse-WS config once a QQ account exists. Used after an
   * offline install and after a successful login; safe to call repeatedly.
   * @returns {Promise<boolean>} whether the config was applied.
   */
  async #autoConfigure() {
    try {
      const detected = this.#detect()
      const accounts = Array.isArray(detected.accounts) ? detected.accounts : []
      if (accounts.length === 0) return false
      const result = await this.configure()
      return result?.ok === true
    } catch {
      return false
    }
  }

  /**
   * macOS fallback when the native offline port cannot run (for example the
   * administrator prompt was declined): extract the bundled official installer
   * app and let it finish the job. It may download NapCat when the machine has
   * network access, which is why it is only a fallback.
   * @param {string} vendorDir
   * @returns {Promise<{ ok: true, offline: true, appPath: string, version: string, zipPath: string, message: string } | null>}
   */
  async #bundledMacInstaller(vendorDir) {
    try {
      const manifest = await readManifest(vendorDir)
      const entry = manifest?.installers?.macos
      if (entry === null || entry === undefined) return null
      const zipPath = join(vendorDir, String(entry.file))
      const verified = await verifyArchive(zipPath, entry)
      if (verified.ok !== true) return null
      const version = String(entry.version ?? 'latest')
      const extractDir = join(expandHome(this.settings.installerDir), version, 'extracted')
      await ensureDir(extractDir)
      const extracted = await extractZip({ zipPath, destDir: extractDir, platform: 'macos', run: this.run })
      if (extracted.ok !== true) return null
      const appPath = await this.#findInstallerApp(extractDir)
      if (appPath === null) return null
      this.lastInstaller = { zipPath, appPath, version }
      return { ok: true, offline: true, appPath, version, zipPath, message: `已使用离线安装器（v${version}）` }
    } catch {
      return null
    }
  }

  /**
   * URL of the latest installer release for a platform.
   * @param {string} platform
   * @returns {string}
   */
  #releaseUrl(platform) {
    return platform === 'windows' ? GITHUB_WINDOWS_RELEASE : GITHUB_MAC_INSTALLER_RELEASE
  }

  /**
   * Fetch the latest installer release metadata (HTTP, then system curl
   * fallback for proxy/TLS differences).
   * @param {string} platform
   * @returns {Promise<{ ok: true, release: Record<string, any> } | { ok: false, reason: string }>}
   */
  async #fetchLatestRelease(platform) {
    const url = this.#releaseUrl(platform)
    const response = await this.http(url, {
      headers: { ...GITHUB_HEADERS },
      timeoutMs: 20_000,
    })
    if (response?.ok === true && isPlainObject(response.data)) return { ok: true, release: response.data }
    const curl = platform === 'windows' ? 'curl' : '/usr/bin/curl'
    const viaCurl = await this.run(curl, [
      '-fsSL', '--max-time', '30',
      '-H', `user-agent: ${GITHUB_HEADERS['user-agent']}`,
      url,
    ], { timeoutMs: 40_000 })
    if (viaCurl.code !== 0) {
      const reason = response?.error ?? (response?.status ? `HTTP ${response.status}` : runDetail(viaCurl))
      return { ok: false, reason }
    }
    try {
      return { ok: true, release: JSON.parse(viaCurl.stdout) }
    } catch {
      return { ok: false, reason: '返回内容不是 JSON' }
    }
  }

  /**
   * Installer zip path for one release version.
   * @param {unknown} version
   * @param {string} platform
   * @returns {string}
   */
  #installerZipPath(version, platform) {
    return join(
      expandHome(this.settings.installerDir),
      String(version ?? 'latest'),
      platform === 'windows' ? WINDOWS_INSTALLER_ZIP : MAC_INSTALLER_ZIP,
    )
  }

  /**
   * Download a file to `zipPath` using the injected downloader/fetch.
   * @param {string} url
   * @param {string} zipPath
   * @param {string} platform
   * @returns {Promise<{ ok: boolean, error?: string }>}
   */
  async #downloadFile(url, zipPath, platform) {
    if (this.download !== null) {
      try {
        await this.download(url, zipPath)
        return { ok: true }
      } catch (error) {
        return { ok: false, error: String(error?.message ?? error) }
      }
    }
    try {
      if (this.fetch === null) throw new Error('当前环境没有可用的 fetch')
      const hasSignalTimeout = typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
      const response = await this.fetch(url, {
        headers: { 'user-agent': GITHUB_HEADERS['user-agent'] },
        signal: hasSignalTimeout ? AbortSignal.timeout(120_000) : undefined,
      })
      if (response?.ok !== true) throw new Error(`HTTP ${response?.status ?? 0}`)
      const buffer = Buffer.from(await response.arrayBuffer())
      await this.fs.writeFile(zipPath, buffer)
      return { ok: true }
    } catch (error) {
      // Fetch may fail where the system curl succeeds (proxy/TLS differences).
      const curl = platform === 'windows' ? 'curl' : '/usr/bin/curl'
      const viaCurl = await this.run(curl, ['-fsSL', '--max-time', '180', '-o', zipPath, url], { timeoutMs: 200_000 })
      if (viaCurl.code === 0 && this.fs.existsSync(zipPath)) return { ok: true }
      return { ok: false, error: String(error?.message ?? error) }
    }
  }

  /**
   * Extract the installer zip.
   * - Windows: `tar -xf` first, then PowerShell `Expand-Archive`.
   * - macOS: `ditto -x -k` first, then `unzip`.
   *
   * @param {string} zipPath
   * @param {string} extractDir
   * @param {string} platform
   * @returns {Promise<string|null>} error message, or null on success
   */
  async #extractZip(zipPath, extractDir, platform) {
    if (platform === 'windows') {
      const tar = await this.run('tar', ['-xf', zipPath, '-C', extractDir], { timeoutMs: 120_000 })
      if (tar.code === 0) return null
      const command = `Expand-Archive -LiteralPath ${powershellQuote(zipPath)} -DestinationPath ${powershellQuote(extractDir)} -Force`
      const powershell = await this.run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { timeoutMs: 120_000 })
      if (powershell.code === 0) return null
      const detail = runDetail(powershell) || runDetail(tar)
      return `解压 NapCat 安装器失败${detail === '' ? '' : `：${detail}`}`
    }
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
    const direct = join(extractDir, MAC_INSTALLER_APP)
    if (this.fs.existsSync(direct)) return direct
    const entries = await this.fs.readdir(extractDir)
    const list = Array.isArray(entries) ? entries : []
    for (const entry of list) {
      if (typeof entry !== 'string' || entry === '') continue
      const app = join(extractDir, entry, MAC_INSTALLER_APP)
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

  /**
   * Find `NapCatInstaller.exe` inside the extracted Windows OneKey directory.
   * @param {string} extractDir
   * @returns {Promise<string|null>}
   */
  async #findInstallerExe(extractDir) {
    const direct = join(extractDir, WINDOWS_INSTALLER_EXE)
    if (this.fs.existsSync(direct)) return direct
    const entries = await this.fs.readdir(extractDir)
    const list = Array.isArray(entries) ? entries : []
    for (const entry of list) {
      if (typeof entry !== 'string' || entry === '') continue
      const nested = join(extractDir, entry, WINDOWS_INSTALLER_EXE)
      if (this.fs.existsSync(nested)) return nested
    }
    for (const entry of list) {
      if (typeof entry === 'string' && /^napcatinstaller\.exe$/iu.test(entry)) {
        const candidate = join(extractDir, entry)
        if (this.fs.existsSync(candidate)) return candidate
      }
    }
    return null
  }

  /**
   * Launch the Windows installer: `cmd /c start "" <exe>` from its directory,
   * falling back to executing the exe directly.
   * @param {string} exePath
   * @returns {Promise<string|null>} error detail, or null on success
   */
  async #launchWindowsInstaller(exePath) {
    const cwd = dirname(exePath)
    const launched = await this.run('cmd.exe', ['/c', 'start', '', exePath], { cwd, timeoutMs: 20_000 })
    if (launched.code === 0) return null
    // `start` through cmd.exe can be finicky; running the exe directly is a safe fallback.
    const direct = await this.run(exePath, [], { cwd, timeoutMs: 20_000 })
    if (direct.code === 0) return null
    return runDetail(direct) || runDetail(launched)
  }

  /** Downloaded-installer summary for `status()` (platform aware). */
  async #installerInfo() {
    const platform = this.#platformId()
    /** @type {{ downloaded: boolean, appPath: string|null, version: string|null, zipPath: string|null }} */
    const empty = { downloaded: false, appPath: null, version: null, zipPath: null }
    try {
      if (this.lastInstaller !== null
        && typeof this.lastInstaller.installDir === 'string'
        && this.lastInstaller.installDir !== ''
        && this.fs.existsSync(this.lastInstaller.installDir)) {
        return {
          downloaded: true,
          appPath: null,
          version: this.lastInstaller.version,
          zipPath: this.lastInstaller.zipPath,
        }
      }
      if (this.lastInstaller !== null && this.fs.existsSync(this.lastInstaller.appPath)) {
        return {
          downloaded: true,
          appPath: this.lastInstaller.appPath,
          version: this.lastInstaller.version,
          zipPath: this.lastInstaller.zipPath,
        }
      }
      const installerDir = expandHome(this.settings.installerDir)
      if (!this.fs.existsSync(installerDir)) return empty
      const entries = await this.fs.readdir(installerDir)
      for (const entry of Array.isArray(entries) ? entries : []) {
        if (typeof entry !== 'string' || entry === '') continue
        const targetDir = join(installerDir, entry)
        const extractDir = join(targetDir, 'extracted')
        const extracted = platform === 'windows'
          ? await this.#findInstallerExe(extractDir)
          : await this.#findInstallerApp(extractDir)
        const direct = join(targetDir, platform === 'windows' ? WINDOWS_INSTALLER_EXE : MAC_INSTALLER_APP)
        const appPath = extracted ?? (this.fs.existsSync(direct) ? direct : null)
        if (appPath !== null) {
          return {
            downloaded: true,
            appPath,
            version: entry,
            zipPath: this.#installerZipPath(entry, platform),
          }
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
