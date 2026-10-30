/**
 * Overview feature: a read-only summary of QQ, NapCat, Koishi and the bot.
 * No actions — the panel renders it as status cards.
 */

/**
 * @param {import('../features.js').FeatureDeps} deps
 */
function status(deps) {
  const qq = deps.platform.detectQq()
  const napcat = deps.platform.detectNapcat(deps.settings)
  const project = deps.platform.detectKoishiProject(deps.settings)
  return {
    qq,
    napcat: {
      installed: napcat.installed,
      version: napcat.version,
      accounts: napcat.accounts.length,
      configDir: napcat.configDir,
    },
    koishi: {
      projectDir: project.projectDir,
      exists: project.exists,
      depsInstalled: project.hasNodeModules,
      port: deps.settings.koishiPort,
    },
  }
}

export default {
  id: 'overview',
  title: { zh: '总览', en: 'Overview' },
  description: {
    zh: 'QQ、NapCat 与 Koishi 的安装和环境状态。',
    en: 'Installation and environment state for QQ, NapCat and Koishi.',
  },
  status,
  actions: [],
}
