/**
 * Read-only Koishi status and health probes.
 *
 * Kept out of the manager class so process lifecycle and HTTP state stay
 * separate concerns.
 */

import { detectKoishiProject } from '../../platform/index.js'
import { HEALTH_PATH, pickBot, refreshManagedPid, requestJson } from './helpers.js'

/**
 * Panel snapshot for the Koishi service.
 *
 * @param {object} manager
 */
export async function koishiStatus(manager) {
  const project = detectKoishiProject(manager.settings)
  await refreshManagedPid(manager)
  const base = {
    projectDir: project.projectDir,
    exists: project.exists,
    hasPackageJson: project.hasPackageJson,
    depsInstalled: project.hasNodeModules,
    running: false,
    managed: manager.isManaged(),
    pid: manager.managedPid,
    port: manager.port,
    online: false,
    selfId: null,
    platform: null,
    stats: null,
    logs: manager.logs(30),
  }
  if (!project.exists) {
    return { ...base, logs: [], error: `Koishi 项目不存在：${project.projectDir}` }
  }

  const health = await manager.health()
  const bot = pickBot(health.bots)
  let running = health.reachable === true
  let pid = manager.managedPid
  if (pid === null) {
    const found = await manager.findPortPid(manager.port)
    if (found !== null) {
      pid = found
      running = true
    }
  } else {
    running = true
  }

  return {
    ...base,
    running,
    managed: manager.isManaged(),
    pid,
    online: health.ok,
    selfId: bot.selfId,
    platform: bot.platform,
    stats: health.stats,
    logs: manager.logs(30),
  }
}

/**
 * Probe the Koishi health endpoint.
 *
 * @param {object} manager
 * @param {{ timeoutMs?: number }} [options]
 */
export async function koishiHealth(manager, { timeoutMs = manager.healthTimeoutMs } = {}) {
  const url = `http://127.0.0.1:${manager.port}${HEALTH_PATH}`
  const result = await requestJson(manager, url, { timeoutMs })
  if (result.ok !== true) {
    return {
      ok: false,
      reachable: false,
      bots: null,
      stats: null,
      error: result.error ?? `健康检查失败（HTTP ${result.status}）`,
    }
  }
  const data = result.data
  const isObject = data !== null && typeof data === 'object'
  return {
    ok: isObject && data.ok === true,
    reachable: true,
    bots: isObject && Array.isArray(data.bots) ? data.bots : null,
    stats: isObject && data.stats !== null && typeof data.stats === 'object' ? data.stats : null,
  }
}
