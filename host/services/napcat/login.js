/**
 * Shared NapCat login polling used by the Docker backend.
 *
 * A QR-scan timeout is not a hard failure: the container is up and the user can
 * finish login from the panel.
 */

/** Poll interval while waiting for a login. */
export const POLL_INTERVAL_MS = 500
/** Default login wait for `start()`. */
export const START_TIMEOUT_MS = 30_000
/** Default stop timeout. */
export const STOP_TIMEOUT_MS = 10_000

/** Poll `loginStatus()` until logged in or timed out. */
export async function waitForLogin(manager, timeoutMs) {
  const deadline = manager.now() + timeoutMs
  let probe = await manager.loginStatus()
  while (probe.loggedIn !== true && manager.now() < deadline) {
    await manager.sleep(POLL_INTERVAL_MS)
    probe = await manager.loginStatus()
  }
  if (probe.loggedIn === true) {
    manager.logger.info('NapCat 已启动并登录 QQ %s', probe.qq ?? '')
    return {
      ok: true,
      loggedIn: true,
      qq: probe.qq,
      nickname: probe.nickname,
      message: `NapCat 已启动${probe.qq ? `（QQ ${probe.qq}）` : ''}`,
    }
  }
  manager.logger.warn('QQ 已启动，%dms 内未检测到登录，等待用户扫码', timeoutMs)
  return {
    ok: true,
    loggedIn: false,
    timedOut: true,
    qq: null,
    nickname: null,
    message: 'NapCat 已启动，请在 QQ 窗口中完成扫码登录',
  }
}
