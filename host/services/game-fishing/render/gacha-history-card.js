/** Render the recent gacha draw history as a light, long PNG. */
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { frameHref } from './frames.js'
import { convertSvgFile } from './png.js'

const WIDTH = 1080
const MARGIN = 56
const CONTENT = WIDTH - MARGIN * 2
const CARD_GAP = 20
const CARD_W = (CONTENT - CARD_GAP) / 2
const CARD_H = 150
const CARD_GAP_Y = 18
const COLUMNS = 2
const LIST_TOP = 524
const MAX_ROWS = 50
const FOOTER_H = 64
const BOTTOM_PAD = 100
const MIN_HEIGHT = 1240
const FONT = 'Yuanti SC, Hannotate SC, Hiragino Maru Gothic ProN, PingFang SC, sans-serif'
const INK = '#2b4b55'
const MUTED = '#6b8a91'
const CARD = '#fffdf7'
const CORAL = '#ef8d7e'
const TEAL = '#3fae9f'
const SKY_TOP = '#bce8ff'
const SKY_BOTTOM = '#eaf9ef'
const POND = '#93dfd2'
const POND_DARK = '#72cec6'
const GOLD_INK = '#b9832a'
const TIER_COLOR = { 1: '#9aaeb3', 2: '#5db7e8', 3: '#b392ee', 4: '#f0b64b', 5: '#f59e0b' }
const TIER_SOFT = { 1: '#e9eef0', 2: '#e3f4fd', 3: '#f0e9ff', 4: '#fff1d2', 5: '#fff0cf' }
const PITY_ROWS = [
  { key: 'rod', label: '鱼竿', limit: 10 },
  { key: 'lv3Rod', label: 'Lv.3 鱼竿', limit: 50 },
  { key: 'legendaryBait', label: '传奇鱼饵', limit: 60 },
  { key: 'legendaryRod', label: '传奇鱼竿', limit: 150 },
]
const ICON_CACHE = new Map()
const CATALOG_CACHE = new Map()

function esc(value) {
  return String(value ?? '').replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;').replace(/"/gu, '&quot;').replace(/'/gu, '&apos;')
}
function cut(value, length) {
  const text = String(value ?? '')
  return text.length > length ? `${text.slice(0, length - 1)}…` : text
}
function text(value) { return value === undefined || value === null ? '' : String(value) }
function int(value, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.trunc(number) : fallback
}
function tierOf(value) {
  const tier = int(value, 1)
  return tier >= 4 ? 4 : Math.max(1, tier)
}
function colorOf(tier) { const n = Number(tier); return TIER_COLOR[n] ?? (n >= 5 ? TIER_COLOR[5] : TIER_COLOR[1]) }
function softOf(tier) { const n = Number(tier); return TIER_SOFT[n] ?? (n >= 5 ? TIER_SOFT[5] : TIER_SOFT[1]) }
function textWidth(value, size) {
  let width = 0
  for (const char of text(value)) width += char.codePointAt(0) > 0xff ? size : size * 0.56
  return width
}

async function catalogMap(assetsDir, folder) {
  const path = join(assetsDir, folder, 'catalog.json')
  if (CATALOG_CACHE.has(path)) return CATALOG_CACHE.get(path)
  let map = new Map()
  try {
    const parsed = JSON.parse(await readFile(path, 'utf8'))
    const items = Array.isArray(parsed[folder]) ? parsed[folder] : []
    map = new Map(items.filter((item) => typeof item?.id === 'string').map((item) => [item.id, item]))
  } catch {
    map = new Map()
  }
  CATALOG_CACHE.set(path, map)
  return map
}

/** Icon data URI for one draw, resolved through the asset catalog; '' when unknown. */
async function iconHref(assetsDir, folder, itemId) {
  if (!assetsDir || itemId === '') return ''
  const entry = (await catalogMap(assetsDir, folder)).get(itemId)
  if (entry === undefined || typeof entry.asset !== 'string') return ''
  const path = join(assetsDir, folder, entry.asset)
  if (ICON_CACHE.has(path)) return ICON_CACHE.get(path)
  try {
    const bytes = await readFile(path)
    const href = `data:image/png;base64,${bytes.toString('base64')}`
    ICON_CACHE.set(path, href)
    return href
  } catch { return '' }
}

/** Legendary-only decorative frame, matching the gacha result card. */
function frameFor(assetsDir, kind, tier, itemId) {
  if (!assetsDir || tier < 4 || itemId === '') return ''
  try { return frameHref(assetsDir, { kind, item: { id: itemId, tier } }) } catch { return '' }
}

