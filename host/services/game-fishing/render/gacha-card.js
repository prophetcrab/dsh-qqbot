/** Render gacha results as a light, playful 1080x1440 PNG via SVG + resvg. */
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { frameHref } from './frames.js'
import { convertSvgFile } from './png.js'

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
const imageCache = new Map()

function esc(value) {
  return String(value ?? '').replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;').replace(/"/gu, '&quot;').replace(/'/gu, '&apos;')
}
function cut(value, length) {
  const text = String(value ?? '')
  return text.length > length ? `${text.slice(0, length - 1)}…` : text
}
function tierLabel(tier) { return tier >= 4 ? 'Legendary' : `Lv.${tier}` }
function tierColor(tier) { return TIER_COLOR[tier] ?? TIER_COLOR[1] }
function tierSoft(tier) { return TIER_SOFT[tier] ?? TIER_SOFT[1] }

async function assetHref(result, assetsDir) {
  const folder = result.kind === 'rod' ? 'rods' : 'baits'
  const path = join(assetsDir, folder, result.item.asset ?? '')
  if (imageCache.has(path)) return imageCache.get(path)
  try {
    const bytes = await readFile(path)
    const href = `data:image/png;base64,${bytes.toString('base64')}`
    imageCache.set(path, href)
    return href
  } catch { return '' }
}

function background() {
  return `<defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${SKY_TOP}"/><stop offset="0.58" stop-color="${SKY_BOTTOM}"/><stop offset="1" stop-color="#f7fbf3"/>
    </linearGradient>
    <radialGradient id="sun" cx="0.2" cy="0.1" r="0.5">
      <stop offset="0" stop-color="#fff1ad" stop-opacity="0.9"/><stop offset="1" stop-color="#fff1ad" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#sky)"/>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#sun)"/>
  <circle cx="900" cy="120" r="68" fill="#ffe89a" opacity="0.7"/>
  <g fill="#ffffff" opacity="0.58">
    <ellipse cx="160" cy="115" rx="105" ry="34"/><ellipse cx="220" cy="95" rx="65" ry="28"/>
    <ellipse cx="850" cy="250" rx="80" ry="24"/><ellipse cx="890" cy="236" rx="45" ry="18"/>
  </g>
  <path d="M0 1050 Q150 1000 300 1040 T600 1035 T900 1045 T1080 1030 V1440 H0 Z" fill="${POND}" opacity="0.95"/>
  <path d="M0 1110 Q170 1070 330 1108 T660 1100 T960 1110 T1080 1098 V1440 H0 Z" fill="${POND_DARK}" opacity="0.72"/>
  <g fill="#ffffff" opacity="0.32">
    <circle cx="110" cy="1180" r="10"/><circle cx="150" cy="1210" r="5"/><circle cx="930" cy="1160" r="8"/>
    <circle cx="970" cy="1200" r="4"/><circle cx="70" cy="1120" r="3"/><circle cx="1010" cy="1080" r="3"/>
  </g>
  <g fill="none" stroke="#ffffff" stroke-opacity="0.4" stroke-width="3">
    <path d="M70 1270 Q110 1258 150 1270"/><path d="M850 1320 Q890 1308 930 1320"/><path d="M180 1380 Q220 1368 260 1380"/>
  </g>`
}

function header(title, nickname) {
  return `<rect x="56" y="46" width="164" height="34" rx="17" fill="#ffffff" opacity="0.58"/>
  <text x="80" y="69" fill="${CORAL}" font-size="15" font-weight="700" font-family="${FONT}" letter-spacing="2">GACHA TIME</text>
  <text x="56" y="142" fill="${INK}" font-size="46" font-weight="700" font-family="${FONT}">${esc(title)}</text>
  <text x="58" y="178" fill="${MUTED}" font-size="19" font-family="${FONT}">${esc(nickname)} · 旧河鱼谱</text>
  <line x1="56" y1="200" x2="1024" y2="200" stroke="${INK}" stroke-opacity="0.12" stroke-dasharray="3 8"/>`
}

function shadowRect(x, y, width, height, radius) {
  return `<rect x="${x + 5}" y="${y + 7}" width="${width}" height="${height}" rx="${radius}" fill="${INK}" opacity="0.06"/>`
}

function badge(x, y, tier) {
  const label = tierLabel(tier)
  const w = tier >= 4 ? 108 : 66
  return `<rect x="${x}" y="${y}" width="${w}" height="28" rx="14" fill="${tierSoft(tier)}"/>
  <text x="${x + w / 2}" y="${y + 19}" text-anchor="middle" fill="${tierColor(tier)}" font-size="14" font-weight="700" font-family="${FONT}">${label}</text>`
}

