/**
 * Koishi plugin management: list, enable/disable, install and uninstall by
 * editing `koishi.yml` atomically and inspecting `package.json`.
 */

import { join } from 'node:path'
import {
  existsSync,
  expandHome,
  readJson,
  readText,
  run,
  writeFileAtomic,
} from '../../platform/mac/index.js'
import {
  addPluginEntry,
  combineOutput,
  findListedPlugin,
  listKoishiPlugins,
  normalizePluginKey,
  packageNameFromSpec,
  removePluginEntry,
  setPluginEnabled,
  stripTilde,
  truncateOutput,
} from './koishi-yml.js'

/** Normalize the injectable executor to a `(file, args, options)` function. */
function normalizeExec(exec) {
  if (typeof exec === 'function') return exec
  if (exec !== null && typeof exec === 'object' && typeof exec.run === 'function') {
    return exec.run.bind(exec)
  }
  return run
}

/** @param {unknown} error */
function errorText(error) {
  return String(error?.message ?? error ?? 'unknown error')
}

export class KoishiPluginsManager {
  constructor(options = {}) {
    const settings = options.settings ?? options.koishi?.settings ?? {}
    this.settings = settings
    this.koishi = options.koishi ?? null
    this.logger = options.logger ?? {
      info() {},
      warn() {},
      error() {},
      debug() {},
    }
    this.exec = normalizeExec(options.exec ?? options.koishi?.exec)
    this.projectDir = expandHome(
      typeof settings.projectDir === 'string' && settings.projectDir !== ''
        ? settings.projectDir
        : '~/project/qq-bot',
    )
    this.ymlPath = join(this.projectDir, 'koishi.yml')
    this.packagePath = join(this.projectDir, 'package.json')
  }

  async readState() {
    const ymlText = await readText(this.ymlPath)
    const packageJson = await readJson(this.packagePath, null)
    return {
      ymlText: typeof ymlText === 'string' ? ymlText : '',
      hasYml: typeof ymlText === 'string',
      hasPackageJson: existsSync(this.packagePath),
      packageJson,
    }
  }

  async list() {
    const state = await this.readState()
    if (!state.hasYml) return []
    return listKoishiPlugins({ ymlText: state.ymlText, packageJson: state.packageJson })
  }

  async toggle(key, enabled, { restart = false } = {}) {
    const query = typeof key === 'string' ? key.trim() : ''
    if (query === '') throw new Error('插件 key 不能为空')
    const state = await this.readState()
    if (!state.hasYml) throw new Error(`未找到 koishi.yml：${this.ymlPath}`)

    const nextText = setPluginEnabled(state.ymlText, query, enabled !== false)
    const textChanged = nextText !== state.ymlText
    if (textChanged) await writeFileAtomic(this.ymlPath, nextText)

    const listed = listKoishiPlugins({ ymlText: nextText, packageJson: state.packageJson })
    const entry = findListedPlugin(listed, query)
    const restartResult = textChanged ? await this.maybeRestart(restart) : { restarted: false }
    const active = enabled !== false
    return {
      ok: true,
      action: 'toggle',
      key: entry?.key ?? stripTilde(query),
      packageName: entry?.packageName ?? null,
      textChanged,
      restarted: restartResult.restarted,
      output: textChanged ? `已${active ? '启用' : '禁用'} ${entry?.key ?? stripTilde(query)}` : '配置未变化',
      ...(restartResult.error === undefined ? {} : { error: restartResult.error }),
    }
  }

