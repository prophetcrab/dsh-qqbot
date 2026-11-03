/** Small command registry: one deterministic executor per slash command. */
export class GameRegistry {
  constructor(modules = []) {
    this.modules = new Map()
    this.commands = new Map()
    for (const module of modules) this.register(module)
  }

  register(module) {
    if (module === null || typeof module !== 'object') throw new Error('game module must be an object')
    if (typeof module.id !== 'string' || module.id === '') throw new Error('game module id is required')
    if (typeof module.execute !== 'function') throw new Error(`game module ${module.id}: execute() is required`)
    if (!Array.isArray(module.commands)) throw new Error(`game module ${module.id}: commands[] is required`)
    if (this.modules.has(module.id)) throw new Error(`duplicate game module: ${module.id}`)
    for (const command of module.commands) {
      if (typeof command !== 'string' || !command.startsWith('/')) throw new Error(`game module ${module.id}: invalid command`)
      if (this.commands.has(command)) throw new Error(`duplicate game command: ${command}`)
    }
    this.modules.set(module.id, module)
    for (const command of module.commands) this.commands.set(command, module)
    return module
  }

  async dispatch(command, context) {
    const module = this.commands.get(String(command))
    if (module === undefined) return { ok: false, error: 'unknown command' }
    return module.execute({ ...context, command })
  }

  helpText() {
    const lines = ['可用命令：']
    for (const [command, module] of this.commands) {
      const description = module.help?.[command] ?? module.description ?? '—'
      lines.push(`${command}  ${description}`)
    }
    if (this.commands.size === 0) lines.push('暂无可用命令')
    return lines.join('\n')
  }
}
