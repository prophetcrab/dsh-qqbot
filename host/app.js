/**
 * Host composition: build the kernel, provide the platform service, load the
 * built-in plugin list and wire the kernel to the DSH context (routes, tools,
 * system prompt, `qqbot` service).
 *
 * `index.js` only calls this; business logic never lives in the entry point.
 */

import { Kernel } from './kernel/index.js'
import { BUILTIN_PLUGINS } from './plugins/index.js'
import {
  DEFAULT_SETTINGS,
  NAPCAT_CONFIG_DIRS,
  NAPCAT_INSTALL_DIR,
  QQ_APP_PATH,
  detectKoishiProject,
  detectNapcat,
  detectQq,
  hostPlatform,
  macInfo,
  napcatQrPath,
  platformInfo,
  resolveSettings,
} from './platform/mac/index.js'

/** Platform capability object exposed to plugins as the `platform` service. */
const PLATFORM_SERVICE = Object.freeze({
  DEFAULT_SETTINGS,
  NAPCAT_INSTALL_DIR,
  NAPCAT_CONFIG_DIRS,
  QQ_APP_PATH,
  detectQq,
  detectNapcat,
  detectKoishiProject,
  hostPlatform,
  macInfo,
  platformInfo,
  napcatQrPath,
})

/**
 * @param {import('cordis').Context} ctx
 * @param {Record<string, unknown>} [config]
 * @param {any[]} [plugins]
 */
export async function applyHost(ctx, config = {}, plugins = BUILTIN_PLUGINS) {
  const settings = resolveSettings(config ?? {})
  const logger = ctx.logger('qqbot')
  const kernel = new Kernel({ settings, logger, ctx })
  kernel.provide('host', 'platform', PLATFORM_SERVICE)
  await kernel.load(plugins, { ctx, config: config ?? {} })

  if (ctx.tools !== undefined) kernel.mountTools(ctx.tools)
  ctx.inject(['webServer'], (child) => kernel.mountWebServer(child.webServer))
  ctx.inject(['systemPrompt'], (child) => kernel.mountSystemPrompt(child.systemPrompt))
  ctx.effect?.(() => () => kernel.dispose())

  // Extension seam for other DSH plugins (kept compatible with v1).
  const service = {
    settings,
    kernel,
    status: {
      get napcat() { return kernel.get('napcat') },
      get koishi() { return kernel.get('koishi') },
      get plugins() { return kernel.get('koishiPlugins') },
    },
    features: kernel.featureRegistry,
    registerFeature: (feature) => kernel.registerFeature('external', feature),
    registerClientTab: (tab) => kernel.registerClientTab('external', tab),
    getStatus: () => kernel.statusSnapshot(),
    listPlugins: () => kernel.listPlugins(),
  }
  ctx.provide?.('qqbot')
  ctx.set?.('qqbot', service)

  logger.info('QQ bot control center ready; koishi=%s napcat=%s', settings.projectDir, settings.napcatPort)
  return { kernel, settings, service }
}