  async install(spec, { restart = false } = {}) {
    const rawSpec = typeof spec === 'string' ? spec.trim() : ''
    if (rawSpec === '') throw new Error('插件 spec 不能为空')
    if (!existsSync(this.packagePath)) {
      throw new Error(`Koishi 项目不存在或缺少 package.json：${this.projectDir}`)
    }

    this.logger.info?.('安装 Koishi 插件：%s', rawSpec)
    const result = await this.exec('npm', ['install', rawSpec, '--no-audit', '--no-fund'], {
      cwd: this.projectDir,
      timeoutMs: 300_000,
    })
    const npmOutput = truncateOutput(combineOutput(result))
    if (result.code !== 0) {
      throw new Error(`安装 ${rawSpec} 失败（退出码 ${result.code}）${npmOutput === '' ? '' : `：\n${npmOutput}`}`)
    }

    const packageName = packageNameFromSpec(rawSpec)
    const key = normalizePluginKey(packageName)
    if (key === '') throw new Error(`无法从 ${rawSpec} 推导 koishi.yml 插件 key`)

    const state = await this.readState()
    const lined = listKoishiPlugins({ ymlText: state.ymlText, packageJson: state.packageJson })
    const duplicate = lined.some((plugin) => plugin.key === key || plugin.name === key)
    let textChanged = false
    let output = npmOutput
    if (duplicate) {
      output = `${output === '' ? '' : `${output}\n`}koishi.yml 已存在插件 ${key}，未重复写入`
    } else {
      const nextText = addPluginEntry(state.ymlText, key, { group: 'local' })
      textChanged = nextText !== state.ymlText
      if (textChanged) await writeFileAtomic(this.ymlPath, nextText)
    }

    const restartResult = await this.maybeRestart(restart)
    return {
      ok: true,
      action: 'install',
      key,
      packageName,
      textChanged,
      restarted: restartResult.restarted,
      output,
      ...(restartResult.error === undefined ? {} : { error: restartResult.error }),
    }
  }

  async uninstall(key, { restart = false } = {}) {
    const query = typeof key === 'string' ? key.trim() : ''
    if (query === '') throw new Error('插件 key 不能为空')
    const state = await this.readState()
    if (!state.hasYml) throw new Error(`未找到 koishi.yml：${this.ymlPath}`)

    const listed = listKoishiPlugins({ ymlText: state.ymlText, packageJson: state.packageJson })
    const target = findListedPlugin(listed, query)
    if (target === null) throw new Error(`未找到插件配置：${query}`)

    let output = ''
    if (target.local) {
      output = '本地插件：仅从 koishi.yml 移除配置，不执行 npm uninstall'
    } else if (target.packageName === null) {
      output = '未在 package.json 中匹配到包名：仅从 koishi.yml 移除配置'
    } else {
      this.logger.info?.('卸载 Koishi 插件：%s', target.packageName)
      const result = await this.exec('npm', ['uninstall', target.packageName, '--no-audit', '--no-fund'], {
        cwd: this.projectDir,
        timeoutMs: 300_000,
      })
      output = truncateOutput(combineOutput(result))
      if (result.code !== 0) {
        throw new Error(`卸载 ${target.packageName} 失败（退出码 ${result.code}）${output === '' ? '' : `：\n${output}`}`)
      }
    }

    const nextText = removePluginEntry(state.ymlText, target.key)
    const textChanged = nextText !== state.ymlText
    if (textChanged) await writeFileAtomic(this.ymlPath, nextText)

    const restartResult = await this.maybeRestart(restart)
    return {
      ok: true,
      action: 'uninstall',
      key: target.key,
      packageName: target.packageName,
      textChanged,
      restarted: restartResult.restarted,
      output,
      ...(restartResult.error === undefined ? {} : { error: restartResult.error }),
    }
  }

  async maybeRestart(restart) {
    if (restart !== true) return { restarted: false }
    if (this.koishi === null || typeof this.koishi.restart !== 'function') {
      return { restarted: false, error: '配置已写入，但无法重启：缺少 Koishi 管理器' }
    }
    try {
      const result = await this.koishi.restart()
      if (result?.ok === false) {
        return {
          restarted: false,
          error: `配置已写入，但重启失败：${result.error ?? result.message ?? '未知错误'}`,
        }
      }
      return { restarted: true }
    } catch (error) {
      return { restarted: false, error: `配置已写入，但重启失败：${errorText(error)}` }
    }
  }
}
