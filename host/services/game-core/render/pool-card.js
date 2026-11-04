/** Render the fishing gacha pool as a light long PNG. */
import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { frameHref } from './frames.js'

const run = promisify(execFile)
const WIDTH = 1080
const FONT = 'Yuanti SC, Hannotate SC, Hiragino Maru Gothic ProN, PingFang SC, sans-serif'
const INK = '#2b4b55'
const MUTED = '#6b8a91'
const CARD = '#fffdf7'
const CORAL = '#ef8d7e'
const SKY_TOP = '#bce8ff'
const SKY_BOTTOM = '#eaf9ef'
const POND = '#93dfd2'
const POND_DARK = '#72cec6'
const TIER_COLOR = { 1: '#9aaeb3', 2: '#5db7e8', 3: '#b392ee', 4: '#f0b64b' }
const TIER_SOFT = { 1: '#e9eef0', 2: '#e3f4fd', 3: '#f0e9ff', 4: '#fff1d2' }
const cache = new Map()

function esc(value) {
  return String(value ?? '').replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;').replace(/"/gu, '&quot;').replace(/'/gu, '&apos;')
}
function cut(value, length) {
  const text = String(value ?? '')
  return text.length > length ? `${text.slice(0, length - 1)}…` : text
}
function tierLabel(tier) { return tier >= 4 ? 'Legendary' : `Lv.${tier}` }
function color(tier) { return TIER_COLOR[tier] ?? TIER_COLOR[1] }
function soft(tier) { return TIER_SOFT[tier] ?? TIER_SOFT[1] }

