/**
 * Feature contributions: the extension seam of the QQ bot control center.
 *
 * A feature is a small, self-describing capability (status + optional actions)
 * rendered by the panel. Built-ins live in host/plugins/features; other DSH
 * plugins can register their own through the `qqbot` service.
 */

/**
 * Collects features and executes their actions with a shared dependency bag.
 * The dependency bag is supplied by the kernel and exposes the registered
 * services (napcat/koishi/plugins/access/...) plus settings and platform info.
 */
export class FeatureRegistry {
  /** @param {Record<string, any>} deps */
  constructor(deps = {}) {
    this.deps = deps
    /** @type {Map<string, ReturnType<typeof normalizeFeature>>} */
    this.features = new Map()
  }

  /**
   * Register a feature. Re-registering the same id replaces the previous
   * definition, which is what hot reloads expect.
   *
   * @param {object} feature
   * @returns {() => void} unsubscribe
   */
  register(feature) {
    if (feature === null || typeof feature !== 'object') throw new Error('feature must be an object')
    if (typeof feature.id !== 'string' || feature.id === '') throw new Error('feature.id must be a non-empty string')
    if (typeof feature.title !== 'string' && (typeof feature.title !== 'object' || feature.title === null)) {
      throw new Error(`feature ${feature.id}: title is required`)
    }
    const normalized = normalizeFeature(feature)
    this.features.set(normalized.id, normalized)
    return () => {
      if (this.features.get(normalized.id) === normalized) this.features.delete(normalized.id)
    }
  }

  /** List descriptors for the UI/API (no status evaluation). */
  list() {
    return [...this.features.values()].map(describeFeature)
  }

  /** Evaluate every feature's status; failures are reported per feature. */
  async statusAll() {
    const entries = await Promise.all([...this.features.values()].map(async (feature) => {
      try {
        const status = typeof feature.status === 'function' ? await feature.status(this.deps) : null
        return { id: feature.id, status }
      } catch (error) {
        return { id: feature.id, status: null, error: String(error?.message ?? error) }
      }
    }))
    return Object.fromEntries(entries.map((entry) => [entry.id, entry]))
  }

  /** Run one action of one feature. */
  async run(featureId, actionId, params = {}) {
    const feature = this.features.get(featureId)
    if (feature === undefined) throw new Error(`unknown feature: ${featureId}`)
    const action = (feature.actions ?? []).find((item) => item.id === actionId)
    if (action === undefined) throw new Error(`unknown action: ${featureId}/${actionId}`)
    return action.run(this.deps, params ?? {})
  }
}

/** Normalize a feature definition (stable action ids, bilingual copy). */
export function normalizeFeature(feature) {
  return {
    id: feature.id,
    title: normalizeText(feature.title, feature.id),
    description: normalizeText(feature.description, ''),
    status: feature.status,
    actions: Array.isArray(feature.actions)
      ? feature.actions.map((action) => ({
          id: action.id,
          title: normalizeText(action.title, action.id),
          tone: action.tone ?? 'normal',
          run: action.run,
        }))
      : [],
  }
}

/** Public descriptor without executable functions. */
export function describeFeature(feature) {
  return {
    id: feature.id,
    title: feature.title,
    description: feature.description,
    actions: (feature.actions ?? []).map(({ id, title, tone }) => ({ id, title, tone })),
  }
}

/** Accept `{zh,en}` or a plain string. */
export function normalizeText(value, fallback) {
  if (typeof value === 'string' && value !== '') return { zh: value, en: value }
  if (value !== null && typeof value === 'object') {
    return {
      zh: typeof value.zh === 'string' ? value.zh : String(value.en ?? fallback),
      en: typeof value.en === 'string' ? value.en : String(value.zh ?? fallback),
    }
  }
  return { zh: fallback, en: fallback }
}
