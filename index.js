/**
 * dsh-qqbot — QQ bot control center for DeepSeek Harness.
 *
 * This entry point is composition only: it declares the Cordis plugin metadata
 * and hands the built-in plugin list to `host/app.js`. Every capability
 * (routes/tools/features/status/client tabs) is contributed by a host plugin
 * under host/plugins/*; see docs/refactor/02-file-layout.md.
 *
 * @module dsh-qqbot
 */

import { applyHost } from './host/app.js'
import { BUILTIN_PLUGINS } from './host/plugins/index.js'

/** Cordis plugin name used by Loader diagnostics. */
export const name = 'qqbot'

/** Required DSH services. */
export const inject = ['webServer', 'tools', 'systemPrompt']

/**
 * Register the plugin.
 *
 * @param {import('cordis').Context} ctx
 * @param {Record<string, unknown>} [config]
 */
export async function apply(ctx, config) {
  await applyHost(ctx, config, BUILTIN_PLUGINS)
}
