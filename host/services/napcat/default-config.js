/**
 * Default NapCat OneBot config used before a QQ account exists.
 *
 * NapCat's container entrypoint creates a reverse client named `rws` when
 * `onebot11.json` is missing. The plugin then adds its own `koishi` client,
 * which would leave two reverse sockets and make Koishi process every message
 * twice. Seeding/sanitizing the default file keeps exactly one client.
 */

import { join } from 'node:path'
import { isPlainObject } from './common.js'
import { WS_CLIENT_NAME, upsertWebsocketClient } from './onebot-config.js'

/**
 * Seed or sanitize `<configDir>/onebot11.json`.
 *
 * @param {{ fs: object, configDir: string, onebotUrl: string, settings: object }} manager
 * @returns {Promise<boolean>} whether the file changed
 */
export async function ensureDefaultOnebotConfig(manager) {
  const file = join(manager.configDir, 'onebot11.json')
  const exists = manager.fs.existsSync(file)
  const current = exists ? await manager.fs.readJson(file, null) : {}
  if (exists && !isPlainObject(current)) return false
  const { config, changed } = upsertWebsocketClient(current, {
    url: manager.onebotUrl,
    name: WS_CLIENT_NAME,
    token: manager.settings.napcatToken,
  })
  if (!exists || changed) {
    await manager.fs.writeFileAtomic(file, `${JSON.stringify(config, null, 2)}\n`)
  }
  return changed
}
