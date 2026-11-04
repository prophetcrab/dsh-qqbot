/**
 * NapCat plugin: install/configure/start/stop NapCat (the patched macOS QQ
 * client, or a Linux QQ container with the Docker backend) and expose its login
 * state, QR image and account contacts.
 */

import { NapcatManager } from '../../services/napcat/index.js'
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
  description: 'NapCat detection, install, OneBot config and QQ login lifecycle (local macOS QQ or Docker/Linux QQ).',
  async apply(api) {
    // Docker backend: platform-neutral, isolates QQ/NapCat from the host and
    // works on any host with Docker. Local backend: patched macOS QQ.app.
    const dockerBackend = api.settings.napcatBackend === 'docker'
    const napcat = dockerBackend
      ? new DockerNapcatManager({ settings: api.settings, logger: api.logger })
      : new NapcatManager({ settings: api.settings, logger: api.logger })
    api.provide('napcat', napcat)
    api.registerRoutes(routes(api, napcat))
    for (const tool of tools(api, napcat)) api.registerTool(tool)
    api.registerStatusProvider(createStatusProvider(napcat))
  },
}
