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

/** macOS defaults to the local QQ.app patched client. */
export const DEFAULT_SETTINGS = { ...BASE_SETTINGS, napcatBackend: 'local' }

/** Merge row config over the macOS defaults. */
export function resolveSettings(raw = {}) {
  return resolveSettingsCommon(raw, DEFAULT_SETTINGS)
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
 * Inspect NapCat's installation and runtime configuration inside the QQ container.
 *
 * @param {typeof DEFAULT_SETTINGS} settings
 */
export function detectNapcat(settings = {}) {
  const installDir = typeof settings.napcatDir === 'string' && settings.napcatDir !== ''
    ? settings.napcatDir
    : firstExisting([expandHome(NAPCAT_INSTALL_DIR)], (path) => fsExistsSync(path))
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

/** Cached QR image path derived from the NapCat config directory. */
export function napcatQrPath(detected) {
  if (typeof detected?.configDir === 'string' && detected.configDir !== '') {
    return join(detected.configDir, '..', 'cache', 'qrcode.png')
  }
  return expandHome('~/Library/Containers/com.tencent.qq/Data/Library/Application Support/QQ/NapCat/cache/qrcode.png')
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

/** First existing path from a list, or null. */
function firstExisting(paths, predicate) {
  for (const path of paths) {
    if (predicate(path)) return path
  }
  return null
}
