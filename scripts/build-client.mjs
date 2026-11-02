#!/usr/bin/env node
/**
 * Build `client.js` from the `client/` source tree.
 *
 * The client ships as one browser bundle registered with DSH's
 * `window.__ModuleLoader__`, so no npm dependency is needed at build time.
 * A tiny ESM-subset bundler is enough: every source file uses only relative
 * imports and the external `react` module, with named/default exports. Each
 * module is wrapped in a factory and resolved through one `__require` cache,
 * which keeps normal module scoping without a full parser.
 *
 * Usage:
 *
 *   node scripts/build-client.mjs            # write client.js
 *   node scripts/build-client.mjs --check    # fail when client.js is stale
 *
 * Run from the package root.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ENTRY = 'client/index.js'
const OUTPUT = resolve(ROOT, 'client.js')
const EXTERNAL = new Set(['react'])

const SLASH = (path) => (sep === '/' ? path : path.split(sep).join('/'))

function moduleId(fromId, specifier) {
  if (EXTERNAL.has(specifier)) return specifier
  if (!specifier.startsWith('.')) {
    throw new Error(`${fromId}: unsupported bare import ${JSON.stringify(specifier)}`)
  }
  const target = relative(ROOT, resolve(ROOT, dirname(fromId), specifier))
  return SLASH(target)
}

/** Rewrite one ESM-subset module into a factory body returning its exports. */
function transform(id, source) {
  const deps = []
  const exported = []
  let hasDefault = false
  const out = []
  // Normalize multi-line named imports so the line scanner below stays simple.
  source = source.replace(/import\s*\{([\s\S]*?)\}\s*from\s*'([^']+)'/g, (match, names, specifier) => {
    const list = names.split(',').map((part) => part.trim()).filter(Boolean).join(', ')
    return `import { ${list} } from '${specifier}'`
  })
  const lines = source.split('\n')

  const need = (specifier) => {
    const target = moduleId(id, specifier)
    deps.push(target)
    return `__require(${JSON.stringify(target)})`
  }

  for (const line of lines) {
    if (line.startsWith('import ')) {
      const sideEffect = /^import\s+'([^']+)'\s*$/.exec(line)
      if (sideEffect) {
        out.push(need(sideEffect[1]))
        continue
      }
      const namespace = /^import\s+\*\s+as\s+([A-Za-z_$][\w$]*)\s+from\s+'([^']+)'\s*$/.exec(line)
      if (namespace) {
        out.push(`const ${namespace[1]} = ${need(namespace[2])}`)
        continue
      }
      const named = /^import\s+\{([^}]*)\}\s+from\s+'([^']+)'\s*$/.exec(line)
      if (named) {
        const bindings = named[1].split(',').map((part) => part.trim()).filter(Boolean).map((part) => {
          const [local, alias] = part.split(/\s+as\s+/)
          return alias ? `${local}: ${alias}` : local
        })
        out.push(`const { ${bindings.join(', ')} } = ${need(named[2])}`)
        continue
      }
      const defaultImport = /^import\s+([A-Za-z_$][\w$]*)\s+from\s+'([^']+)'\s*$/.exec(line)
      if (defaultImport) {
        out.push(`const ${defaultImport[1]} = ${need(defaultImport[2])}`)
        continue
      }
      throw new Error(`${id}: unsupported import statement ${JSON.stringify(line)}`)
    }

    if (line.startsWith('export ')) {
      const fn = /^export\s+(async\s+)?function\s+([A-Za-z_$][\w$]*)/.exec(line)
      if (fn) {
        exported.push(fn[2])
        out.push(line.slice('export '.length))
        continue
      }
      const decl = /^export\s+(const|let|var)\s+([A-Za-z_$][\w$]*)/.exec(line)
      if (decl) {
        exported.push(decl[2])
        out.push(line.slice('export '.length))
        continue
      }
      const named = /^export\s+\{([^}]*)\}\s*$/.exec(line)
      if (named) {
        for (const part of named[1].split(',').map((item) => item.trim()).filter(Boolean)) {
          const [local, alias] = part.split(/\s+as\s+/)
          exported.push(alias ? `${local}: ${alias}` : local)
        }
        continue
      }
      const def = /^export\s+default\s+(.*)$/.exec(line)
      if (def) {
        hasDefault = true
        out.push(`const __default = ${def[1]}`)
        continue
      }
      throw new Error(`${id}: unsupported export statement ${JSON.stringify(line)}`)
    }

    out.push(line)
  }

  const returned = []
  if (hasDefault) returned.push('default: __default')
  returned.push(...exported)
  const body = out.join('\n').replace(/\n{3,}/g, '\n\n')
  return {
    deps,
    code: `${body}\nreturn { ${returned.join(', ')} }`,
  }
}

