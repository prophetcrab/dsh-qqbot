/**
 * First-run bootstrap: scaffold the bundled Koishi project, install its
 * dependencies, pull the NapCat Docker image and apply the OneBot config.
 *
 * Never blocks plugin activation; every step is retryable from the panel.
 */

import { join } from 'node:path'
import { ensureDir, fileMtime, writeFileAtomic } from '../../platform/index.js'

/** How long a failed Docker image pull suppresses repeated attempts. */
const RETRY_WINDOW_MS = 10 * 60 * 1000

/** @param {object} api plugin API */
export async function bootstrap(api) {
  const setup = api.get('setup')
  const napcat = api.get('napcat')
  if (setup === undefined || napcat === undefined) return
  const logger = api.logger
  try {
    const boot = await setup.autoBootstrap()
    if (boot?.ok === false) logger.warn('自动安装 Koishi 运行环境失败：%s', boot.message ?? boot.error ?? 'unknown')
    const state = await napcat.status()
    if (state.installed !== true) {
      // Docker backend: pull the image once. OrbStack is started by the
      // engine helper; no macOS App Management prompt is involved.
      const markerPath = join(api.settings.projectDir, 'runtime', 'napcat-docker-install.json')
      const mtime = await fileMtime(markerPath)
      const recentlyTried = mtime !== null && Date.now() - Date.parse(mtime) < RETRY_WINDOW_MS
      if (recentlyTried) {
        logger.info('NapCat Docker 安装最近已尝试，跳过重复拉取')
      } else {
        const installed = await napcat.install()
        if (installed.ok === true) {
          await ensureDir(join(api.settings.projectDir, 'runtime'))
          await writeFileAtomic(markerPath, JSON.stringify({ at: new Date().toISOString(), version: installed.version ?? null }))
          logger.info('NapCat Docker 镜像已就绪（%s）', installed.version ?? 'unknown')
        } else {
          logger.warn('NapCat Docker 安装失败：%s', installed.message ?? installed.error ?? 'unknown')
        }
      }
    } else if (state.configApplied !== true) {
      const configured = await napcat.configure()
      if (configured.ok === true) logger.info('已自动写入 NapCat OneBot 配置')
      else logger.warn('自动写入 NapCat OneBot 配置失败：%s', configured.message ?? configured.error ?? 'unknown')
    }
  } catch (error) {
    logger.warn('首次运行自动配置失败：%s', String(error?.message ?? error))
  }
}
