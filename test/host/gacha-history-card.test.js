/** Gacha history card: recent draws render as a 1080-wide long PNG. */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { renderGachaHistoryCard } from '../../host/services/game-fishing/render/gacha-history-card.js'

const ASSETS = fileURLToPath(new URL('../../assets/', import.meta.url))
const PITY = {
  rod: { value: 3, limit: 10 },
  lv3Rod: { value: 12, limit: 50 },
  legendaryBait: { value: 20, limit: 60 },
  legendaryRod: { value: 45, limit: 150 },
}

async function catalog(folder) {
  const parsed = JSON.parse(await readFile(new URL(`../../assets/${folder}/catalog.json`, import.meta.url), 'utf8'))
  return parsed[folder]
}

function pick(items, tier) {
  return items.find((item) => item.tier === tier) ?? items[0]
}

function draw(drawNo, timeLabel, sourceLabel, item, kind, tier, rarityLabel, pity, duplicateSold) {
  return {
    drawNo,
    timeLabel,
    sourceLabel,
    itemId: item.id,
    name: item.name,
    kind,
    tier,
    rarityLabel,
    pity,
    duplicateSold,
  }
}

/** Six draws covering legendary frames, pity, duplicate sale and an unknown item. */
async function fixtureRows() {
  const [rods, baits] = await Promise.all([catalog('rods'), catalog('baits')])
  const legendaryRod = pick(rods, 4)
  const lv3Rod = pick(rods, 3)
  const legendaryBait = pick(baits, 4)
  const lv2Bait = pick(baits, 2)
  const lv1Bait = pick(baits, 1)
  return [
    draw(37, '11-05 14:32', '单抽券', legendaryRod, 'rod', 4, '传奇', true, 0),
    draw(36, '11-05 14:31', '十连券', lv3Rod, 'rod', 3, 'Lv.3', false, 120),
    draw(35, '11-05 14:31', '十连券', { id: 'no_such_item', name: '神秘道具' }, 'rod', 2, 'Lv.2', false, 0),
    draw(34, '11-05 14:31', '十连券', lv2Bait, 'bait', 2, 'Lv.2', false, 0),
    draw(33, '11-04 09:02', '钓鱼币单抽', lv1Bait, 'bait', 1, 'Lv.1', true, 0),
    draw(32, '11-04 09:02', '钓鱼币单抽', legendaryBait, 'bait', 4, '传奇', false, 0),
  ]
}

function summaryOf(rows, totalDraws = 123) {
  return {
    totalDraws,
    shown: rows.length,
    legendary: rows.filter((row) => row.tier >= 4).length,
    duplicateCoins: rows.reduce((sum, row) => sum + row.duplicateSold, 0),
    pity: PITY,
  }
}

function fiftyRows(rows) {
  return Array.from({ length: 50 }, (_, index) => ({
    ...rows[index % rows.length],
    drawNo: 50 - index,
    pity: index % 7 === 0,
    duplicateSold: index % 5 === 0 ? 120 : 0,
  }))
}

function pngSize(png) {
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) }
}

test('gacha history card renders six draws as a long 1080-wide PNG', async () => {
  const rows = await fixtureRows()
  const image = await renderGachaHistoryCard({ nickname: '小明', rows, summary: summaryOf(rows), assetsDir: ASSETS })

  assert.equal(image.mime, 'image/png')
  assert.equal(image.width, 1080)
  assert.ok(image.height > 1200, `height ${image.height} should be a long card`)
  assert.ok(image.data.length > 20000, `base64 payload is only ${image.data.length} chars`)

  const png = Buffer.from(image.data, 'base64')
  assert.equal(png.subarray(0, 4).toString('hex'), '89504e47')
  assert.ok(png.length > 20000, `PNG is only ${png.length} bytes`)
  assert.deepEqual(pngSize(png), { width: 1080, height: image.height })
})

test('fifty draws extend the card well past the six-draw version', async () => {
  const rows = await fixtureRows()
  const six = await renderGachaHistoryCard({ nickname: '小明', rows, summary: summaryOf(rows), assetsDir: ASSETS })
  const many = fiftyRows(rows)
  const fifty = await renderGachaHistoryCard({ nickname: '小明', rows: many, summary: summaryOf(many, 200), assetsDir: ASSETS })

  assert.equal(fifty.mime, 'image/png')
  assert.equal(fifty.width, 1080)
  assert.ok(fifty.height > six.height + 1000, `50 draws ${fifty.height} vs 6 draws ${six.height}`)
  const png = Buffer.from(fifty.data, 'base64')
  assert.equal(png.subarray(0, 4).toString('hex'), '89504e47')
  assert.ok(png.length > 20000, `PNG is only ${png.length} bytes`)
  assert.deepEqual(pngSize(png), { width: 1080, height: fifty.height })
})

test('renders stay independent between calls', async () => {
  const rows = await fixtureRows()
  const first = await renderGachaHistoryCard({ nickname: '小明', rows, summary: summaryOf(rows), assetsDir: ASSETS })
  const many = fiftyRows(rows)
  const fifty = await renderGachaHistoryCard({ nickname: '小红', rows: many, summary: summaryOf(many, 200), assetsDir: ASSETS })
  const again = await renderGachaHistoryCard({ nickname: '小刚', rows, summary: summaryOf(rows), assetsDir: ASSETS })

  assert.equal(again.height, first.height)
  assert.equal(again.width, 1080)
  assert.equal(again.mime, 'image/png')
  assert.notEqual(again.data, first.data)
  assert.equal(fifty.height > again.height, true)

  const png = Buffer.from(again.data, 'base64')
  assert.equal(png.subarray(0, 4).toString('hex'), '89504e47')
  assert.deepEqual(pngSize(png), { width: 1080, height: again.height })
})
