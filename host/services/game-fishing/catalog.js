/**
 * Catalog loading for the fishing art/gameplay JSON.
 *
 * Catalogs are read through an mtime-aware cache so editing
 * `assets/<kind>/catalog.json` (adding fish, baits or rods) is picked up by
 * catalog-driven views (the codex) without a DSH restart.
 */
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const PACKAGE_ASSETS = fileURLToPath(new URL('../../../assets/', import.meta.url))
const cache = new Map()

/** Resolve the assets directory the same way every fishing service does. */
export function resolveAssetsDir(projectDir, assetsDir) {
  if (typeof assetsDir === 'string' && assetsDir !== '') return assetsDir
  if (typeof projectDir === 'string' && existsSync(join(projectDir, 'assets', 'rods', 'catalog.json'))) {
    return join(projectDir, 'assets')
  }
  return PACKAGE_ASSETS
}

/**
 * Read one catalog array, re-parsing when the file changes on disk.
 *
 * @param {string} assetsDir
 * @param {string} name catalog folder (`rods`/`baits`/`fish`/`items`/`frames`)
 * @param {string} key array key inside the JSON
 * @returns {any[]}
 */
export function loadCatalog(assetsDir, name, key) {
  const path = join(assetsDir, name, 'catalog.json')
  let mtimeMs
  try {
    mtimeMs = statSync(path).mtimeMs
  } catch {
    throw new Error(`missing catalog: ${name}`)
  }
  const cached = cache.get(path)
  if (cached !== undefined && cached.mtimeMs === mtimeMs) return cached.items
  const parsed = JSON.parse(readFileSync(path, 'utf8'))
  if (!Array.isArray(parsed[key])) throw new Error(`invalid catalog: ${name}`)
  cache.set(path, { mtimeMs, items: parsed[key] })
  return parsed[key]
}

/** Read a catalog without touching the cache (audits, tests). */
export function readCatalogFile(assetsDir, name, key) {
  const parsed = JSON.parse(readFileSync(join(assetsDir, name, 'catalog.json'), 'utf8'))
  if (!Array.isArray(parsed[key])) throw new Error(`invalid catalog: ${name}`)
  return parsed[key]
}

/** Drop the mtime cache (tests only). */
export function clearCatalogCache() {
  cache.clear()
}