function normalizeRows(rows) {
  const list = Array.isArray(rows) ? rows : []
  return list
    .filter((row) => row !== null && typeof row === 'object')
    .slice(0, MAX_ROWS)
    .map((row) => ({
      drawNo: int(row.drawNo, 0),
      timeLabel: text(row.timeLabel),
      sourceLabel: text(row.sourceLabel),
      itemId: text(row.itemId),
      name: text(row.name) === '' ? '未知道具' : text(row.name),
      kind: row.kind === 'bait' ? 'bait' : 'rod',
      tier: tierOf(row.tier),
      rarityLabel: text(row.rarityLabel),
      pity: row.pity === true,
      duplicateSold: Math.max(0, int(row.duplicateSold, 0)),
    }))
}

function summarize(rows, summary) {
  const source = summary !== null && typeof summary === 'object' ? summary : {}
  const legendary = rows.filter((row) => row.tier >= 4).length
  const duplicateCoins = rows.reduce((sum, row) => sum + row.duplicateSold, 0)
  const totalDraws = Math.max(rows.length, int(source.totalDraws, rows.length))
  return { totalDraws, shown: rows.length, legendary, duplicateCoins }
}

function normalizePity(pity) {
  const source = pity !== null && typeof pity === 'object' ? pity : {}
  return PITY_ROWS.map((row) => {
    const entry = source[row.key]
    const rawLimit = int(entry?.limit, row.limit)
    const limit = rawLimit > 0 ? rawLimit : row.limit
    const value = Math.min(limit, Math.max(0, int(entry?.value, 0)))
    return { label: row.label, value, limit }
  })
}

function layout(count) {
  const rowCount = Math.max(1, Math.ceil(count / COLUMNS))
  const listEnd = LIST_TOP + rowCount * CARD_H + (rowCount - 1) * CARD_GAP_Y
  const contentHeight = listEnd + 36 + FOOTER_H + BOTTOM_PAD
  const height = Math.max(MIN_HEIGHT, contentHeight)
  return { footerY: height - FOOTER_H - BOTTOM_PAD, height }
}

function background(height) {
  const waveA = height - 380
  const waveB = height - 320
  return `<defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${SKY_TOP}"/><stop offset="0.58" stop-color="${SKY_BOTTOM}"/><stop offset="1" stop-color="#f7fbf3"/></linearGradient>
    <radialGradient id="sun" cx="0.2" cy="0.1" r="0.5"><stop offset="0" stop-color="#fff1ad" stop-opacity="0.9"/><stop offset="1" stop-color="#fff1ad" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="${WIDTH}" height="${height}" fill="url(#sky)"/><rect width="${WIDTH}" height="${height}" fill="url(#sun)"/>
  <circle cx="900" cy="120" r="68" fill="#ffe89a" opacity="0.7"/>
  <g fill="#ffffff" opacity="0.58"><ellipse cx="160" cy="115" rx="105" ry="34"/><ellipse cx="220" cy="95" rx="65" ry="28"/><ellipse cx="850" cy="250" rx="80" ry="24"/><ellipse cx="890" cy="236" rx="45" ry="18"/></g>
  <path d="M0 ${waveA} Q150 ${waveA - 50} 300 ${waveA - 10} T600 ${waveA - 15} T900 ${waveA - 5} T1080 ${waveA - 20} V${height} H0 Z" fill="${POND}" opacity="0.95"/>
  <path d="M0 ${waveB} Q170 ${waveB - 40} 330 ${waveB - 2} T660 ${waveB - 10} T960 ${waveB} T1080 ${waveB - 12} V${height} H0 Z" fill="${POND_DARK}" opacity="0.72"/>
  <g fill="#ffffff" opacity="0.32"><circle cx="110" cy="${height - 250}" r="10"/><circle cx="150" cy="${height - 220}" r="5"/><circle cx="930" cy="${height - 270}" r="8"/><circle cx="970" cy="${height - 230}" r="4"/></g>`
}

function header(nickname) {
  return `<rect x="56" y="46" width="164" height="34" rx="17" fill="#ffffff" opacity="0.58"/>
  <text x="80" y="69" fill="${CORAL}" font-size="15" font-weight="700" font-family="${FONT}" letter-spacing="2">GACHA LOG</text>
  <text x="56" y="148" fill="${INK}" font-size="48" font-weight="700" font-family="${FONT}">抽卡记录</text>
  <text x="58" y="184" fill="${MUTED}" font-size="19" font-family="${FONT}">${esc(cut(nickname, 16))} · 旧河鱼谱</text>
  <line x1="56" y1="210" x2="1024" y2="210" stroke="${INK}" stroke-opacity="0.12" stroke-dasharray="3 8"/>`
}

