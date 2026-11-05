/** Codex card: renders every rod, bait and fish as a 1080-wide long PNG. */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { renderCodexCard } from '../../host/services/game-fishing/render/codex-card.js'

const ASSETS = fileURLToPath(new URL('../../assets/', import.meta.url))
const FIXTURE_DATES = ['2026-10-01', '2026-10-12', '2026-11-01', '2026-11-03', '2026-11-05']

async function catalog(folder) {
  const parsed = JSON.parse(await readFile(new URL(`../../assets/${folder}/catalog.json`, import.meta.url), 'utf8'))
  return parsed[folder]
}

function owned(items, count, decorate) {
  return items.map((item, index) => (index < count
    ? { ...item, owned: true, ...decorate(index, item) }
    : { ...item, owned: false, acquiredAt: null, acquiredLabel: null }))
}

function summaryOf(data) {
  return {
    rodsOwned: data.rods.filter((item) => item.owned).length,
    rodsTotal: data.rods.length,
    baitsOwned: data.baits.filter((item) => item.owned).length,
    baitsTotal: data.baits.length,
    fishOwned: data.fish.filter((item) => item.owned).length,
    fishTotal: data.fish.length,
  }
}

async function fixture() {
  const [rods, baits, fish] = await Promise.all([catalog('rods'), catalog('baits'), catalog('fish')])
  const data = {
    rods: owned(rods, 3, (index) => ({
      acquiredAt: `${FIXTURE_DATES[index]}T12:00:00+08:00`,
      acquiredLabel: FIXTURE_DATES[index],
    })),
    baits: owned(baits, 2, (index) => ({
      acquiredAt: `${FIXTURE_DATES[index]}T12:00:00+08:00`,
      acquiredLabel: FIXTURE_DATES[index],
    })),
    fish: owned(fish, 5, (index) => ({
      maxWeightKg: 1.25 + index * 3.1,
      maxWeightLabel: `${(1.25 + index * 3.1).toFixed(2)}kg`,
    })),
  }
  return { ...data, summary: summaryOf(data) }
}

function pngSize(png) {
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) }
}

test('codex card renders specs, dimensions and every owned/missing entry', async () => {
  const data = await fixture()
  const image = await renderCodexCard({ nickname: '小明', data, assetsDir: ASSETS })

  assert.equal(image.mime, 'image/png')
  assert.equal(image.width, 1080)
  assert.ok(image.height > 1800, `height ${image.height} should be a long card`)

  const png = Buffer.from(image.data, 'base64')
  assert.equal(png.subarray(0, 4).toString('hex'), '89504e47')
  assert.ok(png.length > 20000, `PNG is only ${png.length} bytes`)
  assert.deepEqual(pngSize(png), { width: 1080, height: image.height })

  // A second render must succeed too: the icon cache may not leak between calls.
  const again = await renderCodexCard({ nickname: '小红', data, assetsDir: ASSETS })
  assert.equal(again.mime, 'image/png')
  assert.equal(again.width, 1080)
  assert.equal(again.height, image.height)
  const pngAgain = Buffer.from(again.data, 'base64')
  assert.equal(pngAgain.subarray(0, 4).toString('hex'), '89504e47')
  assert.ok(pngAgain.length > 20000)
  assert.deepEqual(pngSize(pngAgain), { width: 1080, height: again.height })
})
