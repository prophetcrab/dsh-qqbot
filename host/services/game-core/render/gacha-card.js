/** Render gacha results as a 1080x1440 PNG using SVG + macOS sips. */
import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

const run = promisify(execFile)
const WIDTH = 1080
const HEIGHT = 1440
const INK = '#0c1f25'
const NIGHT = '#071417'
const RIVER = '#123843'
const PAPER = '#efe5cf'
const LAMP = '#e8b56b'
const MUTED = '#9bb0b2'
const TIER_COLOR = { 1: '#9ca3af', 2: '#60a5fa', 3: '#c084fc', 4: '#fbbf24' }
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
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${NIGHT}"/><stop offset="0.55" stop-color="${RIVER}"/><stop offset="1" stop-color="${INK}"/>
    </linearGradient>
    <radialGradient id="lamp" cx="0.72" cy="0.18" r="0.55">
      <stop offset="0" stop-color="${LAMP}" stop-opacity="0.22"/><stop offset="1" stop-color="${LAMP}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)"/>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#lamp)"/>
  <path d="M0 1060 Q180 1010 360 1060 T720 1060 T1080 1060 V1440 H0 Z" fill="#0b2229" opacity="0.7"/>
  <path d="M0 1120 Q220 1070 440 1120 T880 1120 T1320 1120" fill="none" stroke="#7fa5a6" stroke-opacity="0.12" stroke-width="2"/>
  <path d="M0 1180 Q220 1130 440 1180 T880 1180 T1320 1180" fill="none" stroke="#7fa5a6" stroke-opacity="0.08" stroke-width="2"/>`
}

function header(title, nickname) {
  return `<text x="56" y="82" fill="${LAMP}" font-size="18" font-family="PingFang SC, Hiragino Sans GB, sans-serif" letter-spacing="5">OLD RIVER / GACHA</text>
  <text x="56" y="142" fill="${PAPER}" font-size="42" font-weight="700" font-family="PingFang SC, Hiragino Sans GB, sans-serif">${esc(title)}</text>
  <text x="58" y="177" fill="${MUTED}" font-size="18" font-family="PingFang SC, Hiragino Sans GB, sans-serif">${esc(nickname)} · 钓鱼卡池</text>
  <line x1="56" y1="196" x2="1024" y2="196" stroke="${PAPER}" stroke-opacity="0.16"/>`
}

function itemCard(result, index, x, y, width, height, href, compact = true) {
  const color = tierColor(result.tier)
  const duplicate = result.duplicateSold > 0 ? `重复 · +${result.duplicateSold} 钓鱼币` : (result.pityTriggered ? '保底获得' : '已收入钓鱼道具库')
  const iconSize = compact ? 92 : 128
  const iconX = x + 20
  const iconY = y + (height - iconSize) / 2 - 4
  const textX = iconX + iconSize + 24
  return `<g>
    <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="18" fill="${PAPER}" stroke="${color}" stroke-width="2"/>
    <rect x="${x + 8}" y="${y + 8}" width="${width - 16}" height="${height - 16}" rx="12" fill="none" stroke="${color}" stroke-opacity="0.28"/>
    ${href === '' ? '' : `<image x="${iconX}" y="${iconY}" width="${iconSize}" height="${iconSize}" href="${href}"/>`}
    <text x="${textX}" y="${y + 47}" fill="${INK}" font-size="${compact ? 22 : 26}" font-weight="700" font-family="PingFang SC, Hiragino Sans GB, sans-serif">${esc(cut(`${index + 1}. ${result.item.name}`, compact ? 10 : 16))}</text>
    <text x="${textX}" y="${y + 78}" fill="${color}" font-size="${compact ? 16 : 18}" font-weight="700" font-family="PingFang SC, Hiragino Sans GB, sans-serif">${tierLabel(result.tier)}</text>
    <text x="${textX}" y="${y + 112}" fill="${INK}" fill-opacity="0.72" font-size="${compact ? 16 : 18}" font-family="PingFang SC, Hiragino Sans GB, sans-serif">${esc(cut(duplicate, 18))}</text>
  </g>`
}

function singleCard(result, href) {
  const color = tierColor(result.tier)
  const duplicate = result.duplicateSold > 0 ? `重复 · +${result.duplicateSold} 钓鱼币` : (result.pityTriggered ? '保底获得' : '已收入钓鱼道具库')
  return `<g>
    <rect x="110" y="250" width="860" height="700" rx="28" fill="${PAPER}" stroke="${color}" stroke-width="3"/>
    <rect x="124" y="264" width="832" height="672" rx="20" fill="none" stroke="${color}" stroke-opacity="0.3"/>
    ${href === '' ? '' : `<image x="400" y="300" width="280" height="280" href="${href}"/>`}
    <text x="540" y="650" text-anchor="middle" fill="${INK}" font-size="42" font-weight="700" font-family="PingFang SC, Hiragino Sans GB, sans-serif">${esc(cut(result.item.name, 18))}</text>
    <text x="540" y="698" text-anchor="middle" fill="${color}" font-size="24" font-weight="700" font-family="PingFang SC, Hiragino Sans GB, sans-serif">${tierLabel(result.tier)}</text>
    <text x="540" y="752" text-anchor="middle" fill="${INK}" fill-opacity="0.72" font-size="22" font-family="PingFang SC, Hiragino Sans GB, sans-serif">${esc(duplicate)}</text>
  </g>`
}

function footer(cost, player, fishing) {
  const lines = [
    `消耗：${cost}`,
    `当前：钓鱼币 ${player.fishingCoins} · 单抽券 ${fishing.tickets.singleTickets} · 十连券 ${fishing.tickets.tenTickets}`,
    `保底：鱼竿 ${fishing.gacha.rodPity}/10 · Lv3 ${fishing.gacha.lv3RodPity}/50 · 传奇饵 ${fishing.gacha.legendaryBaitPity}/60 · 传奇竿 ${fishing.gacha.legendaryRodPity}/150`,
  ]
  return `<rect x="56" y="1260" width="968" height="126" rx="18" fill="${PAPER}" fill-opacity="0.94"/>
  <text x="78" y="1302" fill="${INK}" font-size="19" font-family="PingFang SC, Hiragino Sans GB, sans-serif">${esc(lines[0])}</text>
  <text x="78" y="1334" fill="${INK}" font-size="18" font-family="PingFang SC, Hiragino Sans GB, sans-serif">${esc(lines[1])}</text>
  <text x="78" y="1366" fill="${INK}" fill-opacity="0.74" font-size="15" font-family="PingFang SC, Hiragino Sans GB, sans-serif">${esc(lines[2])}</text>`
}

async function buildCardSvg({ results, nickname, title, cost, player, fishing, assetsDir }) {
  const single = results.length === 1
  let cards = ''
  if (single) {
    cards = singleCard(results[0], await assetHref(results[0], assetsDir))
  } else {
    for (let index = 0; index < results.length; index += 1) {
      const href = await assetHref(results[index], assetsDir)
      const col = index % 2
      const row = Math.floor(index / 2)
      cards += itemCard(results[index], index, 56 + col * 500, 226 + row * 196, 468, 178, href, true)
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
    await run('/usr/bin/sips', ['-s', 'format', 'png', input, '--out', output], { timeout: 15000 })
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
