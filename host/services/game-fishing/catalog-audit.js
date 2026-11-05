/**
 * Startup audit for fishing catalogs: a new fish/bait/rod entry must also have
 * gameplay data and art, otherwise `/钓鱼 抛竿`/`抽卡` would fail later.
 *
 * The audit only logs warnings; it never blocks plugin activation.
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { FISH_STATS, LEGENDARY_BAIT_EFFECTS, NORMAL_BAIT_COEFFICIENTS } from './data.js'
import { readCatalogFile } from './catalog.js'
import { ROD_INFO } from './modules/fishing-rod.js'

const FISH_TIERS = new Set([1, 2, 3, 4, 5])
const GEAR_TIERS = new Set([1, 2, 3, 4])

function readSafe(assetsDir, name, key, warnings) {
  try {
    return readCatalogFile(assetsDir, name, key)
  } catch (error) {
    warnings.push(`${name} catalog unavailable: ${String(error?.message ?? error)}`)
    return []
  }
}

function assetMissing(assetsDir, folder, asset) {
  return typeof asset !== 'string' || asset === '' || !existsSync(join(assetsDir, folder, asset))
}

function frameCatalog(assetsDir) {
  try {
    return readCatalogFile(assetsDir, 'frames', 'frames')
  } catch {
    return []
  }
}

function hasLegendaryFrame(frames, kind, id) {
  return frames.some((frame) => frame !== null
    && typeof frame === 'object'
    && frame.target === (kind === 'rod' ? 'rod' : 'bait')
    && frame.tier === 4
    && frame.itemId === id)
}

/**
 * Check every catalog entry against gameplay data, art and tier support.
 *
 * @param {{ assetsDir: string }} input
 * @returns {{ warnings: string[] }}
 */
export function auditCatalogs({ assetsDir }) {
  const warnings = []
  const rods = readSafe(assetsDir, 'rods', 'rods', warnings)
  const baits = readSafe(assetsDir, 'baits', 'baits', warnings)
  const fish = readSafe(assetsDir, 'fish', 'fish', warnings)
  const frames = frameCatalog(assetsDir)

  const rodIds = new Set()
  for (const rod of rods) {
    const id = String(rod?.id ?? '')
    rodIds.add(id)
    if (ROD_INFO[id] === undefined) {
      warnings.push(`rod ${id}: missing ROD_INFO (weights/sellPrice/effect)`)
    }
    if (!GEAR_TIERS.has(Number(rod?.tier))) {
      warnings.push(`rod ${id}: tier ${rod?.tier} needs gacha/cast tier support`)
    }
    if (assetMissing(assetsDir, 'rods', rod?.asset)) warnings.push(`rod ${id}: missing art ${rod?.asset ?? ''}`)
    if (Number(rod?.tier) >= 4 && !hasLegendaryFrame(frames, 'rod', id)) {
      warnings.push(`rod ${id}: missing legendary frame entry`)
    }
  }

  const baitIds = new Set()
  for (const bait of baits) {
    const id = String(bait?.id ?? '')
    baitIds.add(id)
    const legendary = LEGENDARY_BAIT_EFFECTS.includes(id)
    if (!legendary && NORMAL_BAIT_COEFFICIENTS[id] === undefined) {
      warnings.push(`bait ${id}: missing NORMAL_BAIT_COEFFICIENTS or LEGENDARY_BAIT_EFFECTS entry`)
    }
    if (!GEAR_TIERS.has(Number(bait?.tier))) {
      warnings.push(`bait ${id}: tier ${bait?.tier} needs gacha/cast tier support`)
    }
    if (assetMissing(assetsDir, 'baits', bait?.asset)) warnings.push(`bait ${id}: missing art ${bait?.asset ?? ''}`)
    if (Number(bait?.tier) >= 4 && !hasLegendaryFrame(frames, 'bait', id)) {
      warnings.push(`bait ${id}: missing legendary frame entry`)
    }
  }

  const fishIds = new Set()
  for (const item of fish) {
    const id = String(item?.id ?? '')
    fishIds.add(id)
    if (FISH_STATS[id] === undefined) warnings.push(`fish ${id}: missing FISH_STATS (weight/price)`)
    const tier = Number(item?.tier)
    if (!FISH_TIERS.has(tier)) warnings.push(`fish ${id}: tier ${item?.tier} needs fishByTier/frame support`)
    if (assetMissing(assetsDir, 'fish', item?.asset)) warnings.push(`fish ${id}: missing art ${item?.asset ?? ''}`)
    if (Number.isInteger(tier) && tier > 0 && !existsSync(join(assetsDir, 'frames', `frame_fish_t${tier}.png`))) {
      warnings.push(`fish ${id}: missing frame_fish_t${tier}.png`)
    }
  }

  for (const id of Object.keys(ROD_INFO)) if (!rodIds.has(id)) warnings.push(`ROD_INFO has unused rod ${id}`)
  for (const id of Object.keys(NORMAL_BAIT_COEFFICIENTS)) if (!baitIds.has(id)) warnings.push(`bait coefficients have unused bait ${id}`)
  for (const id of LEGENDARY_BAIT_EFFECTS) if (!baitIds.has(id)) warnings.push(`legendary bait effect has unused bait ${id}`)
  for (const id of Object.keys(FISH_STATS)) if (!fishIds.has(id)) warnings.push(`FISH_STATS has unused fish ${id}`)

  return { warnings }
}
