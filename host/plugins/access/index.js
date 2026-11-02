/**
 * Access plugin: read/replace the QQ bot access policy enforced by the Koishi
 * access-control plugin (stored in `<projectDir>/data/access.json`).
 */

import {
  accessPath,
  normalizePolicy,
  readPolicy,
  summarizePolicy,
  writePolicy,
} from '../../services/access/index.js'
import { routes } from './routes.js'
import { tools } from './tools.js'

export const name = 'access'
export const version = '1.0.0'

export default {
  id: 'qqbot-access',
  name,
  version,
  inject: [],
  provides: ['access'],
  description: 'Inbound/outbound group policy and quiet mode.',
  async apply(api) {
    const file = accessPath(api.settings)
    const service = {
      path: file,
      read: () => readPolicy(file),
      write: (raw) => writePolicy(file, raw),
      normalizePolicy,
      summarizePolicy,
    }
    api.provide('access', service)
    api.registerRoutes(routes(api, service))
    for (const tool of tools(api, service)) api.registerTool(tool)
    api.registerClientTab({ id: 'access', title: { zh: '权限', en: 'Access' }, order: 3 })
  },
}
