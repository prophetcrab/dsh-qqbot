/**
 * First-run bootstrap: scaffold the bundled Koishi project and install its
 * dependencies. NapCat is pulled/started explicitly from the panel because the
 * Docker image can be large; bootstrap never blocks on it.
 *
 * Never blocks plugin activation; every step is retryable from the panel.
 */

/** @param {object} api plugin API */
export async function bootstrap(api) {
  const setup = api.get('setup')
  if (setup === undefined) return
  const logger = api.logger
  try {
    const boot = await setup.autoBootstrap()
    if (boot?.ok === false) logger.warn('自动安装 Koishi 运行环境失败：%s', boot.message ?? boot.error ?? 'unknown')
    logger.info('NapCat 使用 Docker 后端，镜像由面板的安装/启动操作拉取')
  } catch (error) {
    logger.warn('首次运行自动配置失败：%s', String(error?.message ?? error))
  }
}
