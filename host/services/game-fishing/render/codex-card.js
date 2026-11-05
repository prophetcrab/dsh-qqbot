/** Render the fishing collection codex as a light long PNG. */
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { frameHref } from './frames.js'
import { convertSvgFile } from './png.js'

const WIDTH = 1080
const MARGIN = 56
const FONT = 'Yuanti SC, Hannotate SC, Hiragino Maru Gothic ProN, PingFang SC, sans-serif'
const INK = '#2b4b55'
const MUTED = '#6b8a91'
const CARD = '#fffdf7'
const CORAL = '#ef8d7e'
const SKY_TOP = '#bce8ff'
const SKY_BOTTOM = '#eaf9ef'
const POND = '#93dfd2'
const POND_DARK = '#72cec6'
const MISSING_CARD = '#f0f3f2'
const MISSING_STROKE = '#b8c7c6'
const MISSING_INK = '#7e9499'
const TIER_COLOR = { 1: '#9aaeb3', 2: '#5db7e8', 3: '#b392ee', 4: '#f0b64b', 5: '#f59e0b' }
const TIER_SOFT = { 1: '#e9eef0', 2: '#e3f4fd', 3: '#f0e9ff', 4: '#fff1d2', 5: '#fff0cf' }
const SECTIONS = [
  { key: 'rods', label: '鱼竿', countLabel: '已获得', cols: 3, cardW: 308, cardH: 176, gapX: 22, gapY: 16, accent: '#5db7e8' },
  { key: 'baits', label: '鱼饵', countLabel: '已获得', cols: 3, cardW: 308, cardH: 176, gapX: 22, gapY: 16, accent: '#b392ee' },
  { key: 'fish', label: '鱼', countLabel: '已获得', cols: 4, cardW: 227, cardH: 168, gapX: 20, gapY: 16, accent: '#ef8d7e' },
]
const ICON_CACHE = new Map()

function esc(value) {
  return String(value ?? '').replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;').replace(/"/gu, '&quot;').replace(/'/gu, '&apos;')
}
function cut(value, length) {
  const text = String(value ?? '')
  return text.length > length ? `${text.slice(0, length - 1)}…` : text
}
function tierLabel(tier, kind) { return kind !== 'fish' && tier >= 4 ? '传奇' : `Lv.${tier}` }
function color(tier) { const n = Number(tier); return TIER_COLOR[n] ?? (n >= 5 ? TIER_COLOR[5] : TIER_COLOR[1]) }
function soft(tier) { const n = Number(tier); return TIER_SOFT[n] ?? (n >= 5 ? TIER_SOFT[5] : TIER_SOFT[1]) }
function countOf(value, fallback) { return Number.isSafeInteger(value) && value >= 0 ? value : fallback }
function tally(items) { return items.filter((item) => item.owned === true).length }

async function hrefFor(assetsDir, folder, asset) {
  if (!assetsDir || !asset) return ''
  const path = join(assetsDir, folder, asset)
  if (ICON_CACHE.has(path)) return ICON_CACHE.get(path)
  try {
    const bytes = await readFile(path)
    const href = `data:image/png;base64,${bytes.toString('base64')}`
    ICON_CACHE.set(path, href)
    return href
  } catch { return '' }
}

