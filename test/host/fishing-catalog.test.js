/** Catalog hot-reload, startup audit and codex sync for new fish/baits/rods. */
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { auditCatalogs } from '../../host/services/game-fishing/catalog-audit.js'
import { FishingCatalog, catalogFor, clearCatalogCache, readCatalogFile } from '../../host/services/game-fishing/catalog.js'
import { FishingBagService } from '../../host/services/game-fishing/modules/fishing-bag.js'
import { FishingCodexService } from '../../host/services/game-fishing/modules/codex.js'
import { FishingRodService } from '../../host/services/game-fishing/modules/fishing-rod.js'

const REAL_ASSETS = join(process.cwd(), 'assets')

async function makeAssets(root, { rods, baits, fish, items = [], frames = [] }) {
  const assets = join(root, 'assets')
  for (const [name, key, itemsList] of [['rods', 'rods', rods], ['baits', 'baits', baits], ['fish', 'fish', fish], ['items', 'items', items], ['frames', 'frames', frames]]) {
    const items = itemsList
    await mkdir(join(assets, name), { recursive: true })
    await writeFile(join(assets, name, 'catalog.json'), JSON.stringify({ version: 1, [key]: items }, null, 2))
  }
  return assets
}

/** Write and mtime-bump a catalog so the mtime cache notices the change. */
async function rewriteCatalog(assets, name, key, items) {
  const file = join(assets, name, 'catalog.json')
  await writeFile(file, JSON.stringify({ version: 1, [key]: items }, null, 2))
  const future = new Date(Date.now() + 10_000)
  await utimes(file, future, future)
}

function catalogItem(id, tier = 1) {
  return { id, name: `${id}-name`, tier, asset: `${id}.png` }
}

const STORE = { read: async () => ({ players: { '20000': { nickname: '小明' } } }) }

test('catalogs refresh by mtime and share one instance per assets dir', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-fishing-catalog-'))
  try {
    const assets = await makeAssets(root, { rods: [catalogItem('a')], baits: [], fish: [], frames: [] })
    clearCatalogCache()
    const catalog = new FishingCatalog(assets)
    assert.equal(catalog.rods.length, 1)
    assert.equal(catalog.rodsByTier[1].length, 1)
    assert.equal(catalogFor(assets), catalogFor(assets))
    await rewriteCatalog(assets, 'rods', 'rods', [catalogItem('a'), catalogItem('b', 2)])
    assert.equal(catalog.rods.length, 2)
    assert.equal(catalog.rodsByTier[2].length, 1)
    assert.equal(readCatalogFile(assets, 'rods').length, 2)
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

test('the item library and rod view pick up catalog changes in place', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-fishing-services-sync-'))
  try {
    const assets = await makeAssets(root, { rods: [], baits: [], fish: [] })
    clearCatalogCache()
    const owned = {
      read: async () => ({
        players: {
          '20000': {
            nickname: '小明',
            fishing: {
              rods: { owned: ['bamboo_hand'], equipped: 'bamboo_hand' },
              baits: { counts: { dough: 1 }, selected: 'dough' },
              tickets: { singleTickets: 0, tenTickets: 0 },
            },
          },
        },
      }),
    }
    const bag = new FishingBagService({ projectDir: root, assetsDir: assets, logger: { warn() {} } })
    const rod = new FishingRodService({ projectDir: root, assetsDir: assets, logger: { warn() {} } })
    const bagCall = () => bag.execute({ rawCommand: '/钓鱼 道具库', groupId: 'g1', userId: '20000', store: owned })
    const rodCall = () => rod.execute({ rawCommand: '/钓鱼 查看鱼竿', groupId: 'g1', userId: '20000', store: owned })

    assert.match((await bagCall()).replies[0], /鱼竿 0 把/u)
    assert.match((await rodCall()).replies[0], /当前没有装备鱼竿/u)

    await rewriteCatalog(assets, 'rods', 'rods', [catalogItem('bamboo_hand')])
    await rewriteCatalog(assets, 'baits', 'baits', [catalogItem('dough')])
    assert.match((await bagCall()).replies[0], /鱼竿 1 把 · 鱼饵 1 种/u)
    assert.match((await rodCall()).replies[0], /bamboo_hand-name/u)
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
