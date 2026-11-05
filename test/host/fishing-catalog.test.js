/** Catalog hot-reload, startup audit and codex sync for new fish/baits/rods. */
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { auditCatalogs } from '../../host/services/game-fishing/catalog-audit.js'
import { clearCatalogCache, loadCatalog, readCatalogFile } from '../../host/services/game-fishing/catalog.js'
import { FishingCodexService } from '../../host/services/game-fishing/modules/codex.js'

const REAL_ASSETS = join(process.cwd(), 'assets')

async function makeAssets(root, { rods, baits, fish, frames = [] }) {
  const assets = join(root, 'assets')
  for (const [name, key, items] of [['rods', 'rods', rods], ['baits', 'baits', baits], ['fish', 'fish', fish], ['frames', 'frames', frames]]) {
    await mkdir(join(assets, name), { recursive: true })
    await writeFile(join(assets, name, 'catalog.json'), JSON.stringify({ version: 1, [key]: items }, null, 2))
  }
  return assets
}

function catalogItem(id, tier = 1) {
  return { id, name: `${id}-name`, tier, asset: `${id}.png` }
}

const STORE = { read: async () => ({ players: { '20000': { nickname: '小明' } } }) }

test('catalog loader refreshes when the catalog file changes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-fishing-catalog-'))
  try {
    const assets = await makeAssets(root, { rods: [catalogItem('a')], baits: [], fish: [], frames: [] })
    clearCatalogCache()
    assert.equal(loadCatalog(assets, 'rods', 'rods').length, 1)
    await writeFile(join(assets, 'rods', 'catalog.json'), JSON.stringify({ version: 1, rods: [catalogItem('a'), catalogItem('b')] }))
    const future = new Date(Date.now() + 10_000)
    await utimes(join(assets, 'rods', 'catalog.json'), future, future)
    assert.equal(loadCatalog(assets, 'rods', 'rods').length, 2)
    assert.equal(readCatalogFile(assets, 'rods', 'rods').length, 2)
  } finally {
    clearCatalogCache()
    await rm(root, { recursive: true, force: true })
  }
})

test('codex picks up newly added species without a restart', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-fishing-codex-sync-'))
  try {
    const assets = await makeAssets(root, {
      rods: [catalogItem('rod_a')],
      baits: [catalogItem('bait_a')],
      fish: [catalogItem('fish_a')],
    })
    clearCatalogCache()
    const codex = new FishingCodexService({ projectDir: root, assetsDir: assets, logger: { warn() {} } })
    const call = () => codex.execute({ rawCommand: '/钓鱼 图鉴', groupId: 'g1', userId: '20000', store: STORE })
    const first = await call()
    assert.match(first.replies[0], /鱼竿 0\/1/u)
    assert.match(first.replies[0], /鱼 0\/1/u)

    const future = new Date(Date.now() + 10_000)
    for (const [name, key, items] of [
      ['rods', 'rods', [catalogItem('rod_a'), catalogItem('rod_b', 2)]],
      ['baits', 'baits', [catalogItem('bait_a'), catalogItem('bait_b', 2)]],
      ['fish', 'fish', [catalogItem('fish_a'), catalogItem('fish_b', 2)]],
    ]) {
      const file = join(assets, name, 'catalog.json')
      await writeFile(file, JSON.stringify({ version: 1, [key]: items }, null, 2))
      await utimes(file, future, future)
    }
    const second = await call()
    assert.match(second.replies[0], /鱼竿 0\/2/u)
    assert.match(second.replies[0], /鱼饵 0\/2/u)
    assert.match(second.replies[0], /鱼 0\/2/u)
  } finally {
    clearCatalogCache()
    await rm(root, { recursive: true, force: true })
  }
})

test('catalog audit flags missing gameplay data, art and unsupported tiers', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-fishing-audit-'))
  try {
    const assets = await makeAssets(root, {
      rods: [catalogItem('custom_rod', 6)],
      baits: [catalogItem('custom_bait', 2)],
      fish: [catalogItem('custom_fish', 6)],
    })
    const { warnings } = auditCatalogs({ assetsDir: assets })
    assert.ok(warnings.some((line) => /rod custom_rod: missing ROD_INFO/u.test(line)))
    assert.ok(warnings.some((line) => /rod custom_rod: tier 6/u.test(line)))
    assert.ok(warnings.some((line) => /bait custom_bait: missing NORMAL_BAIT_COEFFICIENTS/u.test(line)))
    assert.ok(warnings.some((line) => /fish custom_fish: missing FISH_STATS/u.test(line)))
    assert.ok(warnings.some((line) => /fish custom_fish: tier 6/u.test(line)))
    assert.ok(warnings.some((line) => /missing art/u.test(line)))
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('the shipped catalogs are complete', () => {
  const { warnings } = auditCatalogs({ assetsDir: REAL_ASSETS })
  assert.deepEqual(warnings, [])
})