function summaryChip(index, label, value, accent) {
  const x = MARGIN + index * ((CONTENT - 48) / 4 + 16)
  const width = (CONTENT - 48) / 4
  return `<rect x="${x}" y="228" width="${width}" height="96" rx="20" fill="#ffffff" opacity="0.72"/>
  <text x="${x + 22}" y="262" fill="${MUTED}" font-size="15" font-family="${FONT}">${esc(label)}</text>
  <text x="${x + 22}" y="300" fill="${accent}" font-size="24" font-weight="700" font-family="${FONT}">${esc(value)}</text>`
}

function summaryChips(chips) {
  return [
    summaryChip(0, '总抽数', String(chips.totalDraws), INK),
    summaryChip(1, '最近条数', String(chips.shown), CORAL),
    summaryChip(2, '传奇', String(chips.legendary), TIER_COLOR[4]),
    summaryChip(3, '重复回收', `${chips.duplicateCoins} 币`, TEAL),
  ].join('\n  ')
}

function pityPanel(pity) {
  const columns = pity.map((row, index) => {
    const x = 84 + index * 234
    const ratio = row.limit <= 0 ? 0 : Math.min(1, Math.max(0, row.value / row.limit))
    const filled = row.value <= 0 ? 0 : Math.max(6, 210 * ratio)
    return `<text x="${x}" y="414" fill="${MUTED}" font-size="14" font-family="${FONT}">${esc(row.label)} <tspan fill="${INK}" font-weight="700">${row.value}/${row.limit}</tspan></text>
    <rect x="${x}" y="424" width="210" height="9" rx="4.5" fill="#e6edf0"/>
    ${filled <= 0 ? '' : `<rect x="${x}" y="424" width="${Math.round(filled)}" height="9" rx="4.5" fill="${CORAL}" opacity="0.82"/>`}`
  }).join('\n  ')
  return `<rect x="56" y="344" width="968" height="112" rx="22" fill="${CARD}" opacity="0.94"/>
  <text x="84" y="382" fill="${INK}" font-size="19" font-weight="700" font-family="${FONT}">保底进度</text>
  <text x="1000" y="382" text-anchor="end" fill="${MUTED}" font-size="13" font-family="${FONT}">数值 / 上限</text>
  ${columns}`
}

function sectionTitle(chips) {
  return `<rect x="56" y="474" width="8" height="30" rx="4" fill="${CORAL}"/>
  <text x="78" y="500" fill="${INK}" font-size="27" font-weight="700" font-family="${FONT}">最近记录</text>
  <text x="1024" y="500" text-anchor="end" fill="${MUTED}" font-size="17" font-family="${FONT}">展示最近 ${chips.shown} 条 · 累计 ${chips.totalDraws} 次</text>`
}

function pill(xRight, y, label, fill, ink) {
  const width = Math.round(textWidth(label, 12)) + 20
  const x = xRight - width
  return `<rect x="${x}" y="${y}" width="${width}" height="22" rx="11" fill="${fill}"/>
  <text x="${x + width / 2}" y="${y + 15}" text-anchor="middle" fill="${ink}" font-size="12" font-weight="700" font-family="${FONT}">${esc(label)}</text>`
}

function tags(row, xRight, y) {
  let cursor = xRight
  let markup = ''
  if (row.duplicateSold > 0) {
    markup = pill(cursor, y, `重复 +${row.duplicateSold} 币`, softOf(4), GOLD_INK) + markup
    cursor -= Math.round(textWidth(`重复 +${row.duplicateSold} 币`, 12)) + 20 + 8
  }
  if (row.pity) {
    markup = pill(cursor, y, '保底', '#fdeae6', CORAL) + markup
  }
  return markup
}

function rarityOf(row) {
  if (row.tier >= 4) return '传奇'
  return row.rarityLabel === '' ? `Lv.${row.tier}` : row.rarityLabel
}

function badge(x, y, row) {
  const label = rarityOf(row)
  const width = Math.round(textWidth(label, 13)) + 22
  return `<rect x="${x}" y="${y}" width="${width}" height="24" rx="12" fill="${softOf(row.tier)}"/>
  <text x="${x + width / 2}" y="${y + 17}" text-anchor="middle" fill="${colorOf(row.tier)}" font-size="13" font-weight="700" font-family="${FONT}">${esc(label)}</text>`
}

