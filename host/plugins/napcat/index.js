/**
 * NapCat plugin: Docker-managed Linux QQ/NapCat lifecycle, login state, QR
 * image and account contacts. The Windows branch has no local QQ backend.
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
  },
}
