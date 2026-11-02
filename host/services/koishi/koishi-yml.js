/**
 * Dependency-free, text-level editor and parser for `koishi.yml`.
 *
 * Groups look like `group:basic:` (indent 2) and plugin entries like
 * `help:ss74sj: {}` or `~market:jgwg4c:` (indent 4); the `~` prefix means
 * disabled and the part after the last `:` is a per-instance id. This module
 * understands exactly that shape and never rewrites unrelated lines.
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

export const PLUGIN_ROOT = 'plugins'

export const GROUP_INDENT = 2

export const ENTRY_INDENT = 4

export const SPECIAL_KEY_PREFIX = '$'

export function errorText(error) {
  return String(error?.message ?? error ?? 'unknown error')
}

export function normalizeExec(exec) {
  if (typeof exec === 'function') return exec
  if (exec !== null && typeof exec === 'object' && typeof exec.run === 'function') {
    return exec.run.bind(exec)
  }
  return run
}

export function splitLines(text) {
  const source = typeof text === 'string' ? text : ''
  if (source === '') return []
  return source.split(/\r?\n/u)
}

export function countIndent(line) {
  let count = 0
  while (count < line.length && line[count] === ' ') count += 1
  return count
}

export function stripTilde(key) {
  return typeof key === 'string' && key.startsWith('~') ? key.slice(1) : key
}

export function displayKey(key) {
  const value = typeof key === 'string' ? key : ''
  const index = value.lastIndexOf(':')
  return index > 0 ? value.slice(0, index) : value
}

export function isLocalKey(key) {
  const value = typeof key === 'string' ? key : ''
  return /^\.\.?[\\/]/u.test(value) || value.startsWith('/')
}

export function isGroupKey(key) {
  return typeof key === 'string' && key.startsWith('group:') && key.length > 'group:'.length
}

export function readKeyToken(content) {
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

export function collectDependencies(packageJson) {
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

export function resolvePackageName(name, deps) {
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

export function resolveVersion(packageName, deps) {
  if (typeof packageName !== 'string' || packageName === '' || !deps.has(packageName)) return null
  const range = String(deps.get(packageName) ?? '')
  if (range === '') return null
  return range.replace(/^[\^~]/u, '')
}

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

export function findEntry(entries, query) {
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

export function findListedPlugin(plugins, query) {
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

export function normalizeGroupName(group) {
  const raw = typeof group === 'string' ? group.trim() : ''
  if (raw === '' || raw === PLUGIN_ROOT) return PLUGIN_ROOT
  return raw.startsWith('group:') ? raw : `group:${raw}`
}

export function formatYamlKey(name) {
  if (/^[A-Za-z0-9_$][A-Za-z0-9_./-]*$/u.test(name)) return name
  return `'${name.replace(/'/gu, "''")}'`
}

export function locatePlugins(lines) {
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    if (line.trim() === '') continue
    const indent = countIndent(line)
    const token = readKeyToken(line.slice(indent))
    if (token !== null && stripTilde(token.key) === PLUGIN_ROOT) return { index, indent, token }
  }
  return null
}

export function findGroupLine(lines, rootIndex, rootIndent, groupName) {
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

export function groupBlockEnd(lines, groupIndex, rootIndent) {
  let last = groupIndex
  for (let index = groupIndex + 1; index < lines.length; index += 1) {
    const line = lines[index]
    if (line.trim() === '') continue
    if (countIndent(line) <= rootIndent + GROUP_INDENT) break
    last = index
  }
  return last + 1
}

export function pluginsSectionEnd(lines, rootIndex, rootIndent) {
  for (let index = rootIndex + 1; index < lines.length; index += 1) {
    const line = lines[index]
    if (line.trim() === '') continue
    if (countIndent(line) <= rootIndent) return index
  }
  return lines.length
}

export function newPluginsBlock(name, groupName) {
  if (groupName === PLUGIN_ROOT) return ['plugins:', `    ${formatYamlKey(name)}: {}`]
  return ['plugins:', `  ${groupName}:`, `    ${formatYamlKey(name)}: {}`]
}

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

export function packageNameFromSpec(spec) {
  const value = typeof spec === 'string' ? spec.trim() : ''
  if (value === '') return ''
  if (isLocalKey(value)) return value
  if (value.startsWith('npm:')) return value.slice(4)
  const at = value.lastIndexOf('@')
  return at > 0 ? value.slice(0, at) : value
}

export function combineOutput(result) {
  if (result === null || result === undefined) return ''
  const stdout = String(result.stdout ?? '')
  const stderr = String(result.stderr ?? '')
  return [stdout.trim(), stderr.trim()].filter((part) => part !== '').join('\n')
}

export function truncateOutput(text, limit = 4000) {
  const value = String(text ?? '')
  if (value.length <= limit) return value
  return `${value.slice(0, limit)}\n…（输出已截断）`
}
