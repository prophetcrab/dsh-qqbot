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
import { join, win32 as pathWin32 } from 'node:path'
import { expandHome, existsSync, readJson, run } from './util.js'

/** Defaults; every value can be overridden from the cordis row config. */
export const DEFAULT_SETTINGS = {
  projectDir: '~/project/qq-bot',
  koishiPort: 5140,
  napcatPort: 6099,
  reversePath: '/onebot',
  /** Empty means `<projectDir>/runtime/napcat-installer` (set in resolveSettings). */
  installerDir: '',
  napcatToken: '',
  /** Optional explicit paths for unusual layouts (mainly Windows). */
  qqPath: '',
  napcatDir: '',
  autoRestartKoishi: true,
  autoInstallDeps: true,
  autoOpenInstaller: true,
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
  // Keep every runtime artifact inside the bot project: <projectDir>/runtime/...
  const installerDir = source.installerDir === undefined || source.installerDir === ''
    ? join(projectDir, 'runtime', 'napcat-installer')
    : expandHome(String(source.installerDir))
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
    qqPath: typeof source.qqPath === 'string' ? expandHome(source.qqPath) : '',
    napcatDir: typeof source.napcatDir === 'string' ? expandHome(source.napcatDir) : '',
    autoRestartKoishi: source.autoRestartKoishi === undefined ? DEFAULT_SETTINGS.autoRestartKoishi : source.autoRestartKoishi === true,
    autoInstallDeps: source.autoInstallDeps === undefined ? DEFAULT_SETTINGS.autoInstallDeps : source.autoInstallDeps === true,
    autoOpenInstaller: source.autoOpenInstaller === undefined ? DEFAULT_SETTINGS.autoOpenInstaller : source.autoOpenInstaller === true,
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

/**
 * Detect the QQ client for the current platform.
 * `settings.qqPath` overrides the search (useful for non-standard Windows installs).
 *
 * @param {{ qqPath?: string }} [settings]
 */
export function detectQq(settings = {}) {
  const platform = hostPlatform()
  if (platform === 'macos') {
    const path = settings.qqPath !== '' && typeof settings.qqPath === 'string' ? settings.qqPath : expandHome(QQ_APP_PATH)
    if (!existsSync(path)) return { installed: false, path: null, version: null }
    return { installed: true, path, version: readQqVersion(path) }
  }
  if (platform === 'windows') {
    const override = typeof settings.qqPath === 'string' && settings.qqPath !== '' ? settings.qqPath : null
    const candidates = [override, ...windowsQqCandidates(process.env)].filter((item) => typeof item === 'string' && item !== '')
    for (const candidate of candidates) {
      if (existsSync(candidate)) return { installed: true, path: candidate, version: null }
    }
    return { installed: false, path: null, version: null }
  }
  return { installed: false, path: null, version: null }
}

/** Candidate QQ executable paths on Windows, most common first. */
export function windowsQqCandidates(env = process.env) {
  const bases = [env.ProgramFiles, env.ProgramW6432, env['ProgramFiles(x86)'], env.LOCALAPPDATA ? pathWin32.join(env.LOCALAPPDATA, 'Programs') : null]
  const paths = []
  for (const base of bases) {
    if (typeof base !== 'string' || base === '') continue
    paths.push(
      pathWin32.join(base, 'Tencent', 'QQNT', 'QQ.exe'),
      pathWin32.join(base, 'Tencent', 'QQ', 'QQ.exe'),
    )
  }
  return [...new Set(paths)]
}

/** Candidate NapCat install/config directories on Windows. */
export function windowsNapcatCandidates(env = process.env, settings = {}) {
  const candidates = []
  const add = (value) => {
    if (typeof value === 'string' && value !== '' && !candidates.includes(value)) candidates.push(value)
  }
  add(settings.napcatDir)
  add(env.NAPCAT_DIR)
  const parents = [
    env.USERPROFILE,
    env.USERPROFILE ? pathWin32.join(env.USERPROFILE, 'Desktop') : null,
    env.USERPROFILE ? pathWin32.join(env.USERPROFILE, 'Downloads') : null,
    env.USERPROFILE ? pathWin32.join(env.USERPROFILE, 'Documents') : null,
    env.LOCALAPPDATA,
    env.LOCALAPPDATA ? pathWin32.join(env.LOCALAPPDATA, 'Programs') : null,
    env.ProgramFiles,
    env['ProgramFiles(x86)'],
    'C:\\',
    'D:\\',
  ]
  for (const parent of parents) {
    if (typeof parent !== 'string' || parent === '') continue
    let entries = []
    try { entries = readdirSync(parent) } catch { continue }
    for (const entry of entries) {
      if (!/^napcat.*\.shell$/iu.test(entry) && !/^napcat$/iu.test(entry)) continue
      add(pathWin32.join(parent, entry))
    }
  }
  // Injection-style installs keep NapCat under the QQ data folder.
  if (env.APPDATA) add(pathWin32.join(env.APPDATA, 'QQ', 'NapCat'))
  if (env.LOCALAPPDATA) add(pathWin32.join(env.LOCALAPPDATA, 'QQ', 'NapCat'))
  return candidates
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
export function detectNapcat(settings = {}) {
  const platform = hostPlatform()
  if (platform === 'macos') return detectMacNapcat(settings)
  if (platform === 'windows') return detectWindowsNapcat(settings)
  // Linux: only honour an explicit directory, never guess QQ paths.
  if (typeof settings.napcatDir === 'string' && settings.napcatDir !== '') {
    const installDir = settings.napcatDir
    const configDir = join(installDir, 'config')
    return {
      installed: fsExistsSync(installDir),
      installDir: fsExistsSync(installDir) ? installDir : null,
      configDir: fsExistsSync(configDir) ? configDir : null,
      version: readNapcatVersion(installDir),
      accounts: fsExistsSync(configDir) ? readAccounts(configDir) : [],
      webui: readWebui(fsExistsSync(configDir) ? configDir : null, settings.napcatPort ?? DEFAULT_SETTINGS.napcatPort),
    }
  }
  return {
    installed: false,
    installDir: null,
    configDir: null,
    version: null,
    accounts: [],
    webui: { port: settings.napcatPort ?? DEFAULT_SETTINGS.napcatPort, token: null },
  }
}

/** macOS NapCat lives inside the QQ application container. */
function detectMacNapcat(settings) {
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

/** Windows NapCat Shell / OneKey installs keep `config/` beside the launcher. */
function detectWindowsNapcat(settings) {
  const candidates = windowsNapcatCandidates(process.env, settings)
  let installDir = null
  let configDir = null
  for (const candidate of candidates) {
    if (!fsExistsSync(candidate)) continue
    const maybeConfig = join(candidate, 'config')
    const hasConfig = fsExistsSync(maybeConfig)
    const hasLauncher = fsExistsSync(join(candidate, 'napcat.bat')) || fsExistsSync(join(candidate, 'launcher.bat'))
    if (!hasConfig && !hasLauncher) continue
    installDir = installDir ?? candidate
    if (hasConfig) {
      configDir = maybeConfig
      break
    }
  }
  const accounts = configDir === null ? [] : readAccounts(configDir)
  const webui = readWebui(configDir, settings?.napcatPort ?? DEFAULT_SETTINGS.napcatPort)
  const version = installDir === null
    ? null
    : (readNapcatVersion(installDir) ?? parseWindowsNapcatVersion(installDir))
  return {
    installed: installDir !== null,
    installDir,
    configDir,
    version,
    accounts,
    webui,
  }
}

/** `NapCat.4.18.41.Shell` -> `4.18.41`. */
function parseWindowsNapcatVersion(installDir) {
  const match = /napcat[.\-_/ ]*v?(\d+\.\d+\.\d+)/iu.exec(installDir.replace(/\\/gu, '/'))
  return match === null ? null : match[1]
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
  const platform = hostPlatform()
  if (platform === 'windows') return findWindowsProcess(pattern)
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

/** Match a process via PowerShell's Win32_Process command lines. */
function findWindowsProcess(pattern) {
  let output = ''
  try {
    output = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
      'Get-CimInstance Win32_Process | Select-Object ProcessId,CommandLine | ConvertTo-Json -Compress'],
    { encoding: 'utf8', timeout: 6000, maxBuffer: 8 * 1024 * 1024 })
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

/** PID listening on a TCP port (macOS lsof, Windows netstat). */
export async function portPid(port) {
  const target = Number(port)
  if (!Number.isInteger(target) || target <= 0) return null
  if (hostPlatform() === 'windows') {
    const result = await run('netstat', ['-ano', '-p', 'tcp'], { timeoutMs: 8000 })
    if (result.code !== 0) return null
    return parseNetstatPid(result.stdout, target)
  }
  const result = await run('/usr/sbin/lsof', ['-nP', `-iTCP:${target}`, '-sTCP:LISTEN', '-t'], { timeoutMs: 8000 })
  if (result.code !== 0) return null
  const pid = Number(result.stdout.trim().split('\n')[0])
  return Number.isInteger(pid) && pid > 0 ? pid : null
}

/** Parse a PID from `netstat -ano` output for a listening port. */
export function parseNetstatPid(output, port) {
  const target = Number(port)
  if (!Number.isInteger(target) || target <= 0) return null
  for (const line of String(output ?? '').split('\n')) {
    const match = /^\s*TCP\s+\S+:(\d+)\s+\S+\s+LISTENING\s+(\d+)/iu.exec(line)
    if (match === null) continue
    if (Number(match[1]) === target) return Number(match[2])
  }
  return null
}

/** Stop a PID using the platform's native mechanism. */
export async function killPid(pid, { force = false, group = false } = {}) {
  const target = Number(pid)
  if (!Number.isInteger(target) || target <= 0) return { ok: false, error: 'invalid-pid' }
  if (hostPlatform() === 'windows') {
    const args = ['/PID', String(target), '/T']
    if (force) args.push('/F')
    const result = await run('taskkill', args, { timeoutMs: 8000 })
    return result.code === 0 ? { ok: true } : { ok: false, error: result.stderr || `taskkill exit ${result.code}` }
  }
  try {
    process.kill(group ? -target : target, force ? 'SIGKILL' : 'SIGTERM')
    return { ok: true }
  } catch (error) {
    return { ok: false, error: String(error?.message ?? error) }
  }
}

/** npm executable name for the host platform. */
export function npmExecutable() {
  return hostPlatform() === 'windows' ? 'npm.cmd' : 'npm'
}

/** Cached QR image path derived from the NapCat config directory. */
export function napcatQrPath(detected) {
  if (typeof detected?.configDir === 'string' && detected.configDir !== '') {
    return join(detected.configDir, '..', 'cache', 'qrcode.png')
  }
  return expandHome('~/Library/Containers/com.tencent.qq/Data/Library/Application Support/QQ/NapCat/cache/qrcode.png')
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
