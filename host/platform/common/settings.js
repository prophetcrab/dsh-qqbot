/**
 * Platform-neutral settings, platform facts and shared detection helpers.
 *
 * macOS and Windows wrappers provide only their own default backend and the
 * OS-specific detection functions (QQ/NapCat paths, versions, QR cache).
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { existsSync, expandHome } from './paths.js'

/** Base defaults shared by every host; wrappers override `napcatBackend`. */
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
  /** NapCat backend: Docker/Linux QQ only on this branch. */
  napcatBackend: 'docker',
  /** Docker backend: image tag, container name and data directory. */
  dockerNapcatImage: 'mlikiowa/napcat-docker:latest',
  /** GitHub release archive; empty falls back to a registry pull. */
  dockerNapcatImageUrl: 'https://github.com/prophetcrab/dsh-qqbot/releases/download/napcat-docker-latest/napcat-docker-latest.tar.gz',
  dockerNapcatImageSha256: '919fe1089303031ef8dd0caef812daeabb27398f17dcf67f213fd494439ae028',
  /** Expected compressed archive size, used for the install progress bar. */
  dockerNapcatImageBytes: 593921964,
  dockerNapcatContainer: 'dsh-qqbot-napcat',
  /** Empty means `<projectDir>/runtime/napcat-docker`. */
  dockerNapcatDataDir: '',
  /** Host name the container uses to reach Koishi on this machine. */
  dockerNapcatHost: 'host.docker.internal',
  /** Empty means generate and persist a random WebUI token in the data dir. */
  dockerNapcatToken: '',
  /** Start OrbStack automatically when the engine is not running. */
  dockerAutoStart: true,
  /** Optional OrbStack app path; empty means auto-detect /Applications/OrbStack.app. */
  dockerDesktopPath: '',
  /** How long to wait for the Docker engine after launching OrbStack. */
  dockerEngineTimeoutMs: 180000,
  /** Stop Koishi/NapCat when the DSH host process exits (detached watchdog). */
  lifecycleGuard: true,
  /** Run first-run bootstrap (scaffold/install/configure) when the plugin loads. */
  bootstrap: true,
  autoRestartKoishi: true,
  autoInstallDeps: true,
  /** Keep Koishi adapter selfId in sync with the QQ account logged into NapCat. */
  autoSyncSelfId: true,
  logLines: 200,
  /** GitHub source used by the panel's environment reinstall. */
  githubRepo: 'prophetcrab/dsh-qqbot',
  githubRef: 'dshbot-mac',
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
    dockerNapcatImageUrl: typeof source.dockerNapcatImageUrl === 'string' ? source.dockerNapcatImageUrl.trim() : defaults.dockerNapcatImageUrl,
    dockerNapcatImageSha256: typeof source.dockerNapcatImageSha256 === 'string' ? source.dockerNapcatImageSha256.trim().toLowerCase() : defaults.dockerNapcatImageSha256,
    dockerNapcatImageBytes: Number.isFinite(Number(source.dockerNapcatImageBytes)) && Number(source.dockerNapcatImageBytes) > 0 ? Number(source.dockerNapcatImageBytes) : defaults.dockerNapcatImageBytes,
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
    bootstrap: source.bootstrap === undefined ? defaults.bootstrap : source.bootstrap === true,
    autoRestartKoishi: source.autoRestartKoishi === undefined ? defaults.autoRestartKoishi : source.autoRestartKoishi === true,
    autoInstallDeps: source.autoInstallDeps === undefined ? defaults.autoInstallDeps : source.autoInstallDeps === true,
    autoSyncSelfId: source.autoSyncSelfId === undefined ? defaults.autoSyncSelfId : source.autoSyncSelfId === true,
    logLines,
    githubRepo: typeof source.githubRepo === 'string' && source.githubRepo.trim() !== '' ? source.githubRepo.trim() : defaults.githubRepo,
    githubRef: typeof source.githubRef === 'string' && source.githubRef.trim() !== '' ? source.githubRef.trim() : defaults.githubRef,
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

function toBoundedInt(value, fallback, min, max) {
  const number = Number(value)
  if (!Number.isInteger(number)) return fallback
  return Math.min(max, Math.max(min, number))
}
