/**
 * OneBot reverse-WebSocket configuration for NapCat accounts.
 *
 * Writes the managed `koishi` client into every `<uin>` config and hot-applies
 * it through the WebUI when possible; the files are always written first.
 */

import {
  failure,
  isPlainObject,
  isSupportedPlatform,
  platformId,
  safeReadJson,
} from './common.js'
import { WS_CLIENT_NAME, upsertWebsocketClient } from './onebot-config.js'
import { detect, websocketUrl, resolveAccounts } from './detect.js'
import { hotApply, webuiInfo } from './webui.js'

/**
 * Write the OneBot reverse WebSocket client into every account config and
 * hot-apply it through the NapCat WebUI API.
 *
 * @param {{ uin?: string }} [options]
 */
export async function configure(manager, options = {}) {
  if (options !== null && typeof options !== 'object') throw new TypeError('configure options must be an object')
  const requested = options?.uin
  const uin = typeof requested === 'string'
    ? requested.trim()
    : (typeof requested === 'number' && Number.isFinite(requested) ? String(requested) : '')
  try {
    if (!isSupportedPlatform(platformId(manager))) return failure('unsupported-platform', '当前平台暂不支持 NapCat 配置')
    const detected = detect(manager)
    const configDir = typeof detected.configDir === 'string' && detected.configDir !== '' ? detected.configDir : null
    if (configDir === null) {
      return failure('napcat-config-missing', '未找到 NapCat 配置目录，请先安装 NapCat 并登录 QQ')
    }
    const selected = await resolveAccounts(manager, detected, configDir, uin)
    if (selected.ok !== true) return selected

    const url = websocketUrl(manager)
    const webui = await webuiInfo(manager, detected)
    const accounts = []
    let hardFailures = 0
    for (const account of selected.accounts) {
      const current = await safeReadJson(manager, account.configPath)
      if (current === null) {
        hardFailures += 1
        accounts.push({ uin: account.uin, path: account.configPath, changed: false, applied: false, error: 'invalid-config' })
        continue
      }
      const { config, changed } = upsertWebsocketClient(current, {
        url,
        name: WS_CLIENT_NAME,
        token: manager.settings.napcatToken,
      })
      if (changed) {
        try {
          await manager.fs.writeFileAtomic(account.configPath, `${JSON.stringify(config, null, 2)}\n`)
        } catch (error) {
          hardFailures += 1
          manager.logger.warn('NapCat 配置写入失败 (%s): %s', account.configPath, String(error?.message ?? error))
          accounts.push({ uin: account.uin, path: account.configPath, changed: false, applied: false, error: 'write-failed' })
          continue
        }
      }
      const applied = webui === null ? false : await hotApply(manager, webui, config, account.configPath)
      accounts.push({ uin: account.uin, path: account.configPath, changed, applied })
    }

    let message
    if (accounts.length === 0) {
      message = '没有可配置的 QQ 账号'
    } else if (hardFailures > 0) {
      message = '部分账号的 NapCat 配置写入失败，请检查配置目录权限'
    } else if (accounts.every((account) => account.applied)) {
      message = `已写入并热应用 ${accounts.length} 个账号的 OneBot 配置`
    } else {
      message = '已写入文件，重启 NapCat 生效'
    }
    manager.logger.info('NapCat OneBot 配置: %s', message)
    return { ok: accounts.length > 0 && hardFailures === 0, accounts, message }
  } catch (error) {
    const message = String(error?.message ?? error)
    manager.logger.error('NapCat 配置失败: %s', message)
    return failure('configure-failed', `写入 NapCat 配置失败：${message}`)
  }
}

/**
 * Write the OneBot reverse-WS config once a QQ account exists. Used after an
 * offline install and after a successful login; safe to call repeatedly.
 * @returns {Promise<boolean>} whether the config was applied.
 */
export async function autoConfigure(manager) {
  try {
    const detected = detect(manager)
    const accounts = Array.isArray(detected.accounts) ? detected.accounts : []
    if (accounts.length === 0) return false
    const result = await configure(manager)
    return result?.ok === true
  } catch {
    return false
  }
}
