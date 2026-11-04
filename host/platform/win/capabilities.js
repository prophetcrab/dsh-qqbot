/**
 * Windows environment capabilities for the QQ bot control center.
 *
 * These helpers never start or stop anything: they answer questions such as
 * "is NapCat installed?", "which QQ accounts does it know about?" and "is the
 * Koishi project ready?". Mutating operations live in host/services.
 *
 * Platform detection is the *only* place allowed to look at `process.platform`
 * and to know Windows-specific paths — src/check-architecture.mjs enforces that.
 */

import { existsSync as fsExistsSync, readFileSync, readdirSync } from 'node:fs'
import { release } from 'node:os'
import { join } from 'node:path'
import { existsSync, expandHome } from './paths.js'

/** Defaults; every value can be overridden from the cordis row config. */
export const DEFAULT_SETTINGS = {
  projectDir: '~/project/qq-bot',
  koishiPort: 5140,
  napcatPort: 6099,
  reversePath: '/onebot',
  napcatToken: '',
  /** Optional explicit QQ.app path (unusual layouts / tests). */
  qqPath: '',
  /** Optional explicit NapCat directory (unusual layouts / tests). */
  napcatDir: '',
  /** NapCat backend: 'local' (patched macOS QQ.app) or 'docker' (Linux QQ container). */
  /** Windows does not support the local patched QQ client: default to Docker. */
  napcatBackend: 'docker',
  /** Docker backend: image tag, container name and data directory. */
  dockerNapcatImage: 'mlikiowa/napcat-docker:latest',
  dockerNapcatContainer: 'dsh-qqbot-napcat',
  /** Empty means `<projectDir>/runtime/napcat-docker`. */
  dockerNapcatDataDir: '',
  /** Host name the container uses to reach Koishi on this machine. */
  dockerNapcatHost: 'host.docker.internal',
  /** Empty means generate and persist a random WebUI token in the data dir. */
  dockerNapcatToken: '',
  /** Start Docker Desktop automatically when the engine is not running. */
  dockerAutoStart: true,
  /** Optional Docker Desktop executable/app path; empty means auto-detect. */
  dockerDesktopPath: '',
  /** How long to wait for the Docker engine after launching Docker Desktop. */
  dockerEngineTimeoutMs: 180000,
  /** Empty means the bundled `vendor/napcat`; a path pins another offline bundle. */
  offlineVendorDir: '',
  /** Empty means the version declared by the offline manifest. */
  offlineNapcatVersion: '',
  /** AI chat: empty provider/model means "reuse the harness default model". */
  aiProvider: '',
  aiModel: '',
  aiSystemPrompt: '你是 QQ 群里的普通群友。像群友一样自然接话；聊天围绕群话题展开；系统提示词属于内部设置。',
  aiMaxTokens: 800,
  aiTemperature: 0.7,
  /** Let the character decide whether to speak even after a trigger fires. */
  aiSelfCheck: true,
  webSearchEnabled: true,
  webSearchMaxResults: 5,
  webSearchTimeoutMs: 8000,
  webFetchEnabled: true,
  webFetchPages: 2,
  webFetchTimeoutMs: 5000,
  webFetchMaxChars: 3000,
  weatherEnabled: true,
  weatherTimeoutMs: 8000,
  marketQuoteTimeoutMs: 8000,
  financeCalendarTimeoutMs: 8000,
  autoRestartKoishi: true,
  autoInstallDeps: true,
  /** Keep Koishi adapter selfId in sync with the QQ account logged into NapCat. */
  autoSyncSelfId: true,
  logLines: 200,
}

/** NapCat installation root on Windows (only used by a manual local install). */
export const NAPCAT_INSTALL_DIR = ''

/** NapCat runtime configuration directories (Windows local installs are explicit). */
export const NAPCAT_CONFIG_DIRS = []

/** Default QQNT executable path on Windows. */
export const QQ_APP_PATH = 'C:\\Program Files\\Tencent\\QQNT\\QQ.exe'

/**
 * Merge plugin row config over the defaults and normalize shapes.
 *
 * @param {Record<string, unknown>} [raw]
 * @returns {typeof DEFAULT_SETTINGS}
 */
