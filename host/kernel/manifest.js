/**
 * Plugin manifest validation and topology resolution.
 *
 * A manifest is the small, self-describing header of one host plugin:
 * unique `id`, `name`, optional `version`, declared `inject`/`provides`
 * services, and an `apply(api)` function. The kernel loads plugins in an order
 * that satisfies every `inject` dependency and fails closed on cycles.
 */

/** Services the DSH host itself provides (not host/plugins). */
export const EXTERNAL_SERVICES = Object.freeze([
  'webServer',
  'tools',
  'systemPrompt',
  'llm',
  'attachments',
  'agentDefaultModel',
  'qqbot',
  'platform',
])

/**
 * @param {unknown} raw plugin module (default export or manifest object)
 * @returns {{ id: string, name: string, version: string, inject: string[], provides: string[], description: string, apply: Function, Config?: object }}
 */
export function normalizeManifest(raw) {
  if (raw === null || typeof raw !== 'object') throw new Error('plugin manifest must be an object')
  const source = raw.default !== undefined && raw.default !== null && typeof raw.default === 'object' ? raw.default : raw
  const id = requireString(source.id, 'plugin.id')
  const name = typeof source.name === 'string' && source.name !== '' ? source.name : id
  const version = typeof source.version === 'string' && source.version !== '' ? source.version : '1.0.0'
  if (typeof source.apply !== 'function') throw new Error(`plugin ${id}: apply() is required`)
  return {
    id,
    name,
    version,
    inject: normalizeStringArray(source.inject, `${id}.inject`),
    provides: normalizeStringArray(source.provides, `${id}.provides`),
    description: typeof source.description === 'string' ? source.description : '',
    apply: source.apply,
    ...(source.Config !== null && typeof source.Config === 'object' ? { Config: source.Config } : {}),
  }
}

/**
 * Validate a set of manifests and return them in dependency order.
 *
 * @param {ReturnType<typeof normalizeManifest>[]} manifests
 * @param {{ externalServices?: string[] }} [options]
 * @returns {ReturnType<typeof normalizeManifest>[]}
 */
export function validatePluginSet(manifests, options = {}) {
  const external = new Set(options.externalServices ?? EXTERNAL_SERVICES)
  const ids = new Set()
  const providers = new Map()
  for (const manifest of manifests) {
    if (ids.has(manifest.id)) throw new Error(`duplicate plugin id: ${manifest.id}`)
    ids.add(manifest.id)
    for (const service of manifest.provides) {
      if (providers.has(service)) {
        throw new Error(`service ${service} is provided by both ${providers.get(service)} and ${manifest.id}`)
      }
      if (external.has(service)) throw new Error(`plugin ${manifest.id} cannot re-provide host service ${service}`)
      providers.set(service, manifest.id)
    }
  }
  for (const manifest of manifests) {
    for (const service of manifest.inject) {
      if (!providers.has(service) && !external.has(service)) {
        throw new Error(`plugin ${manifest.id} injects unknown service: ${service}`)
      }
    }
  }
  return topologicalOrder(manifests, providers)
}

/** Kahn topological sort over provides -> inject edges; throws on cycles. */
function topologicalOrder(manifests, providers) {
  const byId = new Map(manifests.map((manifest) => [manifest.id, manifest]))
  const indegree = new Map(manifests.map((manifest) => [manifest.id, 0]))
  const edges = new Map(manifests.map((manifest) => [manifest.id, []]))
  for (const manifest of manifests) {
    for (const service of manifest.inject) {
      const providerId = providers.get(service)
      if (providerId === undefined || providerId === manifest.id) continue
      edges.get(providerId).push(manifest.id)
      indegree.set(manifest.id, indegree.get(manifest.id) + 1)
    }
  }
  const queue = manifests.filter((manifest) => indegree.get(manifest.id) === 0).map((manifest) => manifest.id)
  const order = []
  while (queue.length > 0) {
    const id = queue.shift()
    order.push(byId.get(id))
    for (const consumer of edges.get(id)) {
      indegree.set(consumer, indegree.get(consumer) - 1)
      if (indegree.get(consumer) === 0) queue.push(consumer)
    }
  }
  if (order.length !== manifests.length) {
    const cycle = manifests.map((manifest) => manifest.id).filter((id) => !order.some((item) => item.id === id))
    throw new Error(`plugin dependency cycle: ${cycle.join(', ')}`)
  }
  return order
}

function requireString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${label} must be a non-empty string`)
  return value.trim()
}

function normalizeStringArray(value, label) {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value)) throw new Error(`${label} must be an array of strings`)
  const seen = new Set()
  for (const item of value) {
    if (typeof item !== 'string' || item === '') throw new Error(`${label} must contain non-empty strings`)
    if (seen.has(item)) throw new Error(`${label} contains duplicate entry: ${item}`)
    seen.add(item)
  }
  return [...seen]
}
