/** Resolve and cache frame overlay images for fishing art. */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { catalogFor } from '../catalog.js'

const cache = new Map()

function frameName(assetsDir, { kind, item }) {
  if (item === undefined) return ''
  if (kind === 'fish') return `frame_fish_t${item.tier}.png`
  if (item.tier >= 4) {
    const target = kind === 'rod' ? 'rod' : 'bait'
    const frame = catalogFor(assetsDir).frames.find((entry) => entry.target === target && entry.itemId === item.id)
    return frame?.asset ?? ''
  }
  return `frame_gear_t${item.tier}.png`
}

export function frameHref(assetsDir, { kind, item }) {
  let name = ''
  try {
    name = frameName(assetsDir, { kind, item })
  } catch {
    // A missing/broken frame catalog must not break image rendering.
    name = ''
  }
  if (name === '') return ''
  const path = join(assetsDir, 'frames', name)
  if (cache.has(path)) return cache.get(path)
  try {
    const bytes = readFileSync(path)
    const href = `data:image/png;base64,${bytes.toString('base64')}`
    cache.set(path, href)
    return href
  } catch {
    return ''
  }
}