/** Walk the import graph from the entry and transform every module. */
export function buildModules() {
  const modules = new Map()
  const visit = (id) => {
    if (EXTERNAL.has(id) || modules.has(id)) return
    let source
    try {
      source = readFileSync(resolve(ROOT, id), 'utf8')
    } catch {
      throw new Error(`client bundle: cannot read ${id}`)
    }
    const { deps, code } = transform(id, source)
    modules.set(id, code)
    for (const dep of deps) visit(dep)
  }
  visit(ENTRY)
  return modules
}

const HEADER = `/**
 * dsh-qqbot — browser half. GENERATED FILE, do not edit.
 *
 * Built from client/ by scripts/build-client.mjs: one bundle registered with
 * DSH's module loader. A sidebar row plus a full-width control center for the
 * local QQ bot stack: status pills, the NapCat/Koishi cards, lifecycle and
 * setup actions, the plugin manager, the feature board and the log tail.
 *
 * The client never guesses ports or paths: everything comes from
 * \`GET /qqbot/status\`. Mutations are JSON POSTs, buttons disable while a
 * request is in flight, and failures surface in a banner at the top.
 */
`

/** Build the complete client.js text. */
export function buildClient() {
  const modules = buildModules()
  const ids = [...modules.keys()].sort()
  const factories = ids.map((id) => {
    const code = modules.get(id).split('\n').map((line) => (line === '' ? '' : `      ${line}`)).join('\n')
    return `    ${JSON.stringify(id)}: (__require) => {\n${code}\n    },`
  })
  const entrySpecifier = JSON.stringify(ENTRY)
  return `${HEADER}window.__ModuleLoader__.load({
  id: 'dsh-qqbot',
  factory(require) {
    const __modules = {
${factories.join('\n')}
    }
    const __cache = Object.create(null)
    function __require(id) {
      if (id === 'react') return require('react')
      const cached = __cache[id]
      if (cached !== undefined) return cached
      const factory = __modules[id]
      if (factory === undefined) throw new Error(\`dsh-qqbot bundle: unknown module \${id}\`)
      const exports = factory(__require)
      __cache[id] = exports
      return exports
    }
    const entry = __require(${entrySpecifier})
    return entry.default
  },
})
`
}

/** Source files that make up the bundle, for architecture/line checks. */
export function sourceFiles() {
  return [...buildModules().keys()].filter((id) => !EXTERNAL.has(id)).sort()
}

const isMain = process.argv[1] !== undefined && pathToFileURL(resolve(process.argv[1])).href === import.meta.url

if (isMain) {
  const check = process.argv.includes('--check')
  const code = buildClient()
  if (check) {
    const current = readFileSync(OUTPUT, 'utf8')
    if (current !== code) {
      console.error('client.js is stale: run `node scripts/build-client.mjs`')
      process.exit(1)
    }
    console.log('client.js is up to date')
  } else {
    writeFileSync(OUTPUT, code)
    const lines = code.split('\n').length
    const modules = buildModules()
    console.log(`built client.js (${lines} lines, ${modules.size} modules)`)
  }
}
