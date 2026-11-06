/** Load the group-chat prompt config from disk, with defaults and hot reload. */
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { compilePromptConfig } from '../../prompt/index.js'
import { dataPaths } from '../../../platform/index.js'

const DEFAULT_CONFIG_PATH = fileURLToPath(new URL('./group-chat.prompts.json', import.meta.url))

export class PromptConfigStore {
  constructor({ projectDir = null, logger = null, configPath = null } = {}) {
    this.logger = logger
    this.defaultPath = DEFAULT_CONFIG_PATH
    this.path = configPath ?? (projectDir === null || projectDir === undefined
      ? null
      : dataPaths(projectDir).config.promptConfig)
    this.compiled = null
    this.mtimeMs = -1
    this.source = 'default'
    this.error = ''
    if (this.path !== null) this.#ensureRuntimeFile()
    this.#reload(true)
  }

  #ensureRuntimeFile() {
    if (existsSync(this.path)) return
    try {
      mkdirSync(dirname(this.path), { recursive: true })
      copyFileSync(this.defaultPath, this.path)
    } catch (error) {
      this.logger?.warn?.('prompt config bootstrap failed: %s', String(error?.message ?? error))
    }
  }

  #read(path) {
    return JSON.parse(readFileSync(path, 'utf8'))
  }

  #mtime(path) {
    try {
      return statSync(path).mtimeMs
    } catch {
      return -1
    }
  }

  #loadDefault() {
    return compilePromptConfig(this.#read(this.defaultPath))
  }

  #reload(force = false) {
    const path = this.path !== null && existsSync(this.path) ? this.path : this.defaultPath
    const mtime = this.#mtime(path)
    if (!force && this.compiled !== null && mtime === this.mtimeMs) return
    try {
      this.compiled = compilePromptConfig(this.#read(path))
      this.mtimeMs = mtime
      this.source = path === this.defaultPath ? 'default' : 'runtime'
      this.error = ''
    } catch (error) {
      this.error = String(error?.message ?? error)
      this.logger?.warn?.('prompt config reload failed: %s', this.error)
      this.mtimeMs = mtime
      if (this.compiled === null) {
        this.compiled = this.#loadDefault()
        this.source = 'default'
      }
    }
  }

  build(stage, context) {
    this.#reload()
    if (this.compiled === null) throw new Error('prompt config is not loaded')
    return this.compiled.assembler.build(stage, context)
  }

  status() {
    return {
      path: this.path,
      source: this.source,
      mtimeMs: this.mtimeMs,
      error: this.error,
      sections: this.compiled?.registry.ids().length ?? 0,
      stages: Object.keys(this.compiled?.config.stages ?? {}),
    }
  }
}
