/**
 * Configuration feature: install/configure NapCat and install Koishi deps.
 *
 * The GUI parts of NapCat's macOS installer and QQ login stay manual; these
 * actions automate everything around them (download/launch, OneBot WS config,
 * npm dependencies).
 */

/** @param {import('../features.js').FeatureDeps} deps */
function status(deps) {
  const napcat = deps.platform.detectNapcat(deps.settings)
  const project = deps.platform.detectKoishiProject(deps.settings)
  return {
    napcat: {
      installed: napcat.installed,
      version: napcat.version,
      accounts: napcat.accounts.length,
      webuiPort: napcat.webui.port,
    },
    koishi: {
      projectDir: project.projectDir,
      exists: project.exists,
      hasPackageJson: project.hasPackageJson,
      depsInstalled: project.hasNodeModules,
    },
  }
}

export default {
  id: 'configuration',
  title: { zh: '安装与配置', en: 'Setup' },
  description: {
    zh: '安装 NapCat、写入 OneBot 反向 WebSocket 配置、安装 Koishi 项目依赖。',
    en: 'Install NapCat, write the OneBot reverse WebSocket config, and install Koishi dependencies.',
  },
  status,
  actions: [
    {
      id: 'napcat-install',
      title: { zh: '安装 / 更新 NapCat', en: 'Install / update NapCat' },
      tone: 'primary',
      run: async (deps) => deps.napcat.install(),
    },
    {
      id: 'napcat-configure',
      title: { zh: '写入 OneBot 配置', en: 'Apply OneBot config' },
      tone: 'primary',
      run: async (deps) => deps.napcat.configure(),
    },
    {
      id: 'koishi-install-deps',
      title: { zh: '安装 Koishi 依赖', en: 'Install Koishi dependencies' },
      run: async (deps) => deps.koishi.installDeps(),
    },
  ],
}
