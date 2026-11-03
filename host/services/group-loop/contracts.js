/** Minimal wire validation for the Koishi -> DSH group loop. */
const API_VERSION = 1
const MAX_IMAGES = 4
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
const MAX_IMAGE_CHARS = 12 * 1024 * 1024

function bad(error) { return { ok: false, error, code: 'BAD_REQUEST' } }
function str(value, max = 50000) { return typeof value === 'string' ? value.slice(0, max) : '' }
function object(value) { return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : null }
function images(value) {
  if (!Array.isArray(value)) return []
  return value.filter((item) => item !== null && typeof item === 'object' && IMAGE_TYPES.has(String(item.mediaType).toLowerCase()) && typeof item.data === 'string' && item.data.length > 0 && item.data.length <= MAX_IMAGE_CHARS)
    .slice(0, MAX_IMAGES)
    .map((item) => ({ mediaType: String(item.mediaType).toLowerCase(), data: item.data }))
}

function participants(value) {
  if (!Array.isArray(value)) return []
  return value.filter((item) => item !== null && typeof item === 'object' && typeof item.qq === 'string').map((item) => ({
    qq: item.qq.trim().slice(0, 20),
    nickname: str(item.nickname, 80).trim(),
  })).filter((item) => item.qq !== '')
}

function common(body) {
  const source = object(body)
  if (source === null) return bad('body must be an object')
  if (source.apiVersion !== undefined && Number(source.apiVersion) !== API_VERSION) return bad(`unsupported apiVersion: ${source.apiVersion}`)
  return null
}

export function validateAnalyze(body) {
  const base = common(body)
  if (base !== null) return base
  const groupId = str(body.groupId, 80).trim()
  const material = str(body.material, 200000).trim()
  if (groupId === '') return bad('groupId is required')
  if (material === '') return bad('material is required')
  const reason = str(body.trigger?.reason, 30).trim()
  if (reason !== '' && !['mention', 'reply', 'count', 'time', 'watch'].includes(reason)) return bad('invalid trigger.reason')
  return { ok: true, value: { apiVersion: API_VERSION, groupId, material, trigger: { reason, messageId: str(body.trigger?.messageId, 80) }, participants: participants(body.participants), images: images(body.images), quotedImages: images(body.quotedImages), backgroundImages: images(body.backgroundImages) } }
}

export function validateCompose(body) {
  const base = common(body)
  if (base !== null) return base
  const groupId = str(body.groupId, 80).trim()
  const material = str(body.material, 200000).trim()
  const speak = object(body.speak)
  if (groupId === '') return bad('groupId is required')
  if (material === '') return bad('material is required')
  if (speak === null || speak.enabled !== true) return bad('speak.enabled must be true for compose')
  return { ok: true, value: { apiVersion: API_VERSION, groupId, material, speak, participants: participants(body.participants), images: images(body.images), quotedImages: images(body.quotedImages), backgroundImages: images(body.backgroundImages) } }
}

export function validateStateUpdate(body) {
  const base = common(body)
  if (base !== null) return base
  const loopId = str(body.loopId, 100).trim()
  const groupId = str(body.groupId, 80).trim()
  const material = str(body.material, 200000).trim()
  if (loopId === '') return bad('loopId is required')
  if (groupId === '') return bad('groupId is required')
  if (material === '') return bad('material is required')
  return {
    ok: true,
    value: {
      apiVersion: API_VERSION,
      loopId,
      groupId,
      material,
      speak: object(body.speak) ?? { enabled: false },
      sendResult: object(body.sendResult) ?? { sent: false },
      participants: participants(body.participants),
    },
  }
}

export { API_VERSION }
