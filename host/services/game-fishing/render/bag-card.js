/** Render the fishing item library as a light 1080x1440 PNG. */
import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { frameHref } from './frames.js'
import { convertSvgFile } from './png.js'

const run = promisify(execFile)
const WIDTH = 1080
const HEIGHT = 1440
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
  const waveA = height - 390
  const waveB = height - 330
  return `<defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${SKY_TOP}"/><stop offset="0.58" stop-color="${SKY_BOTTOM}"/><stop offset="1" stop-color="#f7fbf3"/></linearGradient>
    <radialGradient id="sun" cx="0.2" cy="0.1" r="0.5"><stop offset="0" stop-color="#fff1ad" stop-opacity="0.9"/><stop offset="1" stop-color="#fff1ad" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#sky)"/><rect width="${WIDTH}" height="${HEIGHT}" fill="url(#sun)"/>
  <circle cx="900" cy="120" r="68" fill="#ffe89a" opacity="0.7"/>
  <g fill="#ffffff" opacity="0.58"><ellipse cx="160" cy="115" rx="105" ry="34"/><ellipse cx="220" cy="95" rx="65" ry="28"/><ellipse cx="850" cy="250" rx="80" ry="24"/><ellipse cx="890" cy="236" rx="45" ry="18"/></g>
  <path d="M0 ${waveA} Q150 ${waveA - 50} 300 ${waveA - 10} T600 ${waveA - 15} T900 ${waveA - 5} T1080 ${waveA - 20} V${height} H0 Z" fill="${POND}" opacity="0.95"/>
  <path d="M0 ${waveB} Q170 ${waveB - 40} 330 ${waveB - 2} T660 ${waveB - 10} T960 ${waveB} T1080 ${waveB - 12} V${height} H0 Z" fill="${POND_DARK}" opacity="0.72"/>
  <g fill="#ffffff" opacity="0.32"><circle cx="110" cy="${height - 260}" r="10"/><circle cx="150" cy="${height - 230}" r="5"/><circle cx="930" cy="${height - 280}" r="8"/><circle cx="970" cy="${height - 240}" r="4"/></g>`
}

function header(nickname) {
  return `<rect x="56" y="46" width="164" height="34" rx="17" fill="#ffffff" opacity="0.58"/>
  <text x="80" y="69" fill="${CORAL}" font-size="15" font-weight="700" font-family="${FONT}" letter-spacing="2">MY TACKLE</text>
  <text x="56" y="142" fill="${INK}" font-size="46" font-weight="700" font-family="${FONT}">钓鱼道具库</text>
  <text x="58" y="178" fill="${MUTED}" font-size="19" font-family="${FONT}">${esc(nickname)} · 旧河鱼谱</text>
  <line x1="56" y1="200" x2="1024" y2="200" stroke="${INK}" stroke-opacity="0.12" stroke-dasharray="3 8"/>`
}

function summary(data) {
  const chips = [
    `鱼竿 ${data.totalRods} 把`,
    `鱼饵 ${data.totalBaits} 种`,
    `单抽券 ${data.tickets.singleTickets}`,
    `十连券 ${data.tickets.tenTickets}`,
  ]
  return chips.map((text, index) => {
    const x = 56 + index * 244
    return `<rect x="${x}" y="218" width="228" height="52" rx="26" fill="#ffffff" opacity="0.7"/>
    <text x="${x + 114}" y="251" text-anchor="middle" fill="${INK}" font-size="17" font-weight="700" font-family="${FONT}">${esc(text)}</text>`
  }).join('')
}

function sectionTitle(text, y) {
  return `<text x="56" y="${y}" fill="${INK}" font-size="24" font-weight="700" font-family="${FONT}">${text}</text>`
}

function empty(y) {
  return `<rect x="56" y="${y}" width="968" height="60" rx="16" fill="#ffffff" opacity="0.5"/>
  <text x="80" y="${y + 37}" fill="${MUTED}" font-size="17" font-family="${FONT}">暂无</text>`
}

function itemTile(item, x, y, href, frame) {
  const c = color(item.tier)
  return `<g>
    <rect x="${x}" y="${y}" width="128" height="142" rx="16" fill="${CARD}" stroke="${c}" stroke-width="2"/>
    ${frame === '' ? '' : `<image x="${x + 12}" y="${y - 2}" width="104" height="104" href="${frame}"/>`}
    ${href === '' ? '' : `<image x="${x + 22}" y="${y + 8}" width="84" height="84" href="${href}"/>`}
    <text x="${x + 64}" y="${y + 112}" text-anchor="middle" fill="${INK}" font-size="14" font-weight="700" font-family="${FONT}">${esc(cut(item.name, 7))}</text>
    <text x="${x + 64}" y="${y + 132}" text-anchor="middle" fill="${c}" font-size="11" font-weight="700" font-family="${FONT}">${tierLabel(item.tier)}</text>
    ${item.badge ? `<rect x="${x + 74}" y="${y + 8}" width="48" height="22" rx="11" fill="${c}"/><text x="${x + 98}" y="${y + 24}" text-anchor="middle" fill="#fff" font-size="10" font-weight="700" font-family="${FONT}">${esc(item.badge)}</text>` : ''}
  </g>`
}