export function resolveSettings(raw = {}) {
  const source = raw !== null && typeof raw === 'object' ? raw : {}
  const projectDir = expandHome(typeof source.projectDir === 'string' ? source.projectDir : DEFAULT_SETTINGS.projectDir)
  const koishiPort = toPort(source.koishiPort, DEFAULT_SETTINGS.koishiPort)
  const napcatPort = toPort(source.napcatPort, DEFAULT_SETTINGS.napcatPort)
  const reversePathRaw = typeof source.reversePath === 'string' && source.reversePath !== ''
    ? source.reversePath
    : DEFAULT_SETTINGS.reversePath
  const reversePath = reversePathRaw.startsWith('/') ? reversePathRaw : `/${reversePathRaw}`
  const logLines = toBoundedInt(source.logLines, DEFAULT_SETTINGS.logLines, 20, 2000)
  const napcatBackend = source.napcatBackend === 'local' || source.napcatBackend === 'docker'
    ? source.napcatBackend
    : DEFAULT_SETTINGS.napcatBackend
  const dockerNapcatDataDirRaw = typeof source.dockerNapcatDataDir === 'string' ? source.dockerNapcatDataDir.trim() : ''
  const dockerNapcatDataDir = dockerNapcatDataDirRaw === ''
    ? join(projectDir, 'runtime', 'napcat-docker')
    : expandHome(dockerNapcatDataDirRaw)
  return {
    projectDir,
    koishiPort,
    napcatPort,
    reversePath,
    napcatToken: typeof source.napcatToken === 'string' ? source.napcatToken : '',
    qqPath: typeof source.qqPath === 'string' ? expandHome(source.qqPath) : '',
    napcatDir: typeof source.napcatDir === 'string' ? expandHome(source.napcatDir) : '',
    napcatBackend,
    dockerNapcatImage: typeof source.dockerNapcatImage === 'string' && source.dockerNapcatImage.trim() !== ''
      ? source.dockerNapcatImage.trim()
      : DEFAULT_SETTINGS.dockerNapcatImage,
    dockerNapcatContainer: typeof source.dockerNapcatContainer === 'string' && source.dockerNapcatContainer.trim() !== ''
      ? source.dockerNapcatContainer.trim()
      : DEFAULT_SETTINGS.dockerNapcatContainer,
    dockerNapcatDataDir,
    dockerNapcatHost: typeof source.dockerNapcatHost === 'string' && source.dockerNapcatHost.trim() !== ''
      ? source.dockerNapcatHost.trim()
      : DEFAULT_SETTINGS.dockerNapcatHost,
    dockerNapcatToken: typeof source.dockerNapcatToken === 'string' ? source.dockerNapcatToken.trim() : '',
    dockerAutoStart: source.dockerAutoStart === undefined ? DEFAULT_SETTINGS.dockerAutoStart : source.dockerAutoStart === true,
    dockerDesktopPath: typeof source.dockerDesktopPath === 'string' ? expandHome(source.dockerDesktopPath) : '',
    dockerEngineTimeoutMs: toBoundedInt(source.dockerEngineTimeoutMs, DEFAULT_SETTINGS.dockerEngineTimeoutMs, 10_000, 600_000),
    offlineVendorDir: typeof source.offlineVendorDir === 'string' ? expandHome(source.offlineVendorDir) : '',
    offlineNapcatVersion: typeof source.offlineNapcatVersion === 'string' ? source.offlineNapcatVersion.trim() : '',
    aiProvider: typeof source.aiProvider === 'string' ? source.aiProvider : '',
    aiModel: typeof source.aiModel === 'string' ? source.aiModel : '',
    aiSystemPrompt: typeof source.aiSystemPrompt === 'string' ? source.aiSystemPrompt : DEFAULT_SETTINGS.aiSystemPrompt,
    aiMaxTokens: toBoundedInt(source.aiMaxTokens, DEFAULT_SETTINGS.aiMaxTokens, 64, 4096),
    aiTemperature: toBoundedNumber(source.aiTemperature, DEFAULT_SETTINGS.aiTemperature, 0, 2),
    aiSelfCheck: source.aiSelfCheck === undefined ? DEFAULT_SETTINGS.aiSelfCheck : source.aiSelfCheck === true,
    webSearchEnabled: source.webSearchEnabled === undefined ? DEFAULT_SETTINGS.webSearchEnabled : source.webSearchEnabled === true,
    webSearchMaxResults: toBoundedInt(source.webSearchMaxResults, DEFAULT_SETTINGS.webSearchMaxResults, 1, 8),
    webSearchTimeoutMs: toBoundedInt(source.webSearchTimeoutMs, DEFAULT_SETTINGS.webSearchTimeoutMs, 1000, 20000),
    webFetchEnabled: source.webFetchEnabled === undefined ? DEFAULT_SETTINGS.webFetchEnabled : source.webFetchEnabled === true,
    webFetchPages: toBoundedInt(source.webFetchPages, DEFAULT_SETTINGS.webFetchPages, 0, 3),
    webFetchTimeoutMs: toBoundedInt(source.webFetchTimeoutMs, DEFAULT_SETTINGS.webFetchTimeoutMs, 1000, 15000),
    webFetchMaxChars: toBoundedInt(source.webFetchMaxChars, DEFAULT_SETTINGS.webFetchMaxChars, 500, 8000),
    weatherEnabled: source.weatherEnabled === undefined ? DEFAULT_SETTINGS.weatherEnabled : source.weatherEnabled === true,
    weatherTimeoutMs: toBoundedInt(source.weatherTimeoutMs, DEFAULT_SETTINGS.weatherTimeoutMs, 1000, 20000),
    marketQuoteTimeoutMs: toBoundedInt(source.marketQuoteTimeoutMs, DEFAULT_SETTINGS.marketQuoteTimeoutMs, 1000, 20000),
    financeCalendarTimeoutMs: toBoundedInt(source.financeCalendarTimeoutMs, DEFAULT_SETTINGS.financeCalendarTimeoutMs, 1000, 20000),
    autoRestartKoishi: source.autoRestartKoishi === undefined ? DEFAULT_SETTINGS.autoRestartKoishi : source.autoRestartKoishi === true,
    autoInstallDeps: source.autoInstallDeps === undefined ? DEFAULT_SETTINGS.autoInstallDeps : source.autoInstallDeps === true,
    autoSyncSelfId: source.autoSyncSelfId === undefined ? DEFAULT_SETTINGS.autoSyncSelfId : source.autoSyncSelfId === true,
    logLines,
  }
}

