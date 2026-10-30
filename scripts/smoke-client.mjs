/**
 * Headless smoke test for the dsh-qqbot browser bundle.
 *
 * Loads client.js with a tiny React stand-in and a fake browser, runs the
 * module-loader factory against a fake Host payload, then mounts the main panel
 * and drives it: status pills and tabs render, the overview actions POST JSON,
 * the plugin row toggles, a feature action runs, and the log tail switches
 * source. No browser, no network, no third-party packages.
 *
 * Run from the package root:
 *
 *   node scripts/smoke-client.mjs
 */
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
if (source.trim() === '') throw new Error('client.js is empty')

// ---- minimal React stand-in -------------------------------------------------
let hookIndex = 0
const hookState = []
const effectSlots = []
let pendingEffects = []
let rerender = false
const sameDeps = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => v === b[i])
const React = {
  createElement(type, props, ...children) {
    const merged = { ...(props ?? {}) }
    const flat = children.length === 0 ? undefined : children.length === 1 ? children[0] : children
    if (flat !== undefined) merged.children = flat
    return { $$el: { type, props: merged } }
  },
  useState(initial) {
    const i = hookIndex++
    if (!(i in hookState)) hookState[i] = typeof initial === 'function' ? initial() : initial
    return [hookState[i], (next) => {
      hookState[i] = typeof next === 'function' ? next(hookState[i]) : next
      rerender = true
    }]
  },
  useEffect(fn, deps) {
    const i = hookIndex++
    const previous = effectSlots[i]
    const changed = previous === undefined || deps === undefined || !sameDeps(previous.deps, deps)
    effectSlots[i] = { deps: deps ?? [] }
    if (changed) pendingEffects.push(fn)
  },
  useMemo(fn) { hookIndex++; return fn() },
  useCallback(fn) { hookIndex++; return fn },
  useRef(value) { hookIndex++; return { current: value ?? null } },
  useLayoutEffect() { hookIndex++ },
}

// ---- fake browser -----------------------------------------------------------
const store = new Map()
const headChildren = []
globalThis.document = {
  createElement: () => ({ dataset: {}, textContent: '', remove() {} }),
  head: { appendChild(element) { headChildren.push(element) } },
}
globalThis.window = {
  __ModuleLoader__: { load(definition) { globalThis.__definition = definition } },
  localStorage: {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => { store.set(key, value) },
  },
  setTimeout,
  clearTimeout,
}
const fakeRequire = (id) => {
  if (id === 'react') return React
  throw new Error(`unexpected require(${JSON.stringify(id)})`)
}

await import(new URL('../client.js', import.meta.url))
const definition = globalThis.__definition
if (!definition || definition.id !== 'dsh-qqbot') throw new Error('module loader registration missing')
const api = definition.factory(fakeRequire)

// ---- fake Host payload ------------------------------------------------------
const STATUS = {
  platform: { isMac: true, arch: 'arm64', release: '24.0.0', node: 'v24.0.0' },
  settings: { projectDir: '~/project/qq-bot', koishiPort: 5140, napcatPort: 6099, reversePath: '/onebot' },
  qq: { installed: true, path: '/Applications/QQ.app', version: '9.9.9' },
  napcat: {
    installed: false,
    installDir: null,
    configDir: null,
    version: null,
    running: false,
    pid: null,
    loggedIn: false,
    qq: null,
    nickname: null,
    webui: { port: 6099, tokenMasked: null, reachable: false },
    accounts: [],
    configApplied: false,
    installer: { downloaded: false, appPath: null, version: null },
  },
  koishi: {
    projectDir: '~/project/qq-bot',
    exists: true,
    hasPackageJson: true,
    depsInstalled: true,
    running: true,
    managed: false,
    pid: 4242,
    port: 5140,
    online: true,
    selfId: '10001',
    platform: 'qq',
    stats: { messages: 12 },
    logs: [],
  },
  bot: { online: true, selfId: '10001', platform: 'qq', uptime: null },
  features: [],
  updatedAt: '2026-10-30T00:00:00.000Z',
}

