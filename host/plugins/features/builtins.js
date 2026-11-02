/**
 * Built-in feature cards: overview, lifecycle, configuration, Koishi plugins
 * and access control. Each card is a self-contained descriptor evaluated with
 * the kernel's feature dependency bag (settings + registered services).
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

/* -------------------------------------------------------------- lifecycle -- */

async function lifecycleStatus(deps) {
  const [napcat, koishi] = await Promise.all([
    deps.napcat.status().catch((error) => ({ running: false, error: String(error?.message ?? error) })),
    deps.koishi.status().catch((error) => ({ running: false, error: String(error?.message ?? error) })),
  ])
  return {
    napcat: { running: napcat?.running === true, loggedIn: napcat?.loggedIn === true, pid: napcat?.pid ?? null },
    koishi: { running: koishi?.running === true, online: koishi?.online === true, pid: koishi?.pid ?? null },
  }
}

async function step(name, fn) {
  try {
    const result = await fn()
    return { name, ok: result?.ok !== false, message: result?.message, data: result?.data }
  } catch (error) {
    return { name, ok: false, message: String(error?.message ?? error) }
  }
}

async function startAll(deps) {
  const steps = []
  // Start Koishi first: NapCat.start() waits for a QR scan / login and would
  // otherwise show the QR code while Koishi still has no process.
  steps.push(await step('koishi', () => deps.koishi.start()))
  steps.push(await step('napcat', () => deps.napcat.start()))
  return {
    ok: steps.some((entry) => entry.ok),
    message: steps.map((entry) => `${entry.name}: ${entry.ok ? 'ok' : 'failed'}${entry.message ? ` (${entry.message})` : ''}`).join('; '),
    steps,
  }
}

async function stopAll(deps) {
  const steps = []
  steps.push(await step('koishi', () => deps.koishi.stop()))
  steps.push(await step('napcat', () => deps.napcat.stop()))
  return {
    ok: steps.every((entry) => entry.ok),
    message: steps.map((entry) => `${entry.name}: ${entry.ok ? 'stopped' : 'failed'}${entry.message ? ` (${entry.message})` : ''}`).join('; '),
    steps,
  }
}

const lifecycle = {
  id: 'lifecycle',
  title: { zh: '启停', en: 'Lifecycle' },
  description: {
    zh: '启动或停止 NapCat（QQ）与 Koishi，支持一键全启/全停。',
    en: 'Start or stop NapCat (QQ) and Koishi, including one-click start/stop for both.',
  },
  status: lifecycleStatus,
  actions: [
    { id: 'all-start', title: { zh: '一键启动全部', en: 'Start everything' }, tone: 'primary', run: (deps) => startAll(deps) },
    { id: 'all-stop', title: { zh: '全部停止', en: 'Stop everything' }, tone: 'danger', run: (deps) => stopAll(deps) },
    { id: 'napcat-start', title: { zh: '启动 NapCat', en: 'Start NapCat' }, run: async (deps) => deps.napcat.start() },
    { id: 'napcat-stop', title: { zh: '停止 NapCat', en: 'Stop NapCat' }, tone: 'danger', run: async (deps) => deps.napcat.stop() },
    { id: 'koishi-start', title: { zh: '启动 Koishi', en: 'Start Koishi' }, run: async (deps) => deps.koishi.start() },
    { id: 'koishi-stop', title: { zh: '停止 Koishi', en: 'Stop Koishi' }, tone: 'danger', run: async (deps) => deps.koishi.stop() },
    { id: 'koishi-restart', title: { zh: '重启 Koishi', en: 'Restart Koishi' }, run: async (deps) => deps.koishi.restart() },
  ],
}

/* ----------------------------------------------------------- configuration -- */

function configurationStatus(deps) {
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

const configuration = {
  id: 'configuration',
  title: { zh: '安装与配置', en: 'Setup' },
  description: {
    zh: '安装 NapCat、写入 OneBot 反向 WebSocket 配置、安装 Koishi 项目依赖。',
    en: 'Install NapCat, write the OneBot reverse WebSocket config, and install Koishi dependencies.',
  },
  status: configurationStatus,
  actions: [
    { id: 'napcat-install', title: { zh: '安装 / 更新 NapCat', en: 'Install / update NapCat' }, tone: 'primary', run: async (deps) => deps.napcat.install() },
    { id: 'napcat-configure', title: { zh: '写入 OneBot 配置', en: 'Apply OneBot config' }, tone: 'primary', run: async (deps) => deps.napcat.configure() },
    { id: 'koishi-install-deps', title: { zh: '安装 Koishi 依赖', en: 'Install Koishi dependencies' }, run: async (deps) => deps.koishi.installDeps() },
  ],
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
export const BUILTIN_FEATURES = [overview, lifecycle, configuration, koishiPlugins, access]

/**
 * Register every built-in feature on a plugin API (or a plain FeatureRegistry
 * for the legacy shim).
 *
 * @param {{ registerFeature?: Function, featureRegistry?: { register: Function } }} target
 */
export function registerBuiltins(target) {
  const register = target.registerFeature ?? ((feature) => target.featureRegistry.register(feature))
  for (const feature of BUILTIN_FEATURES) register(feature)
  return BUILTIN_FEATURES.length
}