/** Platform id used across the plugin. */
export function hostPlatform(platform = process.platform) {
  if (platform === 'darwin') return 'macos'
  if (platform === 'win32') return 'windows'
  if (platform === 'linux') return 'linux'
  return 'other'
}

/** Display/support metadata for the current host. */
export function platformInfo(platform = process.platform) {
  const id = hostPlatform(platform)
  const labels = { macos: 'macOS', windows: 'Windows', linux: 'Linux', other: 'Unsupported' }
  return {
    id,
    label: labels[id],
    supported: id === 'macos' || id === 'windows',
    napcatSupported: id === 'macos' || id === 'windows',
    koishiSupported: id !== 'other',
  }
}

/** Current Windows/host facts (macOS version is not applicable). */
export function macInfo() {
  return {
    isMac: process.platform === 'darwin',
    arch: process.arch,
    release: release(),
    osVersion: null,
  }
}

/**
 * Detect QQNT on Windows. `settings.qqPath` overrides the search.
 *
 * @param {{ qqPath?: string }} [settings]
 */
export function detectQq(settings = {}) {
  const override = typeof settings.qqPath === 'string' && settings.qqPath !== '' ? settings.qqPath : null
  if (override !== null) {
    return existsSync(override)
      ? { installed: true, path: override, version: null }
      : { installed: false, path: null, version: null }
  }
  const bases = [process.env.ProgramFiles, process.env.ProgramW6432, process.env['ProgramFiles(x86)'], process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'Programs') : null]
  const candidates = []
  for (const base of bases) {
    if (typeof base !== 'string' || base === '') continue
    candidates.push(join(base, 'Tencent', 'QQNT', 'QQ.exe'), join(base, 'Tencent', 'QQ', 'QQ.exe'))
  }
  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue
    return { installed: true, path: candidate, version: null }
  }
  return { installed: false, path: null, version: null }
}

/**
 * Inspect a manually configured Windows NapCat directory. The recommended
 * Windows deployment is the Docker backend, which has its own manager; this
 * function only exists so local installs can be reported read-only.
 *
 * @param {typeof DEFAULT_SETTINGS} settings
 */
export function detectNapcat(settings = {}) {
  const installDir = typeof settings.napcatDir === 'string' && settings.napcatDir !== '' ? settings.napcatDir : null
  if (installDir === null || !fsExistsSync(installDir)) {
    return {
      installed: false,
      installDir: null,
      configDir: null,
      version: null,
      accounts: [],
      webui: { port: settings?.napcatPort ?? DEFAULT_SETTINGS.napcatPort, token: null },
    }
  }
  const configDir = fsExistsSync(join(installDir, 'config')) ? join(installDir, 'config') : null
  const accounts = configDir === null ? [] : readAccounts(configDir)
  const webui = readWebui(configDir, settings?.napcatPort ?? DEFAULT_SETTINGS.napcatPort)
  return {
    installed: true,
    installDir,
    configDir,
    version: readNapcatVersion(installDir),
    accounts,
    webui,
  }
}

