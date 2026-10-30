/**
 * Koishi plugin management: a dependency-free, text-level editor for
 * `koishi.yml` plus `package.json` inspection.
 *
 * The real Koishi project keeps its plugins inside the top-level `plugins:`
 * mapping. Groups look like `group:basic:` (indent 2) and plugin entries look
 * like `help:ss74sj: {}` or `~market:jgwg4c:` (indent 4); the `~` prefix means
 * disabled and the part after the last `:` is a per-instance id. This module
 * understands exactly that shape and never rewrites unrelated lines.
 *
 * @module dsh-qqbot/lib/koishi-plugins
 */

import { join } from 'node:path'
import {
  existsSync,
  expandHome,
  readJson,
  readText,
  run,
  writeFileAtomic,
} from './util.js'

/** Top-level mapping that hosts every plugin entry. */
const PLUGIN_ROOT = 'plugins'

/** Indentation of a group line below `plugins:`. */
const GROUP_INDENT = 2

/** Indentation of a plugin entry below `plugins:` / a group line. */
const ENTRY_INDENT = 4

/** Keys starting with this are Koishi special keys and never listed. */
const SPECIAL_KEY_PREFIX = '$'

/** @param {unknown} error */
function errorText(error) {
  return String(error?.message ?? error ?? 'unknown error')
}

/** Normalize the injectable executor to a `(file, args, options)` function. */
function normalizeExec(exec) {
  if (typeof exec === 'function') return exec
  if (exec !== null && typeof exec === 'object' && typeof exec.run === 'function') {
    return exec.run.bind(exec)
  }
  return run
}

/** Split text into lines, keeping the trailing empty element of a final EOL. */
function splitLines(text) {
  const source = typeof text === 'string' ? text : ''
  if (source === '') return []
  return source.split(/\r?\n/u)
}

/** Leading-space width of a line (YAML here only uses spaces). */
function countIndent(line) {
  let count = 0
  while (count < line.length && line[count] === ' ') count += 1
  return count
}

/** Strip the `~` disabled marker from a raw YAML key. */
function stripTilde(key) {
  return typeof key === 'string' && key.startsWith('~') ? key.slice(1) : key
}

/** Remove the per-instance id (`help:ss74sj` -> `help`). */
function displayKey(key) {
  const value = typeof key === 'string' ? key : ''
  const index = value.lastIndexOf(':')
  return index > 0 ? value.slice(0, index) : value
}

/** Local plugin paths start with `./`, `../` or `/`. */
function isLocalKey(key) {
  const value = typeof key === 'string' ? key : ''
  return /^\.\.?[\\/]/u.test(value) || value.startsWith('/')
}

/** Whether a key names a plugin group (e.g. `group:basic`). */
function isGroupKey(key) {
  return typeof key === 'string' && key.startsWith('group:') && key.length > 'group:'.length
}

/**
 * Read the key token and the value from one YAML line (no leading indent).
 *
 * Handles plain keys that contain `:` (`help:ss74sj: {}`) by treating a colon
 * as the key/value separator only when it is followed by a space or EOL.
 *
 * @param {string} content
 * @returns {{ key: string, value: string, colonIndex: number }|null}
 */
function readKeyToken(content) {
  if (typeof content !== 'string') return null
  const text = content.replace(/\s+$/u, '')
  if (text === '' || text.startsWith('#')) return null
  const first = text[0]
  if (first === "'" || first === '"') {
    let index = 1
    let key = ''
    let closed = false
    while (index < text.length) {
      const char = text[index]
      if (first === "'" && char === "'") {
        if (text[index + 1] === "'") {
          key += "'"
          index += 2
          continue
        }
        closed = true
        index += 1
        break
      }
      if (first === '"' && char === '\\') {
        key += text[index + 1] ?? ''
        index += 2
        continue
      }
      if (first === '"' && char === '"') {
        closed = true
        index += 1
        break
      }
      key += char
      index += 1
    }
    if (!closed) return null
    while (index < text.length && text[index] === ' ') index += 1
    if (text[index] !== ':') return null
    return { key, value: text.slice(index + 1).trim(), colonIndex: index }
  }
  const match = /^(.+?):(?=\s|$)/u.exec(text)
  if (match === null) return null
  return {
    key: match[1].trim(),
    value: text.slice(match[0].length).trim(),
    colonIndex: match[0].length - 1,
  }
}