function itemCard(result, index, x, y, width, height, href, frame) {
  const color = tierColor(result.tier)
  const duplicate = result.duplicateSold > 0 ? `重复 +${result.duplicateSold} 钓鱼币` : (result.pityTriggered ? '保底获得' : '已收入道具库')
  const iconSize = 92
  const iconX = x + 20
  const iconY = y + (height - iconSize) / 2 - 2
  const textX = iconX + iconSize + 22
  return `<g>
    ${shadowRect(x, y, width, height, 20)}
    <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="20" fill="${CARD}" stroke="${color}" stroke-width="2"/>
    <rect x="${x + 8}" y="${y + 8}" width="${width - 16}" height="${height - 16}" rx="14" fill="none" stroke="${color}" stroke-opacity="0.22"/>
    ${frame === '' ? '' : `<image x="${iconX - 8}" y="${iconY - 8}" width="${iconSize + 16}" height="${iconSize + 16}" href="${frame}"/>`}
    ${href === '' ? '' : `<image x="${iconX}" y="${iconY}" width="${iconSize}" height="${iconSize}" href="${href}"/>`}
    <text x="${textX}" y="${y + 44}" fill="${INK}" font-size="22" font-weight="700" font-family="${FONT}">${esc(cut(`${index + 1}. ${result.item.name}`, 10))}</text>
    ${badge(textX, y + 60, result.tier)}
    <text x="${textX}" y="${y + 122}" fill="${MUTED}" font-size="15" font-family="${FONT}">${esc(cut(duplicate, 18))}</text>
  </g>`
}

function singleCard(result, href, frame) {
  const color = tierColor(result.tier)
  const duplicate = result.duplicateSold > 0 ? `重复 · +${result.duplicateSold} 钓鱼币` : (result.pityTriggered ? '保底获得' : '已收入钓鱼道具库')
  return `<g>
    ${shadowRect(110, 236, 860, 700, 32)}
    <rect x="110" y="236" width="860" height="700" rx="32" fill="${CARD}" stroke="${color}" stroke-width="3"/>
    <rect x="126" y="252" width="828" height="668" rx="24" fill="none" stroke="${color}" stroke-opacity="0.24"/>
    ${frame === '' ? '' : `<image x="378" y="280" width="324" height="324" href="${frame}"/>`}
    ${href === '' ? '' : `<image x="390" y="292" width="300" height="300" href="${href}"/>`}
    <text x="540" y="664" text-anchor="middle" fill="${INK}" font-size="44" font-weight="700" font-family="${FONT}">${esc(cut(result.item.name, 18))}</text>
    ${badge(486, 688, result.tier)}
    <text x="540" y="780" text-anchor="middle" fill="${MUTED}" font-size="22" font-family="${FONT}">${esc(duplicate)}</text>
    <text x="540" y="850" text-anchor="middle" fill="${MUTED}" fill-opacity="0.7" font-size="16" font-family="${FONT}">旧河鱼谱 · 今日手气</text>
  </g>`
}

function footer(cost, player, fishing) {
  const lines = [
    `消耗：${cost}`,
    `钓鱼币 ${player.fishingCoins} · 单抽券 ${fishing.tickets.singleTickets} · 十连券 ${fishing.tickets.tenTickets}`,
    `保底：鱼竿 ${fishing.gacha.rodPity}/10 · Lv3 ${fishing.gacha.lv3RodPity}/50 · 传奇饵 ${fishing.gacha.legendaryBaitPity}/60 · 传奇竿 ${fishing.gacha.legendaryRodPity}/150`,
  ]
  return `<g>
    ${shadowRect(56, 1246, 968, 142, 24)}
    <rect x="56" y="1246" width="968" height="142" rx="24" fill="#ffffff" opacity="0.88"/>
    <text x="80" y="1290" fill="${INK}" font-size="19" font-weight="700" font-family="${FONT}">${esc(lines[0])}</text>
    <text x="80" y="1324" fill="${INK}" font-size="18" font-family="${FONT}">${esc(lines[1])}</text>
    <text x="80" y="1358" fill="${MUTED}" font-size="15" font-family="${FONT}">${esc(lines[2])}</text>
  </g>`
}

async function buildCardSvg({ results, nickname, title, cost, player, fishing, assetsDir }) {
  const single = results.length === 1
  let cards = ''
  if (single) {
    cards = singleCard(results[0], await assetHref(results[0], assetsDir), frameHref(assetsDir, { kind: results[0].kind, item: results[0].item }))
  } else {
    for (let index = 0; index < results.length; index += 1) {
      const href = await assetHref(results[index], assetsDir)
      const frame = frameHref(assetsDir, { kind: results[index].kind, item: results[index].item })
      cards += itemCard(results[index], index, 56 + (index % 2) * 500, 224 + Math.floor(index / 2) * 196, 468, 178, href, frame)
    }
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  ${background()}
  ${header(title, nickname)}
  ${cards}
  ${footer(cost, player, fishing)}
</svg>`
}

async function convertSvgToPng(svg) {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-gacha-card-'))
  const input = join(dir, 'card.svg')
  const output = join(dir, 'card.png')
  try {
    await writeFile(input, svg, 'utf8')
    await convertSvgFile(input, output)
    return await readFile(output)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

export async function renderGachaCard({ results, nickname, title, cost, player, fishing, assetsDir }) {
  const svg = await buildCardSvg({ results, nickname, title, cost, player, fishing, assetsDir })
  const png = await convertSvgToPng(svg)
  return { data: png.toString('base64'), mime: 'image/png', width: WIDTH, height: HEIGHT }
}
