/** Render the equipped fishing rod as a light 1080x1200 PNG. */
import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { frameHref } from './frames.js'

const run = promisify(execFile)
const WIDTH = 1080
const HEIGHT = 1200
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

function background() {
  return `<defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${SKY_TOP}"/><stop offset="0.58" stop-color="${SKY_BOTTOM}"/><stop offset="1" stop-color="#f7fbf3"/></linearGradient>
    <radialGradient id="sun" cx="0.2" cy="0.1" r="0.5"><stop offset="0" stop-color="#fff1ad" stop-opacity="0.9"/><stop offset="1" stop-color="#fff1ad" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#sky)"/><rect width="${WIDTH}" height="${HEIGHT}" fill="url(#sun)"/>
  <circle cx="900" cy="120" r="68" fill="#ffe89a" opacity="0.7"/>
  <g fill="#ffffff" opacity="0.58"><ellipse cx="160" cy="115" rx="105" ry="34"/><ellipse cx="220" cy="95" rx="65" ry="28"/><ellipse cx="850" cy="250" rx="80" ry="24"/><ellipse cx="890" cy="236" rx="45" ry="18"/></g>
  <path d="M0 850 Q150 800 300 840 T600 835 T900 845 T1080 830 V1200 H0 Z" fill="${POND}" opacity="0.95"/>
  <path d="M0 920 Q170 880 330 918 T660 910 T960 920 T1080 908 V1200 H0 Z" fill="${POND_DARK}" opacity="0.72"/>
  <g fill="#ffffff" opacity="0.32"><circle cx="110" cy="1000" r="10"/><circle cx="150" cy="1030" r="5"/><circle cx="930" cy="980" r="8"/><circle cx="970" cy="1020" r="4"/></g>`
}

function header(nickname, title) {
  return `<rect x="56" y="46" width="164" height="34" rx="17" fill="#ffffff" opacity="0.58"/>
  <text x="80" y="69" fill="${CORAL}" font-size="15" font-weight="700" font-family="${FONT}" letter-spacing="2">MY ROD</text>
  <text x="56" y="142" fill="${INK}" font-size="46" font-weight="700" font-family="${FONT}">${esc(title)}</text>
  <text x="58" y="178" fill="${MUTED}" font-size="19" font-family="${FONT}">${esc(nickname)} · 旧河鱼谱</text>
  <line x1="56" y1="200" x2="1024" y2="200" stroke="${INK}" stroke-opacity="0.12" stroke-dasharray="3 8"/>`
}

function badge(x, y, tier) {
  const label = tierLabel(tier)
  const w = tier >= 4 ? 108 : 66
  return `<rect x="${x}" y="${y}" width="${w}" height="30" rx="15" fill="${soft(tier)}"/>
  <text x="${x + w / 2}" y="${y + 20}" text-anchor="middle" fill="${color(tier)}" font-size="14" font-weight="700" font-family="${FONT}">${label}</text>`
}

function probabilityBars(weights) {
  const labels = ['Lv.1', 'Lv.2', 'Lv.3', 'Lv.4', 'Lv.5']
  return `<text x="142" y="760" fill="${INK}" font-size="19" font-weight="700" font-family="${FONT}">稀有度概率组</text>` +
    labels.map((label, index) => {
      const x = 142 + index * 158
      const weight = weights[index] ?? 0
      const barWidth = Math.max(2, Math.round((weight / 60) * 92))
      return `<rect x="${x}" y="780" width="124" height="90" rx="14" fill="#ffffff" opacity="0.72"/>
      <text x="${x + 62}" y="805" text-anchor="middle" fill="${INK}" font-size="14" font-weight="700" font-family="${FONT}">${label}</text>
      <rect x="${x + 16}" y="818" width="92" height="8" rx="4" fill="${soft(index + 1)}"/>
      <rect x="${x + 16}" y="818" width="${barWidth}" height="8" rx="4" fill="${color(index + 1)}"/>
      <text x="${x + 62}" y="852" text-anchor="middle" fill="${MUTED}" font-size="13" font-weight="700" font-family="${FONT}">${weight}</text>`
    }).join('')
}

function buildSvg({ nickname, title, rod, href, frame }) {
  const c = color(rod.tier)
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  ${background()}
  ${header(nickname, title)}
  <rect x="110" y="236" width="860" height="720" rx="32" fill="${CARD}" stroke="${c}" stroke-width="3"/>
  <rect x="126" y="252" width="828" height="688" rx="24" fill="none" stroke="${c}" stroke-opacity="0.24"/>
  ${frame === '' ? '' : `<image x="370" y="268" width="340" height="340" href="${frame}"/>`}
  ${href === '' ? '' : `<image x="382" y="280" width="316" height="316" href="${href}"/>`}
  <text x="540" y="650" text-anchor="middle" fill="${INK}" font-size="44" font-weight="700" font-family="${FONT}">${esc(cut(rod.name, 18))}</text>
  ${badge(486, 672, rod.tier)}
  <text x="142" y="738" fill="${MUTED}" font-size="17" font-family="${FONT}">售价 ${rod.sellPrice} 钓鱼币 · 单次钓鱼使用此概率组</text>
  ${probabilityBars(rod.weights)}
  <rect x="142" y="908" width="796" height="28" rx="14" fill="${soft(rod.tier)}"/>
  <text x="540" y="928" text-anchor="middle" fill="${color(rod.tier)}" font-size="15" font-weight="700" font-family="${FONT}">${esc(cut(rod.effect || '无特殊效果', 44))}</text>
  <rect x="56" y="1000" width="968" height="126" rx="24" fill="#ffffff" opacity="0.88"/>
  <text x="80" y="1044" fill="${INK}" font-size="19" font-weight="700" font-family="${FONT}">当前装备：${esc(rod.name)}</text>
  <text x="80" y="1078" fill="${MUTED}" font-size="17" font-family="${FONT}">同一时间只能装备一把鱼竿</text>
  <text x="80" y="1110" fill="${MUTED}" font-size="15" font-family="${FONT}">使用 /钓鱼 更换鱼竿 鱼竿名 切换装备</text>
</svg>`
}

export async function renderRodCard({ nickname, title, rod, assetsDir }) {
  const frame = frameHref(assetsDir, { kind: 'rod', item: rod })
  let href = ''
  try {
    const bytes = await readFile(join(assetsDir, 'rods', rod.asset))
    href = `data:image/png;base64,${bytes.toString('base64')}`
  } catch {}
  const svg = buildSvg({ nickname, title, rod, href, frame })
  const dir = await mkdtemp(join(tmpdir(), 'dsh-rod-card-'))
  const input = join(dir, 'rod.svg')
  const output = join(dir, 'rod.png')
  try {
    await writeFile(input, svg, 'utf8')
    await run('/usr/bin/sips', ['-s', 'format', 'png', input, '--out', output], { timeout: 15000 })
    const png = await readFile(output)
    return { data: png.toString('base64'), mime: 'image/png', width: WIDTH, height: HEIGHT }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}
