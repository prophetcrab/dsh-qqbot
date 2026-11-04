/**
 * Windows environment capabilities: shared settings plus Windows-specific
 * detection. NapCat/QQ run in Docker; local detection is read-only and only
 * used for diagnostics.
 */

import { existsSync as fsExistsSync } from 'node:fs'
import { release } from 'node:os'
import { join } from 'node:path'
import { existsSync } from './paths.js'
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

/** Windows always uses the Docker backend. */
export const DEFAULT_SETTINGS = { ...BASE_SETTINGS, napcatBackend: 'docker' }

/** Merge row config over the Windows defaults. */
export function resolveSettings(raw = {}) {
  return resolveSettingsCommon(raw, DEFAULT_SETTINGS)
}

/** NapCat installation root on Windows (read-only diagnostics only). */
export const NAPCAT_INSTALL_DIR = ''

/** NapCat runtime configuration directories (Windows local installs are explicit). */
export const NAPCAT_CONFIG_DIRS = []

/** Default QQNT executable path on Windows. */
export const QQ_APP_PATH = 'C:\\Program Files\\Tencent\\QQNT\\QQ.exe'

/** Current Windows/host facts. */
export function hostInfo() {
  return {
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
  const bases = [
    process.env.ProgramFiles,
    process.env.ProgramW6432,
    process.env['ProgramFiles(x86)'],
    process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'Programs') : null,
  ]
  for (const base of bases) {
    if (typeof base !== 'string' || base === '') continue
    for (const candidate of [
      join(base, 'Tencent', 'QQNT', 'QQ.exe'),
      join(base, 'Tencent', 'QQ', 'QQ.exe'),
    ]) {
      if (existsSync(candidate)) return { installed: true, path: candidate, version: null }
    }
  }
  return { installed: false, path: null, version: null }
}

/**
 * Inspect a manually configured Windows NapCat directory. The recommended
 * Windows deployment is the Docker backend; this is read-only reporting.
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
