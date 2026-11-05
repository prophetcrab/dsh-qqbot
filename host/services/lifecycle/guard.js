/**
 * DSH lifecycle guard: keep the bot tied to this DSH host process.
 *
 * A detached watchdog polls the host PID and, when DSH exits (including a hard
 * kill), stops the NapCat container and kills this project's Koishi processes.
 * On a normal plugin unload the guard also stops those services eagerly.
 */

import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { hostPlatform } from '../../platform/index.js'

const WATCHDOG_SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'watchdog.mjs')

/** @type {import('node:child_process').ChildProcess|null} */
let current = null

/** Compose file path for the Docker backend's generated data dir. */
function composePathFor(settings) {
  const dataDir = typeof settings.dockerNapcatDataDir === 'string' && settings.dockerNapcatDataDir !== ''
    ? settings.dockerNapcatDataDir
    : join(settings.projectDir, 'runtime', 'napcat-docker')
  return join(dataDir, 'compose.yaml')
}

/**
 * Start the lifecycle watchdog (idempotent).
 *
 * @param {object} settings resolved plugin settings
 * @param {{ spawn?: Function }} [deps] test seam
 * @returns {import('node:child_process').ChildProcess|null}
 */
export function startLifecycleWatchdog(settings = {}, deps = {}) {
  if (settings.lifecycleGuard === false) return null
  if (current !== null && current.killed !== true) return current
  const spawnFn = typeof deps.spawn === 'function' ? deps.spawn : spawn
  const config = {
    parentPid: process.pid,
    projectDir: settings.projectDir,
    // The watchdog is a standalone script; hand it the platform id so the OS
    // check stays inside the platform layer.
    platform: hostPlatform(),
    composePath: composePathFor(settings),
  }
  let child
  try {
    child = spawnFn(process.execPath, [WATCHDOG_SCRIPT], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      env: {
        ...process.env,
        // The DSH desktop host is Electron; the watchdog must run as Node.
        ELECTRON_RUN_AS_NODE: '1',
        DSH_QQBOT_WATCHDOG: JSON.stringify(config),
      },
    })
  } catch {
    return null
  }
  if (child === null || child === undefined) return null
  if (typeof child.unref === 'function') child.unref()
  current = child
  return child
}

/**
 * Stop the watchdog (used when the plugin unloads after services are stopped).
 *
 * @param {import('node:child_process').ChildProcess|null} [child]
 */
export function stopLifecycleWatchdog(child = current) {
  if (child === null || child === undefined) return
  if (current === child) current = null
  try {
    if (typeof child.kill === 'function') child.kill()
  } catch {
    // already gone
  }
}
