#!/usr/bin/env node
/**
 * Architecture guard for the DSH QQ bot host.
 *
 * Checks the rules from docs/refactor/02-file-layout.md that can be verified
 * statically:
 *
 *   1. line budget: index.js & every plugin index.js <= 80; source <= 500
 *   2. dependency direction: contracts <- platform <- services <- plugins;
 *      kernel may only import contracts; host/app.js is composition
 *   3. no cross-plugin deep imports
 *   4. no production import of the legacy lib/ shims or of client/
 *   5. no import cycles
 *   6. no `process.platform` leakage outside host/platform/
 *   7. index.js is never imported by host code
 *
 *   node scripts/check-architecture.mjs
 */

import { readdir, readFile } from 'node:fs/promises'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ENTRY_MAX_LINES = 80
const PLUGIN_ENTRY_MAX_LINES = 80
const SOURCE_MAX_LINES = 500

/** @type {string[]} */
const errors = []
const stat = { files: 0, imports: 0 }

/** Recursively list `.js` files below one directory. */
async function listJs(dir) {
  const output = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue
    const path = join(dir, entry.name)
    if (entry.isDirectory()) output.push(...await listJs(path))
    else if (entry.isFile() && entry.name.endsWith('.js')) output.push(path)
  }
  return output
}

const toPosix = (path) => path.split(sep).join('/')
const rel = (path) => toPosix(relative(ROOT, path))
const lineCount = (text) => text.split('\n').length - (text.endsWith('\n') ? 1 : 0)

