/**
 * Koishi plugin management feature: read-only summary.
 *
 * The actual mutations (toggle/install/uninstall) are dedicated routes because
 * they need a per-plugin key and an optional restart flag; keeping the feature
 * read-only lets the panel render a compact badge.
 */

/** @param {import('../features.js').FeatureDeps} deps */
async function status(deps) {
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

export default {
  id: 'koishi-plugins',
  title: { zh: 'Koishi 插件', en: 'Koishi plugins' },
  description: {
    zh: '查看、启用/禁用、安装/卸载 Koishi 插件（在「插件」页操作）。',
    en: 'Inspect, enable/disable, install or remove Koishi plugins (from the Plugins tab).',
  },
  status,
  actions: [],
}
