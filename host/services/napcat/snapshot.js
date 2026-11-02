/**
 * Read-only NapCat snapshot used by `/qqbot/status` and the feature cards.
 */

import {
  UNSUPPORTED_STATUS,
  isSupportedPlatform,
  platformId,
} from './common.js'
import { accountStatuses, detect, processInfo } from './detect.js'
import { loginProbe } from './webui.js'

/**
 * Full read-only snapshot for the panel. Never throws: a failure is reported
 * through `error` and the remaining fields keep empty defaults.
 */
export async function status(manager) {
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
    webui: { port: manager.settings.napcatPort, tokenMasked: null, reachable: false },
    accounts: [],
    configApplied: false,
  }
  try {
    if (!isSupportedPlatform(platformId(manager))) {
      status.error = UNSUPPORTED_STATUS
      return status
    }
    const detected = detect(manager)
    status.installed = detected.installed === true
    status.installDir = typeof detected.installDir === 'string' ? detected.installDir : null
    status.configDir = typeof detected.configDir === 'string' ? detected.configDir : null
    status.version = typeof detected.version === 'string' ? detected.version : null

    const info = processInfo(manager)
    const probe = await loginProbe(manager, detected)
    status.running = info.running === true || probe.reachable === true
    status.pid = Number.isInteger(info.pid) ? info.pid : null
    status.loggedIn = probe.loggedIn
    status.qq = probe.qq
    status.nickname = probe.nickname
    status.webui = {
      port: probe.port,
      tokenMasked: probe.tokenMasked,
      reachable: probe.reachable,
    }

    status.accounts = await accountStatuses(manager, detected)
    status.configApplied = status.accounts.length > 0 && status.accounts.every((account) => account.applied)
  } catch (error) {
    status.error = String(error?.message ?? error)
    manager.logger.warn('NapCat 状态检测失败: %s', status.error)
  }
  return status
}