/**
 * Parse `koishi.yml` into a flat entry list.
 *
 * Entries are lines directly below `plugins:` at indent 4 (grouped under a
 * `group:xxx:` line at indent 2, or directly under `plugins:` when ungrouped).
 * Lines nested deeper are plugin configuration and are ignored.
 *
 * @param {string} text
 * @returns {{
 *   entries: Array<{ key: string, group: string, enabled: boolean, indent: number, line: number, rawKey: string }>,
 *   groups: string[],
 * }}
 */
export function parseKoishiYml(text) {
  const lines = typeof text === 'string' ? text.split(/\r?\n/u) : []
  const entries = []
  const groups = []
  let inPlugins = false
  let pluginsIndent = 0
  let currentGroup = null

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    if (line.trim() === '') continue
    const indent = countIndent(line)
    const content = line.slice(indent)
    if (content.startsWith('#')) continue
    const token = readKeyToken(content)
    if (token === null) continue

    if (!inPlugins) {
      if (stripTilde(token.key) === PLUGIN_ROOT) {
        inPlugins = true
        pluginsIndent = indent
        currentGroup = null
        if (!groups.includes(PLUGIN_ROOT)) groups.push(PLUGIN_ROOT)
      }
      continue
    }

    if (indent <= pluginsIndent) {
      // A sibling top-level key ends the plugins section.
      inPlugins = false
      currentGroup = null
      continue
    }

    const key = stripTilde(token.key)
    if (indent === pluginsIndent + GROUP_INDENT && isGroupKey(key)) {
      currentGroup = key
      if (!groups.includes(key)) groups.push(key)
      continue
    }
    if (indent === pluginsIndent + ENTRY_INDENT) {
      if (key === '' || key.startsWith(SPECIAL_KEY_PREFIX)) continue
      entries.push({
        key,
        group: currentGroup ?? PLUGIN_ROOT,
        enabled: !String(token.key).startsWith('~'),
        indent,
        line: index,
        rawKey: token.key,
      })
    }
  }

  return { entries, groups }
}

/** Collect dependencies/devDependencies from package.json into a Map. */
function collectDependencies(packageJson) {
  const result = new Map()
  if (packageJson === null || typeof packageJson !== 'object') return result
  for (const section of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
    const deps = packageJson[section]
    if (deps === null || typeof deps !== 'object') continue
    for (const [name, range] of Object.entries(deps)) {
      result.set(name, String(range ?? ''))
    }
  }
  return result
}

/** Map a yml plugin key to the npm package name that provides it. */
function resolvePackageName(name, deps) {
  if (isLocalKey(name)) return name
  const candidates = []
  if (name.startsWith('@')) {
    candidates.push(name)
    const scoped = /^(@[^/]+)\/(.+)$/u.exec(name)
    if (scoped !== null) {
      candidates.push(`${scoped[1]}/koishi-plugin-${scoped[2]}`)
      candidates.push(`${scoped[1]}/plugin-${scoped[2]}`)
    }
  } else {
    candidates.push(name, `@koishijs/plugin-${name}`, `koishi-plugin-${name}`)
  }
  for (const candidate of candidates) {
    if (deps.has(candidate)) return candidate
  }
  return null
}

/** Version range from package.json, without a leading `^`/`~`. */
function resolveVersion(packageName, deps) {
  if (typeof packageName !== 'string' || packageName === '' || !deps.has(packageName)) return null
  const range = String(deps.get(packageName) ?? '')
  if (range === '') return null
  return range.replace(/^[\^~]/u, '')
}

/**
 * Flatten `koishi.yml` + `package.json` into the plugin list the panel renders.
 *
 * @param {{ ymlText?: string, packageJson?: object|null }} input
 * @returns {Array<{
 *   key: string, name: string, packageName: string|null, version: string|null,
 *   enabled: boolean, group: string, local: boolean, removable: boolean, description: string,
 * }>}
 */
export function listKoishiPlugins({ ymlText, packageJson } = {}) {
  const parsed = parseKoishiYml(ymlText)
  const deps = collectDependencies(packageJson)
  return parsed.entries.map((entry) => {
    const name = displayKey(entry.key)
    const local = isLocalKey(name)
    const packageName = local ? name : resolvePackageName(name, deps)
    return {
      key: entry.key,
      name,
      packageName,
      version: resolveVersion(packageName, deps),
      enabled: entry.enabled,
      group: entry.group,
      local,
      removable: !local && packageName !== null,
      description: local ? '本地插件' : '',
    }
  })
}

