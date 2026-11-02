/**
 * Runtime tab registry for the control-center panel.
 *
 * A tab is a contribution point: the Host decides which tabs exist and in
 * which order (`clientTabs` on `/qqbot/status`), while the client registers
 * the matching render/hook pair here. Built-in tabs register themselves as a
 * side effect of importing `plugins/<name>/index.js`; external client plugins
 * can register at runtime through `window.__DSH_QQBOT__.registerTab()`.
 *
 * Registration is expected to be complete before the panel mounts (every DSH
 * client bundle is evaluated and applied before the UI renders). The registry
 * exposes no events on purpose: hooks have to be called in a stable order.
 */

/** @type {Map<string, {id: string, labelKey: string, order: number, use: Function, handlers: object}>} */
const registry = new Map()

/** Global bridge used by external client plugins. */
export const EXTERNAL_SCOPE_KEY = '__DSH_QQBOT__'

const orderOf = (value) => {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

/**
 * Register one tab.
 *
 * @param {{ id: string, labelKey?: string, order?: number, use: (panel: object) => (() => any), handlers?: object }} tab
 * @returns object the stored tab entry
 */
export function registerTab(tab) {
  if (tab === null || typeof tab !== 'object') {
    throw new Error('client tab must be an object')
  }
  const { id, labelKey, order, use, handlers } = tab
  if (typeof id !== 'string' || id === '') {
    throw new Error('client tab id must be a non-empty string')
  }
  if (typeof use !== 'function') {
    throw new Error(`client tab ${id} must provide a use(panel) function`)
  }
  if (registry.has(id)) {
    throw new Error(`client tab already registered: ${id}`)
  }
  const entry = {
    id,
    labelKey: typeof labelKey === 'string' && labelKey !== '' ? labelKey : id,
    order: orderOf(order),
    use,
    handlers: handlers !== null && typeof handlers === 'object' ? handlers : {},
  }
  registry.set(id, entry)
  return entry
}

/** All registered tabs, ordered the same way the Host orders them. */
export function listTabs() {
  return [...registry.values()].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
}

/**
 * Resolve the tabs the panel may show.
 *
 * With a Host tab list the Host wins: its order is kept, unknown ids are
 * ignored and duplicate ids are collapsed. Without a Host list (older Host or
 * before the first snapshot) every registered tab is shown, ordered by its
 * declared `order`.
 *
 * @param {Array<{ id: string, title?: object, order?: number }> | null | undefined} hostTabs
 */
export function resolveVisibleTabs(hostTabs) {
  const registered = listTabs()
  if (!Array.isArray(hostTabs)) return registered
  const byId = new Map(registered.map((tab) => [tab.id, tab]))
  const seen = new Set()
  const visible = []
  for (const hostTab of hostTabs) {
    const id = hostTab !== null && typeof hostTab === 'object' ? hostTab.id : null
    if (typeof id !== 'string' || id === '' || seen.has(id)) continue
    seen.add(id)
    const entry = byId.get(id)
    if (entry !== undefined) visible.push(entry)
  }
  return visible
}

/**
 * Expose the public registration API. Called at module load and again from
 * the client entry's `apply`; idempotent and safe in non-browser test hosts.
 *
 * @param {object} [scope] defaults to `window` when present
 */
export function registerClientTabApi(scope) {
  const target = scope !== undefined ? scope : (typeof window === 'undefined' ? null : window)
  if (target === null || target === undefined) return null
  const api = { registerTab, listTabs }
  target[EXTERNAL_SCOPE_KEY] = api
  return api
}

// Make the bridge available as early as possible: external client bundles may
// be evaluated after this module but before the panel mounts.
registerClientTabApi()
