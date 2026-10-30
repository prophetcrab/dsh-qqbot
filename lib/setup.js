/**
 * One-click runtime setup: keep the whole Koishi bot environment inside the
 * configured project directory (`<projectDir>`), scaffold it from the bundled
 * template when missing, and install its npm dependencies automatically.
 *
 * Everything the panel's Setup card needs is reported here; no terminal step is
 * required for Koishi.
 */

import { spawn } from 'node:child_process'
import { existsSync as fsExistsSync } from 'node:fs'
import { copyFile, cp, mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { RingLog, readJson, run } from './util.js'
import { hostPlatform, npmExecutable } from './platform.js'

const PLUGIN_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

/** Files/directories never copied from the template into a runtime project. */
const SKIP_NAMES = new Set(['node_modules', 'data', 'logs', 'runtime', 'runtime-bundles', 'presets', '.git', '.DS_Store'])

/**
 * Scaffold/repair installer for the bundled Koishi project.
 */
export class SetupManager {
  /**
   * @param {object} options
   * @param {ReturnType<import('./platform.js').resolveSettings>} options.settings
   * @param {{ info: Function, warn: Function, error: Function }} options.logger
   * @param {{ spawn?: Function, templateDir?: string, projectDir?: string }} [options.deps] test seams
   */
  constructor(options = {}) {
    const source = options !== null && typeof options === 'object' ? options : {}
    this.settings = source.settings ?? {}
    this.logger = normalizeLogger(source.logger)
    this.deps = source.deps !== null && typeof source.deps === 'object' ? source.deps : {}
    this.templateDir = typeof this.deps.templateDir === 'string'
      ? this.deps.templateDir
      : join(PLUGIN_ROOT, 'template')
    this.projectDir = typeof this.deps.projectDir === 'string'
      ? this.deps.projectDir
      : this.settings.projectDir
    this.spawn = typeof this.deps.spawn === 'function' ? this.deps.spawn : spawn
    this.run = typeof this.deps.run === 'function' ? this.deps.run : run
    this.bundleKey = typeof this.deps.bundleKey === 'string' ? this.deps.bundleKey : `${process.platform}-${process.arch}`
    this.logRing = new RingLog(400)
    /** @type {boolean} */
    this.installing = false
    /** @type {{ ok: boolean, code: number|null, startedAt: string, finishedAt: string, error?: string }|null} */
    this.lastInstall = null
    /** @type {Promise<object>|null} */
    this.installTask = null
  }

  /** Offline `node_modules` tarball for this platform, if shipped. */
  bundlePath() {
    return join(this.templateDir, 'runtime-bundles', `node_modules-${this.bundleKey}.tar.gz`)
  }

  /** Runtime artifacts root (`<projectDir>/runtime`). */
  runtimeDir() {
    return join(this.projectDir, 'runtime')
  }

  /** Snapshot for the panel Setup card and the HTTP API. */
  async status() {
    const packagePath = join(this.projectDir, 'package.json')
    const packageJson = await readJson(packagePath, null)
    return {
      projectDir: this.projectDir,
      runtimeDir: this.runtimeDir(),
      templateDir: this.templateDir,
      templateAvailable: fsExistsSync(join(this.templateDir, 'package.json')),
      projectExists: fsExistsSync(this.projectDir),
      hasPackageJson: fsExistsSync(packagePath),
      hasNodeModules: fsExistsSync(join(this.projectDir, 'node_modules')),
      hasKoishiYml: fsExistsSync(join(this.projectDir, 'koishi.yml')),
      packageJson: packageJson === null || typeof packageJson !== 'object'
        ? null
        : {
            name: packageJson.name ?? null,
            version: packageJson.version ?? null,
            dependencyCount: Object.keys(packageJson.dependencies ?? {}).length,
          },
      nodeVersion: process.version,
      bundleKey: this.bundleKey,
      bundlePath: this.bundlePath(),
      bundleAvailable: fsExistsSync(this.bundlePath()),
      installing: this.installing,
      lastInstall: this.lastInstall,
      logs: this.logRing.tail(40),
    }
  }

  /**
   * Create the runtime project from the bundled template when it does not exist.
   * An existing directory without package.json is left untouched and reported.
   *
   * @returns {Promise<{ ok: boolean, created?: boolean, skipped?: boolean, error?: string, message?: string }>}
   */
  async ensureProject() {
    const packagePath = join(this.projectDir, 'package.json')
    if (fsExistsSync(packagePath)) {
      await mkdir(join(this.projectDir, 'runtime'), { recursive: true })
      await this.#seedPresets()
      return { ok: true, created: false, skipped: true }
    }
    if (fsExistsSync(this.projectDir)) {
      return {
        ok: false,
        error: 'project-not-empty',
        message: `${this.projectDir} 已存在但不是 Koishi 项目，请清空该目录或修改 projectDir`,
      }
    }
    if (!fsExistsSync(join(this.templateDir, 'package.json'))) {
      return { ok: false, error: 'template-missing', message: `插件内置模板缺失：${this.templateDir}` }
    }
    try {
      await mkdir(dirname(this.projectDir), { recursive: true })
      await cp(this.templateDir, this.projectDir, {
        recursive: true,
        filter: (source) => !SKIP_NAMES.has(basename(source)),
      })
      await mkdir(join(this.projectDir, 'data'), { recursive: true })
      await mkdir(join(this.projectDir, 'runtime'), { recursive: true })
      const bundled = await this.#extractBundle()
      await this.#seedPresets()
      if (bundled) this.logger.info('已从内置离线包安装 Koishi 依赖')
      this.logger.info('已从内置模板创建 Koishi 项目: %s', this.projectDir)
      return {
        ok: true,
        created: true,
        bundled,
        message: `已创建 Koishi 项目：${this.projectDir}${bundled ? '（依赖来自内置离线包）' : ''}`,
      }
    } catch (error) {
      return { ok: false, error: 'scaffold-failed', message: `创建 Koishi 项目失败：${String(error?.message ?? error)}` }
    }
  }

  /**
   * Install the project's npm dependencies (no terminal needed; logs are kept
   * for the panel). Concurrent calls share the running task.
   *
   * @param {{ force?: boolean }} [options]
   * @returns {Promise<{ ok: boolean, alreadyInstalled?: boolean, busy?: boolean, code?: number|null, error?: string, message?: string, logs?: string[] }>}
   */
  async installDeps(options = {}) {
    if (this.installTask !== null) {
      await this.installTask
      return { ok: this.lastInstall?.ok === true, busy: true, message: '依赖安装刚刚完成', logs: this.logRing.tail(40) }
    }
    const ensured = await this.ensureProject()
    if (ensured.ok !== true) return { ok: false, error: ensured.error, message: ensured.message }
    const modulesPath = join(this.projectDir, 'node_modules')
    if (fsExistsSync(modulesPath) && options.force !== true) {
      return { ok: true, alreadyInstalled: true, message: '依赖已安装' }
    }
    if (options.force !== true) {
      const bundled = await this.#extractBundle()
      if (bundled) return { ok: true, bundled: true, message: '已使用内置离线依赖包（无需 npm/网络）' }
    }
    this.installTask = this.#runNpmInstall()
    try {
      return await this.installTask
    } finally {
      this.installTask = null
    }
  }

  /** Fire-and-forget bootstrap used when the plugin loads. */
  async autoBootstrap() {
    if (this.settings.autoInstallDeps === false) return { skipped: true }
    const ensured = await this.ensureProject()
    if (ensured.ok !== true) return ensured
    if (!fsExistsSync(join(this.projectDir, 'node_modules'))) {
      this.logger.info('检测到 Koishi 依赖缺失，开始自动安装…')
      return this.installDeps()
    }
    return { ok: true, skipped: true }
  }

  /**
   * Keep the Koishi OneBot `selfId` in sync with the QQ account logged into
   * NapCat. Used after a fresh install once the user has scanned the QR code.
   *
   * @param {string} qq
   * @returns {Promise<{ ok: boolean, changed?: boolean, path?: string, error?: string }>}
   */
  async setKoishiSelfId(qq) {
    const id = String(qq ?? '').trim()
    if (!/^[1-9]\d{4,11}$/u.test(id)) return { ok: false, error: 'invalid-qq' }
    const file = join(this.projectDir, 'koishi.yml')
    try {
      const text = await readFile(file, 'utf8')
      const lines = text.split('\n')
      const adapterIndex = lines.findIndex((line) => /^\s+adapter-onebot:[^\s]*:/u.test(line))
      if (adapterIndex < 0) return { ok: false, error: 'adapter-not-found' }
      const adapterIndent = (lines[adapterIndex].match(/^\s*/u)?.[0] ?? '').length
      let target = -1
      for (let index = adapterIndex + 1; index < lines.length; index++) {
        const line = lines[index]
        const indent = (line.match(/^\s*/u)?.[0] ?? '').length
        if (line.trim() !== '' && indent <= adapterIndent) break
        if (/^\s+selfId:/u.test(line)) {
          target = index
          break
        }
      }
      if (target < 0) return { ok: false, error: 'selfid-not-found' }
      const previous = lines[target]
      const next = previous.replace(/selfId:.*$/u, `selfId: '${id}'`)
      if (next === previous) return { ok: true, changed: false, path: file }
      lines[target] = next
      await writeFile(file, lines.join('\n'), 'utf8')
      this.logger.info('已同步 Koishi selfId 为 QQ %s', id)
      return { ok: true, changed: true, path: file }
    } catch (error) {
      return { ok: false, error: String(error?.message ?? error) }
    }
  }

  /**
   * Extract the platform-matched offline node_modules bundle, if present.
   * Returns true when node_modules now exists.
   */
  async #extractBundle() {
    if (fsExistsSync(join(this.projectDir, 'node_modules'))) return true
    const bundle = this.bundlePath()
    if (!fsExistsSync(bundle)) return false
    this.logRing.append(`[setup] 解压内置依赖包：${bundle}`)
    try {
      const result = await this.run('tar', ['-xzf', bundle, '-C', this.projectDir], { timeoutMs: 180_000 })
      if (result.code !== 0) {
        this.logRing.append(`[setup] 解压内置依赖包失败：${result.stderr || result.code}`)
        this.logger.warn('解压内置依赖包失败，将回退 npm install: %s', result.stderr || result.code)
        return false
      }
      return fsExistsSync(join(this.projectDir, 'node_modules'))
    } catch (error) {
      this.logger.warn('解压内置依赖包异常，将回退 npm install: %s', String(error?.message ?? error))
      return false
    }
  }

  /**
   * Seed the shipped persona presets into data/ on first install. Never
   * overwrites an existing preset library.
   */
  async #seedPresets() {
    const seed = join(this.templateDir, 'presets', 'persona-presets.json')
    const target = join(this.projectDir, 'data', 'persona-presets.json')
    if (!fsExistsSync(seed) || fsExistsSync(target)) return false
    await mkdir(join(this.projectDir, 'data'), { recursive: true })
    await copyFile(seed, target)
    this.logger.info('已导入内置人设预设卡：%s', target)
    return true
  }

  /** Recent npm output for the panel. */
  logs(count = 40) {
    return this.logRing.tail(count)
  }

  /** Spawn `npm install` and capture its output. */
  #runNpmInstall() {
    this.installing = true
    this.logRing.clear()
    this.logRing.append(`[setup] 开始安装依赖：${this.projectDir}`)
    const startedAt = new Date().toISOString()
    return new Promise((resolvePromise) => {
      let child
      const windows = hostPlatform() === 'windows'
      const command = windows ? 'cmd.exe' : npmExecutable()
      const args = windows
        ? ['/c', 'npm', 'install', '--no-audit', '--no-fund']
        : ['install', '--no-audit', '--no-fund']
      try {
        child = this.spawn(command, args, {
          cwd: this.projectDir,
          env: process.env,
          stdio: ['ignore', 'pipe', 'pipe'],
        })
      } catch (error) {
        this.installing = false
        this.lastInstall = { ok: false, code: null, startedAt, finishedAt: new Date().toISOString(), error: String(error?.message ?? error) }
        resolvePromise({ ok: false, error: 'spawn-failed', message: `无法启动 npm：${String(error?.message ?? error)}` })
        return
      }
      if (child === null || child === undefined || typeof child !== 'object') {
        this.installing = false
        resolvePromise({ ok: false, error: 'spawn-failed', message: '无法启动 npm install' })
        return
      }
      child.stdout?.on?.('data', (chunk) => {
        this.logRing.append(chunk)
      })
      child.stderr?.on?.('data', (chunk) => {
        this.logRing.append(chunk)
      })
      child.on?.('error', (error) => {
        this.installing = false
        this.lastInstall = { ok: false, code: null, startedAt, finishedAt: new Date().toISOString(), error: String(error?.message ?? error) }
        resolvePromise({ ok: false, error: 'spawn-failed', message: `npm install 启动失败：${String(error?.message ?? error)}`, logs: this.logRing.tail(40) })
      })
      child.on?.('close', (code) => {
        this.installing = false
        const ok = code === 0
        this.lastInstall = {
          ok,
          code: Number.isInteger(code) ? code : null,
          startedAt,
          finishedAt: new Date().toISOString(),
          ...(ok ? {} : { error: `npm install 退出码 ${code}` }),
        }
        this.logRing.append(ok ? '[setup] 依赖安装完成' : `[setup] 依赖安装失败（code=${code}）`)
        this.logger[ok ? 'info' : 'error']('Koishi 依赖安装%s', ok ? '完成' : '失败')
        resolvePromise({
          ok,
          code: Number.isInteger(code) ? code : null,
          ...(ok ? { message: '依赖安装完成' } : { error: `npm install 退出码 ${code}`, message: '依赖安装失败' }),
          logs: this.logRing.tail(40),
        })
      })
    })
  }
}

/** The last modified time of a file, or null. */
export async function fileMtime(path) {
  try {
    const info = await stat(path)
    return info.mtime.toISOString()
  } catch {
    return null
  }
}

/** Accept a loose logger shape. */
function normalizeLogger(logger) {
  const source = logger !== null && typeof logger === 'object' ? logger : {}
  return {
    info: typeof source.info === 'function' ? source.info.bind(source) : () => {},
    warn: typeof source.warn === 'function' ? source.warn.bind(source) : () => {},
    error: typeof source.error === 'function' ? source.error.bind(source) : () => {},
    debug: typeof source.debug === 'function' ? source.debug.bind(source) : () => {},
  }
}