/** Locate an entry by exact key, then by display name (unique match only). */
function findEntry(entries, query) {
  const raw = typeof query === 'string' ? query.trim() : ''
  if (raw === '') return null
  const normalized = stripTilde(raw)
  const exact = entries.find((entry) => entry.key === normalized)
  if (exact !== undefined) return exact
  const byName = entries.filter((entry) => displayKey(entry.key) === normalized)
  if (byName.length === 1) return byName[0]
  if (byName.length > 1) {
    throw new Error(`插件 key 不唯一（${byName.length} 个实例）：${raw}，请使用完整 key（含实例 id）`)
  }
  return null
}

/** Locate a listed plugin by exact key, then display name (unique only). */
function findListedPlugin(plugins, query) {
  const raw = typeof query === 'string' ? query.trim() : ''
  if (raw === '') return null
  const normalized = stripTilde(raw)
  const exact = plugins.find((plugin) => plugin.key === normalized)
  if (exact !== undefined) return exact
  const byName = plugins.filter((plugin) => plugin.name === normalized)
  if (byName.length === 1) return byName[0]
  if (byName.length > 1) {
    throw new Error(`插件 key 不唯一（${byName.length} 个实例）：${raw}，请使用完整 key（含实例 id）`)
  }
  return null
}

/**
 * Toggle the `~` disabled prefix of one entry.
 *
 * @param {string} ymlText
 * @param {string} key entry key (instance id optional, `~` optional)
 * @param {boolean} enabled
 * @returns {string} the new text (identical when already in that state)
 * @throws when the key is missing or ambiguous
 */
export function setPluginEnabled(ymlText, key, enabled) {
  const source = typeof ymlText === 'string' ? ymlText : ''
  const parsed = parseKoishiYml(source)
  const target = findEntry(parsed.entries, key)
  if (target === null) throw new Error(`未找到插件配置：${key}`)

  const lines = source.split(/\r?\n/u)
  const raw = lines[target.line]
  const indent = countIndent(raw)
  const content = raw.slice(indent)
  const token = readKeyToken(content)
  if (token === null) throw new Error(`无法解析插件配置行：${raw}`)
  const currentRaw = token.key
  const shouldEnable = enabled !== false
  let nextRaw = currentRaw
  if (shouldEnable && currentRaw.startsWith('~')) nextRaw = currentRaw.slice(1)
  if (!shouldEnable && !currentRaw.startsWith('~')) nextRaw = `~${currentRaw}`
  if (nextRaw === currentRaw) return source

  lines[target.line] = `${raw.slice(0, indent)}${nextRaw}${content.slice(token.colonIndex)}`
  return lines.join(source.includes('\r\n') ? '\r\n' : '\n')
}

/** Normalize a group argument: `local` / `group:local` -> `group:local`. */
function normalizeGroupName(group) {
  const raw = typeof group === 'string' ? group.trim() : ''
  if (raw === '' || raw === PLUGIN_ROOT) return PLUGIN_ROOT
  return raw.startsWith('group:') ? raw : `group:${raw}`
}

/** Quote a YAML mapping key only when it cannot be written as a plain scalar. */
function formatYamlKey(name) {
  if (/^[A-Za-z0-9_$][A-Za-z0-9_./-]*$/u.test(name)) return name
  return `'${name.replace(/'/gu, "''")}'`
}

/** Locate the top-level `plugins:` line. */
function locatePlugins(lines) {
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    if (line.trim() === '') continue
    const indent = countIndent(line)
    const token = readKeyToken(line.slice(indent))
    if (token !== null && stripTilde(token.key) === PLUGIN_ROOT) return { index, indent, token }
  }
  return null
}

/** Find a group line (`group:xxx:`) inside the plugins section. */
function findGroupLine(lines, rootIndex, rootIndent, groupName) {
  for (let index = rootIndex + 1; index < lines.length; index += 1) {
    const line = lines[index]
    if (line.trim() === '') continue
    const indent = countIndent(line)
    if (indent <= rootIndent) return null
    if (indent !== rootIndent + GROUP_INDENT) continue
    const token = readKeyToken(line.slice(indent))
    if (token === null) continue
    if (stripTilde(token.key) === groupName) return index
  }
  return null
}

/** Last line index that belongs to a group. */
function groupBlockEnd(lines, groupIndex, rootIndent) {
  let last = groupIndex
  for (let index = groupIndex + 1; index < lines.length; index += 1) {
    const line = lines[index]
    if (line.trim() === '') continue
    if (countIndent(line) <= rootIndent + GROUP_INDENT) break
    last = index
  }
  return last + 1
}

/** First line index after the plugins section. */
function pluginsSectionEnd(lines, rootIndex, rootIndent) {
  for (let index = rootIndex + 1; index < lines.length; index += 1) {
    const line = lines[index]
    if (line.trim() === '') continue
    if (countIndent(line) <= rootIndent) return index
  }
  return lines.length
}

