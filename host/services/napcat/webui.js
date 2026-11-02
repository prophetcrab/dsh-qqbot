/**
 * NapCat WebUI authentication, login probing and OneBot hot-apply.
 *
 * The WebUI credentials are cached for ten minutes; any 401 drops the cache.
 * Every network call goes through the manager's injectable `http` seam so unit
 * tests stay offline.
 */

import { dirname, join } from 'node:path'
import { fileMtime, maskToken, sha256Hex } from '../../platform/mac/index.js'
import {
  failure,
  firstString,
  isPlainObject,
  platformId,
  toBoolean,
  unwrapData,
  isSupportedPlatform,
} from './common.js'
import { detect } from './detect.js'

/** WebUI credentials are cached for ten minutes; any 401 drops the cache. */
export const CREDENTIAL_TTL_MS = 10 * 60 * 1000

/** Resolve `webui.json` for API calls. Returns null when no token is found. */
export async function webuiInfo(manager, detected = undefined) {
  const info = isPlainObject(detected) ? detected : detect(manager)
  const configDir = typeof info.configDir === 'string' && info.configDir !== '' ? info.configDir : null
  const candidates = configDir === null
    ? []
    : [join(configDir, 'webui.json'), join(dirname(configDir), 'webui.json')]
  for (const candidate of candidates) {
    const data = await manager.fs.readJson(candidate, null)
    if (isPlainObject(data) && typeof data.token === 'string' && data.token !== '') {
      return makeWebui(manager, data, data.port)
    }
  }
  const webui = info.webui
  if (isPlainObject(webui) && typeof webui.token === 'string' && webui.token !== '') {
    return makeWebui(manager, webui, webui.port)
  }
  return null
}

/** Normalize a webui descriptor. */
export function makeWebui(manager, source, portCandidate) {
  const port = Number.isInteger(portCandidate) ? portCandidate : manager.settings.napcatPort
  return { port, token: source.token, baseUrl: `http://127.0.0.1:${port}` }
}

/** Log in to the WebUI and return a cached credential (or null on failure). */
export async function credential(manager, webui) {
  const now = manager.now()
  const tokenHash = sha256Hex(webui.token)
  if (
    manager.auth !== null
    && manager.auth.port === webui.port
    && manager.auth.tokenHash === tokenHash
    && manager.auth.expiresAt > now
  ) {
    return manager.auth.credential
  }
  const response = await manager.http(`${webui.baseUrl}/api/auth/login`, {
    method: 'POST',
    body: { hash: sha256Hex(`${webui.token}.napcat`) },
    timeoutMs: 3000,
  })
  if (response?.ok !== true) {
    // status 0 means the connection failed; any HTTP status means the API is up.
    manager.webuiReachable = Number(response?.status) > 0
    return null
  }
  manager.webuiReachable = true
  const payload = unwrapData(response.data)
  const value = typeof payload?.Credential === 'string'
    ? payload.Credential
    : (typeof payload?.credential === 'string' ? payload.credential : null)
  if (value === null || value === '') return null
  manager.auth = { credential: value, port: webui.port, tokenHash, expiresAt: now + CREDENTIAL_TTL_MS }
  return value
}

/**
 * Probe NapCat login state; also reports whether the WebUI answered.
 * @returns {Promise<{ loggedIn: boolean, qq: string|null, nickname: string|null, reachable: boolean, port: number, tokenMasked: string|null, phase: string|null, qrUrl: string|null, coreReady: boolean }>}
 */
export async function loginProbe(manager, detected = undefined) {
  const info = isPlainObject(detected) ? detected : detect(manager)
  const webui = await webuiInfo(manager, info)
  const fallback = {
    loggedIn: false,
    qq: null,
    nickname: null,
    reachable: false,
    port: Number.isInteger(info?.webui?.port) ? info.webui.port : manager.settings.napcatPort,
    tokenMasked: null,
    phase: null,
    qrUrl: null,
    coreReady: false,
  }
  if (webui === null) return fallback
  fallback.port = webui.port
  fallback.tokenMasked = maskToken(webui.token)
  try {
    const value = await credential(manager, webui)
    if (value === null) return { ...fallback, reachable: manager.webuiReachable }
    const headers = { authorization: `Bearer ${value}` }
    const check = await manager.http(`${webui.baseUrl}/api/QQLogin/CheckLoginStatus`, {
      method: 'POST',
      headers,
      body: {},
      timeoutMs: 2500,
    })
    if (check?.ok !== true) {
      if (check?.status === 401 || check?.status === 403) manager.auth = null
      const reachable = Number(check?.status) > 0
      manager.webuiReachable = reachable
      return { ...fallback, reachable }
    }
    manager.webuiReachable = true
    const checkPayload = unwrapData(check.data)
    const loggedIn = toBoolean(checkPayload?.isLogin ?? checkPayload?.loggedIn)
    const extra = {
      phase: typeof checkPayload?.loginPhase === 'string' ? checkPayload.loginPhase : null,
      qrUrl: typeof checkPayload?.qrcodeurl === 'string' ? checkPayload.qrcodeurl : null,
      coreReady: checkPayload?.coreReady === true,
    }
    if (!loggedIn) return { ...fallback, reachable: true, ...extra }
    let qq = null
    let nickname = null
    const infoResponse = await manager.http(`${webui.baseUrl}/api/QQLogin/GetQQLoginInfo`, {
      method: 'POST',
      headers,
      body: {},
      timeoutMs: 2500,
    })
    if (infoResponse?.ok === true) {
      const loginInfo = unwrapData(infoResponse.data)
      qq = firstString(loginInfo, ['uin', 'user_id', 'userId', 'uid', 'qq'])
      nickname = firstString(loginInfo, ['nick', 'nickname', 'nickName', 'name'])
    }
    return { loggedIn: true, qq, nickname, reachable: true, port: webui.port, tokenMasked: maskToken(webui.token), ...extra }
  } catch (error) {
    manager.logger.warn('NapCat WebUI 探测失败: %s', String(error?.message ?? error))
    return fallback
  }
}

