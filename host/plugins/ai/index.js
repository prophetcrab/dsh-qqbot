/**
 * AI chat bridge plugin: AI settings, profiles, prompt preview, the Koishi
 * discovery endpoint file and `POST /qqbot/ai/chat`.
 */

import { join } from 'node:path'
import { AiChatService } from '../../services/ai/index.js'
import { createDiscovery } from './discovery.js'
import { routes } from './routes.js'
import { createStatusProvider } from './status.js'

export const name = 'ai'
export const version = '1.0.0'

export default {
  id: 'qqbot-ai',
  name,
  version,
  inject: ['persona', 'webServer'],
  provides: ['ai'],
  description: 'AI chat gateway over the harness LLM, runtime settings and user profiles.',
  async apply(api) {
    const persona = api.get('persona')
    const aiSettingsPath = join(api.settings.projectDir, 'data', 'ai-settings.json')
    const profilesPath = join(api.settings.projectDir, 'data', 'profiles.json')
    const ai = new AiChatService({
      ctx: api.ctx,
      settings: api.settings,
      personaPath: persona?.path ?? null,
      profilesPath,
      logger: api.logger,
    })
    api.provide('ai', ai)
    const ensureEndpoint = createDiscovery(api, ai)
    void ensureEndpoint()
    api.registerRoutes(routes(api, { ai, aiSettingsPath, profilesPath, ensureEndpoint }))
    api.registerStatusProvider(createStatusProvider({ ai, aiSettingsPath, ensureEndpoint }))
    api.registerClientTab({ id: 'ai', title: { zh: 'AI', en: 'AI' }, order: 1 })
  },
}