/** YAML lines for a brand new `plugins:` section holding one entry. */
function newPluginsBlock(name, groupName) {
  if (groupName === PLUGIN_ROOT) return ['plugins:', `    ${formatYamlKey(name)}: {}`]
  return ['plugins:', `  ${groupName}:`, `    ${formatYamlKey(name)}: {}`]
}

/**
 * Insert `<key>: {}` into a group (default: directly below `plugins:`).
 *
 * @param {string} ymlText
 * @param {string} key entry key without `~`
 * @param {{ group?: string }} [options]
 * @returns {string} the new text
 * @throws when the key already exists or the yml cannot host a block mapping
 */
export function addPluginEntry(ymlText, key, { group = PLUGIN_ROOT } = {}) {
  const source = typeof ymlText === 'string' ? ymlText : ''
  const name = typeof key === 'string' ? key.trim() : ''
  if (name === '') throw new Error('插件 key 不能为空')
  if (name.startsWith('~')) throw new Error(`插件 key 不能以 ~ 开头：${name}`)

  const parsed = parseKoishiYml(source)
  const duplicate = parsed.entries.some((entry) => entry.key === name || displayKey(entry.key) === name)
  if (duplicate) throw new Error(`插件已存在于 koishi.yml：${name}`)

  const eol = source.includes('\r\n') ? '\r\n' : '\n'
  const groupName = normalizeGroupName(group)
  if (source === '') return `${newPluginsBlock(name, groupName).join(eol)}${eol}`

  const lines = source.split(/\r?\n/u)
  const root = locatePlugins(lines)
  if (root === null) {
    while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop()
    const block = newPluginsBlock(name, groupName)
    if (lines.length > 0) block.unshift('')
    return [...lines, ...block, ''].join(eol)
  }

  const inlineEmpty = root.token.value === '' || root.token.value === '{}' || root.token.value === 'null' || root.token.value === '~'
  if (!inlineEmpty) {
    throw new Error('暂不支持行内 plugins 配置，请先把 `plugins:` 改成块状映射')
  }
  if (root.token.value !== '') lines[root.index] = `${' '.repeat(root.indent)}${PLUGIN_ROOT}:`
  const entryLine = `${' '.repeat(root.indent + ENTRY_INDENT)}${formatYamlKey(name)}: {}`

  if (groupName === PLUGIN_ROOT) {
    lines.splice(root.index + 1, 0, entryLine)
    return lines.join(eol)
  }

  const groupIndex = findGroupLine(lines, root.index, root.indent, groupName)
  if (groupIndex !== null) {
    lines.splice(groupBlockEnd(lines, groupIndex, root.indent), 0, entryLine)
    return lines.join(eol)
  }

  const sectionEnd = pluginsSectionEnd(lines, root.index, root.indent)
  let lastContent = root.index
  for (let index = root.index + 1; index < sectionEnd; index += 1) {
    if (lines[index].trim() !== '') lastContent = index
  }
  const groupLine = `${' '.repeat(root.indent + GROUP_INDENT)}${groupName}:`
  lines.splice(lastContent + 1, 0, groupLine, entryLine)
  return lines.join(eol)
}

/**
 * Remove an entry and every line nested deeper (its configuration block).
 * An empty `group:xxx:` line left behind is removed as well.
 *
 * @param {string} ymlText
 * @param {string} key
 * @returns {string} the new text
 * @throws when the key is missing or ambiguous
 */
export function removePluginEntry(ymlText, key) {
  const source = typeof ymlText === 'string' ? ymlText : ''
  const parsed = parseKoishiYml(source)
  const target = findEntry(parsed.entries, key)
  if (target === null) throw new Error(`未找到插件配置：${key}`)

  const eol = source.includes('\r\n') ? '\r\n' : '\n'
  const lines = source.split(/\r?\n/u)
  let end = target.line + 1
  while (end < lines.length) {
    const line = lines[end]
    if (line.trim() === '') {
      end += 1
      continue
    }
    if (countIndent(line) > target.indent) {
      end += 1
      continue
    }
    break
  }
  lines.splice(target.line, end - target.line)

  if (target.group !== PLUGIN_ROOT) {
    const remaining = parseKoishiYml(lines.join(eol))
    if (!remaining.entries.some((entry) => entry.group === target.group)) {
      const root = locatePlugins(lines)
      if (root !== null) {
        const groupIndex = findGroupLine(lines, root.index, root.indent, target.group)
        if (groupIndex !== null) {
          let groupEnd = groupIndex + 1
          while (groupEnd < lines.length) {
            const line = lines[groupEnd]
            if (line.trim() === '') {
              groupEnd += 1
              continue
            }
            if (countIndent(line) > root.indent + GROUP_INDENT) {
              groupEnd += 1
              continue
            }
            break
          }
          lines.splice(groupIndex, groupEnd - groupIndex)
        }
      }
    }
  }

  let result = lines.join(eol)
  if (result !== '' && source.endsWith('\n') && !result.endsWith('\n')) result += eol
  return result
}

