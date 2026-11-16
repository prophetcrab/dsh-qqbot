/**
 * NapCat plugin: Docker-managed Linux QQ/NapCat lifecycle, login state, QR
 * image and account contacts. This branch is Docker-only; local QQ is never patched.
 */

import { DockerNapcatManager } from '../../services/napcat/docker.js'
import { routes } from './routes.js'
import { tools } from './tools.js'
import { createStatusProvider } from './status.js'

export const name = 'napcat'
export const version = '1.0.0'

export default {
  id: 'qqbot-napcat',
  name,
  version,
  inject: ['platform'],
  provides: ['napcat'],
  description: 'Docker NapCat lifecycle: install/pull, OneBot config and QQ login.',
  async apply(api) {
    const napcat = new DockerNapcatManager({ settings: api.settings, logger: api.logger })
    api.provide('napcat', napcat)
    api.registerRoutes(routes(api, napcat))
    for (const tool of tools(api, napcat)) api.registerTool(tool)
    api.registerStatusProvider(createStatusProvider(napcat))

    // Docker NapCat writes account configs only after the QR scan. Watch the
    // WebUI login state so the OneBot reverse-WS client is applied without
    // requiring a second panel action.
    let configured = false
    const timer = api.settings.bootstrap === false ? null : setInterval(() => {
      if (configured) return
      void (async () => {
        try {
          const state = await napcat.loginStatus()
          if (state?.loggedIn !== true) return
          const result = await api.serialize(() => napcat.configure())
          if (result?.ok === true) configured = true
        } catch {
          // Status polling must never break the panel or the container.
        }
      })()
    }, 5_000)
    if (timer !== null) {
      timer.unref?.()
      api.ctx?.effect?.(() => () => clearInterval(timer))
    }
  },
}