function frameFor(assetsDir, kind, item) {
  if (kind !== 'fish' && !(item.tier >= 4)) return ''
  try { return frameHref(assetsDir, { kind, item }) } catch { return '' }
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

function header(nickname, owned, total) {
  return `<rect x="56" y="46" width="164" height="34" rx="17" fill="#ffffff" opacity="0.58"/>
  <text x="80" y="69" fill="${CORAL}" font-size="15" font-weight="700" font-family="${FONT}" letter-spacing="2">FISH CODEX</text>
  <text x="56" y="142" fill="${INK}" font-size="46" font-weight="700" font-family="${FONT}">图鉴</text>
  <text x="58" y="178" fill="${MUTED}" font-size="19" font-family="${FONT}">${esc(cut(nickname, 16))} · 旧河鱼谱</text>
  <rect x="714" y="102" width="310" height="76" rx="18" fill="#ffffff" opacity="0.7"/>
  <text x="742" y="132" fill="${MUTED}" font-size="15" font-family="${FONT}">图鉴收集进度</text>
  <text x="742" y="164" fill="${CORAL}" font-size="21" font-weight="700" font-family="${FONT}">${owned} / ${total}</text>
  <line x1="56" y1="200" x2="1024" y2="200" stroke="${INK}" stroke-opacity="0.12" stroke-dasharray="3 8"/>`
}

function sectionTitle(section, owned, total) {
  const y = section.titleY
  return `<rect x="56" y="${y - 24}" width="8" height="30" rx="4" fill="${section.accent}"/>
  <text x="78" y="${y}" fill="${INK}" font-size="27" font-weight="700" font-family="${FONT}">${esc(section.label)}</text>
  <text x="1024" y="${y}" text-anchor="end" fill="${MUTED}" font-size="17" font-family="${FONT}">${esc(section.countLabel)} ${owned} / ${total}</text>`
}

function badge(x, y, tier, kind) {
  const label = tierLabel(tier, kind)
  const width = label === '传奇' ? 58 : 62
  return `<rect x="${x}" y="${y}" width="${width}" height="26" rx="13" fill="${soft(tier)}"/>
  <text x="${x + width / 2}" y="${y + 18}" text-anchor="middle" fill="${color(tier)}" font-size="13" font-weight="700" font-family="${FONT}">${esc(label)}</text>`
}

function gearStatus(item) {
  if (item.owned !== true) return '未获得'
  return `已获得 · ${item.acquiredLabel || '时间未知'}`
}

function fishStatus(item) {
  if (item.owned !== true) return '未捕获'
  return `最大 ${item.maxWeightLabel || '记录缺失'}`
}

function gearCard(item, kind, x, y) {
  const owned = item.owned === true
  const c = color(item.tier)
  return `<g${owned ? '' : ' opacity="0.85"'}>
    <rect x="${x + 4}" y="${y + 5}" width="308" height="176" rx="20" fill="${INK}" opacity="0.05"/>
    <rect x="${x}" y="${y}" width="308" height="176" rx="20" fill="${owned ? CARD : MISSING_CARD}" stroke="${owned ? c : MISSING_STROKE}" stroke-width="2"${owned ? '' : ' stroke-dasharray="7 7"'}/>
    ${item.frame === '' ? '' : `<image x="${x + 14}" y="${y + 12}" width="92" height="92" href="${item.frame}" opacity="${owned ? 1 : 0.6}"/>`}
    ${item.href === '' ? '' : `<image x="${x + 25}" y="${y + 23}" width="70" height="70" href="${item.href}" opacity="${owned ? 1 : 0.7}"/>`}
    <text x="${x + 120}" y="${y + 52}" fill="${owned ? INK : MISSING_INK}" font-size="20" font-weight="700" font-family="${FONT}">${esc(cut(item.name, 8))}</text>
    ${badge(x + 120, y + 64, item.tier, kind)}
    <line x1="${x + 22}" y1="${y + 118}" x2="${x + 286}" y2="${y + 118}" stroke="${INK}" stroke-opacity="0.08"/>
    <text x="${x + 22}" y="${y + 150}" fill="${owned ? CORAL : MUTED}" font-size="15" font-weight="${owned ? 700 : 400}" font-family="${FONT}">${esc(gearStatus(item))}</text>
  </g>`
}

function fishCard(item, x, y) {
  const owned = item.owned === true
  const c = color(item.tier)
  return `<g${owned ? '' : ' opacity="0.85"'}>
    <rect x="${x + 4}" y="${y + 5}" width="227" height="168" rx="20" fill="${INK}" opacity="0.05"/>
    <rect x="${x}" y="${y}" width="227" height="168" rx="20" fill="${owned ? CARD : MISSING_CARD}" stroke="${owned ? c : MISSING_STROKE}" stroke-width="2"${owned ? '' : ' stroke-dasharray="7 7"'}/>
    ${item.frame === '' ? '' : `<image x="${x + 12}" y="${y + 10}" width="76" height="76" href="${item.frame}" opacity="${owned ? 1 : 0.55}"/>`}
    ${item.href === '' ? '' : `<image x="${x + 18}" y="${y + 16}" width="64" height="64" href="${item.href}" opacity="${owned ? 1 : 0.7}"/>`}
    <text x="${x + 100}" y="${y + 50}" fill="${owned ? INK : MISSING_INK}" font-size="19" font-weight="700" font-family="${FONT}">${esc(cut(item.name, 6))}</text>
    ${badge(x + 100, y + 62, item.tier, 'fish')}
    <line x1="${x + 14}" y1="${y + 118}" x2="${x + 213}" y2="${y + 118}" stroke="${INK}" stroke-opacity="0.08"/>
    <text x="${x + 14}" y="${y + 140}" fill="${owned ? CORAL : MUTED}" font-size="14" font-weight="${owned ? 700 : 400}" font-family="${FONT}">${esc(fishStatus(item))}</text>
  </g>`
}

function gridCards(section, items) {
  if (items.length === 0) {
    return `<rect x="56" y="${section.gridY}" width="968" height="64" rx="16" fill="#ffffff" opacity="0.5"/>
  <text x="80" y="${section.gridY + 40}" fill="${MUTED}" font-size="17" font-family="${FONT}">暂无</text>`
  }
  return items.map((item, index) => {
    const x = MARGIN + (index % section.cols) * (section.cardW + section.gapX)
    const y = section.gridY + Math.floor(index / section.cols) * (section.cardH + section.gapY)
    return section.key === 'fish' ? fishCard(item, x, y) : gearCard(item, section.key === 'rods' ? 'rod' : 'bait', x, y)
  }).join('')
}

function layoutSections(itemsByKey) {
  let cursor = 200
  const sections = SECTIONS.map((section) => {
    const items = itemsByKey[section.key]
    const titleY = cursor + 62
    const gridY = titleY + 22
    const rows = items.length === 0 ? 0 : Math.ceil(items.length / section.cols)
    const gridHeight = items.length === 0 ? 64 : rows * section.cardH + (rows - 1) * section.gapY
    cursor = gridY + gridHeight
    return { ...section, items, titleY, gridY }
  })
  return { sections, contentEnd: cursor }
}

function footer(y) {
  return `<rect x="56" y="${y}" width="968" height="64" rx="18" fill="#ffffff" opacity="0.82"/>
  <text x="80" y="${y + 38}" fill="${MUTED}" font-size="16" font-family="${FONT}">图鉴收录全部鱼竿、鱼饵与鱼类 · 灰色虚线条目尚未获得</text>`
}

async function decorate(assetsDir, kind, items) {
  const list = Array.isArray(items) ? items : []
  const folder = kind === 'fish' ? 'fish' : `${kind}s`
  return Promise.all(list.map(async (item) => ({
    ...item,
    href: await hrefFor(assetsDir, folder, item.asset),
    frame: frameFor(assetsDir, kind, item),
  })))
}

export async function renderCodexCard({ nickname, data, assetsDir }) {
  const source = data ?? {}
  const [rods, baits, fish] = await Promise.all([
    decorate(assetsDir, 'rod', source.rods),
    decorate(assetsDir, 'bait', source.baits),
    decorate(assetsDir, 'fish', source.fish),
  ])
  const itemsByKey = { rods, baits, fish }
  const summary = source.summary ?? {}
  const counts = {
    rods: { owned: countOf(summary.rodsOwned, tally(rods)), total: countOf(summary.rodsTotal, rods.length) },
    baits: { owned: countOf(summary.baitsOwned, tally(baits)), total: countOf(summary.baitsTotal, baits.length) },
    fish: { owned: countOf(summary.fishOwned, tally(fish)), total: countOf(summary.fishTotal, fish.length) },
  }
  const { sections, contentEnd } = layoutSections(itemsByKey)
  const footerY = contentEnd + 34
  const height = footerY + 64 + 40
  const crafted = sections.map((section) => `${sectionTitle(section, counts[section.key].owned, counts[section.key].total)}
  ${gridCards(section, section.items)}`).join('\n  ')
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${WIDTH}" height="${height}" viewBox="0 0 ${WIDTH} ${height}">
  ${background(height)}
  ${header(nickname, counts.rods.owned + counts.baits.owned + counts.fish.owned, counts.rods.total + counts.baits.total + counts.fish.total)}
  ${crafted}
  ${footer(footerY)}
</svg>`
  const dir = await mkdtemp(join(tmpdir(), 'dsh-codex-card-'))
  const input = join(dir, 'codex.svg')
  const output = join(dir, 'codex.png')
  try {
    await writeFile(input, svg, 'utf8')
    await convertSvgFile(input, output)
    const png = await readFile(output)
    return { data: png.toString('base64'), mime: 'image/png', width: WIDTH, height }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}
