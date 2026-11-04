/**
 * Keep the Koishi `server` plugin port in sync with the host setting.
 *
 * The template ships `port: 5140`; a profile may override `koishiPort`, so the
 * project must be updated before Koishi starts. This is a surgical text edit:
 * only the `port`/`maxPort` lines of the `group:server > server:*` entry change.
 */

import {
  ENTRY_INDENT,
  GROUP_INDENT,
  countIndent,
  findGroupLine,
  locatePlugins,
  readKeyToken,
  stripTilde,
} from './koishi-yml.js'

/**
 * Update the Koishi server plugin port in a `koishi.yml` document.
 *
 * @param {string} ymlText
 * @param {number} port
 * @returns {string} the original text when no server entry/port was found
 */
export function setServerPort(ymlText, port) {
  const source = typeof ymlText === 'string' ? ymlText : ''
  const target = Number(port)
  if (!Number.isInteger(target) || target <= 0 || target > 65535) return source

  const eol = source.includes('\r\n') ? '\r\n' : '\n'
  const lines = source.split(/\r?\n/u)
  const root = locatePlugins(lines)
  if (root === null) return source
  const groupIndex = findGroupLine(lines, root.index, root.indent, 'group:server')
  if (groupIndex === null) return source

  const entryIndent = root.indent + ENTRY_INDENT
  const groupIndent = root.indent + GROUP_INDENT
  let entry = -1
  for (let index = groupIndex + 1; index < lines.length; index += 1) {
    const line = lines[index]
    if (line.trim() === '') continue
    const indent = countIndent(line)
    if (indent <= groupIndent) break
    if (indent !== entryIndent) continue
    const token = readKeyToken(line.slice(indent))
    if (token !== null && stripTilde(token.key).split(':')[0] === 'server') {
      entry = index
      break
    }
  }
  if (entry === -1) return source

  let changed = false
  for (let index = entry + 1; index < lines.length; index += 1) {
    const line = lines[index]
    if (line.trim() === '') continue
    const indent = countIndent(line)
    if (indent <= entryIndent) break
    const portLine = /^(\s*)port:\s*\d+\s*$/u.exec(line)
    if (portLine !== null) {
      lines[index] = `${portLine[1]}port: ${target}`
      changed = true
      continue
    }
    const maxPortLine = /^(\s*)maxPort:\s*(\d+)\s*$/u.exec(line)
    if (maxPortLine !== null && Number(maxPortLine[2]) < target) {
      lines[index] = `${maxPortLine[1]}maxPort: ${target}`
      changed = true
    }
  }
  return changed ? lines.join(eol) : source
}