const PLUGINS = [
  { key: 'puppeteer', name: 'puppeteer', packageName: 'koishi-plugin-puppeteer', version: '1.2.3', enabled: true, group: 'group:basic', local: false, removable: true },
]

const FEATURES = [
  {
    id: 'lifecycle',
    title: { zh: '启停', en: 'Lifecycle' },
    description: { zh: '启动或停止 NapCat 与 Koishi。', en: 'Start or stop NapCat and Koishi.' },
    actions: [
      { id: 'all-start', title: { zh: '一键启动全部', en: 'Start everything' }, tone: 'primary' },
      { id: 'all-stop', title: { zh: '全部停止', en: 'Stop everything' }, tone: 'danger' },
    ],
    status: { napcat: { running: false }, koishi: { running: true } },
  },
  {
    id: 'koishi-plugins',
    title: { zh: 'Koishi 插件', en: 'Koishi plugins' },
    description: { zh: '插件数量摘要。', en: 'Plugin count summary.' },
    actions: [],
  },
]

const LOG_LINES = ['[koishi] ready', '[koishi] bot online']

const fetchLog = []
let failStatus = false
globalThis.fetch = async (url, init) => {
  const path = String(url)
  fetchLog.push({ url: path, method: (init && init.method) || 'GET', body: (init && init.body) || null })
  const json = (body) => ({ ok: true, status: 200, json: async () => body })
  if (path.startsWith('/qqbot/status')) {
    return failStatus ? json({ ok: false, error: 'boom' }) : json({ ok: true, data: STATUS })
  }
  if (path.startsWith('/qqbot/koishi/plugins')) return json({ ok: true, data: PLUGINS })
  if (path.startsWith('/qqbot/features')) return json({ ok: true, data: FEATURES })
  if (path.startsWith('/qqbot/logs')) return json({ ok: true, lines: LOG_LINES })
  return json({ ok: true })
}

// ---- fake ctx / apply -------------------------------------------------------
let currentLang = 'zh'
const registrations = []
let MainComponent = null
const ctx = {
  effect(fn) {
    const cleanup = fn()
    return typeof cleanup === 'function' ? cleanup : () => {}
  },
  locale: {
    dictionaries: {},
    register(ns, dictionaries) { ctx.locale.dictionaries[ns] = dictionaries },
    bind(ns) {
      return (key) => {
        const dictionaries = ctx.locale.dictionaries[ns] || {}
        const table = dictionaries[currentLang] || dictionaries.en || {}
        return table[key] !== undefined ? table[key] : String(key)
      }
    },
  },
  slots: {
    inject(seat, callback) { callback() },
    register(seat, component) {
      registrations.push({ seat, component })
      if (seat.name === 'main') MainComponent = component
    },
  },
}

if (JSON.stringify(api.inject) !== JSON.stringify(['slots', 'locale'])) {
  throw new Error(`unexpected inject list: ${JSON.stringify(api.inject)}`)
}
api.apply(ctx)

// ---- registration assertions ------------------------------------------------
const mainSeat = registrations.find((entry) => entry.seat.name === 'main')
const sidebarSeat = registrations.find((entry) => entry.seat.name === 'sidebar.panellist')
if (mainSeat === undefined) throw new Error('main slot was not registered')
if (mainSeat.seat.key !== 'qqbot') throw new Error(`main key should be qqbot, got ${String(mainSeat.seat.key)}`)
if (sidebarSeat === undefined) throw new Error('sidebar.panellist row was not registered')
if (sidebarSeat.seat.id !== 'qqbot') throw new Error(`sidebar id should be qqbot, got ${String(sidebarSeat.seat.id)}`)
if (sidebarSeat.seat.order !== 30) throw new Error(`sidebar order should be 30, got ${String(sidebarSeat.seat.order)}`)
const sidebarLabel = sidebarSeat.seat.label()
if (typeof sidebarLabel !== 'string' || sidebarLabel === '') throw new Error('sidebar label is empty')
console.log('sidebar label:', sidebarLabel)

