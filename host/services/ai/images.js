/** Convert base64 image payloads into DSH attachment parts; never throws. */

const ACCEPTED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

export async function toImageParts(ctx, images, logger) {
  if (!Array.isArray(images) || images.length === 0) return []
  const attachments = ctx?.get?.('attachments')
  if (attachments === null || attachments === undefined || typeof attachments.saveImages !== 'function') return []
  const inputs = []
  for (const image of images.slice(0, 4)) {
    if (image === null || typeof image !== 'object') continue
    const mediaType = String(image.mediaType ?? '').toLowerCase()
    if (!ACCEPTED.has(mediaType)) continue
    if (typeof image.data !== 'string' || image.data === '') continue
    let data
    try {
      data = new Uint8Array(Buffer.from(image.data, 'base64'))
    } catch {
      continue
    }
    if (data.byteLength === 0 || data.byteLength > 8 * 1024 * 1024) continue
    inputs.push({ data, mediaType })
  }
  if (inputs.length === 0) return []
  try {
    const refs = await attachments.saveImages(inputs)
    return refs.map((attachment) => ({ type: 'image', attachment }))
  } catch (error) {
    logger.warn('读取图片失败（已忽略图片继续回复）：%s', String(error?.message ?? error))
    return []
  }
}
