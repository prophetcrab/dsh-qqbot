/**
 * Read-only environment detection for the QQ bot control center.
 *
 * These helpers never start or stop anything: they answer questions such as
 * "is NapCat installed?", "which QQ accounts does it know about?" and "is the
 * Koishi project ready?". Mutating operations live in lib/napcat.js and
 * lib/koishi.js.
 */

import { execFileSync } from 'node:child_process'
import { existsSync as fsExistsSync, readFileSync, readdirSync } from 'node:fs'
import { homedir, release } from 'node:os'
import { join } from 'node:path'
import { expandHome, existsSync, readJson } from './util.js'

/** Defaults; every value can be overridden from the cordis row config. */
export const DEFAULT_SETTINGS = {
  projectDir: '~/project/qq-bot',
  koishiPort: 5140,
  napcatPort: 6099,
  reversePath: '/onebot',
  installerDir: '~/Library/Application Support/dsh-qqbot/napcat-installer',
  napcatToken: '',
  autoRestartKoishi: true,
  logLines: 200,
}

/** NapCat installation root on macOS (inside the QQ container). */
export const NAPCAT_INSTALL_DIR = '~/Library/Containers/com.tencent.qq/Data/Documents/napcat'

/** NapCat runtime configuration directories, most specific first. */
export const NAPCAT_CONFIG_DIRS = [
  '~/Library/Containers/com.tencent.qq/Data/Library/Application Support/QQ/NapCat/config',
  '~/Library/Containers/com.tencent.qq/Data/Documents/napcat/config',
]

/** QQ application bundle path on macOS. */
export const QQ_APP_PATH = '/Applications/QQ.app'

/**
 * Merge plugin row config over the defaults and normalize shapes.
 *
 * @param {Record<string, unknown>} [raw]
 * @returns {typeof DEFAULT_SETTINGS}
 */
export function resolveSettings(raw = {}) {
  const source = raw !== null && typeof raw === 'object' ? raw : {}
  const projectDir = expandHome(typeof source.projectDir === 'string' ? source.projectDir : DEFAULT_SETTINGS.projectDir)
  const installerDir = expandHome(typeof source.installerDir === 'string' ? source.installerDir : DEFAULT_SETTINGS.installerDir)
  const koishiPort = toPort(source.koishiPort, DEFAULT_SETTINGS.koishiPort)
  const napcatPort = toPort(source.napcatPort, DEFAULT_SETTINGS.napcatPort)
  const reversePathRaw = typeof source.reversePath === 'string' && source.reversePath !== ''
    ? source.reversePath
    : DEFAULT_SETTINGS.reversePath
  const reversePath = reversePathRaw.startsWith('/') ? reversePathRaw : `/${reversePathRaw}`
  const logLines = toBoundedInt(source.logLines, DEFAULT_SETTINGS.logLines, 20, 2000)
  return {
    projectDir,
    koishiPort,
    napcatPort,
    reversePath,
    installerDir,
    napcatToken: typeof source.napcatToken === 'string' ? source.napcatToken : '',
    autoRestartKoishi: source.autoRestartKoishi === undefined ? DEFAULT_SETTINGS.autoRestartKoishi : source.autoRestartKoishi === true,
    logLines,
  }
}

/** Current macOS/host facts. */
export function macInfo() {
  let version = null
  try {
    version = execFileSync('/usr/bin/sw_vers', ['-productVersion'], { encoding: 'utf8', timeout: 3000 }).trim()
  } catch {
    version = null
  }
  return {
    isMac: process.platform === 'darwin',
    arch: process.arch,
    release: release(),
    osVersion: version,
  }
}

/** Detect the QQ application bundle and its bundle version. */
export function detectQq() {
  const path = expandHome(QQ_APP_PATH)
  if (!existsSync(path)) return { installed: false, path: null, version: null }
  return { installed: true, path, version: readQqVersion(path) }
}

/**
 * Inspect NapCat's installation and runtime configuration.
 *
 * @param {typeof DEFAULT_SETTINGS} settings
 * @returns {{
 *   installed: boolean,
 *   installDir: string|null,
 *   configDir: string|null,
 *   version: string|null,
 *   accounts: Array<{ uin: string, configPath: string }>,
 *   webui: { port: number, token: string|null },
 * }}
 */
export function detectNapcat(settings) {
  const installDir = firstExisting([expandHome(NAPCAT_INSTALL_DIR)], (path) => fsExistsSync(path))
  const configDir = firstExisting(NAPCAT_CONFIG_DIRS.map(expandHome), (path) => fsExistsSync(path)) ?? (installDir === null ? null : join(installDir, 'config'))
  const accounts = configDir === null ? [] : readAccounts(configDir)
  const webui = readWebui(configDir, settings?.napcatPort ?? DEFAULT_SETTINGS.napcatPort)
  return {
    installed: installDir !== null,
    installDir,
    configDir,
    version: installDir === null ? null : readNapcatVersion(installDir),
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

/**
 * Read installed napcat release version from its package.json.
 * @param {string} installDir
 */
function readNapcatVersion(installDir) {
  try {
    const meta = JSON.parse(readFileSync(join(installDir, 'package.json'), 'utf8'))
    if (typeof meta?.version === 'string') return meta.version
  } catch {
    // ignore marker-less installs
  }
  return null
}

/**
 * Read the QQ bundle version from Info.plist without extra tools.
 * @param {string} appPath
 */
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

/**
 * Read the NapCat WebUI port/token when present.
 * @param {string|null} configDir
 * @param {number} fallbackPort
 */
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

/** Clamp an integer into [min, max], else fallback. */
function toBoundedInt(value, fallback, min, max) {
  const number = Number(value)
  if (!Number.isInteger(number)) return fallback
  return Math.min(max, Math.max(min, number))
}
