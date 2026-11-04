/**
 * End-to-end tab wiring for the built bundle: built-in registration, the
 * public `window.__DSH_QQBOT__` bridge, Host `clientTabs` filtering/ordering
 * and the external tab render path.
 *
 * The bundle is imported with a tiny React stand-in plus a fake Host, mirroring
 * scripts/smoke-client.mjs but focused on the tab contract.
 *
 * Run with: node --test test/client/
 */
import assert from 'node:assert/strict'
import test, { after } from 'node:test'

// The mounted panel installs polling intervals; clear them so the test process
// can exit once the suite is done.
const liveIntervals = new Set()
const realSetInterval = globalThis.setInterval
const realClearInterval = globalThis.clearInterval
globalThis.setInterval = (fn, ms) => {
  const id = realSetInterval(fn, ms)
  liveIntervals.add(id)
  return id
}
globalThis.clearInterval = (id) => {
  liveIntervals.delete(id)
  realClearInterval(id)
}
after(() => {
  for (const id of liveIntervals) realClearInterval(id)
  liveIntervals.clear()
})

// ------------------------------------------------------------ React stand-in --
let hookIndex = 0
const hookState = []
const effectSlots = []
let pendingEffects = []
let rerender = false
const sameDeps = (a, b) => Array.isArray(a) && Array.isArray(b)
  && a.length === b.length && a.every((value, index) => value === b[index])

const React = {
  createElement(type, props, ...children) {
    const merged = { ...(props ?? {}) }
    const flat = children.length === 0 ? undefined : children.length === 1 ? children[0] : children
    if (flat !== undefined) merged.children = flat
    return { $$el: { type, props: merged } }
  },
  useState(initial) {
    const index = hookIndex++
    if (!(index in hookState)) hookState[index] = typeof initial === 'function' ? initial() : initial
    return [hookState[index], (next) => {
      hookState[index] = typeof next === 'function' ? next(hookState[index]) : next
      rerender = true
    }]
  },
  useEffect(fn, deps) {
    const index = hookIndex++
    const previous = effectSlots[index]
    const changed = previous === undefined || deps === undefined || !sameDeps(previous.deps, deps)
    effectSlots[index] = { deps: deps ?? [] }
    if (changed) pendingEffects.push(fn)
  },
  useMemo(fn) { hookIndex += 1; return fn() },
  useCallback(fn) { hookIndex += 1; return fn },
  useRef(value) { hookIndex += 1; return { current: value ?? null } },
  useLayoutEffect() { hookIndex += 1 },
}

// --------------------------------------------------------------- fake browser --
const store = new Map()
const headChildren = []
const styles = []
globalThis.document = {
  createElement: () => ({ dataset: {}, textContent: '', remove() {} }),
  head: { appendChild: (element) => { headChildren.push(element) } },
}
let definition = null
globalThis.window = {
  __ModuleLoader__: { load: (value) => { definition = value } },
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

// ------------------------------------------------------------------ fake Host --
const BUILTIN_HOST_TABS = [
  { id: 'overview', title: { zh: '总览', en: 'Overview' }, order: 0 },
  { id: 'ai', title: { zh: 'AI', en: 'AI' }, order: 1 },
  { id: 'messages', title: { zh: '消息', en: 'Messages' }, order: 2 },
  { id: 'access', title: { zh: '权限', en: 'Access' }, order: 3 },
  { id: 'plugins', title: { zh: '插件', en: 'Plugins' }, order: 4 },
  { id: 'features', title: { zh: '功能', en: 'Features' }, order: 5 },
  { id: 'logs', title: { zh: '日志', en: 'Logs' }, order: 6 },
  { id: 'games', title: { zh: '小游戏', en: 'Mini Games' }, order: 7 },
]
const EXTERNAL_HOST_TAB = { id: 'external-demo', title: { zh: '外部页', en: 'External page' }, order: 1.5 }
let hostTabs = BUILTIN_HOST_TABS

const STATUS = {
  platform: { id: 'macos', label: 'macOS', arch: 'arm64', napcatSupported: true },
  settings: { projectDir: '~/project/qq-bot', koishiPort: 5140, napcatPort: 6099, reversePath: '/onebot' },
  qq: { installed: true },
  napcat: {},
  koishi: {},
  bot: { online: true },
  ai: { available: false },
  features: [],
  updatedAt: '2026-11-02T00:00:00.000Z',
}

globalThis.fetch = async (url, init) => {
  const path = String(url)
  const json = (body) => ({ ok: true, status: 200, json: async () => body })
  if (path.startsWith('/qqbot/status')) {
    return json({ ok: true, data: { ...STATUS, clientTabs: hostTabs === null ? undefined : hostTabs } })
  }
  if (path === '/qqbot/access') return json({ ok: true, data: {} })
  if (path === '/qqbot/setup') return json({ ok: true, data: { logs: [] } })
  if (path === '/qqbot/persona') return json({ ok: true, data: { persona: {}, promptPreview: '', path: null } })
  if (path === '/qqbot/napcat/login') return json({ ok: true, data: { reachable: true, loggedIn: true } })
  if (path === '/qqbot/contacts') return json({ ok: true, groups: [], friends: [], selfId: null, fetchedAt: null })
  return json({ ok: true, data: [] })
}

// ------------------------------------------------------------------- bootstrap --
await import('../../client.js')
if (!definition || definition.id !== 'dsh-qqbot') throw new Error('bundle registration missing')
const api = definition.factory(fakeRequire)

const registrations = []
const dictionaries = {}
const ctx = {
  effect(fn) {
    const cleanup = fn()
    return typeof cleanup === 'function' ? cleanup : () => {}
  },
  locale: {
    register(namespace, value) { dictionaries[namespace] = value },
    bind(namespace) {
      return (key) => {
        const table = (dictionaries[namespace] || {}).zh || {}
        return table[key] !== undefined ? table[key] : String(key)
      }
    },
  },
  slots: {
    inject(seat, callback) { callback() },
    register(seat, component) { registrations.push({ seat, component }) },
  },
}
api.apply(ctx)

// -------------------------------------------------------------------- renderer --
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

const MainComponent = registrations.find((entry) => entry.seat.name === 'main').component

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
    for (const effect of effects) effect()
    await new Promise((resolve) => setTimeout(resolve, 0))
    if (!rerender && effects.length === 0) break
    tree = render()
  }
  return tree
}