function grid(items, startY, assetsDir, folder) {
  if (items.length === 0) return empty(startY)
  return `<g>${items.map((item, index) => {
    const x = 56 + (index % 7) * 140
    const y = startY + Math.floor(index / 7) * 154
    return itemTile(item, x, y, item.href ?? '', item.frame ?? '')
  }).join('')}</g>`
}

function ticketTile(ticket, x, y, href) {
  return `<g>
    <rect x="${x}" y="${y}" width="468" height="104" rx="20" fill="${CARD}" stroke="#ef8d7e" stroke-width="2"/>
    ${href === '' ? '' : `<image x="${x + 16}" y="${y + 10}" width="84" height="84" href="${href}"/>`}
    <text x="${x + 120}" y="${y + 42}" fill="${INK}" font-size="22" font-weight="700" font-family="${FONT}">${esc(ticket.name)}</text>
    <text x="${x + 120}" y="${y + 78}" fill="${CORAL}" font-size="26" font-weight="700" font-family="${FONT}">× ${ticket.count}</text>
  </g>`
}

function footer(data, y) {
  return `<rect x="56" y="${y}" width="968" height="146" rx="24" fill="#ffffff" opacity="0.88"/>
  <text x="80" y="${y + 44}" fill="${INK}" font-size="19" font-weight="700" font-family="${FONT}">钓鱼币 ${data.fishingCoins}</text>
  <text x="80" y="${y + 78}" fill="${INK}" font-size="17" font-family="${FONT}">装备：${esc(data.equippedName || '未装备')} · 鱼饵已选：${esc(data.selectedName || '未选择')}</text>
  <text x="80" y="${y + 112}" fill="${MUTED}" font-size="15" font-family="${FONT}">抽卡券和鱼饵可直接在 /钓鱼 抽卡、/钓鱼 十连 中使用</text>`
}

export async function renderBagCard({ nickname, data, assetsDir }) {
  const rods = await Promise.all(data.rods.map(async (rod) => ({
    ...rod,
    href: await hrefFor(assetsDir, 'rods', rod.asset),
    frame: frameHref(assetsDir, { kind: 'rod', item: rod }),
  })))
  const baits = await Promise.all(data.baits.map(async (bait) => ({
    ...bait,
    href: await hrefFor(assetsDir, 'baits', bait.asset),
    frame: frameHref(assetsDir, { kind: 'bait', item: bait }),
  })))
  const singleHref = await hrefFor(assetsDir, 'items', 'item_t0_01_single_draw_ticket.png')
  const tenHref = await hrefFor(assetsDir, 'items', 'item_t0_02_ten_draw_ticket.png')
  const rodGridY = 316
  const rodRows = Math.max(1, Math.ceil(rods.length / 7))
  const rodHeight = rods.length === 0 ? 60 : rodRows * 154
  const baitTitleY = rodGridY + rodHeight + 34
  const baitGridY = baitTitleY + 16
  const baitRows = Math.max(1, Math.ceil(baits.length / 7))
  const baitHeight = baits.length === 0 ? 60 : baitRows * 154
  const ticketTitleY = baitGridY + baitHeight + 34
  const ticketY = ticketTitleY + 16
  const footerY = ticketY + 104 + 40
  const height = Math.max(1200, footerY + 146 + 48)
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${WIDTH}" height="${height}" viewBox="0 0 ${WIDTH} ${height}">
  ${background(height)}
  ${header(nickname)}
  ${summary({ ...data, rods, baits })}
  ${sectionTitle('鱼竿', 298)}
  ${grid(rods, rodGridY, assetsDir, 'rods')}
  ${sectionTitle('鱼饵', baitTitleY)}
  ${grid(baits, baitGridY, assetsDir, 'baits')}
  ${sectionTitle('抽卡券', ticketTitleY)}
  ${ticketTile({ name: '钓鱼单抽券', count: data.tickets.singleTickets }, 56, ticketY, singleHref)}
  ${ticketTile({ name: '钓鱼十连券', count: data.tickets.tenTickets }, 556, ticketY, tenHref)}
  ${footer(data, footerY)}
</svg>`
  const dir = await mkdtemp(join(tmpdir(), 'dsh-bag-card-'))
  const input = join(dir, 'bag.svg')
  const output = join(dir, 'bag.png')
  try {
    await writeFile(input, svg, 'utf8')
    await convertSvgFile(input, output)
    const png = await readFile(output)
    return { data: png.toString('base64'), mime: 'image/png', width: WIDTH, height }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}
