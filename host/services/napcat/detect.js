/**
 * Read-only NapCat detection and snapshot helpers.
 *
 * Each function receives the manager instance (a deliberate, tiny "self" seam)
 * so the public class stays a thin dispatcher and every probe is testable.
 */

import { dirname, join } from 'node:path'
import { expandHome } from '../../platform/mac/index.js'
import { failure, isPlainObject } from './common.js'
import { WS_CLIENT_NAME, QQ_EXECUTABLE, listWebsocketClients } from './onebot-config.js'

/** `ws://127.0.0.1:<koishiPort><reversePath>` expected by Koishi. */
export function websocketUrl(manager) {
  return `ws://127.0.0.1:${manager.settings.koishiPort}${manager.settings.reversePath}`
}

/** Safe wrapper around the injected platform detector. */
export function detect(manager) {
  try {
    const detected = manager.platform.detectNapcat(manager.settings)
    return isPlainObject(detected) ? detected : {}
  } catch (error) {
    manager.logger.warn('NapCat 检测失败: %s', String(error?.message ?? error))
    return {}
  }
}

/** Safe wrapper around the injected QQ detector. */
export function detectQq(manager) {
  try {
    const qq = manager.platform.detectQq(manager.settings)
    return isPlainObject(qq) ? qq : { installed: false, path: null, version: null }
  } catch {
    return { installed: false, path: null, version: null }
  }
}

/**
 * Process command-line fragment used to find the running NapCat client.
 * Only the QQ executable is matched: a plain desktop QQ instance must never be
 * picked up by status or stop.
 */
export function processPattern() {
  return QQ_EXECUTABLE
}

/** Safe wrapper around the injected process finder. */
export function processInfo(manager) {
  try {
    const found = manager.platform.findProcess(processPattern())
    return isPlainObject(found) ? found : { running: false, pid: null }
  } catch {
    return { running: false, pid: null }
  }
}

/** Per-account config summary for `status()`. */
export async function accountStatuses(manager, detected) {
  const configDir = typeof detected.configDir === 'string' && detected.configDir !== '' ? detected.configDir : null
  const expectedUrl = websocketUrl(manager)
  const rawAccounts = Array.isArray(detected.accounts) ? detected.accounts : []
  const accounts = []
  for (const account of rawAccounts) {
    if (!isPlainObject(account) || typeof account.uin !== 'string' || account.uin === '') continue
    const configPath = typeof account.configPath === 'string' && account.configPath !== ''
      ? account.configPath
      : (configDir === null ? '' : join(configDir, `onebot11_${account.uin}.json`))
    if (configPath === '') continue
    const config = await manager.fs.readJson(configPath, null)
    const wsClients = listWebsocketClients(isPlainObject(config) ? config : null)
    const applied = wsClients.some((client) => client.name === WS_CLIENT_NAME && client.url === expectedUrl)
    accounts.push({ uin: account.uin, configPath, wsClients, applied })
  }
  return accounts
}

/**
 * Path of NapCat's cached login QR image; delegates to the platform helper,
 * then falls back to the container cache path.
 */
export function qrImagePath(manager) {
  const detected = detect(manager)
  try {
    const resolved = manager.platform.napcatQrPath(detected)
    if (typeof resolved === 'string' && resolved !== '') return resolved
  } catch (error) {
    manager.logger.warn('NapCat 二维码路径解析失败: %s', String(error?.message ?? error))
  }
  const configDir = typeof detected?.configDir === 'string' ? detected.configDir : ''
  if (configDir !== '') return join(dirname(configDir), 'cache', 'qrcode.png')
  return expandHome('~/Library/Containers/com.tencent.qq/Data/Library/Application Support/QQ/NapCat/cache/qrcode.png')
}

/** Select the accounts to configure. */
export async function resolveAccounts(manager, detected, configDir, uin) {
  const rawAccounts = Array.isArray(detected.accounts) ? detected.accounts : []
  const accounts = []
  for (const account of rawAccounts) {
    if (!isPlainObject(account) || typeof account.uin !== 'string' || account.uin === '') continue
    const configPath = typeof account.configPath === 'string' && account.configPath !== ''
      ? account.configPath
      : join(configDir, `onebot11_${account.uin}.json`)
    accounts.push({ uin: account.uin, configPath })
  }
  if (uin !== '') {
    const matched = accounts.filter((account) => account.uin === uin)
    if (matched.length > 0) return { ok: true, accounts: matched }
    // The detector may miss a config created moments ago; check the file directly.
    const explicit = join(configDir, `onebot11_${uin}.json`)
    if (await manager.fs.readJson(explicit, null) !== null) {
      return { ok: true, accounts: [{ uin, configPath: explicit }] }
    }
    return failure('account-not-found', `未找到 QQ 账号 ${uin} 的 NapCat 配置，请先在 NapCat 中登录该账号`)
  }
  if (accounts.length === 0) {
    return failure('no-accounts', '未发现 QQ 账号，请先登录 QQ 并完成 NapCat 安装')
  }
  return { ok: true, accounts }
}