/** Read the QQ login state through the NapCat WebUI API. */
export async function loginStatus(manager) {
  try {
    const probe = await loginProbe(manager)
    return { loggedIn: probe.loggedIn, qq: probe.qq, nickname: probe.nickname }
  } catch (error) {
    manager.logger.warn('NapCat 登录状态读取失败: %s', String(error?.message ?? error))
    return { loggedIn: false, qq: null, nickname: null }
  }
}

/**
 * Login state for the panel: QR phase, cached QR image availability and the
 * logged-in account. Never throws.
 */
export async function loginState(manager) {
  try {
    const probe = await loginProbe(manager)
    const qrPath = manager.qrImagePath()
    const updatedAt = await fileMtime(qrPath)
    return {
      reachable: probe.reachable === true,
      loggedIn: probe.loggedIn === true,
      qq: probe.qq,
      nickname: probe.nickname,
      phase: probe.phase ?? null,
      qrUrl: probe.qrUrl ?? null,
      coreReady: probe.coreReady === true,
      webuiPort: probe.port,
      qrAvailable: updatedAt !== null,
      qrUpdatedAt: updatedAt,
    }
  } catch (error) {
    manager.logger.warn('NapCat 登录状态读取失败: %s', String(error?.message ?? error))
    return {
      reachable: false,
      loggedIn: false,
      qq: null,
      nickname: null,
      phase: null,
      qrUrl: null,
      coreReady: false,
      webuiPort: manager.settings.napcatPort,
      qrAvailable: false,
      qrUpdatedAt: null,
    }
  }
}

/** Hot-apply one account config through the WebUI `SetConfig` API. */
export async function hotApply(manager, webui, config, configPath) {
  try {
    const value = await credential(manager, webui)
    if (value === null) return false
    const response = await manager.http(`${webui.baseUrl}/api/OB11Config/SetConfig`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${value}`,
        'content-type': 'application/json',
      },
      body: { config: JSON.stringify(config) },
      timeoutMs: 10_000,
    })
    if (response?.ok !== true) {
      if (response?.status === 401 || response?.status === 403) manager.auth = null
      manager.logger.warn('NapCat WebUI 热应用失败 (%s): HTTP %s', configPath, response?.status ?? 0)
      return false
    }
    if (isPlainObject(response.data)) {
      if (typeof response.data.code === 'number' && response.data.code !== 0) return false
      if (response.data.ok === false) return false
    }
    return true
  } catch (error) {
    manager.logger.warn('NapCat WebUI 热应用异常 (%s): %s', configPath, String(error?.message ?? error))
    return false
  }
}

/** Ask NapCat's WebUI to refresh the login QR code. */
export async function refreshQr(manager) {
  if (!isSupportedPlatform(platformId(manager))) return failure('unsupported-platform', '当前平台暂不支持 NapCat 配置')
  try {
    const detected = detect(manager)
    const webui = await webuiInfo(manager, detected)
    if (webui === null) return failure('webui-unavailable', 'NapCat WebUI 不可达，请先启动 NapCat')
    const value = await credential(manager, webui)
    if (value === null) return failure('auth-failed', 'NapCat WebUI 认证失败')
    const response = await manager.http(`${webui.baseUrl}/api/QQLogin/RefreshQRcode`, {
      method: 'POST',
      headers: { authorization: `Bearer ${value}`, 'content-type': 'application/json' },
      body: {},
      timeoutMs: 10_000,
    })
    if (response?.ok !== true) {
      if (response?.status === 401 || response?.status === 403) manager.auth = null
      return failure('refresh-failed', `刷新二维码失败：HTTP ${response?.status ?? 0}`)
    }
    const payload = unwrapData(response.data)
    const qrUrl = typeof payload?.qrcodeurl === 'string' && payload.qrcodeurl !== '' ? payload.qrcodeurl : null
    manager.logger.info('NapCat 登录二维码已刷新')
    return { ok: true, qrUrl, message: '二维码已刷新' }
  } catch (error) {
    return failure('refresh-failed', `刷新二维码失败：${String(error?.message ?? error)}`)
  }
}
