/**
 * NapCat installation and process lifecycle.
 *
 * This macOS build installs NapCat strictly from the bundled offline payload
 * and never downloads it. Start/stop poll the WebUI login state so a QR-scan
 * timeout is not a hard failure.
 */

import { QQ_APP_PATH } from '../../platform/mac/index.js'
import {
  UNSUPPORTED_CONTROL,
  UNSUPPORTED_INSTALL,
  failure,
  isSupportedPlatform,
  platformId,
  runDetail,
} from './common.js'
import { detect, detectQq, processInfo } from './detect.js'
import { autoConfigure } from './configure.js'
import { defaultVendorDir, installMacOffline } from './offline.js'

/** Delay between poll iterations for start/stop. */
export const POLL_INTERVAL_MS = 500
/** How long `stop()` waits for a graceful SIGTERM exit before escalating. */
export const STOP_TIMEOUT_MS = 10_000
/** How long `stop()` waits after SIGKILL before declaring failure. */
export const SIGKILL_GRACE_MS = 2_000
/** Default login wait for `start()`. */
export const START_TIMEOUT_MS = 30_000

/**
 * Install NapCat from the bundled `vendor/napcat` payload. A missing/invalid
 * bundle fails closed instead of downloading anything.
 */
export async function install(manager) {
  if (platformId(manager) !== 'macos') return failure('unsupported-platform', UNSUPPORTED_INSTALL)
  const vendorDir = manager.settings.offlineVendorDir !== '' ? manager.settings.offlineVendorDir : defaultVendorDir()
  const pinned = manager.settings.offlineNapcatVersion
  try {
    const result = await installMacOffline({
      vendorDir,
      appPath: manager.settings.qqPath !== '' ? manager.settings.qqPath : QQ_APP_PATH,
      ...(pinned === '' ? {} : { version: pinned }),
      run: manager.run,
      logger: manager.logger,
    })
    if (result.ok !== true) return result
    const configured = await autoConfigure(manager)
    return {
      ok: true,
      offline: true,
      installDir: result.installDir,
      version: result.version,
      reused: result.reused === true,
      configured,
      message: configured
        ? 'NapCat 已从离线包安装并写入 OneBot 配置，请启动并扫码登录'
        : 'NapCat 已从离线包安装，登录 QQ 后将自动写入 OneBot 配置',
    }
  } catch (error) {
    return failure('offline-failed', `离线安装 NapCat 失败：${String(error?.message ?? error)}`)
  }
}

/**
 * Launch NapCat and wait until it reports a logged-in QQ account.
 *
 * macOS: `open -n -a QQ.app --args --no-sandbox`; the `--no-sandbox` argument
 * is what makes QQ's `loadNapCat.js` entry load NapCat.
 */
export async function start(manager, options = {}) {
  const requestedTimeout = Number(options?.timeoutMs)
  const timeoutMs = Number.isFinite(requestedTimeout) && requestedTimeout > 0 ? requestedTimeout : START_TIMEOUT_MS
  try {
    const platform = platformId(manager)
    if (!isSupportedPlatform(platform)) return failure('unsupported-platform', UNSUPPORTED_CONTROL)
    const qq = detectQq(manager)

    // Already up (logged in or waiting for a QR scan): never launch a second
    // instance, just report the current state.
    const probeBefore = await manager.loginStatus()
    if (probeBefore.loggedIn === true) {
      return {
        ok: true,
        alreadyRunning: true,
        loggedIn: true,
        qq: probeBefore.qq,
        nickname: probeBefore.nickname,
        message: `NapCat 已在运行${probeBefore.qq ? `（QQ ${probeBefore.qq}）` : ''}`,
      }
    }
    if (manager.webuiReachable === true) {
      return {
        ok: true,
        alreadyRunning: true,
        loggedIn: false,
        timedOut: true,
        qq: null,
        nickname: null,
        message: 'NapCat 已在运行，请在 QQ 窗口中完成扫码登录',
      }
    }

    const started = await startMac(manager, timeoutMs, qq)
    if (started?.ok === true && started.loggedIn === true && await autoConfigure(manager)) {
      started.configured = true
    }
    return started
  } catch (error) {
    return failure('start-failed', `启动 NapCat 失败：${String(error?.message ?? error)}`)
  }
}