async function hrefFor(assetsDir, folder, asset) {
  const path = join(assetsDir, folder, asset)
  if (cache.has(path)) return cache.get(path)
  try {
    const bytes = await readFile(path)
    const href = `data:image/png;base64,${bytes.toString('base64')}`
    cache.set(path, href)
    return href
  } catch { return '' }
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
  <path d="M0 ${waveB} Q170 ${waveB - 40} 330 ${waveB - 2} T660 ${waveB - 10} T960 ${waveB} T1080 ${waveB - 12} V${height} H0 Z" fill="${POND_DARK}" opacity="0.72"/>`
}

function header(nickname) {
  return `<rect x="56" y="46" width="164" height="34" rx="17" fill="#ffffff" opacity="0.58"/>
  <text x="80" y="69" fill="${CORAL}" font-size="15" font-weight="700" font-family="${FONT}" letter-spacing="2">GACHA POOL</text>
  <text x="56" y="142" fill="${INK}" font-size="46" font-weight="700" font-family="${FONT}">钓鱼卡池</text>
  <text x="58" y="178" fill="${MUTED}" font-size="19" font-family="${FONT}">${esc(nickname)} · 旧河鱼谱</text>
  <line x1="56" y1="200" x2="1024" y2="200" stroke="${INK}" stroke-opacity="0.12" stroke-dasharray="3 8"/>`
}

function costCards() {
  return `<rect x="56" y="216" width="468" height="64" rx="20" fill="#ffffff" opacity="0.78"/>
  <text x="84" y="244" fill="${MUTED}" font-size="15" font-family="${FONT}">单抽</text>
  <text x="84" y="270" fill="${INK}" font-size="22" font-weight="700" font-family="${FONT}">10 钓鱼币</text>
  <rect x="556" y="216" width="468" height="64" rx="20" fill="#ffffff" opacity="0.78"/>
  <text x="584" y="244" fill="${MUTED}" font-size="15" font-family="${FONT}">十连</text>
  <text x="584" y="270" fill="${INK}" font-size="22" font-weight="700" font-family="${FONT}">90 钓鱼币</text>`
}

function rateRows(rows) {
  return rows.map((row, index) => {
    const y = 350 + index * 30
    return `<text x="84" y="${y}" fill="${INK}" font-size="16" font-family="${FONT}">${esc(row.label)}</text>
    <text x="420" y="${y}" text-anchor="end" fill="${row.color ?? MUTED}" font-size="16" font-weight="700" font-family="${FONT}">${esc(row.value)}</text>`
  }).join('')
}

function ratesPanel(pool) {
  const bateRows = [
    { label: '鱼饵 Lv.1', value: `${pool.categoryRates.bait[1]}%` },
    { label: '鱼饵 Lv.2', value: `${pool.categoryRates.bait[2]}%` },
    { label: '鱼饵 Lv.3', value: `${pool.categoryRates.bait[3]}%` },
    { label: '传奇鱼饵', value: `${pool.categoryRates.bait[4]}%`, color: TIER_COLOR[4] },
  ]
  const rodRows = [
    { label: '鱼竿 Lv.1', value: `${pool.categoryRates.rod[1]}%` },
    { label: '鱼竿 Lv.2', value: `${pool.categoryRates.rod[2]}%` },
    { label: '鱼竿 Lv.3', value: `${pool.categoryRates.rod[3]}%` },
    { label: '传奇鱼竿', value: `${pool.categoryRates.rod[4]}%`, color: TIER_COLOR[4] },
  ]
  return `<rect x="56" y="302" width="968" height="170" rx="22" fill="${CARD}" opacity="0.94"/>
  <text x="84" y="326" fill="${INK}" font-size="20" font-weight="700" font-family="${FONT}">分类出率</text>
  ${rateRows(bateRows)}
  ${rateRows(rodRows).replaceAll('x="84"', 'x="560"').replaceAll('x="420"', 'x="896"')}
  <line x1="520" y1="326" x2="520" y2="456" stroke="${INK}" stroke-opacity="0.08"/>`
}

function pityPanel(pity) {
  const rows = [
    { label: 'Lv.1 / Lv.2 鱼竿', value: pity.rod, max: 10 },
    { label: 'Lv.3 鱼竿', value: pity.lv3Rod, max: 50 },
    { label: '传奇鱼饵', value: pity.legendaryBait, max: 60 },
    { label: '传奇鱼竿', value: pity.legendaryRod, max: 150 },
  ]
  return `<rect x="56" y="488" width="968" height="214" rx="22" fill="${CARD}" opacity="0.94"/>
  <text x="84" y="516" fill="${INK}" font-size="20" font-weight="700" font-family="${FONT}">保底进度</text>
  ${rows.map((row, index) => {
    const y = 544 + index * 37
    const ratio = Math.min(1, row.value / row.max)
    return `<text x="84" y="${y}" fill="${INK}" font-size="16" font-family="${FONT}">${row.label}</text>
    <rect x="330" y="${y - 11}" width="540" height="10" rx="5" fill="#e6edf0"/>
    <rect x="330" y="${y - 11}" width="${Math.max(2, 540 * ratio)}" height="10" rx="5" fill="${CORAL}" opacity="0.82"/>
    <text x="1000" y="${y}" text-anchor="end" fill="${MUTED}" font-size="15" font-weight="700" font-family="${FONT}">${row.value}/${row.max}</text>`
  }).join('')}`
}

function itemTile(item, x, y, href, frame) {
  return `<g>
    <rect x="${x}" y="${y}" width="128" height="144" rx="16" fill="${CARD}" stroke="${color(item.tier)}" stroke-width="1.5"/>
    ${frame === '' ? '' : `<image x="${x + 12}" y="${y - 2}" width="104" height="104" href="${frame}"/>`}
    ${href === '' ? '' : `<image x="${x + 22}" y="${y + 8}" width="84" height="84" href="${href}"/>`}
    <text x="${x + 64}" y="${y + 111}" text-anchor="middle" fill="${INK}" font-size="13" font-weight="700" font-family="${FONT}">${esc(cut(item.name, 7))}</text>
    <text x="${x + 64}" y="${y + 131}" text-anchor="middle" fill="${color(item.tier)}" font-size="11" font-weight="700" font-family="${FONT}">${esc(item.rate)}%</text>
  </g>`
}

function upCard(item, x, href) {
  if (item === undefined) return ''
  return `<rect x="${x}" y="744" width="468" height="132" rx="20" fill="${CARD}" stroke="${TIER_COLOR[4]}" stroke-width="2"/>
  ${href === '' ? '' : `<image x="${x + 14}" y="762" width="96" height="96" href="${href}"/>`}
  <rect x="${x + 14}" y="754" width="44" height="22" rx="11" fill="${TIER_COLOR[4]}"/>
  <text x="${x + 36}" y="770" text-anchor="middle" fill="#fff" font-size="11" font-weight="700" font-family="${FONT}">UP</text>
  <text x="${x + 124}" y="796" fill="${INK}" font-size="20" font-weight="700" font-family="${FONT}">${esc(cut(item.name, 13))}</text>
  <text x="${x + 124}" y="828" fill="${MUTED}" font-size="15" font-family="${FONT}">${esc(item.rate)}% · 占传奇 50%</text>
  <text x="${x + 124}" y="856" fill="${TIER_COLOR[4]}" font-size="14" font-weight="700" font-family="${FONT}">当期概率提升</text>`
}

function upPanel(up, hrefs) {
  if (up === undefined || up.rod === undefined || up.bait === undefined) return ''
  return `<text x="56" y="712" fill="${INK}" font-size="24" font-weight="700" font-family="${FONT}">当期 UP</text>
  ${upCard(up.rod, 56, hrefs.rod)}
  ${upCard(up.bait, 556, hrefs.bait)}`
}

function sectionTitle(title, y) {
  return `<text x="56" y="${y}" fill="${INK}" font-size="24" font-weight="700" font-family="${FONT}">${title}</text>`
}

function grid(items, startY) {
  return items.map((item, index) => {
    const x = 56 + (index % 7) * 140
    const y = startY + Math.floor(index / 7) * 154
    return itemTile(item, x, y, item.href, item.frame)
  }).join('')
}

function footer(height) {
  return `<rect x="56" y="${height - 130}" width="968" height="92" rx="22" fill="#ffffff" opacity="0.86"/>
  <text x="80" y="${height - 94}" fill="${INK}" font-size="18" font-weight="700" font-family="${FONT}">旧河鱼谱 · 本期卡池</text>
  <text x="80" y="${height - 64}" fill="${MUTED}" font-size="15" font-family="${FONT}">保底按玩家、按群独立记录 · 自然抽中会重置对应保底</text>`
}

export async function renderPoolCard({ nickname, pool, assetsDir }) {
  const rods = await Promise.all(pool.rods.map(async (item) => ({ ...item, href: await hrefFor(assetsDir, 'rods', item.asset), frame: frameHref(assetsDir, { kind: 'rod', item }) })))
  const baits = await Promise.all(pool.baits.map(async (item) => ({ ...item, href: await hrefFor(assetsDir, 'baits', item.asset), frame: frameHref(assetsDir, { kind: 'bait', item }) })))
  const up = pool.up
  const upRodHref = up?.rod === undefined ? '' : await hrefFor(assetsDir, 'rods', up.rod.asset)
  const upBaitHref = up?.bait === undefined ? '' : await hrefFor(assetsDir, 'baits', up.bait.asset)
  const hasUp = up !== undefined && up.rod !== undefined && up.bait !== undefined
  const rodRows = Math.max(2, Math.ceil(rods.length / 7))
  const baitRows = Math.max(2, Math.ceil(baits.length / 7))
  const rodTitle = hasUp ? 892 : 730
  const rodGrid = rodTitle + 18
  const baitTitle = rodGrid + rodRows * 154 + 34
  const baitGrid = baitTitle + 18
  const height = baitGrid + baitRows * 154 + 160
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${WIDTH}" height="${height}" viewBox="0 0 ${WIDTH} ${height}">
  ${background(height)}
  ${header(nickname)}
  ${costCards()}
  ${ratesPanel(pool)}
  ${pityPanel(pool.pity)}
  ${upPanel(up, { rod: upRodHref, bait: upBaitHref })}
  ${sectionTitle('鱼竿池', rodTitle)}
  ${grid(rods, rodGrid)}
  ${sectionTitle('鱼饵池', baitTitle)}
  ${grid(baits, baitGrid)}
  ${footer(height)}
</svg>`
  const dir = await mkdtemp(join(tmpdir(), 'dsh-pool-card-'))
  const input = join(dir, 'pool.svg')
  const output = join(dir, 'pool.png')
  try {
    await writeFile(input, svg, 'utf8')
    await run('/usr/bin/sips', ['-s', 'format', 'png', input, '--out', output], { timeout: 15000 })
    const png = await readFile(output)
    return { data: png.toString('base64'), mime: 'image/png', width: WIDTH, height }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}
