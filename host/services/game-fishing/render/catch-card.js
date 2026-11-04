/** Render a fishing catch or special item as a light 1080x1200 PNG. */
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
const TIER_COLOR = { 1: '#9aaeb3', 2: '#5db7e8', 3: '#b392ee', 4: '#f0b64b', 5: '#f59e0b' }
const TIER_SOFT = { 1: '#e9eef0', 2: '#e3f4fd', 3: '#f0e9ff', 4: '#fff1d2', 5: '#fff0cf' }

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
  <text x="80" y="69" fill="${CORAL}" font-size="15" font-weight="700" font-family="${FONT}" letter-spacing="2">CATCH TIME</text>
  <text x="56" y="142" fill="${INK}" font-size="46" font-weight="700" font-family="${FONT}">${esc(title)}</text>
  <text x="58" y="178" fill="${MUTED}" font-size="19" font-family="${FONT}">${esc(nickname)} · 旧河鱼谱</text>
  <line x1="56" y1="200" x2="1024" y2="200" stroke="${INK}" stroke-opacity="0.12" stroke-dasharray="3 8"/>`
}

function badge(x, y, tier) {
  const label = tierLabel(tier)
  const w = 66
  return `<rect x="${x}" y="${y}" width="${w}" height="30" rx="15" fill="${soft(tier)}"/>
  <text x="${x + w / 2}" y="${y + 20}" text-anchor="middle" fill="${color(tier)}" font-size="14" font-weight="700" font-family="${FONT}">${label}</text>`
}

function fishBody(result, href, frame, rodName, baitName) {
  const c = color(result.tier)
  return `<rect x="110" y="236" width="860" height="720" rx="32" fill="${CARD}" stroke="${c}" stroke-width="3"/>
  <rect x="126" y="252" width="828" height="688" rx="24" fill="none" stroke="${c}" stroke-opacity="0.24"/>
  ${frame === '' ? '' : `<image x="370" y="268" width="340" height="340" href="${frame}"/>`}
  ${href === '' ? '' : `<image x="382" y="280" width="316" height="316" href="${href}"/>`}
  <text x="540" y="650" text-anchor="middle" fill="${INK}" font-size="44" font-weight="700" font-family="${FONT}">${esc(cut(result.item.name, 18))}</text>
  ${badge(486, 672, result.tier)}
  <text x="540" y="736" text-anchor="middle" fill="${MUTED}" font-size="20" font-family="${FONT}">${result.weightKg}kg · ${result.pricePerKg} 钓鱼币/kg</text>
  <text x="540" y="778" text-anchor="middle" fill="${CORAL}" font-size="28" font-weight="700" font-family="${FONT}">价值 ${result.value} 钓鱼币</text>
  ${result.copies > 1 ? `<rect x="398" y="800" width="284" height="34" rx="17" fill="${soft(4)}"/><text x="540" y="824" text-anchor="middle" fill="${color(4)}" font-size="15" font-weight="700" font-family="${FONT}">拉帕拉效果 · 复制 ${result.copies} 份</text>` : ''}
  <text x="540" y="860" text-anchor="middle" fill="${MUTED}" font-size="15" font-family="${FONT}">鱼竿：${esc(rodName)} · 鱼饵：${esc(baitName || '无')}</text>`
}

function specialBody(result, href, rodName, baitName) {
  return `<rect x="110" y="236" width="860" height="720" rx="32" fill="${CARD}" stroke="${CORAL}" stroke-width="3"/>
  <rect x="126" y="252" width="828" height="688" rx="24" fill="none" stroke="${CORAL}" stroke-opacity="0.22"/>
  ${href === '' ? '' : `<image x="410" y="290" width="260" height="260" href="${href}"/>`}
  <text x="540" y="620" text-anchor="middle" fill="${INK}" font-size="42" font-weight="700" font-family="${FONT}">${esc(cut(result.item.name, 18))}</text>
  <rect x="486" y="646" width="108" height="30" rx="15" fill="#fff1d2"/>
  <text x="540" y="666" text-anchor="middle" fill="${CORAL}" font-size="14" font-weight="700" font-family="${FONT}">特殊物品</text>
  <text x="540" y="724" text-anchor="middle" fill="${MUTED}" font-size="20" font-family="${FONT}">${result.item.category === 'ticket' ? '不计价 · 已进入道具库' : `固定价值 ${result.item.fixedPrice ?? 0} 钓鱼币`}</text>
  ${result.extraSpecial ? `<text x="540" y="770" text-anchor="middle" fill="${CORAL}" font-size="18" font-family="${FONT}">额外获得：${esc(result.extraSpecial.name)}</text>` : ''}
  <text x="540" y="850" text-anchor="middle" fill="${MUTED}" font-size="15" font-family="${FONT}">鱼竿：${esc(rodName)} · 鱼饵：${esc(baitName || '无')}</text>`
}

function footer(text, subtitle) {
  return `<rect x="56" y="1000" width="968" height="126" rx="24" fill="#ffffff" opacity="0.88"/>
  <text x="80" y="1044" fill="${INK}" font-size="19" font-weight="700" font-family="${FONT}">${esc(text)}</text>
  <text x="80" y="1078" fill="${MUTED}" font-size="17" font-family="${FONT}">${esc(subtitle)}</text>`
}

async function loadHref(assetsDir, folder, asset) {
  try {
    const bytes = await readFile(join(assetsDir, folder, asset))
    return `data:image/png;base64,${bytes.toString('base64')}`
  } catch { return '' }
}

export async function renderCatchCard({ nickname, result, rodName, baitName, assetsDir }) {
  let svg
  if (result.kind === 'fish') {
    const href = await loadHref(assetsDir, 'fish', result.item.asset)
    const frame = frameHref(assetsDir, { kind: 'fish', item: result.item })
    svg = `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  ${background()}${header(nickname, '上鱼了')}${fishBody(result, href, frame, rodName, baitName)}${footer('旧河鱼谱 · 今日收获', '鱼获已写入鱼仓 · 继续 /钓鱼 抛竿 再钓一杆')}</svg>`
  } else {
    const href = await loadHref(assetsDir, 'items', result.item.asset)
    svg = `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  ${background()}${header(nickname, '特殊收获')}${specialBody(result, href, rodName, baitName)}${footer('旧河鱼谱 · 今日收获', '特殊物品已发放 · 继续 /钓鱼 抛竿 再钓一杆')}</svg>`
  }
  const dir = await mkdtemp(join(tmpdir(), 'dsh-catch-card-'))
  const input = join(dir, 'catch.svg')
  const output = join(dir, 'catch.png')
  try {
    await writeFile(input, svg, 'utf8')
    await run('/usr/bin/sips', ['-s', 'format', 'png', input, '--out', output], { timeout: 15000 })
    const png = await readFile(output)
    return { data: png.toString('base64'), mime: 'image/png', width: WIDTH, height: HEIGHT }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}
