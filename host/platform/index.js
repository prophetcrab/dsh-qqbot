/**
 * macOS host platform facade.
 *
 * Services and plugins import from here; the platform layer is the only place
 * that knows OS-specific paths/commands. Per ADR-0008 this branch carries the
 * macOS implementation only; `dshbot-win64` carries `host/platform/win/` and
 * `main` carries neither.
 */

import * as mac from './mac/index.js'

const impl = mac

export const DEFAULT_SETTINGS = impl.DEFAULT_SETTINGS
export const NAPCAT_INSTALL_DIR = impl.NAPCAT_INSTALL_DIR
export const NAPCAT_CONFIG_DIRS = impl.NAPCAT_CONFIG_DIRS
export const QQ_APP_PATH = impl.QQ_APP_PATH

export const resolveSettings = impl.resolveSettings
export const hostPlatform = impl.hostPlatform
export const platformInfo = impl.platformInfo
/** Kept for existing callers on the macOS branch. */
export const macInfo = impl.macInfo
/** Platform-neutral alias; prefer this name in new code. */
export const hostInfo = impl.hostInfo
export const detectQq = impl.detectQq
export const detectNapcat = impl.detectNapcat
export const detectKoishiProject = impl.detectKoishiProject
export const napcatQrPath = impl.napcatQrPath

export const expandHome = impl.expandHome
export const existsSync = impl.existsSync
export const ensureDir = impl.ensureDir
export const readText = impl.readText
export const readJson = impl.readJson
export const writeFileAtomic = impl.writeFileAtomic
export const directoryExists = impl.directoryExists
export const sha256Hex = impl.sha256Hex
export const findCommand = impl.findCommand
export const maskToken = impl.maskToken
export const sleep = impl.sleep
export const RingLog = impl.RingLog
export const readdir = impl.readdir
export const fileMtime = impl.fileMtime

export const run = impl.run
export const runShell = impl.runShell
export const findProcess = impl.findProcess
export const portPid = impl.portPid
export const killPid = impl.killPid
export const npmExecutable = impl.npmExecutable
export const npmCommand = impl.npmCommand
export const launchDetached = impl.launchDetached

export const httpJson = impl.httpJson

export const dataPaths = impl.dataPaths
export const migrateDataLayout = impl.migrateDataLayout

/**
 * Offline `node_modules` bundle key for the current platform/arch
 * (`darwin-arm64`, ...).
 *
 * @param {string} [platform] Node's `process.platform` value
 * @param {string} [arch] Node's `process.arch` value
 * @returns {string}
 */
export function bundleKey(platform = process.platform, arch = process.arch) {
  return `${platform}-${arch}`
}
