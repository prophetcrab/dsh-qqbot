/**
 * Full environment reinstall job: pull the branch archive from GitHub, sync
 * the customized Koishi template, install dependencies, prepare the NapCat
 * Docker image, start both services and apply the OneBot config.
 *
 * The job is intentionally asynchronous so the panel can render per-step
 * progress while the download/install is running.
 */

import { rm } from 'node:fs/promises'
import { cloneSource, validateTemplate } from './github.js'

/** Ordered progress steps; IDs are translated by the client. */
export const REINSTALL_STEPS = [
  { step: 'stop-services', label: '停止现有服务' },
  { step: 'download-source', label: '下载 GitHub 资源' },
  { step: 'extract-source', label: '校验资源' },
  { step: 'sync-koishi', label: '同步 Koishi 环境' },
  { step: 'install-deps', label: '安装 Koishi 依赖' },
  { step: 'napcat-docker', label: '准备 NapCat Docker' },
  { step: 'start-koishi', label: '启动 Koishi' },
  { step: 'start-napcat', label: '启动 NapCat' },
  { step: 'configure-onebot', label: '写入 OneBot 配置' },
]

function nowIso() {
  return new Date().toISOString()
}

function makeJob() {
  return {
    id: `reinstall-${Date.now()}`,
    status: 'running',
    startedAt: nowIso(),
    finishedAt: null,
    source: null,
    error: null,
    steps: REINSTALL_STEPS.map((entry) => ({ ...entry, status: 'pending', message: '' })),
  }
}

function jobView(job) {
  if (job === null) return null
  return {
    id: job.id,
    status: job.status,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    source: job.source,
    error: job.error,
    steps: job.steps.map((entry) => ({ ...entry })),
  }
}

/** Set one step's state; the panel reads this from `/qqbot/setup`. */
function updateStep(job, index, status, message = '') {
  const step = job.steps[index]
  step.status = status
  step.message = String(message ?? '').slice(0, 500)
}

async function runStep(job, index, fn) {
  updateStep(job, index, 'running', '')
  try {
    const result = await fn()
    const skipped = result?.skipped === true
    updateStep(job, index, skipped ? 'skipped' : 'ok', result?.message ?? '')
    return result
  } catch (error) {
    updateStep(job, index, 'failed', String(error?.message ?? error))
    throw error
  }
}

function stopIfPresent(service, method) {
  if (service === null || service === undefined) return { skipped: true, message: '服务未加载' }
  if (typeof service[method] !== 'function') return { skipped: true, message: '没有可停止的方法' }
  return service[method]().then((result) => {
    if (result?.ok === false) throw new Error(result?.message ?? result?.error ?? '停止服务失败')
    return result
  })
}

