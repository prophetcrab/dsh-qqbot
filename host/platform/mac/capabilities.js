/**
 * macOS environment capabilities: shared settings plus Apple-specific detection.
 */

import { execFileSync } from 'node:child_process'
import { existsSync as fsExistsSync, readFileSync } from 'node:fs'
import { release } from 'node:os'
import { join } from 'node:path'
import { existsSync, expandHome } from './paths.js'
import {
  BASE_SETTINGS,
  detectKoishiProject,
  hostPlatform,
  platformInfo,
  readAccounts,
  readNapcatVersion,
  readWebui,
  resolveSettings as resolveSettingsCommon,
} from '../common/settings.js'

export { detectKoishiProject, hostPlatform, platformInfo }

/** macOS now uses the Docker NapCat backend; local QQ is not patched. */
export const DEFAULT_SETTINGS = { ...BASE_SETTINGS, napcatBackend: 'docker' }

/** Merge row config over the macOS defaults. */
export function resolveSettings(raw = {}) {
  return resolveSettingsCommon(raw, DEFAULT_SETTINGS)
}

/** NapCat installation root on macOS (inside the QQ container). */
export const NAPCAT_INSTALL_DIR = ''

/** NapCat runtime configuration directories, most specific first. */
export const NAPCAT_CONFIG_DIRS = []

/** QQ application bundle path on macOS. */
export const QQ_APP_PATH = '/Applications/QQ.app'

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

/** Platform-neutral alias; prefer this name in new code. */
export const hostInfo = macInfo

/**
 * Detect QQ.app on macOS. `settings.qqPath` overrides /Applications/QQ.app.
 *
 * @param {{ qqPath?: string }} [settings]
 */
export function detectQq(settings = {}) {
  const path = typeof settings.qqPath === 'string' && settings.qqPath !== '' ? settings.qqPath : expandHome(QQ_APP_PATH)
  if (!existsSync(path)) return { installed: false, path: null, version: null }
  return { installed: true, path, version: readQqVersion(path) }
}

/**
 * Docker-only build: only an explicitly configured local NapCat directory is
 * reported, for diagnostics. Docker state is owned by DockerNapcatManager.
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
  return {
    installed: true,
    installDir,
    configDir,
    version: readNapcatVersion(installDir),
    accounts: configDir === null ? [] : readAccounts(configDir),
    webui: readWebui(configDir, settings?.napcatPort ?? DEFAULT_SETTINGS.napcatPort),
  }
}

/** Cached QR image path derived from the NapCat config directory. */
export function napcatQrPath(detected) {
  if (typeof detected?.configDir === 'string' && detected.configDir !== '') {
    return join(detected.configDir, '..', 'cache', 'qrcode.png')
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
