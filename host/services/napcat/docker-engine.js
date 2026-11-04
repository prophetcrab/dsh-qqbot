/**
 * Docker engine lifecycle for the NapCat backend: readiness probe, optional
 * Docker Desktop launch and readiness polling. Kept separate from container
 * management so `docker.js` stays focused on NapCat.
 */

import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { failure } from './common.js'

/** `docker info` readiness probe. */
const ENGINE_INFO_TIMEOUT_MS = 15_000
/** How often to poll after launching Docker Desktop. */
const ENGINE_POLL_MS = 2000

/**
 * Ensure a reachable Docker engine, launching Docker Desktop when allowed.
 *
 * @param {{
 *   settings: object,
 *   logger: { info: Function, warn?: Function },
 *   now: () => number,
 *   sleep: (ms: number) => Promise<void>,
 *   hostOs: string,
 *   launch: (file: string, args?: string[]) => boolean,
 *   run: (args: string[], options?: object) => Promise<{ code: number }>,
 * }} deps
 */
export async function ensureDockerEngine(deps) {
  const { settings, logger, now, sleep, hostOs, launch, run } = deps
  if (await engineReady(run)) return { ok: true, started: false }
  const launched = await launchDocker({ settings, logger, hostOs, launch })
  if (launched.ok !== true) return launched
  const timeoutMs = settings.dockerEngineTimeoutMs
  const deadline = now() + timeoutMs
  logger.info('Docker Desktop 已启动，等待 Docker 引擎就绪…')
  while (now() < deadline) {
    await sleep(ENGINE_POLL_MS)
    if (await engineReady(run)) {
      logger.info('Docker 引擎已就绪')
      return { ok: true, started: true, message: 'Docker Desktop 已启动' }
    }
  }
  return failure('docker-engine-timeout', `Docker Desktop 启动超时（${Math.round(timeoutMs / 1000)}s）：请确认 Docker Desktop 已安装、允许 WSL2 启动，或在配置中调整 dockerEngineTimeoutMs`)
}

/** Whether `docker info` talks to a live engine. */
async function engineReady(run) {
  const result = await run(['info', '--format', '{{.ServerVersion}}'], { timeoutMs: ENGINE_INFO_TIMEOUT_MS })
  return result.code === 0
}

/** Resolve the Docker Desktop executable/app bundle for this host. */
function dockerDesktopPath(settings, hostOs) {
  const configured = settings.dockerDesktopPath
  if (typeof configured === 'string' && configured !== '') return configured
  if (hostOs === 'windows') {
    const bases = [
      process.env.ProgramFiles,
      process.env.ProgramW6432,
      process.env['ProgramFiles(x86)'],
      process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'Programs') : null,
      process.env.LOCALAPPDATA,
    ]
    for (const base of bases) {
      if (typeof base !== 'string' || base === '') continue
      for (const candidate of [
        join(base, 'Docker', 'Docker', 'Docker Desktop.exe'),
        join(base, 'Docker', 'Docker Desktop.exe'),
      ]) {
        if (existsSync(candidate)) return candidate
      }
    }
    return null
  }
  if (hostOs === 'macos') return '/Applications/Docker.app'
  return null
}

/** Launch Docker Desktop (Windows executable or macOS app bundle). */
async function launchDocker({ settings, logger, hostOs, launch }) {
  if (settings.dockerAutoStart !== true) {
    return failure('docker-engine-unavailable', 'Docker 引擎未运行；请先启动 Docker Desktop，或开启 dockerAutoStart 配置')
  }
  const target = dockerDesktopPath(settings, hostOs)
  if (target === null || target === '') {
    return failure('docker-desktop-missing', '未找到 Docker Desktop：请安装 Docker Desktop，或在配置中设置 dockerDesktopPath')
  }
  if (!existsSync(target)) {
    return failure('docker-desktop-missing', `Docker Desktop 不存在：${target}；请安装或修正 dockerDesktopPath`)
  }
  const launched = hostOs === 'macos'
    ? launch('open', ['-a', target])
    : hostOs === 'windows'
      ? launch(target, [])
      : false
  if (launched !== true) {
    return failure('docker-desktop-launch-failed', `无法启动 Docker Desktop：${target}`)
  }
  logger.info('已启动 Docker Desktop：%s', target)
  return { ok: true }
}