const findAll = (tree, predicate, acc = []) => {
  for (const node of tree) {
    if (node.type !== undefined && predicate(node)) acc.push(node)
    if (node.children) findAll(node.children, predicate, acc)
  }
  return acc
}
const tabIds = (tree) => findAll(tree, (node) => node.props && typeof node.props['data-testid'] === 'string'
  && node.props['data-testid'].startsWith('qqbot-tab-'))
  .map((node) => node.props['data-testid'])
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

// ----------------------------------------------------------------------- tests --
test('built-in tabs register themselves with the runtime registry', () => {
  assert.ok(globalThis.window.__DSH_QQBOT__, 'window.__DSH_QQBOT__ bridge missing')
  const tabs = globalThis.window.__DSH_QQBOT__.listTabs()
  assert.deepEqual(tabs.map((tab) => tab.id), ['overview', 'ai', 'messages', 'access', 'plugins', 'features', 'logs', 'games'])
  assert.deepEqual(tabs.map((tab) => tab.order), [0, 1, 2, 3, 4, 5, 6, 7])
})

test('an external client plugin can register through window.__DSH_QQBOT__', () => {
  globalThis.window.__DSH_QQBOT__.registerTab({
    id: 'external-demo',
    labelKey: 'externalDemoTab',
    order: 1.5,
    use(panel) {
      return () => panel.h('div', { 'data-testid': 'external-demo-body' }, '外部插件正文')
    },
    handlers: {},
  })
  const tabs = globalThis.window.__DSH_QQBOT__.listTabs().map((tab) => tab.id)
  assert.ok(tabs.includes('external-demo'))
  assert.throws(() => globalThis.window.__DSH_QQBOT__.registerTab({ id: 'external-demo', use: () => () => null }), /already registered/)
})

test('the panel renders only Host-listed tabs, in Host order, ignoring unknown ids', async () => {
  hostTabs = [
    { id: 'external-demo', title: { zh: '外部页', en: 'External page' }, order: 1.5 },
    { id: 'ghost-tab', title: { zh: '幽灵', en: 'Ghost' }, order: 9 },
    { id: 'overview', title: { zh: '总览', en: 'Overview' }, order: 0 },
  ]
  let tree = await settle()
  assert.deepEqual(tabIds(tree), ['qqbot-tab-external-demo', 'qqbot-tab-overview'])
  // The external tab has no dictionary entry, so the Host title is used.
  assert.ok(text(expectTestId(tree, 'qqbot-tab-external-demo')).includes('外部页'))
  // The built-in overview label still comes from the client dictionary.
  assert.ok(text(expectTestId(tree, 'qqbot-tab-overview')).includes('概览'))
  assert.equal(findTestId(tree, 'qqbot-tab-ghost-tab'), undefined)
  // The Host list hides the built-in ai tab and keeps the overview body.
  assert.equal(findTestId(tree, 'qqbot-tab-ai'), undefined)
  expectTestId(tree, 'qqbot-pill-napcat')

  // Clicking the external tab renders its own body.
  clickTestId(tree, 'qqbot-tab-external-demo')
  tree = await settle()
  assert.ok(text(expectTestId(tree, 'external-demo-body')).includes('外部插件正文'))
  assert.equal(expectTestId(tree, 'qqbot-tab-external-demo').props['aria-selected'], 'true')
})

test('the panel falls back to every registered tab in order without a Host list', async () => {
  hostTabs = null
  clickTestId(await settle(), 'qqbot-status-refresh')
  const tree = await settle()
  assert.deepEqual(tabIds(tree), [
    'qqbot-tab-overview',
    'qqbot-tab-ai',
    'qqbot-tab-external-demo',
    'qqbot-tab-messages',
    'qqbot-tab-access',
    'qqbot-tab-plugins',
    'qqbot-tab-features',
    'qqbot-tab-logs',
    'qqbot-tab-games',
  ])
})

test('an active tab the Host hides falls back to the first visible tab', async () => {
  // The previous test left the external tab active; the Host now only lists ai.
  hostTabs = [{ id: 'ai', order: 1 }]
  clickTestId(await settle(), 'qqbot-status-refresh')
  const filtered = await settle()
  assert.deepEqual(tabIds(filtered), ['qqbot-tab-ai'])
  assert.ok(findTestId(filtered, 'qqbot-ai-dashboard') !== undefined, 'the fallback tab body did not render')
  assert.equal(findTestId(filtered, 'external-demo-body'), undefined)
})

test('a status snapshot without clientTabs keeps every tab visible', async () => {
  hostTabs = null
  clickTestId(await settle(), 'qqbot-status-refresh')
  const tree = await settle()
  assert.equal(tabIds(tree).length, 9)
})
