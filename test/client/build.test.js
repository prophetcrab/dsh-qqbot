/**
 * Build-level guarantees for the modular client source tree:
 *
 * - `client.js` is a pure build artifact of `client/` (no drift),
 * - every source file stays inside the 500-line budget (entry points 80),
 * - the import graph is acyclic, layered and free of cross-plugin imports,
 * - every legacy `data-testid` and locale key survives the refactor.
 *
 * Run with: node --test test/client/
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { buildClient, sourceFiles } from '../../scripts/build-client.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const read = (path) => readFileSync(join(ROOT, path), 'utf8')
const lineCount = (text) => text.split('\n').length - (text.endsWith('\n') ? 1 : 0)

function walk(dir, acc = []) {
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, acc)
    else if (name.endsWith('.js')) acc.push(relative(ROOT, full).split('\\').join('/'))
  }
  return acc
}

/** Legacy UI contract: every data-testid the old monolith rendered. */
const STATIC_TESTIDS = [
  'qqbot-access-contacts-error', 'qqbot-access-prefixes', 'qqbot-access-quiet', 'qqbot-access-refresh',
  'qqbot-access-refresh-contacts', 'qqbot-access-save', 'qqbot-ai-card', 'qqbot-ai-error', 'qqbot-ai-reply',
  'qqbot-ai-settings-card', 'qqbot-ai-settings-enabled', 'qqbot-ai-settings-error', 'qqbot-ai-settings-reset',
  'qqbot-ai-settings-save', 'qqbot-ai-status', 'qqbot-ai-test', 'qqbot-banner', 'qqbot-feature-card',
  'qqbot-features-refresh', 'qqbot-full-prompt-card', 'qqbot-full-prompt-error', 'qqbot-full-prompt-message',
  'qqbot-full-prompt-messages', 'qqbot-full-prompt-meta', 'qqbot-full-prompt-refresh', 'qqbot-full-prompt-system',
  'qqbot-full-prompt-toggle', 'qqbot-login-card', 'qqbot-login-phase', 'qqbot-login-qr', 'qqbot-login-refresh',
  'qqbot-login-retry', 'qqbot-login-start', 'qqbot-logs', 'qqbot-logs-refresh', 'qqbot-message-direction',
  'qqbot-message-row', 'qqbot-messages-filter', 'qqbot-messages-list', 'qqbot-messages-refresh', 'qqbot-panel',
  'qqbot-persona-card', 'qqbot-persona-error', 'qqbot-persona-example', 'qqbot-persona-example-add',
  'qqbot-persona-example-remove', 'qqbot-persona-preset-delete', 'qqbot-persona-preset-load',
  'qqbot-persona-preset-name', 'qqbot-persona-preset-row', 'qqbot-persona-preset-save', 'qqbot-persona-presets',
  'qqbot-persona-presets-error', 'qqbot-persona-preview', 'qqbot-persona-preview-toggle', 'qqbot-persona-reset',
  'qqbot-persona-save', 'qqbot-platform-badge', 'qqbot-plugin-install', 'qqbot-plugin-row',
  'qqbot-plugin-toggle', 'qqbot-plugin-uninstall', 'qqbot-plugins-refresh', 'qqbot-profile-delete',
  'qqbot-profile-row', 'qqbot-profile-save', 'qqbot-profiles-card', 'qqbot-profiles-error',
  'qqbot-profiles-refresh', 'qqbot-profiles-search', 'qqbot-setup-card', 'qqbot-setup-collapse',
  'qqbot-setup-expand', 'qqbot-setup-full', 'qqbot-setup-install', 'qqbot-setup-logs', 'qqbot-setup-napcat',
  'qqbot-setup-refresh', 'qqbot-setup-status', 'qqbot-setup-step', 'qqbot-status-refresh',
]

/** Dynamic testids are template literals in the bundle. */
const DYNAMIC_TESTIDS = [
  '${config.rowPrefix}-${item.id}',
  'qqbot-access-extra-${config.scope}-${id}',
  'qqbot-access-remove-${config.scope}-${id}',
  'qqbot-action-${action.id}',
  'qqbot-action-${id}',
  'qqbot-logs-source-${id}',
  'qqbot-tab-${item.id}',
]