/**
 * Stop the QQ process: SIGTERM first, then SIGKILL after the grace period.
 */
export async function stop(manager, options = {}) {
  const requestedTimeout = Number(options?.timeoutMs)
  const timeoutMs = Number.isFinite(requestedTimeout) && requestedTimeout > 0 ? requestedTimeout : STOP_TIMEOUT_MS
  try {
    if (platformId(manager) !== 'macos') return failure('unsupported-platform', UNSUPPORTED_CONTROL)
    const initial = processInfo(manager)
    if (initial.running !== true) {
      return { ok: true, alreadyStopped: true, message: 'NapCat 未在运行' }
    }
    const pid = Number.isInteger(initial.pid) ? initial.pid : null
    if (pid === null) return failure('pid-not-found', '未能获取 NapCat 进程号')
    return await stopMac(manager, pid, timeoutMs)
  } catch (error) {
    return failure('stop-failed', `停止 NapCat 失败：${String(error?.message ?? error)}`)
  }
}

/** macOS launch path: `open -n -a QQ.app --args --no-sandbox`, then poll login. */
export async function startMac(manager, timeoutMs, qq) {
  if (qq.installed !== true) return failure('qq-not-installed', '未找到 QQ.app，请先安装 QQ')
  const appPath = typeof qq.path === 'string' && qq.path !== '' ? qq.path : QQ_APP_PATH
  const running = processInfo(manager)
  const args = running.running === true
    ? ['-n', '-a', appPath, '--args', '--no-sandbox']
    : ['-a', appPath, '--args', '--no-sandbox']
  const opened = await manager.run('/usr/bin/open', args, { timeoutMs: 20_000 })
  if (opened.code !== 0) {
    const detail = runDetail(opened)
    return failure('open-failed', `启动 QQ 失败${detail === '' ? '' : `：${detail}`}`)
  }
  return waitForLogin(manager, timeoutMs)
}

/** Poll `loginStatus()` until logged in or timed out (timeout is not a hard failure). */
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

/** macOS stop path: SIGTERM -> SIGKILL. */
export async function stopMac(manager, pid, timeoutMs) {
  const termError = kill(manager, pid, 'SIGTERM')
  if (termError !== null && termError.code !== 'ESRCH') {
    return failure('kill-failed', `无法结束 NapCat 进程：${String(termError.message ?? termError)}`)
  }
  if (termError !== null || await waitForExit(manager, pid, timeoutMs)) {
    manager.logger.info('NapCat 已停止 (pid %d)', pid)
    return { ok: true, pid, message: 'NapCat 已停止' }
  }
  manager.logger.warn('NapCat 未在 %dms 内退出，发送 SIGKILL (pid %d)', timeoutMs, pid)
  const killError = kill(manager, pid, 'SIGKILL')
  if (killError !== null && killError?.code !== 'ESRCH') {
    return failure('kill-failed', `无法强制结束 NapCat 进程：${String(killError?.message ?? killError)}`)
  }
  if (killError === null && await waitForExit(manager, pid, SIGKILL_GRACE_MS)) {
    manager.logger.info('NapCat 已强制停止 (pid %d)', pid)
    return { ok: true, pid, forced: true, message: 'NapCat 已强制停止' }
  }
  return failure('kill-failed', 'NapCat 进程未能在超时内退出')
}

/** Poll until the QQ process disappears (or the timeout elapses). */
export async function waitForExit(manager, pid, timeoutMs) {
  const deadline = manager.now() + timeoutMs
  while (manager.now() < deadline) {
    const info = processInfo(manager)
    if (info.running !== true) return true
    if (Number.isInteger(info.pid) && info.pid !== pid) return true
    await manager.sleep(POLL_INTERVAL_MS)
  }
  const finalInfo = processInfo(manager)
  return finalInfo.running !== true || (Number.isInteger(finalInfo.pid) && finalInfo.pid !== pid)
}

/** Send a signal to a pid without throwing. */
export function kill(manager, pid, signal) {
  try {
    manager.processKill(pid, signal)
    return null
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error))
  }
}

/** Re-exported for callers that only need detection. */
export { detect }