function drawCard(row, href, frame, x, y) {
  const accent = colorOf(row.tier)
  const textX = x + 130
  const meta = [row.timeLabel, row.sourceLabel].filter((part) => part !== '').join(' · ')
  return `<g>
    <rect x="${x + 4}" y="${y + 5}" width="${CARD_W}" height="${CARD_H}" rx="18" fill="${INK}" opacity="0.05"/>
    <rect x="${x}" y="${y}" width="${CARD_W}" height="${CARD_H}" rx="18" fill="${CARD}" stroke="${accent}" stroke-width="2"/>
    ${row.tier < 4 ? '' : `<rect x="${x + 7}" y="${y + 7}" width="${CARD_W - 14}" height="${CARD_H - 14}" rx="13" fill="none" stroke="${TIER_COLOR[4]}" stroke-opacity="0.35"/>`}
    ${frame === '' ? '' : `<image x="${x + 12}" y="${y + 25}" width="100" height="100" href="${frame}"/>`}
    ${href === '' ? '' : `<image x="${x + 22}" y="${y + 35}" width="80" height="80" href="${href}"/>`}
    <text x="${textX}" y="${y + 46}" fill="${INK}" font-size="21" font-weight="700" font-family="${FONT}">${esc(cut(row.name, 10))}</text>
    <text x="${x + CARD_W - 18}" y="${y + 40}" text-anchor="end" fill="${MUTED}" font-size="14" font-family="${FONT}">#${row.drawNo}</text>
    ${badge(textX, y + 58, row)}
    ${tags(row, x + CARD_W - 18, y + 52)}
    <line x1="${textX}" y1="${y + 96}" x2="${x + CARD_W - 18}" y2="${y + 96}" stroke="${INK}" stroke-opacity="0.07"/>
    <text x="${textX}" y="${y + 122}" fill="${MUTED}" font-size="14" font-family="${FONT}">${esc(cut(meta, 22))}</text>
  </g>`
}

function emptyCard(y) {
  return `<rect x="56" y="${y}" width="968" height="88" rx="18" fill="#ffffff" opacity="0.5"/>
  <text x="84" y="${y + 52}" fill="${MUTED}" font-size="17" font-family="${FONT}">暂无抽卡记录 · 先去 /钓鱼 单抽 抽一发吧</text>`
}

function footer(y) {
  return `<rect x="56" y="${y}" width="968" height="${FOOTER_H}" rx="18" fill="#ffffff" opacity="0.82"/>
  <text x="80" y="${y + 27}" fill="${INK}" font-size="16" font-weight="700" font-family="${FONT}">旧河鱼谱 · 抽卡记录</text>
  <text x="80" y="${y + 51}" fill="${MUTED}" font-size="14" font-family="${FONT}">最多展示最近 ${MAX_ROWS} 次抽卡 · 最新在前</text>`
}

async function buildCardSvg({ nickname, rows, chips, pity, assetsDir, footerY, height }) {
  const cards = await Promise.all(rows.map(async (row, index) => {
    const folder = row.kind === 'rod' ? 'rods' : 'baits'
    const href = await iconHref(assetsDir, folder, row.itemId)
    const frame = frameFor(assetsDir, row.kind, row.tier, row.itemId)
    const x = MARGIN + (index % COLUMNS) * (CARD_W + CARD_GAP)
    const y = LIST_TOP + Math.floor(index / COLUMNS) * (CARD_H + CARD_GAP_Y)
    return drawCard(row, href, frame, x, y)
  }))
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${WIDTH}" height="${height}" viewBox="0 0 ${WIDTH} ${height}">
  ${background(height)}
  ${header(nickname)}
  ${summaryChips(chips)}
  ${pityPanel(pity)}
  ${sectionTitle(chips)}
  ${cards.length === 0 ? emptyCard(LIST_TOP) : cards.join('\n  ')}
  ${footer(footerY)}
</svg>`
}

export async function renderGachaHistoryCard({ nickname, rows, summary, assetsDir }) {
  const list = normalizeRows(rows)
  const chips = summarize(list, summary)
  const pity = normalizePity(summary?.pity)
  const { footerY, height } = layout(list.length)
  const svg = await buildCardSvg({ nickname, rows: list, chips, pity, assetsDir, footerY, height })
  const dir = await mkdtemp(join(tmpdir(), 'dsh-gacha-history-card-'))
  const input = join(dir, 'history.svg')
  const output = join(dir, 'history.png')
  try {
    await writeFile(input, svg, 'utf8')
    await convertSvgFile(input, output)
    const png = await readFile(output)
    return { data: png.toString('base64'), mime: 'image/png', width: WIDTH, height }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}
