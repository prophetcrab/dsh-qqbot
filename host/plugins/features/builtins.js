/**
 * Built-in read-only feature cards: overview, Koishi plugins and access.
 * Lifecycle/configuration actions live in their plugins and are exposed through
 * HTTP routes/tools; they are not duplicated as feature descriptors here.
 */

/* --------------------------------------------------------------- overview -- */

function overviewStatus(deps) {
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

const overview = {
  id: 'overview',
  title: { zh: '总览', en: 'Overview' },
  description: {
    zh: 'QQ、NapCat 与 Koishi 的安装和环境状态。',
    en: 'Installation and environment state for QQ, NapCat and Koishi.',
  },
  status: overviewStatus,
  actions: [],
}

/* --------------------------------------------------------- koishi plugins -- */

async function koishiPluginsStatus(deps) {
  try {
    const plugins = await deps.plugins.list()
    return {
      total: plugins.length,
      enabled: plugins.filter((plugin) => plugin.enabled).length,
      local: plugins.filter((plugin) => plugin.local).length,
      removable: plugins.filter((plugin) => plugin.removable).length,
    }
  } catch (error) {
    return { total: 0, enabled: 0, local: 0, removable: 0, error: String(error?.message ?? error) }
  }
}

const koishiPlugins = {
  id: 'koishi-plugins',
  title: { zh: 'Koishi 插件', en: 'Koishi plugins' },
  description: {
    zh: '查看、启用/禁用、安装/卸载 Koishi 插件（在「插件」页操作）。',
    en: 'Inspect, enable/disable, install or remove Koishi plugins (from the Plugins tab).',
  },
  status: koishiPluginsStatus,
  actions: [],
}

/* ------------------------------------------------------------------ access -- */

async function accessStatus(deps) {
  const { policy, exists, error } = await deps.access.read()
  return {
    ...deps.access.summarizePolicy(policy),
    exists,
    error: error ?? null,
    path: deps.access.path,
  }
}

const access = {
  id: 'access',
  title: { zh: '权限管理', en: 'Access control' },
  description: {
    zh: '管理机器人接受哪些群聊的消息、只向哪些群聊发送，以及是否进入「安静模式」。',
    en: 'Control which groups may message the bot, which groups it may send to, and quiet mode.',
  },
  status: accessStatus,
  actions: [],
}

/** Ordered built-in feature descriptors. */
export const BUILTIN_FEATURES = [overview, koishiPlugins, access]
