/**
 * Platform/status provider: host platform facts, resolved settings and QQ
 * installation state. Other plugins contribute napcat/koishi/ai/persona/bot.
 */

import { safeDetect } from '../../kernel/http.js'

/** @param {object} api plugin API */
export function createStatusProvider(api) {
  return async function statusSnapshot() {
    const platform = api.get('platform') ?? {}
    const settings = api.settings
    const qq = safeDetect(() => platform.detectQq(settings), { installed: false, path: null, version: null })
    const host = safeDetect(() => platform.macInfo(), { arch: process.arch, release: '', osVersion: null })
    const support = safeDetect(() => platform.platformInfo(), {
      id: 'other', label: 'Unsupported', supported: false, napcatSupported: false, koishiSupported: false,
    })
    return {
      platform: {
        ...support,
        arch: host.arch,
        release: host.release,
        osVersion: host.osVersion,
        node: process.version,
      },
      settings: {
        projectDir: settings.projectDir,
        koishiPort: settings.koishiPort,
        napcatPort: settings.napcatPort,
        reversePath: settings.reversePath,
      },
      qq,
      hostPlugins: api.kernel.listPlugins(),
    }
  }
}
