/**
 * Platform-neutral settings, platform facts and shared detection helpers.
 *
 * The Windows wrapper provides the default Docker backend; this module holds
 * the shared defaults and read-only detection helpers.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { existsSync, expandHome } from './paths.js'

/** Base defaults; the Windows wrapper fixes the Docker backend. */
export const BASE_SETTINGS = {
  projectDir: '~/project/qq-bot',
  koishiPort: 5140,
  napcatPort: 6099,
  reversePath: '/onebot',
  napcatToken: '',
  /** Optional explicit QQ.app/QQNT path (unusual layouts / tests). */
  qqPath: '',
  /** Optional explicit NapCat directory (unusual layouts / tests). */
  napcatDir: '',
  /** NapCat backend: this branch always uses the Docker/Linux QQ backend. */
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
  /** Stop Koishi/NapCat when the DSH host process exits (detached watchdog). */
  lifecycleGuard: true,
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

/**
 * Merge plugin row config over platform defaults and normalize shapes.
 *
 * @param {Record<string, unknown>} [raw]
 * @param {typeof BASE_SETTINGS} [defaults]
 * @returns {typeof BASE_SETTINGS}
 */
export function resolveSettings(raw = {}, defaults = BASE_SETTINGS) {
  const source = raw !== null && typeof raw === 'object' ? raw : {}
  const projectDir = expandHome(typeof source.projectDir === 'string' ? source.projectDir : defaults.projectDir)
  const koishiPort = toPort(source.koishiPort, defaults.koishiPort)
  const napcatPort = toPort(source.napcatPort, defaults.napcatPort)
  const reversePathRaw = typeof source.reversePath === 'string' && source.reversePath !== ''
    ? source.reversePath
    : defaults.reversePath
  const reversePath = reversePathRaw.startsWith('/') ? reversePathRaw : `/${reversePathRaw}`
  const logLines = toBoundedInt(source.logLines, defaults.logLines, 20, 2000)
  const napcatBackend = 'docker'
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
      : defaults.dockerNapcatImage,
    dockerNapcatContainer: typeof source.dockerNapcatContainer === 'string' && source.dockerNapcatContainer.trim() !== ''
      ? source.dockerNapcatContainer.trim()
      : defaults.dockerNapcatContainer,
    dockerNapcatDataDir,
    dockerNapcatHost: typeof source.dockerNapcatHost === 'string' && source.dockerNapcatHost.trim() !== ''
      ? source.dockerNapcatHost.trim()
      : defaults.dockerNapcatHost,
    dockerNapcatToken: typeof source.dockerNapcatToken === 'string' ? source.dockerNapcatToken.trim() : '',
    dockerAutoStart: source.dockerAutoStart === undefined ? defaults.dockerAutoStart : source.dockerAutoStart === true,
    dockerDesktopPath: typeof source.dockerDesktopPath === 'string' ? expandHome(source.dockerDesktopPath) : '',
    dockerEngineTimeoutMs: toBoundedInt(source.dockerEngineTimeoutMs, defaults.dockerEngineTimeoutMs, 10_000, 600_000),
    lifecycleGuard: source.lifecycleGuard === undefined ? defaults.lifecycleGuard : source.lifecycleGuard === true,
    aiProvider: typeof source.aiProvider === 'string' ? source.aiProvider : '',
    aiModel: typeof source.aiModel === 'string' ? source.aiModel : '',
    aiSystemPrompt: typeof source.aiSystemPrompt === 'string' ? source.aiSystemPrompt : defaults.aiSystemPrompt,
    aiMaxTokens: toBoundedInt(source.aiMaxTokens, defaults.aiMaxTokens, 64, 4096),
    aiTemperature: toBoundedNumber(source.aiTemperature, defaults.aiTemperature, 0, 2),
    aiSelfCheck: source.aiSelfCheck === undefined ? defaults.aiSelfCheck : source.aiSelfCheck === true,
    webSearchEnabled: source.webSearchEnabled === undefined ? defaults.webSearchEnabled : source.webSearchEnabled === true,
    webSearchMaxResults: toBoundedInt(source.webSearchMaxResults, defaults.webSearchMaxResults, 1, 8),
    webSearchTimeoutMs: toBoundedInt(source.webSearchTimeoutMs, defaults.webSearchTimeoutMs, 1000, 20000),
    webFetchEnabled: source.webFetchEnabled === undefined ? defaults.webFetchEnabled : source.webFetchEnabled === true,
    webFetchPages: toBoundedInt(source.webFetchPages, defaults.webFetchPages, 0, 3),
    webFetchTimeoutMs: toBoundedInt(source.webFetchTimeoutMs, defaults.webFetchTimeoutMs, 1000, 15000),
    webFetchMaxChars: toBoundedInt(source.webFetchMaxChars, defaults.webFetchMaxChars, 500, 8000),
    weatherEnabled: source.weatherEnabled === undefined ? defaults.weatherEnabled : source.weatherEnabled === true,
    weatherTimeoutMs: toBoundedInt(source.weatherTimeoutMs, defaults.weatherTimeoutMs, 1000, 20000),
    marketQuoteTimeoutMs: toBoundedInt(source.marketQuoteTimeoutMs, defaults.marketQuoteTimeoutMs, 1000, 20000),
    financeCalendarTimeoutMs: toBoundedInt(source.financeCalendarTimeoutMs, defaults.financeCalendarTimeoutMs, 1000, 20000),
    autoRestartKoishi: source.autoRestartKoishi === undefined ? defaults.autoRestartKoishi : source.autoRestartKoishi === true,
    autoInstallDeps: source.autoInstallDeps === undefined ? defaults.autoInstallDeps : source.autoInstallDeps === true,
    autoSyncSelfId: source.autoSyncSelfId === undefined ? defaults.autoSyncSelfId : source.autoSyncSelfId === true,
    logLines,
  }
}

/** Platform id used across the plugin (this branch supports Windows only). */
export function hostPlatform(platform = process.platform) {
  return platform === 'win32' ? 'windows' : 'other'
}

/** Display/support metadata for the current host. */
export function platformInfo(platform = process.platform) {
  const id = hostPlatform(platform)
  return {
    id,
    label: id === 'windows' ? 'Windows' : 'Unsupported',
    supported: id === 'windows',
    napcatSupported: id === 'windows',
    koishiSupported: id === 'windows',
  }
}

/**
 * Inspect the Koishi project directory (no execution).
 *
 * @param {typeof BASE_SETTINGS} settings
 */
export function detectKoishiProject(settings) {
  const projectDir = expandHome(settings?.projectDir ?? BASE_SETTINGS.projectDir)
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

/** Read installed NapCat release version from its package.json. */
export function readNapcatVersion(installDir) {
  try {
    const meta = JSON.parse(readFileSync(join(installDir, 'package.json'), 'utf8'))
    if (typeof meta?.version === 'string') return meta.version
  } catch {
    // ignore marker-less installs
  }
  return null
}

/** List account configs (`onebot11_<uin>.json`) under a NapCat config dir. */
export function readAccounts(configDir) {
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
export function readWebui(configDir, fallbackPort) {
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
