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

const CONTACTS = {
  ok: true,
  selfId: '10001',
  fetchedAt: '2026-10-30T00:00:00.000Z',
  groups: [
    { id: '1026855069', name: '龙图群', memberCount: 5 },
    { id: '805836168', name: '残兽前进基地', memberCount: 1955 },
  ],
  friends: [
    { id: '676512192', name: '天青色瞪眼鱼' },
    { id: '1549439707', name: '阿光' },
  ],
}
let contactsFail = false

const ACCESS = {
  version: 1,
  updatedAt: '2026-10-30T00:00:00.000Z',
  inbound: {
    groups: { mode: 'whitelist', ids: ['1026855069', '777777'] },
    private: { mode: 'whitelist', ids: ['676512192'] },
    quiet: { enabled: false, prefixes: ['/'] },
  },
  outbound: {
    groups: { mode: 'blacklist', ids: ['805836168'] },
    private: { mode: 'all', ids: [] },
  },
}
let accessSaved = null

const LOGIN_WAITING = {
  reachable: true,
  loggedIn: false,
  qq: null,
  nickname: null,
  phase: 'waiting_qrcode',
  qrUrl: '/qqbot/napcat/qr?t=1',
  qrAvailable: true,
  coreReady: true,
  webuiPort: 6099,
}
const LOGIN_DONE = {
  reachable: true,
  loggedIn: true,
  qq: '10001',
  nickname: 'botcat',
  phase: null,
  qrUrl: null,
  qrAvailable: false,
  coreReady: true,
  webuiPort: 6099,
}
let loginStage = 'waiting'

const MESSAGE_FIXTURE = [
  { id: 'm1', time: '2026-10-30T10:00:00.000Z', direction: 'in', scene: 'group', targetId: '1026855069', groupId: '1026855069', userId: '5550001', userName: '小明', content: '大家好，今晚开黑吗？' },
  { id: 'm2', time: '2026-10-30T10:01:00.000Z', direction: 'in', scene: 'private', targetId: '676512192', userId: '676512192', userName: '天青色瞪眼鱼', content: '私聊测试消息' },
  { id: 'm3', time: '2026-10-30T10:02:00.000Z', direction: 'out', scene: 'group', targetId: '805836168', groupId: '805836168', userId: 'bot', userName: 'bot', content: '好的，已收到' },
]
let messagesData = MESSAGE_FIXTURE.slice()