if (headChildren.length !== 1) throw new Error(`expected one injected stylesheet, got ${headChildren.length}`)
const css = String(headChildren[0].textContent)
if (!css.includes('.qqbot-page') || !css.includes('--dsw-alias-bg-layer-2')) throw new Error('stylesheet missing panel classes or design tokens')
const dictionaries = ctx.locale.dictionaries.qqbot || {}
if (!dictionaries.en || dictionaries.en.title !== 'QQ bot') throw new Error('en locale dictionary missing')
if (!dictionaries.zh || dictionaries.zh.title !== 'QQ 机器人') throw new Error('zh locale dictionary missing')
if (MainComponent === null) throw new Error('main panel component missing')

// ---- renderer ---------------------------------------------------------------
function walk(node, out = []) {
  if (node === null || node === undefined || node === false || node === true) return out
  if (Array.isArray(node)) { for (const item of node) walk(item, out); return out }
  if (typeof node === 'string' || typeof node === 'number') { out.push({ text: String(node) }); return out }
  if (!node.$$el) return out
  const { type, props } = node.$$el
  if (typeof type === 'function') { walk(type(props), out); return out }
  const entry = { type, props, children: [] }
  out.push(entry)
  const kids = props.children === undefined ? [] : Array.isArray(props.children) ? props.children : [props.children]
  for (const kid of kids) walk(kid, entry.children)
  return out
}

function render() {
  hookIndex = 0
  rerender = false
  pendingEffects = []
  return walk(React.createElement(MainComponent))
}

async function settle() {
  let tree = render()
  for (let round = 0; round < 8; round += 1) {
    const effects = pendingEffects
    pendingEffects = []
    for (const fn of effects) fn()
    await new Promise((resolve) => setTimeout(resolve, 0))
    if (!rerender && effects.length === 0) break
    tree = render()
  }
  return tree
}

/** Drop the fake hook store so the panel can be mounted again with fresh state. */
function resetRenderState() {
  hookState.length = 0
  effectSlots.length = 0
  pendingEffects = []
  rerender = false
  hookIndex = 0
}

function findAll(tree, predicate, acc = []) {
  for (const node of tree) {
    if (node.type !== undefined && predicate(node)) acc.push(node)
    if (node.children) findAll(node.children, predicate, acc)
  }
  return acc
}

const text = (node) => {
  const parts = []
  const visit = (current) => {
    if (current.text !== undefined) parts.push(current.text)
    if (current.children) current.children.forEach(visit)
  }
  visit(node)
  return parts.join(' ').replace(/\s+/g, ' ').trim()
}

const findTestId = (tree, id) => findAll(tree, (node) => node.props && node.props['data-testid'] === id)[0]
const expectTestId = (tree, id) => {
  const node = findTestId(tree, id)
  if (node === undefined) throw new Error(`missing data-testid=${id}`)
  return node
}
const clickTestId = (tree, id) => {
  const node = expectTestId(tree, id)
  if (typeof node.props.onClick !== 'function') throw new Error(`data-testid=${id} is not clickable`)
  node.props.onClick()
}

// ---- mount ------------------------------------------------------------------
let tree = await settle()

