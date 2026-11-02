/**
 * Service registry: the `provide`/`get` seam between host plugins.
 *
 * One value has exactly one owner. Registering the same name twice from
 * different plugins is a hard error, which keeps "everything is plugin"
 * honest; unloading a plugin removes the services it provided.
 */

export class ServiceRegistry {
  constructor() {
    /** @type {Map<string, { instance: any, owner: string }>} */
    this.entries = new Map()
  }

  /**
   * @param {string} name
   * @param {any} instance
   * @param {string} owner plugin id
   */
  provide(name, instance, owner) {
    const existing = this.entries.get(name)
    if (existing !== undefined && existing.owner !== owner) {
      throw new Error(`service ${name} is already provided by ${existing.owner}`)
    }
    this.entries.set(name, { instance, owner })
    return instance
  }

  /** @param {string} name */
  get(name) {
    return this.entries.get(name)?.instance
  }

  /** @param {string} name */
  has(name) {
    return this.entries.has(name)
  }

  /** Names of every registered service. */
  names() {
    return [...this.entries.keys()]
  }

  /** Remove every service owned by one plugin. */
  removeOwner(owner) {
    for (const [name, entry] of this.entries) {
      if (entry.owner === owner) this.entries.delete(name)
    }
  }
}