const fetchLog = []
let failStatus = false
globalThis.fetch = async (url, init) => {
  const path = String(url)
  const method = (init && init.method) || 'GET'
  fetchLog.push({ url: path, method, body: (init && init.body) || null })
  const json = (body) => ({ ok: true, status: 200, json: async () => body })
  if (path.startsWith('/qqbot/status')) {
    if (failStatus) return json({ ok: false, error: 'boom' })
    if (loginStage === 'loggedIn') {
      return json({
        ok: true,
        data: {
          ...STATUS,
          napcat: { ...STATUS.napcat, installed: true, running: true, loggedIn: true, qq: '10001', nickname: 'botcat' },
        },
      })
    }
    return json({ ok: true, data: STATUS })
  }
  if (path === '/qqbot/napcat/login') {
    return json({ ok: true, data: loginStage === 'loggedIn' ? LOGIN_DONE : LOGIN_WAITING })
  }
  if (path === '/qqbot/napcat/qr/refresh') return json({ ok: true, qrUrl: '/qqbot/napcat/qr?t=2' })
  if (path.startsWith('/qqbot/napcat/qr')) return json({ ok: true })
  if (path.startsWith('/qqbot/messages')) {
    return json({ ok: true, data: { messages: messagesData, total: messagesData.length, updatedAt: '2026-10-30T10:02:00.000Z' } })
  }
  if (path === '/qqbot/access') {
    if (method === 'POST') {
      accessSaved = JSON.parse(String(init.body))
      return json({ ok: true, data: accessSaved })
    }
    return json({ ok: true, data: accessSaved ?? ACCESS })
  }
  if (path === '/qqbot/contacts') {
    if (contactsFail) {
      return json({ ok: false, groups: [], friends: [], selfId: null, fetchedAt: null, error: 'Koishi 未运行（测试）' })
    }
    return json(CONTACTS)
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

// Contact rows repeat in both cards (the contract fixes the row testid), so
// scope every lookup by the row data-scope.
const rowIn = (tree, scope, prefix, id) => findAll(tree, (node) => node.props
  && node.props['data-testid'] === `${prefix}-${id}`
  && node.props['data-scope'] === scope)[0]
const rowCheckbox = (row) => {
  if (row === undefined) throw new Error('contact row missing')
  const input = findAll([row], (node) => node.type === 'input' && node.props && node.props.type === 'checkbox')[0]
  if (input === undefined) throw new Error('contact row has no checkbox')
  return input
}
const toggleRow = (tree, scope, prefix, id) => {
  rowCheckbox(rowIn(tree, scope, prefix, id)).props.onChange({ currentTarget: {} })
}
const changeSelect = (tree, id, value) => {
  const node = expectTestId(tree, id)
  if (typeof node.props.onChange !== 'function') throw new Error(`data-testid=${id} is not a select`)
  node.props.onChange({ currentTarget: { value } })
}

// ---- mount ------------------------------------------------------------------
let tree = await settle()

for (const id of [
  'qqbot-panel',
  'qqbot-pill-napcat',
  'qqbot-pill-koishi',
  'qqbot-pill-bot',
  'qqbot-tab-overview',
  'qqbot-tab-messages',
  'qqbot-tab-access',
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
if (!fetchLog.some((entry) => entry.method === 'GET' && entry.url === '/qqbot/access')) {
  throw new Error('access policy was not prefetched on mount')
}

// ---- QR login card (overview) ----------------------------------------------
expectTestId(tree, 'qqbot-login-card')
expectTestId(tree, 'qqbot-login-qr')
if (!text(expectTestId(tree, 'qqbot-login-phase')).includes('等待扫码')) throw new Error('login phase copy missing')
const qrSrc = String(expectTestId(tree, 'qqbot-login-qr').props.src)
if (!qrSrc.startsWith('/qqbot/napcat/qr?t=')) throw new Error(`login QR src wrong: ${qrSrc}`)
expectTestId(tree, 'qqbot-login-refresh')
console.log('login card: ok')

// ---- action: start everything -> POST JSON ----------------------------------
clickTestId(tree, 'qqbot-action-all-start')
tree = await settle()
const started = fetchLog.filter((entry) => entry.method === 'POST' && entry.url === '/qqbot/all/start')
if (started.length !== 1) throw new Error(`expected one POST /qqbot/all/start, got ${started.length}`)
if (started[0].body !== '{}') throw new Error(`start-all body should be an empty JSON object, got ${String(started[0].body)}`)
if (findTestId(tree, 'qqbot-banner') === undefined) throw new Error('success banner missing after the action')
console.log('action POST: ok')

// ---- messages tab -----------------------------------------------------------
clickTestId(tree, 'qqbot-tab-messages')
tree = await settle()
expectTestId(tree, 'qqbot-tab-messages')
expectTestId(tree, 'qqbot-messages-list')
expectTestId(tree, 'qqbot-messages-refresh')
expectTestId(tree, 'qqbot-messages-filter')
if (!fetchLog.some((entry) => entry.method === 'GET' && entry.url.startsWith('/qqbot/messages'))) {
  throw new Error('messages were not fetched when the tab opened')
}
if (!fetchLog.some((entry) => entry.method === 'GET' && entry.url === '/qqbot/contacts')) {
  throw new Error('the messages tab did not ensure contacts were loaded')
}
let messageRows = findAll(tree, (node) => node.props && node.props['data-testid'] === 'qqbot-message-row')
if (messageRows.length !== 3) throw new Error(`expected 3 message rows, got ${messageRows.length}`)
const messagesText = text(expectTestId(tree, 'qqbot-messages-list'))
for (const needle of ['龙图群', '天青色瞪眼鱼', '大家好，今晚开黑吗？', '私聊测试消息', '好的，已收到']) {
  if (!messagesText.includes(needle)) throw new Error(`message copy missing: ${needle}`)
}
if (!messagesText.includes('接收') || !messagesText.includes('发送')) throw new Error('message direction labels missing')
const directions = findAll(tree, (node) => node.props && node.props['data-testid'] === 'qqbot-message-direction').map((node) => text(node))
if (directions.filter((label) => label.includes('接收')).length !== 2) throw new Error(`expected two received messages, got ${directions.join(',')}`)
if (directions.filter((label) => label.includes('发送')).length !== 1) throw new Error('expected one sent message')
const messageCallsBefore = fetchLog.filter((entry) => entry.url.startsWith('/qqbot/messages')).length
clickTestId(tree, 'qqbot-messages-refresh')
tree = await settle()
if (fetchLog.filter((entry) => entry.url.startsWith('/qqbot/messages')).length < messageCallsBefore + 1) {
  throw new Error('messages refresh did not re-fetch')
}
const filterSelect = expectTestId(tree, 'qqbot-messages-filter')
if (filterSelect.props.value !== 'all') throw new Error('default message filter should be all')
filterSelect.props.onChange({ currentTarget: { value: 'group' } })
tree = await settle()
messageRows = findAll(tree, (node) => node.props && node.props['data-testid'] === 'qqbot-message-row')
if (messageRows.length !== 2) throw new Error(`group filter should leave 2 rows, got ${messageRows.length}`)
if (messageRows.some((row) => row.props['data-scene'] !== 'group')) throw new Error('group filter leaked a private row')
expectTestId(tree, 'qqbot-messages-filter').props.onChange({ currentTarget: { value: 'private' } })
tree = await settle()
messageRows = findAll(tree, (node) => node.props && node.props['data-testid'] === 'qqbot-message-row')
if (messageRows.length !== 1) throw new Error(`private filter should leave 1 row, got ${messageRows.length}`)
if (!text(expectTestId(tree, 'qqbot-messages-list')).includes('私聊测试消息')) throw new Error('private message content missing')
expectTestId(tree, 'qqbot-messages-filter').props.onChange({ currentTarget: { value: 'all' } })
tree = await settle()
messagesData = []
clickTestId(tree, 'qqbot-messages-refresh')
tree = await settle()
if (!text(expectTestId(tree, 'qqbot-panel')).includes('还没有收到消息')) throw new Error('messages empty state missing')
messagesData = MESSAGE_FIXTURE.slice()
clickTestId(tree, 'qqbot-messages-refresh')
tree = await settle()
clickTestId(tree, 'qqbot-tab-overview')
tree = await settle()
console.log('messages tab: ok')

// ---- QR refresh + sign-in hides the card -----------------------------------
const refreshBefore = fetchLog.filter((entry) => entry.method === 'POST' && entry.url === '/qqbot/napcat/qr/refresh').length
clickTestId(tree, 'qqbot-login-refresh')
tree = await settle()
const refreshAfter = fetchLog.filter((entry) => entry.method === 'POST' && entry.url === '/qqbot/napcat/qr/refresh').length
if (refreshAfter < refreshBefore + 1) throw new Error('login refresh did not POST /qqbot/napcat/qr/refresh')
loginStage = 'loggedIn'
clickTestId(tree, 'qqbot-login-refresh')
tree = await settle()
if (findTestId(tree, 'qqbot-login-card') !== undefined) throw new Error('login card should hide after sign-in')
console.log('login refresh/sign-in: ok')

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

// ---- access tab -------------------------------------------------------------
clickTestId(tree, 'qqbot-tab-access')
tree = await settle()
for (const id of [
  'qqbot-tab-access',
  'qqbot-access-inbound-mode',
  'qqbot-access-outbound-mode',
  'qqbot-access-inbound-private-mode',
  'qqbot-access-outbound-private-mode',
  'qqbot-access-private-inbound',
  'qqbot-access-private-outbound',
  'qqbot-access-inbound-groups',
  'qqbot-access-outbound-groups',
  'qqbot-access-quiet',
  'qqbot-access-prefixes',
  'qqbot-access-save',
  'qqbot-access-refresh-contacts',
  'qqbot-access-inbound-groups-all',
  'qqbot-access-inbound-groups-clear',
  'qqbot-access-inbound-private-all',
  'qqbot-access-inbound-private-clear',
  'qqbot-access-outbound-groups-all',
  'qqbot-access-outbound-groups-clear',
  'qqbot-access-outbound-private-all',
  'qqbot-access-outbound-private-clear',
]) {
  expectTestId(tree, id)
}
const accessText = text(expectTestId(tree, 'qqbot-panel'))
for (const name of ['龙图群', '残兽前进基地', '天青色瞪眼鱼', '阿光']) {
  if (!accessText.includes(name)) throw new Error(`contact name missing: ${name}`)
}
if (!accessText.includes('未在列表中') || !accessText.includes('777777')) throw new Error('policy-only group id row missing')
if (!accessText.includes('5 人') || !accessText.includes('1955 人')) throw new Error('group member counts missing')
for (const scope of ['inbound', 'outbound']) {
  for (const id of ['1026855069', '805836168']) {
    if (rowIn(tree, scope, 'qqbot-access-group', id) === undefined) throw new Error(`group row missing: ${scope}/${id}`)
  }
  for (const id of ['676512192', '1549439707']) {
    if (rowIn(tree, scope, 'qqbot-access-friend', id) === undefined) throw new Error(`friend row missing: ${scope}/${id}`)
  }
}
if (rowCheckbox(rowIn(tree, 'inbound', 'qqbot-access-group', '1026855069')).props.checked !== true) {
  throw new Error('inbound group 1026855069 should start checked')
}
if (rowCheckbox(rowIn(tree, 'inbound', 'qqbot-access-group', '805836168')).props.checked !== false) {
  throw new Error('inbound group 805836168 should start unchecked')
}
if (rowCheckbox(rowIn(tree, 'inbound', 'qqbot-access-friend', '676512192')).props.checked !== true) {
  throw new Error('inbound friend 676512192 should start checked')
}
if (expectTestId(tree, 'qqbot-access-inbound-mode').props.value !== 'whitelist') throw new Error('loaded inbound group mode wrong')
if (expectTestId(tree, 'qqbot-access-outbound-mode').props.value !== 'blacklist') throw new Error('loaded outbound group mode wrong')
if (expectTestId(tree, 'qqbot-access-inbound-private-mode').props.value !== 'whitelist') throw new Error('loaded inbound private mode wrong')
if (expectTestId(tree, 'qqbot-access-outbound-private-mode').props.value !== 'all') throw new Error('loaded outbound private mode wrong')
if (rowCheckbox(rowIn(tree, 'outbound', 'qqbot-access-friend', '676512192')).props.disabled !== true) {
  throw new Error('contact rows should be disabled while the mode is all')
}
if (!fetchLog.some((entry) => entry.method === 'GET' && entry.url === '/qqbot/contacts')) {
  throw new Error('contacts were not fetched when the access tab opened')
}
console.log('access contacts load: ok')

// search filters by name (and leaves the matching row selectable)
expectTestId(tree, 'qqbot-access-inbound-groups-search').props.onChange({ currentTarget: { value: '龙图' } })
tree = await settle()
if (rowIn(tree, 'inbound', 'qqbot-access-group', '1026855069') === undefined) throw new Error('search dropped the matching group')
if (rowIn(tree, 'inbound', 'qqbot-access-group', '805836168') !== undefined) throw new Error('search kept a non-matching group')
expectTestId(tree, 'qqbot-access-inbound-groups-search').props.onChange({ currentTarget: { value: '' } })
tree = await settle()

// click-to-toggle; switching the mode keeps the current selection
toggleRow(tree, 'inbound', 'qqbot-access-group', '805836168')
tree = await settle()
toggleRow(tree, 'inbound', 'qqbot-access-group', '1026855069')
tree = await settle()
if (rowCheckbox(rowIn(tree, 'inbound', 'qqbot-access-group', '805836168')).props.checked !== true) throw new Error('toggling group 805836168 failed')
if (rowCheckbox(rowIn(tree, 'inbound', 'qqbot-access-group', '1026855069')).props.checked !== false) throw new Error('toggling group 1026855069 failed')
clickTestId(tree, 'qqbot-access-remove-inbound-777777')
tree = await settle()
if (findTestId(tree, 'qqbot-access-extra-inbound-777777') !== undefined) throw new Error('removed policy-only id is still listed')
changeSelect(tree, 'qqbot-access-inbound-mode', 'blacklist')
tree = await settle()
if (rowCheckbox(rowIn(tree, 'inbound', 'qqbot-access-group', '805836168')).props.checked !== true) {
  throw new Error('switching the mode cleared the checked ids')
}
changeSelect(tree, 'qqbot-access-inbound-mode', 'whitelist')
tree = await settle()

// private contact lists toggle the same way
toggleRow(tree, 'inbound', 'qqbot-access-friend', '1549439707')
tree = await settle()
if (rowCheckbox(rowIn(tree, 'inbound', 'qqbot-access-friend', '1549439707')).props.checked !== true) {
  throw new Error('toggling inbound friend failed')
}

// outbound: clear + select all, then switch private mode and pick a friend
clickTestId(tree, 'qqbot-access-outbound-groups-clear')
tree = await settle()
if (rowCheckbox(rowIn(tree, 'outbound', 'qqbot-access-group', '805836168')).props.checked !== false) {
  throw new Error('clear did not empty the outbound groups')
}
clickTestId(tree, 'qqbot-access-outbound-groups-all')
tree = await settle()
for (const id of ['1026855069', '805836168']) {
  if (rowCheckbox(rowIn(tree, 'outbound', 'qqbot-access-group', id)).props.checked !== true) {
    throw new Error(`select all missed group ${id}`)
  }
}
changeSelect(tree, 'qqbot-access-outbound-private-mode', 'whitelist')
tree = await settle()
toggleRow(tree, 'outbound', 'qqbot-access-friend', '676512192')
tree = await settle()

expectTestId(tree, 'qqbot-access-quiet').props.onChange({ currentTarget: { checked: true } })
tree = await settle()
expectTestId(tree, 'qqbot-access-prefixes').props.onChange({ currentTarget: { value: '! , #   !' } })
tree = await settle()
clickTestId(tree, 'qqbot-access-save')
tree = await settle()

const accessPosts = fetchLog.filter((entry) => entry.method === 'POST' && entry.url === '/qqbot/access')
if (accessPosts.length !== 1) throw new Error(`expected one POST /qqbot/access, got ${accessPosts.length}`)
const accessBody = JSON.parse(String(accessPosts[0].body))
if (accessBody.version !== 1 || typeof accessBody.updatedAt !== 'string') throw new Error('access policy version/timestamp missing')
if (!accessBody.inbound || !accessBody.outbound || !accessBody.inbound.quiet) throw new Error('access policy sections missing')
if (accessBody.inbound.groups.mode !== 'whitelist') throw new Error(`inbound groups mode wrong: ${accessBody.inbound.groups.mode}`)
if (JSON.stringify(accessBody.inbound.groups.ids) !== JSON.stringify(['805836168'])) {
  throw new Error(`inbound group ids wrong: ${JSON.stringify(accessBody.inbound.groups.ids)}`)
}
if (accessBody.inbound.private.mode !== 'whitelist') throw new Error(`inbound private mode wrong: ${accessBody.inbound.private.mode}`)
if (JSON.stringify(accessBody.inbound.private.ids) !== JSON.stringify(['676512192', '1549439707'])) {
  throw new Error(`inbound private ids wrong: ${JSON.stringify(accessBody.inbound.private.ids)}`)
}
if (accessBody.outbound.groups.mode !== 'blacklist') throw new Error(`outbound groups mode wrong: ${accessBody.outbound.groups.mode}`)
if (JSON.stringify(accessBody.outbound.groups.ids) !== JSON.stringify(['1026855069', '805836168'])) {
  throw new Error(`outbound group ids wrong: ${JSON.stringify(accessBody.outbound.groups.ids)}`)
}
if (accessBody.outbound.private.mode !== 'whitelist' || JSON.stringify(accessBody.outbound.private.ids) !== JSON.stringify(['676512192'])) {
  throw new Error(`outbound private wrong: ${JSON.stringify(accessBody.outbound.private)}`)
}
if (accessBody.inbound.quiet.enabled !== true) throw new Error('quiet flag not sent')
if (JSON.stringify(accessBody.inbound.quiet.prefixes) !== JSON.stringify(['!', '#'])) {
  throw new Error(`prefixes not sanitized: ${JSON.stringify(accessBody.inbound.quiet.prefixes)}`)
}
const saveBanner = findTestId(tree, 'qqbot-banner')
if (saveBanner === undefined || !text(saveBanner).includes('权限策略已保存')) throw new Error('save banner missing')
console.log('access save POST: ok')

// contacts unavailable: error is surfaced, yet modes and save stay usable
contactsFail = true
const contactCallsBefore = fetchLog.filter((entry) => entry.url === '/qqbot/contacts').length
clickTestId(tree, 'qqbot-access-refresh-contacts')
tree = await settle()
const contactCallsAfter = fetchLog.filter((entry) => entry.url === '/qqbot/contacts').length
if (contactCallsAfter !== contactCallsBefore + 1) throw new Error('refresh list did not re-fetch /qqbot/contacts')
const contactsErrorNode = findTestId(tree, 'qqbot-access-contacts-error')
if (contactsErrorNode === undefined || !text(contactsErrorNode).includes('Koishi 未运行')) {
  throw new Error('contacts error banner missing')
}
if (expectTestId(tree, 'qqbot-access-save').props.disabled === true) {
  throw new Error('save must stay enabled when contacts are unavailable')
}
changeSelect(tree, 'qqbot-access-inbound-mode', 'blacklist')
tree = await settle()
if (expectTestId(tree, 'qqbot-access-inbound-mode').props.value !== 'blacklist') {
  throw new Error('the mode must stay editable without contacts')
}
contactsFail = false
console.log('access contacts error state: ok')

// ---- locale flip ------------------------------------------------------------
currentLang = 'en'
tree = await settle()
if (!text(expectTestId(tree, 'qqbot-panel')).includes('QQ bot')) throw new Error('en title missing after locale switch')
if (!text(expectTestId(tree, 'qqbot-panel')).includes('Access policy')) throw new Error('en access copy missing after locale switch')
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