for (const id of [
  'qqbot-panel',
  'qqbot-pill-napcat',
  'qqbot-pill-koishi',
  'qqbot-pill-bot',
  'qqbot-tab-overview',
  'qqbot-tab-plugins',
  'qqbot-tab-features',
  'qqbot-tab-logs',
]) {
  expectTestId(tree, id)
}
const panelText = text(expectTestId(tree, 'qqbot-panel'))
if (!panelText.includes('QQ 机器人')) throw new Error('panel title missing')
if (!panelText.includes('NapCat') || !panelText.includes('Koishi')) throw new Error('overview cards missing')
if (!text(expectTestId(tree, 'qqbot-pill-napcat')).includes('未安装')) throw new Error('napcat pill should report a missing install')
if (!text(expectTestId(tree, 'qqbot-pill-koishi')).includes('运行中')) throw new Error('koishi pill should report running')
if (!text(expectTestId(tree, 'qqbot-pill-bot')).includes('在线')) throw new Error('bot pill should report online')

// the not-installed overview offers the setup buttons
expectTestId(tree, 'qqbot-action-all-start')
expectTestId(tree, 'qqbot-action-all-stop')
expectTestId(tree, 'qqbot-action-napcat-install')
expectTestId(tree, 'qqbot-action-napcat-configure')
expectTestId(tree, 'qqbot-action-napcat-start')
expectTestId(tree, 'qqbot-action-koishi-start')
expectTestId(tree, 'qqbot-action-koishi-restart')
console.log('overview testids: ok')

// ---- action: start everything -> POST JSON ----------------------------------
clickTestId(tree, 'qqbot-action-all-start')
tree = await settle()
const started = fetchLog.filter((entry) => entry.method === 'POST' && entry.url === '/qqbot/all/start')
if (started.length !== 1) throw new Error(`expected one POST /qqbot/all/start, got ${started.length}`)
if (started[0].body !== '{}') throw new Error(`start-all body should be an empty JSON object, got ${String(started[0].body)}`)
if (findTestId(tree, 'qqbot-banner') === undefined) throw new Error('success banner missing after the action')
console.log('action POST: ok')

// ---- plugins tab ------------------------------------------------------------
clickTestId(tree, 'qqbot-tab-plugins')
tree = await settle()
const rows = findAll(tree, (node) => node.props && node.props['data-testid'] === 'qqbot-plugin-row')
if (rows.length !== 1) throw new Error(`expected one plugin row, got ${rows.length}`)
if (rows[0].props['data-key'] !== 'puppeteer') throw new Error(`plugin row data-key wrong: ${String(rows[0].props['data-key'])}`)
const rowText = text(rows[0])
if (!rowText.includes('puppeteer') || !rowText.includes('1.2.3')) throw new Error('plugin row is missing name or version')
expectTestId(tree, 'qqbot-plugin-toggle')
expectTestId(tree, 'qqbot-plugin-uninstall')
expectTestId(tree, 'qqbot-plugin-install')

clickTestId(tree, 'qqbot-plugin-toggle')
tree = await settle()
const toggles = fetchLog.filter((entry) => entry.method === 'POST' && entry.url === '/qqbot/koishi/plugins/toggle')
if (toggles.length !== 1) throw new Error(`expected one toggle POST, got ${toggles.length}`)
const toggleBody = JSON.parse(String(toggles[0].body))
if (toggleBody.key !== 'puppeteer' || toggleBody.enabled !== false || toggleBody.restart !== false) {
  throw new Error(`unexpected toggle body: ${JSON.stringify(toggleBody)}`)
}
console.log('plugin toggle POST: ok')

// ---- features tab -----------------------------------------------------------
clickTestId(tree, 'qqbot-tab-features')
tree = await settle()
const cards = findAll(tree, (node) => node.props && node.props['data-testid'] === 'qqbot-feature-card')
if (cards.length !== 2) throw new Error(`expected two feature cards, got ${cards.length}`)
if (!text(cards[0]).includes('启停')) throw new Error('feature title not localized')
if (!text(expectTestId(tree, 'qqbot-panel')).includes("inject: ['qqbot']")) throw new Error('feature extension note missing')

