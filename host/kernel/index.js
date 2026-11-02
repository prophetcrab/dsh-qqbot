/**
 * Host kernel: plugin lifecycle plus the contribution points every capability
 * registers through (route/tool/feature/statusProvider/clientTab/systemPrompt/
 * service).
 *
 * The kernel is framework-agnostic. `host/app.js` wires it to the DSH context
 * (webServer/tools/systemPrompt) and to the built-in plugin list, so removing a
 * plugin removes every contribution it made and nothing else.
 */

import { FeatureRegistry } from './contributions.js'
import { createSerializer } from './http.js'
import { EXTERNAL_SERVICES, normalizeManifest, validatePluginSet } from './manifest.js'
import { ServiceRegistry } from './registry.js'

/** Logger used before/without a host logger (tests, scripts). */
const QUIET_LOGGER = { info() {}, warn() {}, error() {}, debug() {} }

export class Kernel {
  /**
   * @param {{ settings?: object, logger?: object, ctx?: object }} [options]
   */
  constructor(options = {}) {
    const source = options !== null && typeof options === 'object' ? options : {}
    this.settings = source.settings ?? {}
    this.logger = normalizeLogger(source.logger)
    this.ctx = source.ctx ?? null
    /** @type {Map<string, { manifest: object, api: object }>} */
    this.plugins = new Map()
    /** @type {Map<string, { owner: string, handler: Function, disposer: Function|null }>} */
    this.routes = new Map()
    /** @type {Map<string, { owner: string, tool: object, disposer: Function|null }>} */
    this.tools = new Map()
    /** @type {Map<string, { owner: string, tab: object }>} */
    this.clientTabs = new Map()
    /** @type {Map<string, { owner: string, provider: Function }>} */
    this.statusProviders = new Map()
    /** @type {Array<{ owner: string, section: object }>} */
    this.systemPrompts = []
    /** @type {Map<string, Set<Function>>} */
    this.ownerDisposers = new Map()

    this.services = new ServiceRegistry()
    this.serialize = createSerializer()
    this.featureRegistry = new FeatureRegistry(this.#featureDeps())
    this.webServer = null
    this.toolsServer = null
    this.systemPromptServer = null
  }

  // -------------------------------------------------------------- services --

  /** @param {string} owner @param {string} name @param {any} instance */
  provide(owner, name, instance) {
    if (typeof name !== 'string' || name === '') throw new Error('service name must be a non-empty string')
    this.services.provide(name, instance, owner)
    return instance
  }

  /** @param {string} name */
  get(name) {
    const value = this.services.get(name)
    if (value !== undefined) return value
    try {
      return this.ctx?.get?.(name)
    } catch {
      return undefined
    }
  }

  // ----------------------------------------------------------- contributions --

  /**
   * @param {string} owner
   * @param {{ path: string, handler: Function }} route
   */
  registerRoute(owner, route) {
    if (route === null || typeof route !== 'object') throw new Error('route must be an object')
    if (typeof route.path !== 'string' || !route.path.startsWith('/')) throw new Error('route.path must start with /')
    if (typeof route.handler !== 'function') throw new Error(`route ${route.path}: handler must be a function`)
    if (this.routes.has(route.path)) throw new Error(`duplicate route: ${route.path}`)
    const entry = { owner, handler: route.handler, disposer: null }
    this.routes.set(route.path, entry)
    this.#track(owner, () => {
      if (this.routes.get(route.path) === entry) this.routes.delete(route.path)
      if (typeof entry.disposer === 'function') entry.disposer()
    })
    if (this.webServer !== null) this.#attachRoute(route.path, entry)
    return route.path
  }

  /** @param {string} owner @param {Array<{ path: string, handler: Function }>} routes */
  registerRoutes(owner, routes) {
    for (const route of routes) this.registerRoute(owner, route)
    return routes.length
  }

  /** @param {string} owner @param {object} tool */
  registerTool(owner, tool) {
    if (tool === null || typeof tool !== 'object') throw new Error('tool must be an object')
    if (typeof tool.name !== 'string' || tool.name === '') throw new Error('tool.name must be a non-empty string')
    if (typeof tool.execute !== 'function') throw new Error(`tool ${tool.name}: execute must be a function`)
    if (this.tools.has(tool.name)) throw new Error(`duplicate tool: ${tool.name}`)
    const entry = { owner, tool, disposer: null }
    this.tools.set(tool.name, entry)
    this.#track(owner, () => {
      if (this.tools.get(tool.name) === entry) this.tools.delete(tool.name)
      if (typeof entry.disposer === 'function') entry.disposer()
    })
    if (this.toolsServer !== null) this.#attachTool(tool.name, entry)
    return tool.name
  }

  /** @param {string} owner @param {object} feature */
  registerFeature(owner, feature) {
    const unsubscribe = this.featureRegistry.register(feature)
    this.#track(owner, unsubscribe)
    return feature.id
  }

  /** @param {string} owner @param {() => Promise<object>|object} provider */
  registerStatusProvider(owner, provider) {
    if (typeof provider !== 'function') throw new Error(`status provider for ${owner} must be a function`)
    if (this.statusProviders.has(owner)) throw new Error(`status provider for ${owner} is already registered`)
    this.statusProviders.set(owner, { owner, provider })
    this.#track(owner, () => this.statusProviders.delete(owner))
    return provider
  }

  /** @param {string} owner @param {{ id: string, title: object, order?: number }} tab */
  registerClientTab(owner, tab) {
    if (tab === null || typeof tab !== 'object' || typeof tab.id !== 'string' || tab.id === '') {
      throw new Error('client tab id must be a non-empty string')
    }
    if (this.clientTabs.has(tab.id)) throw new Error(`duplicate client tab: ${tab.id}`)
    this.clientTabs.set(tab.id, { owner, tab })
    this.#track(owner, () => this.clientTabs.delete(tab.id))
    return tab.id
  }

  /** @param {string} owner @param {{ name: string, text: string, order?: number }} section */
  registerSystemPrompt(owner, section) {
    if (section === null || typeof section !== 'object' || typeof section.text !== 'string') {
      throw new Error('system prompt section.text must be a string')
    }
    const entry = { owner, section, disposer: null }
    this.systemPrompts.push(entry)
    this.#track(owner, () => {
      const index = this.systemPrompts.indexOf(entry)
      if (index >= 0) this.systemPrompts.splice(index, 1)
      if (typeof entry.disposer === 'function') entry.disposer()
    })
    if (this.systemPromptServer !== null) this.#attachSystemPrompt(entry)
  }

  /** Snapshot descriptors for every registered feature. */
  listFeatures() {
    return this.featureRegistry.list()
  }

  /** Client tabs sorted by declared order (stable by id). */
  listClientTabs() {
    return [...this.clientTabs.values()]
      .map(({ tab }) => ({ ...tab }))
      .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0) || String(a.id).localeCompare(String(b.id)))
  }

  // ----------------------------------------------------------------- loading --

  /**
   * Validate, order and apply a set of plugin manifests.
   *
   * @param {any[]} plugins plugin modules (default export or manifest)
   * @param {{ ctx?: object, config?: object }} [options]
   */
  async load(plugins, options = {}) {
    const manifests = plugins.map((plugin) => normalizeManifest(plugin))
    const order = validatePluginSet(manifests, { externalServices: EXTERNAL_SERVICES })
    if (options.ctx !== undefined) this.ctx = options.ctx
    for (const manifest of order) {
      if (this.plugins.has(manifest.id)) throw new Error(`plugin ${manifest.id} is already loaded`)
      const api = this.#createApi(manifest)
      await manifest.apply(api, options.config ?? {})
      this.plugins.set(manifest.id, { manifest, api })
      this.logger.info('已加载插件 %s (%s)', manifest.id, manifest.name)
    }
    return this.listPlugins()
  }

  /** Remove one plugin and every contribution it made. */
  unload(id) {
    const record = this.plugins.get(id)
    if (record === undefined) return false
    const disposers = this.ownerDisposers.get(id)
    if (disposers !== undefined) {
      for (const dispose of [...disposers].reverse()) {
        try {
          dispose()
        } catch (error) {
          this.logger.warn('卸载插件 %s 的贡献失败: %s', id, String(error?.message ?? error))
        }
      }
      this.ownerDisposers.delete(id)
    }
    this.services.removeOwner(id)
    this.plugins.delete(id)
    this.logger.info('已卸载插件 %s', id)
    return true
  }

  /** Unload every plugin in reverse load order. */
  dispose() {
    for (const id of [...this.plugins.keys()].reverse()) this.unload(id)
  }

  /** Descriptors for diagnostics (`/qqbot/status` clients list). */
  listPlugins() {
    return [...this.plugins.values()].map(({ manifest }) => ({
      id: manifest.id,
      name: manifest.name,
      version: manifest.version,
      inject: [...manifest.inject],
      provides: [...manifest.provides],
    }))
  }

  // --------------------------------------------------------------- mounting --

  /** Attach the host web server; current and future routes are registered. */
  mountWebServer(webServer) {
    this.webServer = webServer
    for (const [path, entry] of this.routes) this.#attachRoute(path, entry)
  }

  /** Attach the DSH tool registry; current and future tools are registered. */
  mountTools(tools) {
    this.toolsServer = tools
    for (const [name, entry] of this.tools) this.#attachTool(name, entry)
  }

  /** Attach the DSH system-prompt registry; current and future sections apply. */
  mountSystemPrompt(systemPrompt) {
    this.systemPromptServer = systemPrompt
    for (const entry of this.systemPrompts) this.#attachSystemPrompt(entry)
  }

  // ------------------------------------------------------------------ status --

  /**
   * Aggregate every status provider plus feature status into the stable
   * `/qqbot/status` DTO. Provider failures never break the whole snapshot.
   */
  async statusSnapshot() {
    const providers = [...this.statusProviders.values()]
    const results = await Promise.all(providers.map(async ({ owner, provider }) => {
      try {
        return await provider()
      } catch (error) {
        this.logger.warn('状态提供者 %s 失败: %s', owner, String(error?.message ?? error))
        return {}
      }
    }))
    const snapshot = Object.assign({}, ...results)
    if (snapshot.settings === undefined) {
      snapshot.settings = {
        projectDir: this.settings.projectDir,
        koishiPort: this.settings.koishiPort,
        napcatPort: this.settings.napcatPort,
        reversePath: this.settings.reversePath,
      }
    }
    const featureStatus = await this.featureRegistry.statusAll()
    snapshot.features = this.featureRegistry.list().map((feature) => ({
      ...feature,
      status: featureStatus[feature.id]?.status ?? null,
      error: featureStatus[feature.id]?.error ?? null,
    }))
    snapshot.clientTabs = this.listClientTabs()
    snapshot.updatedAt = new Date().toISOString()
    return snapshot
  }

  // ---------------------------------------------------------------- internals --

  #createApi(manifest) {
    const kernel = this
    const logger = typeof this.ctx?.logger === 'function'
      ? this.ctx.logger(`qqbot/${manifest.name}`)
      : QUIET_LOGGER
    return {
      id: manifest.id,
      name: manifest.name,
      settings: this.settings,
      logger,
      ctx: this.ctx,
      kernel,
      serialize: kernel.serialize,
      provide: (name, instance) => kernel.provide(manifest.id, name, instance),
      get: (name) => kernel.get(name),
      registerRoute: (route) => kernel.registerRoute(manifest.id, route),
      registerRoutes: (routes) => kernel.registerRoutes(manifest.id, routes),
      registerTool: (tool) => kernel.registerTool(manifest.id, tool),
      registerFeature: (feature) => kernel.registerFeature(manifest.id, feature),
      registerStatusProvider: (provider) => kernel.registerStatusProvider(manifest.id, provider),
      registerClientTab: (tab) => kernel.registerClientTab(manifest.id, tab),
      registerSystemPrompt: (section) => kernel.registerSystemPrompt(manifest.id, section),
    }
  }

  #featureDeps() {
    const kernel = this
    const settings = this.settings
    return {
      settings,
      logger: this.logger,
      get: (name) => kernel.get(name),
      get napcat() { return kernel.get('napcat') },
      get koishi() { return kernel.get('koishi') },
      get plugins() { return kernel.get('koishiPlugins') },
      get setup() { return kernel.get('setup') },
      get ai() { return kernel.get('ai') },
      get persona() { return kernel.get('persona') },
      get access() { return kernel.get('access') },
      get platform() { return kernel.get('platform') },
    }
  }

  #track(owner, dispose) {
    let set = this.ownerDisposers.get(owner)
    if (set === undefined) {
      set = new Set()
      this.ownerDisposers.set(owner, set)
    }
    set.add(dispose)
  }

  #attachRoute(path, entry) {
    if (typeof entry.disposer === 'function') return
    try {
      const disposer = this.webServer.register({ kind: 'exact', path, handler: entry.handler })
      entry.disposer = typeof disposer === 'function' ? disposer : null
    } catch (error) {
      this.logger.error('注册路由失败 %s: %s', path, String(error?.message ?? error))
    }
  }

  #attachTool(name, entry) {
    if (typeof entry.disposer === 'function') return
    try {
      const disposer = this.toolsServer.register(entry.tool)
      entry.disposer = typeof disposer === 'function' ? disposer : null
    } catch (error) {
      this.logger.error('注册工具失败 %s: %s', name, String(error?.message ?? error))
    }
  }

  #attachSystemPrompt(entry) {
    if (typeof entry.disposer === 'function') return
    try {
      const disposer = this.systemPromptServer.section(entry.section)
      entry.disposer = typeof disposer === 'function' ? disposer : null
    } catch (error) {
      this.logger.error('注册系统提示失败: %s', String(error?.message ?? error))
    }
  }
}

function normalizeLogger(logger) {
  const source = logger !== null && typeof logger === 'object' ? logger : {}
  const bind = (name) => (typeof source[name] === 'function' ? source[name].bind(source) : () => {})
  return { info: bind('info'), warn: bind('warn'), error: bind('error'), debug: bind('debug') }
}
