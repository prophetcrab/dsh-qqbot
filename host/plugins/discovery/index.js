/**
 * Discovery plugin: publish the DSH HTTP origin for Koishi plugins.
 *
 * Koishi's group-listener and game plugins read `data/state/ai.json` and only
 * use the URL origin, so the endpoint path here is informational. This used to
 * live in the retired AI chat plugin; the file name is kept for compatibility
 * with existing Koishi plugin configs.
 */
import { dataPaths, ensureDir, writeFileAtomic } from '../../platform/index.js'

export const name = 'discovery'
export const version = '1.0.0'

export default {
  id: 'qqbot-discovery',
  name,
  version,
  inject: ['webServer'],
  description: 'Publish the running DSH origin so Koishi plugins can reach the host.',
  async apply(api) {
    const paths = dataPaths(api.settings.projectDir)
    let lastText = ''
    const ensureDiscovery = async () => {
      try {
        const origin = typeof api.ctx?.webServer?.getOrigin === 'function' ? api.ctx.webServer.getOrigin() : null
        if (typeof origin !== 'string' || origin === '') return null
        const text = JSON.stringify({
          version: 1,
          endpoint: `${origin}/qqbot/status`,
          updatedAt: new Date().toISOString(),
        }, null, 2)
        if (text !== lastText) {
          await ensureDir(paths.root)
          await writeFileAtomic(paths.state.aiDiscovery, `${text}\n`)
          lastText = text
        }
        return origin
      } catch {
        return null
      }
    }
    void ensureDiscovery()
    api.registerStatusProvider(async () => {
      await ensureDiscovery()
      return {}
    })
  },
}