test('client.js is an up-to-date build of client/', () => {
  assert.equal(read('client.js'), buildClient(), 'run `node scripts/build-client.mjs`')
})

test('the bundle registers a DSH client plugin', () => {
  const bundle = read('client.js')
  assert.match(bundle, /window\.__ModuleLoader__\.load\(\{/)
  assert.match(bundle, /id: 'dsh-qqbot'/)
  assert.match(bundle, /factory\(require\)/)
  assert.match(bundle, /return entry\.default/)
})

test('every source file stays under the size budget', () => {
  const files = walk(join(ROOT, 'client'))
  assert.ok(files.length > 20, `expected a real source tree, got ${files.length} files`)
  for (const file of files) {
    const lines = lineCount(read(file))
    const isEntry = file === 'client/index.js' || file.endsWith('/index.js')
    const limit = isEntry ? 80 : 500
    assert.ok(lines <= limit, `${file} has ${lines} lines (limit ${limit})`)
  }
})

test('the import graph is acyclic, layered and plugin-isolated', () => {
  const files = sourceFiles()
  const graph = new Map()
  const layerOf = (id) => {
    if (id === 'client/index.js') return 3
    if (id.startsWith('client/runtime/')) return 0
    if (id.startsWith('client/components/')) return 1
    if (id.startsWith('client/plugins/')) return 2
    throw new Error(`unexpected module outside the client layers: ${id}`)
  }
  const pluginOf = (id) => {
    const match = /^client\/plugins\/([^/]+)\//.exec(id)
    return match ? match[1] : null
  }
  for (const id of files) {
    const source = read(id)
    const deps = [...source.matchAll(/from\s+'([^']+)'/g)].map((match) => match[1])
    const resolved = deps.map((spec) => {
      if (spec === 'react') return 'react'
      assert.ok(spec.startsWith('.'), `${id}: unexpected bare import ${spec}`)
      const target = relative(ROOT, resolve(ROOT, dirname(id), spec)).split('\\').join('/')
      assert.ok(files.includes(target), `${id}: import ${spec} does not resolve to a source module`)
      return target
    })
    graph.set(id, resolved)
    for (const dep of resolved) {
      if (dep === 'react') continue
      assert.ok(layerOf(dep) <= layerOf(id), `${id} (layer ${layerOf(id)}) must not import ${dep} (layer ${layerOf(dep)})`)
      const fromPlugin = pluginOf(id)
      const toPlugin = pluginOf(dep)
      if (fromPlugin !== null && toPlugin !== null && fromPlugin !== toPlugin) {
        assert.fail(`${id} must not import across plugins (${fromPlugin} -> ${toPlugin})`)
      }
    }
  }

  const visiting = new Set()
  const done = new Set()
  const visit = (id, trail) => {
    if (done.has(id)) return
    assert.ok(!visiting.has(id), `circular import: ${[...trail, id].join(' -> ')}`)
    visiting.add(id)
    for (const dep of graph.get(id) || []) {
      if (dep !== 'react') visit(dep, [...trail, id])
    }
    visiting.delete(id)
    done.add(id)
  }
  visit('client/index.js', [])
})

test('every legacy data-testid is still rendered by the bundle', () => {
  const bundle = read('client.js')
  for (const id of STATIC_TESTIDS) {
    assert.ok(bundle.includes(`'data-testid': '${id}'`), `missing data-testid=${id}`)
  }
  for (const pattern of DYNAMIC_TESTIDS) {
    assert.ok(bundle.includes(`'data-testid': \`${pattern}\``) || bundle.includes(pattern), `missing dynamic testid ${pattern}`)
  }
})

test('en and zh dictionaries expose the same keys', async () => {
  const en = (await import('../../client/runtime/locale/en.js')).en
  const zh = (await import('../../client/runtime/locale/zh.js')).zh
  const enKeys = Object.keys(en).sort()
  const zhKeys = Object.keys(zh).sort()
  assert.deepEqual(zhKeys, enKeys)
  assert.ok(enKeys.length > 200, 'locale dictionaries look truncated')
  assert.equal(en.title, 'QQ bot')
  assert.equal(zh.title, 'QQ 机器人')
})
