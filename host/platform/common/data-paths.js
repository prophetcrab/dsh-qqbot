/**
 * Runtime data layout for the bundled Koishi project.
 *
 * New layout:
 *   data/config/   user-editable configuration
 *   data/state/    runtime state, databases, QR caches
 *   data/assets/   content assets (presets, profiles)
 *   data/logs/     logs
 *
 * Legacy files at data/<name>.json are migrated once. The migration is
 * idempotent and never overwrites an existing target.
 */

import { existsSync as fsExistsSync, promises as fsp } from 'node:fs'
import { dirname, join } from 'node:path'

/** Canonical runtime data paths. */
export function dataPaths(projectDir) {
  const root = join(projectDir, 'data')
  return {
    root,
    config: {
      access: join(root, 'config', 'access.json'),
      persona: join(root, 'config', 'persona.json'),
    },
    state: {
      aiDiscovery: join(root, 'state', 'ai.json'),
      koishiDb: join(root, 'state', 'koishi.db'),
      napcatQr: join(root, 'state', 'napcat-login-qr.png'),
    },
    assets: {
      personaPresets: join(root, 'assets', 'persona-presets.json'),
      profiles: join(root, 'assets', 'profiles.json'),
    },
    logs: join(root, 'logs'),
  }
}

/** One-time legacy -> new layout moves. */
const MOVES = [
  ['access.json', 'config', 'access.json'],
  ['persona.json', 'config', 'persona.json'],
  ['persona-presets.json', 'assets', 'persona-presets.json'],
  ['profiles.json', 'assets', 'profiles.json'],
  ['ai.json', 'state', 'ai.json'],
  ['napcat-login-qr.png', 'state', 'napcat-login-qr.png'],
]

/**
 * Migrate the legacy flat data/ layout into config/state/assets.
 *
 * @param {string} projectDir
 * @param {{ includeDatabase?: boolean }} [options] includeDatabase is only safe
 *   while Koishi is stopped (moves the SQLite database and updates koishi.yml).
 * @returns {Promise<{ moved: string[], skipped: string[], includedDatabase: boolean }>}
 */
export async function migrateDataLayout(projectDir, options = {}) {
  const paths = dataPaths(projectDir)
  const moved = []
  const skipped = []
  await fsp.mkdir(paths.root, { recursive: true })
  for (const dir of [join(paths.root, 'config'), join(paths.root, 'state'), join(paths.root, 'assets'), paths.logs]) {
    await fsp.mkdir(dir, { recursive: true })
  }
  for (const [legacyName, bucket, nextName] of MOVES) {
    const legacy = join(paths.root, legacyName)
    const target = join(paths.root, bucket, nextName)
    if (!fsExistsSync(legacy)) continue
    if (fsExistsSync(target)) {
      skipped.push(legacyName)
      continue
    }
    await fsp.rename(legacy, target)
    moved.push(legacyName)
  }
  let includedDatabase = false
  if (options.includeDatabase === true) {
    for (const suffix of ['', '-wal', '-shm']) {
      const legacy = join(paths.root, `koishi.db${suffix}`)
      const target = join(paths.state.koishiDb + suffix)
      if (!fsExistsSync(legacy)) continue
      if (fsExistsSync(target)) {
        skipped.push(`koishi.db${suffix}`)
        continue
      }
      await fsp.rename(legacy, target)
      moved.push(`koishi.db${suffix}`)
    }
    includedDatabase = true
    await updateKoishiDbPath(projectDir, paths.state.koishiDb)
  }
  return { moved, skipped, includedDatabase }
}

/** Point koishi.yml's sqlite path at data/state/koishi.db. */
async function updateKoishiDbPath(projectDir, target) {
  const file = join(projectDir, 'koishi.yml')
  try {
    const text = await fsp.readFile(file, 'utf8')
    const next = text.replace(/(\bpath:\s*)data\/koishi\.db\b/u, `$1data/state/koishi.db`)
    if (next !== text) {
      await fsp.mkdir(dirname(file), { recursive: true })
      await fsp.writeFile(file, next, 'utf8')
    }
  } catch {
    // A missing koishi.yml is reported by setup; migration is best-effort here.
  }
}
