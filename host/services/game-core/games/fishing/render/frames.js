/** Resolve and cache frame overlay images for fishing art. */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const cache = new Map()
const catalogs = new Map()

function catalog(assetsDir) {
  if (!catalogs.has(assetsDir)) {
    const parsed = JSON.parse(readFileSync(join(assetsDir, 'frames', 'catalog.json'), 'utf8'))
    catalogs.set(assetsDir, Array.isArray(parsed.frames) ? parsed.frames : [])
  }
  return catalogs.get(assetsDir)
}

function frameName(assetsDir, { kind, item }) {
  if (item === undefined) return ''
  if (kind === 'fish') return `frame_fish_t${item.tier}.png`
  if (item.tier >= 4) {
    const target = kind === 'rod' ? 'rod' : 'bait'
    const frame = catalog(assetsDir).find((entry) => entry.target === target && entry.tier === 4 && entry.itemId === item.id)
    return frame?.asset ?? ''
  }
  return `frame_gear_t${item.tier}.png`
}

export function frameHref(assetsDir, { kind, item }) {
  const name = frameName(assetsDir, { kind, item })
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