/** Extract static import/export-from specifiers. */
function importSpecifiers(text) {
  const specifiers = []
  const pattern = /(?:^|[\s;])(?:import|export)\s+(?:[^'"]*?\sfrom\s+)?['"]([^'"]+)['"]/gu
  let match
  while ((match = pattern.exec(text)) !== null) specifiers.push(match[1])
  const dynamic = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/gu
  while ((match = dynamic.exec(text)) !== null) specifiers.push(match[1])
  return specifiers
}

/** Resolve a relative specifier to an existing file, or null for packages. */
async function resolveImport(fromFile, specifier) {
  if (!specifier.startsWith('./') && !specifier.startsWith('../')) return null
  const base = resolve(dirname(fromFile), specifier)
  for (const candidate of [base, `${base}.js`, join(base, 'index.js')]) {
    try {
      await readFile(candidate, 'utf8')
      return candidate
    } catch {
      // try the next candidate
    }
  }
  errors.push(`${rel(fromFile)}: cannot resolve import ${specifier}`)
  return null
}

/** Layer of a repository-relative path. */
function layerOf(path) {
  if (path === 'index.js') return 'entry'
  if (path === 'host/app.js') return 'app'
  if (path.startsWith('host/contracts/')) return 'contracts'
  if (path.startsWith('host/platform/')) return 'platform'
  if (path.startsWith('host/services/')) return 'services'
  if (path.startsWith('host/plugins/')) return 'plugins'
  if (path.startsWith('host/kernel/')) return 'kernel'
  if (path.startsWith('lib/')) return 'legacy'
  if (path.startsWith('client/')) return 'client'
  if (path.startsWith('scripts/') || path.startsWith('test/')) return 'tooling'
  return 'other'
}

/** Plugin directory (`host/plugins/<name>`) of a path, or null. */
function pluginDirOf(path) {
  const match = /^host\/plugins\/([^/]+)\//u.exec(path)
  return match === null ? null : match[1]
}

/** Cross-layer import rules for files inside host/ and index.js. */
function checkLayerRule(sourcePath, targetPath) {
  const sourceLayer = layerOf(sourcePath)
  const targetLayer = layerOf(targetPath)
  if (sourceLayer === 'entry' || sourceLayer === 'app') return
  if (targetLayer === 'app' || targetLayer === 'entry') {
    errors.push(`${sourcePath}: ${sourceLayer} code must not import composition (${targetLayer})`)
    return
  }
  if (targetLayer === 'legacy' || targetLayer === 'client') {
    errors.push(`${sourcePath}: production host code must not import ${targetLayer}/`)
    return
  }
  if (sourceLayer === 'contracts' && targetLayer !== 'contracts') {
    errors.push(`${sourcePath}: contracts may only import contracts (got ${targetLayer})`)
  } else if (sourceLayer === 'platform' && !['contracts', 'platform'].includes(targetLayer)) {
    errors.push(`${sourcePath}: platform may only import contracts/platform (got ${targetLayer})`)
  } else if (sourceLayer === 'services' && !['contracts', 'platform', 'services'].includes(targetLayer)) {
    errors.push(`${sourcePath}: services may not import ${targetLayer}`)
  } else if (sourceLayer === 'plugins') {
    if (!['contracts', 'platform', 'services', 'plugins', 'kernel'].includes(targetLayer)) {
      errors.push(`${sourcePath}: plugins may not import ${targetLayer}`)
    }
    if (targetLayer === 'kernel' && !targetPath.endsWith('host/kernel/http.js')) {
      errors.push(`${sourcePath}: plugins may only use host/kernel/http.js from the kernel`)
    }
    if (targetLayer === 'plugins') {
      const sourcePlugin = pluginDirOf(rel(sourcePath))
      const targetPlugin = pluginDirOf(rel(targetPath))
      if (sourcePlugin !== null && targetPlugin !== null && sourcePlugin !== targetPlugin) {
        errors.push(`${sourcePath}: cross-plugin deep import from host/plugins/${targetPlugin}`)
      }
    }
  } else if (sourceLayer === 'kernel' && !['contracts', 'kernel'].includes(targetLayer)) {
    errors.push(`${sourcePath}: kernel may only import contracts/kernel (got ${targetLayer})`)
  }
}

async function main() {
  const hostFiles = await listJs(join(ROOT, 'host'))
  const files = [join(ROOT, 'index.js'), ...hostFiles]
  const graph = new Map()
  const sources = new Map()

  // ---- 1. line budget ------------------------------------------------------
  const entryText = await readFile(join(ROOT, 'index.js'), 'utf8')
  if (lineCount(entryText) > ENTRY_MAX_LINES) {
    errors.push(`index.js is ${lineCount(entryText)} lines (max ${ENTRY_MAX_LINES})`)
  }
  for (const file of hostFiles) {
    const path = rel(file)
    const text = await readFile(file, 'utf8')
    sources.set(file, text)
    stat.files += 1
    if (lineCount(text) > SOURCE_MAX_LINES) {
      errors.push(`${path} is ${lineCount(text)} lines (max ${SOURCE_MAX_LINES})`)
    }
    if (path.startsWith('host/plugins/') && path.endsWith('/index.js') && lineCount(text) > PLUGIN_ENTRY_MAX_LINES) {
      errors.push(`${path} is ${lineCount(text)} lines (plugin entry max ${PLUGIN_ENTRY_MAX_LINES})`)
    }
  }

  // ---- 2/3/4/7. import graph ----------------------------------------------
  for (const file of files) {
    const path = rel(file)
    const text = sources.get(file) ?? await readFile(file, 'utf8')
    const imports = []
    for (const specifier of importSpecifiers(text)) {
      const target = await resolveImport(file, specifier)
      if (target === null) continue
      const targetPath = rel(target)
      if (targetPath === 'index.js') errors.push(`${path}: host code must not import index.js`)
      imports.push(targetPath)
      stat.imports += 1
      checkLayerRule(path, targetPath)
    }
    graph.set(path, imports)
  }

  // ---- 5. cycles -----------------------------------------------------------
  const visiting = new Set()
  const visited = new Set()
  const stack = []
  const visit = (path) => {
    if (visited.has(path)) return
    if (visiting.has(path)) {
      const cycle = [...stack.slice(stack.indexOf(path)), path]
      errors.push(`import cycle: ${cycle.join(' -> ')}`)
      return
    }
    visiting.add(path)
    stack.push(path)
    for (const target of graph.get(path) ?? []) visit(target)
    stack.pop()
    visiting.delete(path)
    visited.add(path)
  }
  for (const path of graph.keys()) visit(path)

  // ---- 6. platform leakage -------------------------------------------------
  for (const file of hostFiles) {
    const path = rel(file)
    if (path.startsWith('host/platform/')) continue
    const text = sources.get(file) ?? ''
    if (/\bprocess\.platform\b/u.test(text)) {
      errors.push(`${path}: process.platform must stay inside host/platform/`)
    }
  }

  // ---- plugin structure ----------------------------------------------------
  const pluginRoot = join(ROOT, 'host', 'plugins')
  for (const entry of await readdir(pluginRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const indexPath = join(pluginRoot, entry.name, 'index.js')
    let text
    try {
      text = await readFile(indexPath, 'utf8')
    } catch {
      errors.push(`host/plugins/${entry.name}: missing index.js`)
      continue
    }
    if (!/export default/u.test(text)) errors.push(`host/plugins/${entry.name}/index.js: missing default export manifest`)
    if (!/id:\s*'/u.test(text)) errors.push(`host/plugins/${entry.name}/index.js: manifest is missing an id`)
  }

  // ---- client source ---------------------------------------------------------
  const clientRoot = join(ROOT, 'client')
  const clientFiles = await listJs(clientRoot)
  const clientGraph = new Map()
  for (const file of clientFiles) {
    const path = rel(file)
    const text = await readFile(file, 'utf8')
    sources.set(file, text)
    stat.files += 1
    if (lineCount(text) > SOURCE_MAX_LINES) errors.push(`${path} is ${lineCount(text)} lines (max ${SOURCE_MAX_LINES})`)
    if ((path === 'client/index.js' || /^client\/plugins\/[^/]+\/index\.js$/u.test(path)) && lineCount(text) > PLUGIN_ENTRY_MAX_LINES) {
      errors.push(`${path} is ${lineCount(text)} lines (client entry max ${PLUGIN_ENTRY_MAX_LINES})`)
    }
    const imports = []
    for (const specifier of importSpecifiers(text)) {
      if (specifier === 'react') continue
      if (!specifier.startsWith('.')) {
        errors.push(`${path}: client code may only import react or relative modules (got ${specifier})`)
        continue
      }
      const target = await resolveImport(file, specifier)
      if (target === null) continue
      const targetPath = rel(target)
      if (!targetPath.startsWith('client/')) errors.push(`${path}: client must not import outside client/ (${targetPath})`)
      imports.push(targetPath)
      stat.imports += 1
    }
    clientGraph.set(path, imports)
  }
  const clientVisiting = new Set()
  const clientVisited = new Set()
  const clientStack = []
  const visitClient = (path) => {
    if (clientVisited.has(path)) return
    if (clientVisiting.has(path)) {
      const cycle = [...clientStack.slice(clientStack.indexOf(path)), path]
      errors.push(`client import cycle: ${cycle.join(' -> ')}`)
      return
    }
    clientVisiting.add(path)
    clientStack.push(path)
    for (const target of clientGraph.get(path) ?? []) visitClient(target)
    clientStack.pop()
    clientVisiting.delete(path)
    clientVisited.add(path)
  }
  for (const path of clientGraph.keys()) visitClient(path)

  // ---- result --------------------------------------------------------------
  if (errors.length > 0) {
    console.error(`architecture check failed (${errors.length}):`)
    for (const error of errors) console.error(`  - ${error}`)
    process.exitCode = 1
    return
  }
  console.log(`architecture ok (${stat.files} host source files, ${stat.imports} internal imports)`)
}

await main()
