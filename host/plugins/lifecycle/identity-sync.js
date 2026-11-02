/**
 * Keep Koishi's OneBot selfId aligned with the QQ account NapCat is logged in
 * as. Switching QQ accounts otherwise leaves Koishi permanently "offline":
 * the reverse WebSocket connects, but adapter-onebot only accepts its
 * configured selfId.
 *
 * The watcher runs every 15 seconds, writes `koishi.yml` on a mismatch and
 * restarts Koishi when it is already running. A single in-flight flag prevents
 * overlapping status probes / restarts.
 */

const POLL_MS = 15_000

/**
 * Run one identity check. Exported for tests.
 *
 * @param {object} api plugin API
 * @returns {Promise<{ checked: boolean, changed?: boolean, restarted?: boolean, reason?: string }>}
 */
export async function syncKoishiIdentity(api) {
  if (api.settings.autoSyncSelfId === false) return { checked: false, reason: 'disabled' }
  const napcat = api.get('napcat')
  const koishi = api.get('koishi')
  const setup = api.get('setup')
  if (napcat === undefined || koishi === undefined || setup === undefined) {
    return { checked: false, reason: 'services-unavailable' }
  }
  try {
    const login = await napcat.loginState()
    if (login?.loggedIn !== true || typeof login.qq !== 'string' || login.qq === '') {
      return { checked: false, reason: 'qq-not-logged-in' }
    }
    const current = await setup.getKoishiSelfId()
    if (current.ok !== true || current.selfId === login.qq) {
      return { checked: true, changed: false }
    }
    const updated = await setup.setKoishiSelfId(login.qq)
    if (updated.ok !== true) {
      api.logger.warn('自动同步 Koishi selfId 失败：%s', updated.error ?? 'unknown')
      return { checked: true, changed: false, reason: 'write-failed' }
    }
    api.logger.info('检测到 QQ 账号切换：Koishi selfId %s → %s', current.selfId ?? '?', login.qq)
    const status = await koishi.status().catch(() => null)
    if (status?.running === true) {
      const restarted = await koishi.restart()
      api.logger.info('Koishi 已按新 selfId %s 重启：%s', login.qq, restarted?.ok !== false ? 'ok' : restarted?.error ?? 'failed')
      return { checked: true, changed: true, restarted: restarted?.ok !== false }
    }
    return { checked: true, changed: true, restarted: false }
  } catch (error) {
    api.logger.warn('自动同步 Koishi selfId 异常：%s', String(error?.message ?? error))
    return { checked: false, reason: 'exception' }
  }
}

/**
 * Start the periodic watcher and return its disposer.
 * @param {object} api plugin API
 */
export function installIdentitySync(api) {
  let running = false
  const tick = async () => {
    if (running) return
    running = true
    try {
      await syncKoishiIdentity(api)
    } finally {
      running = false
    }
  }
  void tick()
  const timer = setInterval(() => { void tick() }, POLL_MS)
  timer.unref?.()
  return () => clearInterval(timer)
}