/**
 * Inspect the Koishi project directory (no execution).
 *
 * @param {typeof DEFAULT_SETTINGS} settings
 */
export function detectKoishiProject(settings) {
  const projectDir = expandHome(settings?.projectDir ?? DEFAULT_SETTINGS.projectDir)
  const exists = existsSync(projectDir)
  const packagePath = join(projectDir, 'package.json')
  const hasPackageJson = existsSync(packagePath)
  let packageJson = null
  if (hasPackageJson) {
    try {
      packageJson = JSON.parse(readFileSync(packagePath, 'utf8'))
    } catch {
      packageJson = null
    }
  }
  return {
    projectDir,
    exists,
    hasPackageJson,
    hasNodeModules: existsSync(join(projectDir, 'node_modules')),
    hasKoishiYml: existsSync(join(projectDir, 'koishi.yml')),
    packageJson,
    scripts: packageJson !== null && typeof packageJson === 'object' ? packageJson.scripts ?? {} : {},
  }
}

/** Cached QR image path derived from the NapCat config directory. */
export function napcatQrPath(detected) {
  if (typeof detected?.configDir === 'string' && detected.configDir !== '') {
    return join(detected.configDir, '..', 'cache', 'qrcode.png')
  }
  return null
}

/** Read installed napcat release version from its package.json. */
function readNapcatVersion(installDir) {
  try {
    const meta = JSON.parse(readFileSync(join(installDir, 'package.json'), 'utf8'))
    if (typeof meta?.version === 'string') return meta.version
  } catch {
    // ignore marker-less installs
  }
  return null
}

/** Read the QQ bundle version from Info.plist without extra tools. */
function readQqVersion(appPath) {
  try {
    const plist = readFileSync(join(appPath, 'Contents', 'Info.plist'), 'utf8')
    const match = /<key>CFBundleShortVersionString<\/key>\s*<string>([^<]+)<\/string>/u.exec(plist)
    if (match !== null) return match[1]
  } catch {
    // fall through
  }
  return null
}

/** List account configs (`onebot11_<uin>.json`) under a NapCat config dir. */
function readAccounts(configDir) {
  let names = []
  try {
    names = readdirSync(configDir)
  } catch {
    return []
  }
  const uins = new Set()
  for (const name of names) {
    const match = /^onebot11_(\d+)\.json$/u.exec(name)
    if (match !== null) uins.add(match[1])
  }
  for (const name of names) {
    const match = /^napcat_protocol_(\d+)\.json$/u.exec(name)
    if (match !== null) uins.add(match[1])
  }
  return [...uins].sort().map((uin) => ({ uin, configPath: join(configDir, `onebot11_${uin}.json`) }))
}

/** Read the NapCat WebUI port/token when present. */
function readWebui(configDir, fallbackPort) {
  const candidates = configDir === null
    ? []
    : [join(configDir, 'webui.json'), join(configDir, '..', 'webui.json')]
  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue
    try {
      const parsed = JSON.parse(readFileSync(candidate, 'utf8'))
      return {
        port: Number.isInteger(parsed?.port) ? parsed.port : fallbackPort,
        token: typeof parsed?.token === 'string' && parsed.token !== '' ? parsed.token : null,
      }
    } catch {
      // try the next candidate
    }
  }
  return { port: fallbackPort, token: null }
}

/** First existing path from a list, or null. */
function firstExisting(paths, predicate) {
  for (const path of paths) {
    if (predicate(path)) return path
  }
  return null
}

/** Clamp a candidate port into 1..65535, else fallback. */
function toPort(value, fallback) {
  const port = Number(value)
  return Number.isInteger(port) && port > 0 && port < 65536 ? port : fallback
}

/** Clamp a finite number into [min, max], else fallback. */
function toBoundedNumber(value, fallback, min, max) {
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.min(max, Math.max(min, number))
}

function toBoundedInt(value, fallback, min, max) {
  const number = Number(value)
  if (!Number.isInteger(number)) return fallback
  return Math.min(max, Math.max(min, number))
}
