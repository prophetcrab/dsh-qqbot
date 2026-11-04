/**
 * Shared primitives for the NapCat service.
 *
 * Pure helpers plus the small dependency seams the manager accepts so unit
 * tests never touch a real QQ process, NapCat config or the network.
 */

/** Stable user-facing message when the Docker backend is unavailable. */
export const UNSUPPORTED_STATUS = 'NapCat 需要 Docker 后端；请确认 Docker 已安装并运行'

/** Whether `value` is a non-array object. */
export function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** JSON-safe deep clone (OneBot configs are pure JSON). */
export function deepClone(value) {
  return JSON.parse(JSON.stringify(value))
}

/** Structured failure payload shared by the action methods. */
export function failure(error, message) {
  return { ok: false, error, message }
}

/** Normalize a logger to the three methods used by this service. */
export function normalizeLogger(logger) {
  const noop = () => {}
  return {
    info: typeof logger?.info === 'function' ? logger.info.bind(logger) : noop,
    warn: typeof logger?.warn === 'function' ? logger.warn.bind(logger) : noop,
    error: typeof logger?.error === 'function' ? logger.error.bind(logger) : noop,
  }
}

/** Human-readable detail from a `run()` result. */
export function runDetail(result) {
  return String(result?.stderr ?? '').trim() || String(result?.error ?? '').trim()
}

/** Whether NapCat actions are supported on a normalized platform id. */
export function isSupportedPlatform(platform) {
  return platform === 'docker'
}

/** Extract the meaningful payload from a NapCat WebUI API envelope. */
export function unwrapData(payload) {
  if (!isPlainObject(payload)) return payload
  if (isPlainObject(payload.data)) return payload.data
  return payload
}

/** Coerce a NapCat boolean-ish API field. */
export function toBoolean(value) {
  return value === true || value === 1 || value === 'true' || value === '1'
}

/** First non-empty string value among `keys` of `data`. */
export function firstString(data, keys) {
  if (!isPlainObject(data)) return null
  for (const key of keys) {
    const value = data[key]
    if (typeof value === 'string' && value !== '') return value
    if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  }
  return null
}

/** Normalized platform id via the injected platform seam. */
export function platformId(manager) {
  try {
    return manager.platform.hostPlatform() === 'docker' ? 'docker' : 'other'
  } catch {
    return 'other'
  }
}

/** Read a JSON object, returning null for missing/unparsable files. */
export async function safeReadJson(manager, path) {
  try {
    const value = await manager.fs.readJson(path, null)
    return isPlainObject(value) ? value : null
  } catch {
    return null
  }
}