async function runJob(manager, job) {
  let source = null
  try {
    await runStep(job, 0, async () => {
      const stopped = []
      for (const [name, service] of [['koishi', manager.services?.koishi], ['napcat', manager.services?.napcat]]) {
        const result = await stopIfPresent(service, 'stop')
        if (result?.skipped !== true) stopped.push(name)
      }
      return { skipped: stopped.length === 0, message: stopped.length === 0 ? '没有运行中的服务' : `已停止 ${stopped.join(' / ')}` }
    })

    const downloaded = await runStep(job, 1, async () => {
      const result = await cloneSource(manager.run, manager.githubRepo, manager.githubRef)
      source = result
      job.source = { repo: manager.githubRepo, ref: manager.githubRef, url: result.url }
      return { ...result, message: `${manager.githubRepo}@${manager.githubRef}` }
    })

    const extracted = await runStep(job, 2, async () => {
      const result = await validateTemplate(downloaded.rootDir)
      job.source.templateDir = result.templateDir
      return { ...result, message: 'template/ 校验通过' }
    })

    const previousSelfId = await manager.getKoishiSelfId().catch(() => null)
    await runStep(job, 3, async () => {
      const result = await manager.syncProject(extracted.templateDir, previousSelfId?.selfId ?? '')
      return { message: result?.message ?? '代码已同步，data 与 runtime 已保留' }
    })

    await runStep(job, 4, async () => {
      const result = await manager.installDependenciesFrom(extracted.templateDir)
      if (result?.ok !== true) throw new Error(result?.message ?? result?.error ?? '安装依赖失败')
      return { message: result?.bundled === true ? '已解压内置依赖包' : 'npm 依赖安装完成' }
    })

    await runStep(job, 5, async () => {
      const napcat = manager.services?.napcat
      if (napcat === undefined || napcat === null || typeof napcat.install !== 'function') {
        return { skipped: true, message: 'NapCat 服务未加载' }
      }
      const result = await napcat.install()
      if (result?.ok !== true) throw new Error(result?.message ?? result?.error ?? '准备 NapCat Docker 失败')
      return { message: result?.message ?? 'NapCat Docker 已就绪' }
    })

    await runStep(job, 6, async () => {
      const koishi = manager.services?.koishi
      if (koishi === undefined || koishi === null || typeof koishi.start !== 'function') {
        return { skipped: true, message: 'Koishi 服务未加载' }
      }
      const result = await koishi.start()
      if (result?.ok === false) throw new Error(result?.message ?? result?.error ?? '启动 Koishi 失败')
      return { message: result?.message ?? 'Koishi 已启动' }
    })

    await runStep(job, 7, async () => {
      const napcat = manager.services?.napcat
      if (napcat === undefined || napcat === null || typeof napcat.start !== 'function') {
        return { skipped: true, message: 'NapCat 服务未加载' }
      }
      const result = await napcat.start({ waitForLogin: false })
      if (result?.ok !== true) throw new Error(result?.message ?? result?.error ?? '启动 NapCat 失败')
      return { message: result?.message ?? 'NapCat 容器已启动' }
    })

    await runStep(job, 8, async () => {
      const napcat = manager.services?.napcat
      if (napcat === undefined || napcat === null) return { skipped: true, message: 'NapCat 服务未加载' }
      const login = await napcat.loginState?.().catch?.(() => null)
      if (login?.loggedIn === true && typeof login.qq === 'string' && login.qq !== '') {
        await manager.setKoishiSelfId(login.qq)
        return { message: `已同步 QQ ${login.qq}，登录后自动写入配置` }
      }
      const configured = await napcat.configure?.()
      if (configured?.ok === true) return { message: configured.message ?? 'OneBot 配置已写入' }
      return { skipped: true, message: '扫码登录后自动写入 OneBot 配置' }
    })

    job.status = 'succeeded'
    job.finishedAt = nowIso()
    manager.logRing.append('[reinstall] 环境重装完成')
    manager.logger.info('环境重装完成：%s@%s', manager.githubRepo, manager.githubRef)
    return job
  } catch (error) {
    job.status = 'failed'
    job.error = String(error?.message ?? error)
    job.finishedAt = nowIso()
    manager.logRing.append(`[reinstall] 失败：${job.error}`)
    manager.logger.error('环境重装失败：%s', job.error)
    return job
  } finally {
    if (source?.tempDir !== undefined) await rm(source.tempDir, { recursive: true, force: true }).catch(() => {})
    manager.installing = false
    manager.reinstallTask = null
  }
}

/** Start the job and return immediately; progress is exposed in status(). */
export function startReinstall(manager) {
  if (manager.reinstallTask !== null) {
    return { ok: true, accepted: true, alreadyRunning: true, job: jobView(manager.reinstallJob) }
  }
  const job = makeJob()
  manager.reinstallJob = job
  manager.installing = true
  manager.logRing.clear()
  manager.logRing.append(`[reinstall] 开始从 ${manager.githubRepo}@${manager.githubRef} 重装环境`)
  manager.reinstallTask = runJob(manager, job)
  return { ok: true, accepted: true, job: jobView(job) }
}

export { jobView }
