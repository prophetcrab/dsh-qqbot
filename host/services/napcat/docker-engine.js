/**
 * Docker engine lifecycle for the OrbStack-backed NapCat backend.
 *
 * OrbStack is the supported macOS engine for this branch: the plugin probes
 * `docker info`, launches OrbStack when `dockerAutoStart` is enabled, then
 * polls until the engine is ready. All side effects stay behind the injected
 * `run` / `launch` / `sleep` seams so tests never start a GUI app.
 */

import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { failure } from './common.js'

const ENGINE_INFO_TIMEOUT_MS = 15_000
const ENGINE_POLL_MS = 2_000

/** Candidate OrbStack app bundles, in probe order. */
const ORBSTACK_CANDIDATES = [
  '/Applications/OrbStack.app',
  join(homedir(), 'Applications/OrbStack.app'),
]

function orbstackPath(settings) {
  const configured = typeof settings.dockerDesktopPath === 'string' ? settings.dockerDesktopPath.trim() : ''
  if (configured !== '') return configured
  return ORBSTACK_CANDIDATES.find((candidate) => existsSync(candidate)) ?? null
}

/**
 * Ensure a reachable Docker engine, launching OrbStack when allowed.
 *
 * @param {{
 *   settings: object,
 *   logger: { info: Function, warn?: Function },
 *   now: () => number,
 *   sleep: (ms: number) => Promise<void>,
 *   launch: (file: string, args?: string[]) => boolean,
 *   run: (args: string[], options?: object) => Promise<{ code: number, error?: string }>,
 * }} deps
 */
export async function ensureDockerEngine(deps) {
  const { settings, logger, now, sleep, launch, run } = deps
  if (await engineReady(run)) return { ok: true, started: false }

  const target = orbstackPath(settings)
  if (settings.dockerAutoStart !== true) {
    return failure('docker-engine-unavailable', 'Docker 引擎未运行；请先打开 OrbStack，或在配置中开启 dockerAutoStart')
  }
  if (target === null) {
    return failure('docker-engine-missing', '未找到 OrbStack；请安装 OrbStack，或在配置中用 dockerDesktopPath 指定 OrbStack.app')
  }
  const started = target.endsWith('.app')
    ? launch('/usr/bin/open', ['-a', target])
    : launch(target, [])
  if (started !== true) {
    return failure('docker-engine-launch-failed', `无法启动 OrbStack：${target}`)
  }
  logger.info('OrbStack 已启动，等待 Docker 引擎就绪…')

  const timeoutMs = Number(settings.dockerEngineTimeoutMs) > 0 ? Number(settings.dockerEngineTimeoutMs) : 180_000
  const deadline = now() + timeoutMs
  while (now() < deadline) {
    await sleep(ENGINE_POLL_MS)
    if (await engineReady(run)) {
      logger.info('Docker 引擎已就绪（OrbStack）')
      return { ok: true, started: true, message: 'OrbStack 已启动' }
    }
  }
  return failure(
    'docker-engine-timeout',
    `OrbStack 启动超时（${Math.round(timeoutMs / 1000)}s）：请确认 OrbStack 已安装并完成首次启动，或调整 dockerEngineTimeoutMs`,
  )
}

/** Whether `docker info` talks to a live engine. */
async function engineReady(run) {
  const result = await run(['info', '--format', '{{.ServerVersion}}'], { timeoutMs: ENGINE_INFO_TIMEOUT_MS })
  return result.code === 0
}
