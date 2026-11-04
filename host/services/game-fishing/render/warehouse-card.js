/** Render the fish warehouse as a light long PNG. */
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
const TIER_COLOR = { 1: '#9aaeb3', 2: '#5db7e8', 3: '#b392ee', 4: '#f0b64b', 5: '#f59e0b' }
const TIER_SOFT = { 1: '#e9eef0', 2: '#e3f4fd', 3: '#f0e9ff', 4: '#fff1d2', 5: '#fff0cf' }
const cache = new Map()

function esc(value) {
  return String(value ?? '').replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;').replace(/"/gu, '&quot;').replace(/'/gu, '&apos;')
}
function cut(value, length) {
  const text = String(value ?? '')
  return text.length > length ? `${text.slice(0, length - 1)}…` : text
}
function tierLabel(tier) { return `Lv.${tier}` }
function color(tier) { return TIER_COLOR[tier] ?? TIER_COLOR[1] }
function soft(tier) { return TIER_SOFT[tier] ?? TIER_SOFT[1] }

async function hrefFor(assetsDir, item) {
  const path = join(assetsDir, 'fish', item.asset)
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

function header(nickname, count, totalValue) {
  return `<rect x="56" y="46" width="164" height="34" rx="17" fill="#ffffff" opacity="0.58"/>
  <text x="80" y="69" fill="${CORAL}" font-size="15" font-weight="700" font-family="${FONT}" letter-spacing="2">FISH KEEP</text>
  <text x="56" y="142" fill="${INK}" font-size="46" font-weight="700" font-family="${FONT}">鱼仓</text>
  <text x="58" y="178" fill="${MUTED}" font-size="19" font-family="${FONT}">${esc(nickname)} · 旧河鱼谱</text>
  <rect x="730" y="106" width="294" height="72" rx="18" fill="#ffffff" opacity="0.7"/>
  <text x="758" y="136" fill="${MUTED}" font-size="15" font-family="${FONT}">共有 ${count} 条鱼</text>
  <text x="758" y="161" fill="${CORAL}" font-size="18" font-weight="700" font-family="${FONT}">总价值 ${totalValue} 钓鱼币</text>
  <line x1="56" y1="200" x2="1024" y2="200" stroke="${INK}" stroke-opacity="0.12" stroke-dasharray="3 8"/>`
}

function fishCard(entry, index, x, y, href, frame) {
  const c = color(entry.tier)
  return `<g>
    <rect x="${x + 4}" y="${y + 6}" width="310" height="230" rx="20" fill="${INK}" opacity="0.05"/>
    <rect x="${x}" y="${y}" width="310" height="230" rx="20" fill="${CARD}" stroke="${c}" stroke-width="2"/>
    <rect x="${x + 12}" y="${y + 12}" width="62" height="30" rx="15" fill="${soft(entry.tier)}"/>
    <text x="${x + 43}" y="${y + 32}" text-anchor="middle" fill="${c}" font-size="14" font-weight="700" font-family="${FONT}">#${entry.id}</text>
    ${frame === '' ? '' : `<image x="${x + 12}" y="${y + 44}" width="110" height="110" href="${frame}"/>`}
    ${href === '' ? '' : `<image x="${x + 22}" y="${y + 54}" width="90" height="90" href="${href}"/>`}
    <text x="${x + 142}" y="${y + 82}" fill="${INK}" font-size="20" font-weight="700" font-family="${FONT}">${esc(cut(entry.name, 8))}</text>
    <text x="${x + 142}" y="${y + 108}" fill="${c}" font-size="14" font-weight="700" font-family="${FONT}">${tierLabel(entry.tier)}</text>
    <text x="${x + 22}" y="${y + 181}" fill="${MUTED}" font-size="14" font-family="${FONT}">${entry.weightKg}kg · ${entry.pricePerKg}/kg</text>
    <text x="${x + 22}" y="${y + 207}" fill="${CORAL}" font-size="18" font-weight="700" font-family="${FONT}">${entry.value} 钓鱼币</text>
  </g>`
}

export async function renderWarehouseCard({ nickname, entries, fishById, assetsDir }) {
  const decorated = await Promise.all(entries.map(async (entry) => {
    const item = fishById.get(entry.fishId) ?? { asset: '' }
    return { ...entry, href: item.asset === '' ? '' : await hrefFor(assetsDir, item), frame: frameHref(assetsDir, { kind: 'fish', item }) }
  }))
  const rows = Math.max(1, Math.ceil(decorated.length / 3))
  const gridY = 252
  const height = Math.max(1200, gridY + rows * 246 + 160)
  const cards = decorated.length === 0
    ? `<rect x="110" y="300" width="860" height="220" rx="28" fill="#ffffff" opacity="0.72"/>
       <text x="540" y="400" text-anchor="middle" fill="${MUTED}" font-size="25" font-family="${FONT}">鱼仓还是空的</text>
       <text x="540" y="444" text-anchor="middle" fill="${MUTED}" font-size="17" font-family="${FONT}">使用 /钓鱼 抛竿 开始钓鱼</text>`
    : decorated.map((entry, index) => fishCard(entry, index, 56 + (index % 3) * 330, gridY + Math.floor(index / 3) * 246, entry.href, entry.frame)).join('')
  const totalValue = entries.reduce((sum, entry) => sum + (Number.isSafeInteger(entry.value) ? entry.value : 0), 0)
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${WIDTH}" height="${height}" viewBox="0 0 ${WIDTH} ${height}">
  ${background(height)}
  ${header(nickname, entries.length, totalValue)}
  ${cards}
  <rect x="56" y="${height - 96}" width="968" height="58" rx="18" fill="#ffffff" opacity="0.82"/>
  <text x="80" y="${height - 59}" fill="${MUTED}" font-size="16" font-family="${FONT}">使用 /钓鱼 卖鱼 编号 出售鱼获</text>
</svg>`
  const dir = await mkdtemp(join(tmpdir(), 'dsh-warehouse-'))
  const input = join(dir, 'warehouse.svg')
  const output = join(dir, 'warehouse.png')
  try {
    await writeFile(input, svg, 'utf8')
    await run('/usr/bin/sips', ['-s', 'format', 'png', input, '--out', output], { timeout: 15000 })
    const png = await readFile(output)
    return { data: png.toString('base64'), mime: 'image/png', width: WIDTH, height }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}
