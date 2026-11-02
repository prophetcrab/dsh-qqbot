/**
 * NapCat OneBot configuration helpers (pure; no I/O).
 *
 * The input object is never mutated: callers get a deep copy plus a `changed`
 * flag, which makes re-running the configuration idempotent.
 */

import { QQ_APP_PATH } from '../../platform/mac/index.js'
import { deepClone, isPlainObject } from './common.js'

/** QQ executable matched by `ps` when looking for the running macOS client. */
export const QQ_EXECUTABLE = `${QQ_APP_PATH}/Contents/MacOS/QQ`

/** Name of the reverse WebSocket client this plugin owns in NapCat configs. */
export const WS_CLIENT_NAME = 'koishi'

/** Fields written for the managed `koishi` reverse WebSocket client. */
export const WS_CLIENT_DEFAULTS = Object.freeze({
  name: WS_CLIENT_NAME,
  enable: true,
  url: '',
  messagePostFormat: 'array',
  reportSelfMessage: false,
  reconnectInterval: 5000,
  token: '',
  debug: false,
  heartInterval: 30000,
})

/** Keys whose values must never reach the UI. */
const SENSITIVE_KEYS = new Set(['token', 'accessToken', 'access_token', 'secret', 'password'])

/**
 * Ensure the OneBot config contains a reverse WebSocket client for Koishi.
 * An existing client with the same `name` is updated in place; extra keys are
 * preserved so re-running is idempotent.
 *
 * @param {Record<string, any>} onebotConfig parsed `onebot11_<uin>.json`
 * @param {{ url: string, name?: string, token?: string }} options
 * @returns {{ config: Record<string, any>, changed: boolean }}
 */
export function upsertWebsocketClient(onebotConfig, options = {}) {
  if (!isPlainObject(onebotConfig)) throw new TypeError('onebotConfig must be an object')
  const url = options.url
  if (typeof url !== 'string' || url === '') throw new TypeError('options.url must be a non-empty string')
  const name = typeof options.name === 'string' && options.name !== '' ? options.name : WS_CLIENT_NAME
  const token = typeof options.token === 'string' ? options.token : ''

  const config = deepClone(onebotConfig)
  if (!isPlainObject(config.network)) config.network = {}
  if (!Array.isArray(config.network.websocketClients)) config.network.websocketClients = []
  const clients = config.network.websocketClients
  const desired = { ...WS_CLIENT_DEFAULTS, name, url, token }
  const index = clients.findIndex((client) => isPlainObject(client) && client.name === name)
  if (index === -1) {
    clients.push(desired)
  } else {
    clients[index] = { ...clients[index], ...desired }
  }
  return { config, changed: JSON.stringify(config) !== JSON.stringify(onebotConfig) }
}

/**
 * List reverse WebSocket clients for display: only non-sensitive fields.
 *
 * @param {Record<string, any>|null|undefined} onebotConfig
 * @returns {Array<{ name: string, url: string, enable: boolean }>}
 */
export function listWebsocketClients(onebotConfig) {
  const clients = isPlainObject(onebotConfig)
    && isPlainObject(onebotConfig.network)
    && Array.isArray(onebotConfig.network.websocketClients)
    ? onebotConfig.network.websocketClients
    : []
  return clients
    .filter((client) => isPlainObject(client))
    .map((client) => ({
      name: typeof client.name === 'string' ? client.name : '',
      url: typeof client.url === 'string' ? client.url : '',
      enable: client.enable !== false,
    }))
}

/** Mask every token-like value in an OneBot config before it is shown to the UI. */
export function maskOnebotConfig(onebotConfig) {
  if (!isPlainObject(onebotConfig)) return null
  return maskSecrets(deepClone(onebotConfig))
}

function maskSecrets(value) {
  if (Array.isArray(value)) return value.map((item) => maskSecrets(item))
  if (!isPlainObject(value)) return value
  const masked = {}
  for (const [key, item] of Object.entries(value)) {
    if (SENSITIVE_KEYS.has(key)) {
      masked[key] = maskTokenValue(typeof item === 'string' ? item : '')
    } else {
      masked[key] = maskSecrets(item)
    }
  }
  return masked
}

/** Local masking helper (kept dependency-free to avoid an import cycle). */
function maskTokenValue(value) {
  if (typeof value !== 'string' || value === '') return null
  return value.length <= 4 ? '****' : `${value.slice(0, 4)}…`
}