/**
 * npm package name -> common koishi.yml key.
 *
 * @param {string} name
 * @returns {string}
 */
export function normalizePluginKey(name) {
  const raw = typeof name === 'string' ? name.trim() : ''
  if (raw === '') return ''
  let value = raw
  const at = value.lastIndexOf('@')
  if (at > 0) value = value.slice(0, at)
  if (value.startsWith('koishi-plugin-')) return value.slice('koishi-plugin-'.length)
  if (value.startsWith('@koishijs/plugin-')) return value.slice('@koishijs/plugin-'.length)
  const scoped = /^@[^/]+\/(.+)$/u.exec(value)
  if (scoped !== null) {
    const rest = scoped[1]
    if (rest.startsWith('koishi-plugin-')) return rest.slice('koishi-plugin-'.length)
    if (rest.startsWith('plugin-')) return rest.slice('plugin-'.length)
    return rest
  }
  return value
}

/** Package name installed by an npm spec (`koishi-plugin-x@1.2.3` -> `koishi-plugin-x`). */
function packageNameFromSpec(spec) {
  const value = typeof spec === 'string' ? spec.trim() : ''
  if (value === '') return ''
  if (isLocalKey(value)) return value
  if (value.startsWith('npm:')) return value.slice(4)
  const at = value.lastIndexOf('@')
  return at > 0 ? value.slice(0, at) : value
}

/** Combine npm stdout/stderr for the response output field. */
function combineOutput(result) {
  if (result === null || result === undefined) return ''
  const stdout = String(result.stdout ?? '')
  const stderr = String(result.stderr ?? '')
  return [stdout.trim(), stderr.trim()].filter((part) => part !== '').join('\n')
}

/** Cap captured npm output so route responses stay small. */
function truncateOutput(text, limit = 4000) {
  const value = String(text ?? '')
  if (value.length <= limit) return value
  return `${value.slice(0, limit)}\n…（输出已截断）`
}

/**
 * Manage the plugins of one Koishi project: list, enable/disable, install and
 * uninstall. Every change is written atomically to `koishi.yml`; npm is only
 * invoked with an argv array (`npm install <spec>` / `npm uninstall <name>`).
 */
export class KoishiPluginsManager {
  /**
   * @param {object} options
   * @param {object} [options.koishi] KoishiManager (used for restart)
   * @param {object} options.settings resolved plugin settings
   * @param {object} [options.logger]
   * @param {unknown} [options.exec] injectable execFile-style executor
   */
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

  /** Read both files (missing files degrade to empty/null, never throw). */
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

  /**
   * List plugins from the project's koishi.yml (`[]` when the file is absent).
   *
   * @returns {Promise<ReturnType<typeof listKoishiPlugins>>}
   */
  async list() {
    const state = await this.readState()
    if (!state.hasYml) return []
    return listKoishiPlugins({ ymlText: state.ymlText, packageJson: state.packageJson })
  }

  /**
   * Enable or disable one plugin by toggling its `~` prefix.
   *
   * @param {string} key entry key (instance id optional)
   * @param {boolean} enabled
   * @param {{ restart?: boolean }} [options]
   * @returns {Promise<{ ok: boolean, action: string, key: string, packageName: string|null, textChanged: boolean, restarted: boolean, output: string, error?: string }>}
   */
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

  /**
   * `npm install <spec>`, then add the plugin to `group:local` in koishi.yml.
   *
   * @param {string} spec npm spec or local path
   * @param {{ restart?: boolean }} [options]
   * @returns {Promise<{ ok: boolean, action: string, key: string, packageName: string, textChanged: boolean, restarted: boolean, output: string, error?: string }>}
   */
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

  /**
   * `npm uninstall <package>`, then remove the entry from koishi.yml.
   * Local plugins (`./...`) are only removed from the yml, never from npm.
   *
   * @param {string} key entry key (instance id optional)
   * @param {{ restart?: boolean }} [options]
   * @returns {Promise<{ ok: boolean, action: string, key: string, packageName: string|null, textChanged: boolean, restarted: boolean, output: string, error?: string }>}
   */
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

  /** Restart Koishi when requested; a restart failure never fails the file edit. */
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
