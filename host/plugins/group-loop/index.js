/** Group listener loop: LLM analyze/compose/state-update and dashboard state. */
import { dataPaths } from '../../platform/mac/index.js'
import { GroupLoopService } from '../../services/group-loop/index.js'
import { routes } from './routes.js'

export const name = 'group-loop'
export const version = '1.0.0'

export default {
  id: 'qqbot-group-loop',
  name,
  version,
  inject: ['persona'],
  provides: ['groupLoop'],
  description: 'Group message listener analysis, reply composition and status maintenance.',
  async apply(api) {
    const persona = api.get('persona')
    const paths = dataPaths(api.settings.projectDir)
    const loop = new GroupLoopService({
      ctx: api.ctx,
      settings: api.settings,
      logger: api.logger,
      personaPath: persona?.path ?? paths.config.persona,
      profilesPath: paths.assets.profiles,
    })
    api.provide('groupLoop', loop)
    api.registerRoutes(routes(api, loop))
    api.registerClientTab({ id: 'tokens', title: { zh: 'Token', en: 'Tokens' }, order: 8 })
  },
}
