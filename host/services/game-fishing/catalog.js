/**
 * Fishing catalogs: the single source of truth for rods, baits, fish, items
 * and frames.
 *
 * Every catalog part is cached by file mtime, so editing
 * `assets/<kind>/catalog.json` (adding a fish, bait, rod, frame...) is picked
 * up on the next command in every catalog-driven service, without a DSH
 * restart. Services share one instance per assets directory via
 * `catalogFor()`; a part is only parsed when a command asks for it.
 */
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const PACKAGE_ASSETS = fileURLToPath(new URL('../../../assets/', import.meta.url))

const instances = new Map()

/** Resolve the assets directory the same way every fishing service does. */
export function resolveAssetsDir(projectDir, assetsDir) {
  if (typeof assetsDir === 'string' && assetsDir !== '') return assetsDir
  if (typeof projectDir === 'string' && existsSync(join(projectDir, 'assets', 'rods', 'catalog.json'))) {
    return join(projectDir, 'assets')
  }
  return PACKAGE_ASSETS
}

function catalogPath(assetsDir, name) {
  return join(assetsDir, name, 'catalog.json')
}

/** Parse `assets/<name>/catalog.json`; the file's array key is the folder name. */
function readItems(assetsDir, name) {
  let text
  try {
    text = readFileSync(catalogPath(assetsDir, name), 'utf8')
  } catch {
    throw new Error(`missing catalog: ${name}`)
  }
  const parsed = JSON.parse(text)
  if (!Array.isArray(parsed[name])) throw new Error(`invalid catalog: ${name}`)
  return parsed[name]
}

function indexById(items) {
  const index = new Map()
  for (const item of items) {
    if (typeof item?.id === 'string' && item.id !== '') index.set(item.id, item)
  }
  return index
}

function groupByTier(items) {
  const groups = {}
  for (const item of items) {
    const tier = Number(item?.tier)
    if (!Number.isInteger(tier) || tier <= 0) continue
    if (groups[tier] === undefined) groups[tier] = []
    groups[tier].push(item)
  }
  return groups
}

/** Build the parse result for one catalog part (indexes only where useful). */
function buildPart(name, items) {
  if (name === 'items' || name === 'frames') return { items }
  return { items, byId: indexById(items), byTier: groupByTier(items) }
}

/** One parsed catalog view for an assets directory; parts refresh by mtime. */
export class FishingCatalog {
  /** @param {string} assetsDir */
  constructor(assetsDir) {
    this.assetsDir = assetsDir
    this.parts = new Map()
  }

  /** Load (or refresh) one catalog part and return its cached parse result. */
  #part(name) {
    let mtimeMs
    try {
      mtimeMs = statSync(catalogPath(this.assetsDir, name)).mtimeMs
    } catch {
      this.parts.delete(name)
      throw new Error(`missing catalog: ${name}`)
    }
    const cached = this.parts.get(name)
    if (cached !== undefined && cached.mtimeMs === mtimeMs) return cached.part
    const part = buildPart(name, readItems(this.assetsDir, name))
    this.parts.set(name, { mtimeMs, part })
    return part
  }

  /**
   * Throwing accessor that only requires the catalogs a command needs.
   *
   * @param {Array<'rods'|'baits'|'fish'|'items'|'frames'>} [names]
   */
  assertReady(names = ['rods', 'baits']) {
    for (const name of names) this.#part(name)
    return this
  }

  get rods() { return this.#part('rods').items }
  get baits() { return this.#part('baits').items }
  get fish() { return this.#part('fish').items }
  get items() { return this.#part('items').items }
  get frames() { return this.#part('frames').items }
  get rodById() { return this.#part('rods').byId }
  get baitById() { return this.#part('baits').byId }
  get fishById() { return this.#part('fish').byId }
  get rodsByTier() { return this.#part('rods').byTier }
  get baitsByTier() { return this.#part('baits').byTier }
  get fishByTier() { return this.#part('fish').byTier }
  /** Rod and bait entries merged by id (used by the gacha history card). */
  get itemById() {
    return new Map([...this.rodById, ...this.baitById])
  }
  get specialLow() { return this.items.filter((item) => item?.category === 'special_low') }
  get specialHigh() {
    return this.items.filter((item) => item?.category === 'special_high' || item?.category === 'ticket')
  }
}

/** Shared catalog instance for one assets directory. */
export function catalogFor(assetsDir) {
  const key = String(assetsDir)
  let catalog = instances.get(key)
  if (catalog === undefined) {
    catalog = new FishingCatalog(key)
    instances.set(key, catalog)
  }
  return catalog
}

/** Read a catalog without touching any cache (audits, tests). */
export function readCatalogFile(assetsDir, name) {
  return readItems(assetsDir, name)
}

/** Drop every catalog cache (tests only). */
export function clearCatalogCache() {
  instances.clear()
}
