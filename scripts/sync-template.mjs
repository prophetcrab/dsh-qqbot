#!/usr/bin/env node
/**
 * Sync the bundled Koishi template from the canonical qq-bot repo.
 *
 *   node scripts/sync-template.mjs            # write template/
 *   node scripts/sync-template.mjs --check    # fail on drift (CI)
 *
 * Source defaults to ../qq-bot. Runtime data, dependencies, logs and the
 * generated runtime-bundles directory are never synced.
 */
import { existsSync, readFileSync, readdirSync, rmSync, mkdirSync, copyFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DEST = join(ROOT, 'template')
const args = process.argv.slice(2)
const check = args.includes('--check')
const sourceArg = args.find((arg) => !arg.startsWith('--'))
const SOURCE = resolve(sourceArg ?? process.env.QQBOT_SOURCE ?? join(ROOT, '..', 'qq-bot'))
const SKIP_TOP = new Set(['node_modules', 'data', 'logs', 'runtime', 'runtime-bundles', '.git', '.DS_Store'])
const SKIP_ANY = new Set(['.DS_Store'])

if (!existsSync(join(SOURCE, 'package.json'))) {
  console.error(`qq-bot source not found: ${SOURCE}`)
  process.exit(2)
}

function walk(dir, base = dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    const rel = relative(base, full)
    if (rel === '') continue
    if (rel.split('/').length === 1 && SKIP_TOP.has(entry.name)) continue
    if (SKIP_ANY.has(entry.name)) continue
    if (entry.isDirectory()) walk(full, base, out)
    else if (entry.isFile()) out.push(rel)
  }
  return out
}

const sourceFiles = new Set(walk(SOURCE, SOURCE))
const targetFiles = existsSync(DEST) ? new Set(walk(DEST, DEST)) : new Set()
const missing = [...sourceFiles].filter((file) => !targetFiles.has(file))
const extra = [...targetFiles].filter((file) => !sourceFiles.has(file))
const changed = [...sourceFiles].filter((file) => targetFiles.has(file) && readFileSync(join(SOURCE, file)).compare(readFileSync(join(DEST, file))) !== 0)

if (check) {
  if (missing.length + extra.length + changed.length > 0) {
    console.error('template drift detected:')
    for (const file of missing) console.error(`  missing: ${file}`)
    for (const file of extra) console.error(`  extra:   ${file}`)
    for (const file of changed) console.error(`  changed: ${file}`)
    process.exit(1)
  }
  console.log(`template is in sync with ${SOURCE} (${sourceFiles.size} files)`)
  process.exit(0)
}

mkdirSync(DEST, { recursive: true })
for (const file of sourceFiles) {
  const target = join(DEST, file)
  mkdirSync(dirname(target), { recursive: true })
  copyFileSync(join(SOURCE, file), target)
}
for (const file of extra) rmSync(join(DEST, file), { force: true })
console.log(`synced ${sourceFiles.size} files from ${SOURCE} -> template/`)