clickTestId(tree, 'qqbot-action-all-start')
tree = await settle()
const runs = fetchLog.filter((entry) => entry.method === 'POST' && entry.url === '/qqbot/features/run')
if (runs.length !== 1) throw new Error(`expected one feature run POST, got ${runs.length}`)
const runBody = JSON.parse(String(runs[0].body))
if (runBody.feature !== 'lifecycle' || runBody.action !== 'all-start') {
  throw new Error(`unexpected feature run body: ${JSON.stringify(runBody)}`)
}
console.log('feature run POST: ok')

// ---- logs tab ---------------------------------------------------------------
clickTestId(tree, 'qqbot-tab-logs')
tree = await settle()
const pre = expectTestId(tree, 'qqbot-logs')
if (!text(pre).includes('bot online')) throw new Error('log tail did not render')
if (findTestId(tree, 'qqbot-logs-source-koishi').props['aria-pressed'] !== 'true') throw new Error('koishi source should be active')
clickTestId(tree, 'qqbot-logs-source-napcat')
tree = await settle()
const logCalls = fetchLog.filter((entry) => entry.url.startsWith('/qqbot/logs'))
const lastLogCall = logCalls[logCalls.length - 1]
if (!lastLogCall.url.includes('source=napcat')) throw new Error(`napcat source not requested: ${lastLogCall.url}`)
if (findTestId(tree, 'qqbot-logs-source-napcat').props['aria-pressed'] !== 'true') throw new Error('napcat source did not activate')
console.log('logs source switch: ok')

// ---- locale flip ------------------------------------------------------------
currentLang = 'en'
tree = await settle()
if (!text(expectTestId(tree, 'qqbot-panel')).includes('QQ bot')) throw new Error('en title missing after locale switch')
currentLang = 'zh'

// ---- installed / running state ---------------------------------------------
Object.assign(STATUS.napcat, {
  installed: true,
  installDir: '~/Library/Containers/com.tencent.qq/Data/Documents/napcat',
  version: '4.2.0',
  running: true,
  pid: 777,
  loggedIn: true,
  qq: '10001',
  nickname: 'botcat',
  configApplied: true,
  webui: { port: 6099, tokenMasked: 'abcd', reachable: true },
  accounts: [{
    uin: '10001',
    configPath: '~/onebot11_10001.json',
    wsClients: [{ name: 'koishi', url: 'ws://127.0.0.1:5140/onebot', enable: true }],
    applied: true,
  }],
})
resetRenderState()
tree = await settle()
const installedPanel = text(expectTestId(tree, 'qqbot-panel'))
if (!text(expectTestId(tree, 'qqbot-pill-napcat')).includes('运行中')) throw new Error('installed napcat pill should report running')
if (installedPanel.includes('未安装')) throw new Error('panel still renders the not-installed copy')
if (findTestId(tree, 'qqbot-action-napcat-install') !== undefined) throw new Error('install button should hide once NapCat is installed')
expectTestId(tree, 'qqbot-action-napcat-configure')
if (!installedPanel.includes('ws://127.0.0.1:5140/onebot')) throw new Error('reverse WS client from the status payload is missing')
if (!installedPanel.includes('botcat') || !installedPanel.includes('已登录')) throw new Error('login state is not rendered')
if (expectTestId(tree, 'qqbot-action-napcat-start').props.disabled !== true) throw new Error('start should disable while NapCat runs')
if (expectTestId(tree, 'qqbot-action-napcat-stop').props.disabled !== false) throw new Error('stop should stay enabled while NapCat runs')
console.log('installed overview state: ok')

// ---- status error state ----------------------------------------------------
failStatus = true
resetRenderState()
tree = await settle()
const errorText = text(expectTestId(tree, 'qqbot-panel'))
if (!errorText.includes('状态读取失败') || !errorText.includes('boom')) throw new Error('status error state was not rendered')
const retry = findAll(tree, (node) => node.props && node.props['aria-label'] === '重试')[0]
if (retry === undefined) throw new Error('retry button missing in the error state')
console.log('status error state: ok')
failStatus = false

console.log('\nclient smoke: ok')
process.exit(0)
