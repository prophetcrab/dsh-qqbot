/**
 * Unit tests for lib/koishi-plugins.js: text-level koishi.yml parsing/editing
 * and the npm-backed plugin manager.
 *
 * Every test works on a fixture string or a temporary directory; the real
 * `~/project/qq-bot` is never read or written.
 */

import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { KoishiPluginsManager } from '../host/services/koishi/plugins.js'
import {
  addPluginEntry,
  listKoishiPlugins,
  normalizePluginKey,
  parseKoishiYml,
  removePluginEntry,
  setPluginEnabled,
} from '../host/services/koishi/koishi-yml.js'

const QUIET_LOGGER = { info() {}, warn() {}, error() {}, debug() {} }

/** Fixture mirroring a real koishi.yml (groups, disabled entries, nested config). */
const FIXTURE_YML = `prefix:
  - /
plugins:
  group:server:
    server:sn8oqx:
      port: 5140
      maxPort: 5149
  group:basic:
    logger:cpi4w9: {}
    http:vrzkih: {}
    help:ss74sj: {}
    ~market:jgwg4c:
      search:
        endpoint: https://registry.koishi.chat/index.json
  group:local:
    ./plugins/core:orq22s:
      logMessages: true
      adminUsers: []
    ./plugins/echo:m9a6fn:
      keyword: ping
      reply: pong
`

const FIXTURE_PACKAGE = {
  name: 'qq-bot',
  dependencies: {
    '@koishijs/plugin-server': '^3.2.4',
    '@koishijs/plugin-logger': '^2.6.9',
    '@koishijs/plugin-http': '^0.6.3',
    '@koishijs/plugin-help': '^2.4.5',
    '@koishijs/plugin-market': '^2.11.4',
  },
}

/** Create a temp project containing the fixture files. */
async function makeProject(t, { yml = FIXTURE_YML, packageJson = FIXTURE_PACKAGE } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-koishi-plugins-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  if (yml !== null) await writeFile(join(dir, 'koishi.yml'), yml, 'utf8')
  if (packageJson !== null) await writeFile(join(dir, 'package.json'), JSON.stringify(packageJson, null, 2), 'utf8')
  return dir
}

/** Manager for a temp project with an injectable executor. */
function makeManager(dir, { exec, restart } = {}) {
  return new KoishiPluginsManager({
    settings: { projectDir: dir },
    koishi: restart === undefined ? null : { restart },
    logger: QUIET_LOGGER,
    exec,
  })
}

/** Entry lookup helper for assertions. */
function entryOf(ymlText, key) {
  return parseKoishiYml(ymlText).entries.find((entry) => entry.key === key)
}

test('parseKoishiYml extracts groups, entries and instance ids', () => {
  const parsed = parseKoishiYml(FIXTURE_YML)
  assert.deepEqual(parsed.groups, ['plugins', 'group:server', 'group:basic', 'group:local'])
  assert.equal(parsed.entries.length, 7)
  assert.deepEqual(
    parsed.entries.map((entry) => entry.key),
    ['server:sn8oqx', 'logger:cpi4w9', 'http:vrzkih', 'help:ss74sj', 'market:jgwg4c', './plugins/core:orq22s', './plugins/echo:m9a6fn'],
  )

  const help = entryOf(FIXTURE_YML, 'help:ss74sj')
  assert.deepEqual(
    { rawKey: help.rawKey, enabled: help.enabled, group: help.group, indent: help.indent },
    { rawKey: 'help:ss74sj', enabled: true, group: 'group:basic', indent: 4 },
  )
  assert.equal(typeof help.line, 'number')

  const market = entryOf(FIXTURE_YML, 'market:jgwg4c')
  assert.equal(market.rawKey, '~market:jgwg4c')
  assert.equal(market.enabled, false)

  const local = entryOf(FIXTURE_YML, './plugins/core:orq22s')
  assert.equal(local.group, 'group:local')
  assert.equal(local.enabled, true)

  // Nested configuration lines are not entries.
  assert.equal(parsed.entries.some((entry) => ['port', 'search', 'keyword'].includes(entry.key)), false)

  assert.deepEqual(parseKoishiYml(''), { entries: [], groups: [] })
  assert.deepEqual(parseKoishiYml('prefix: []\n'), { entries: [], groups: [] })
  assert.deepEqual(parseKoishiYml('plugins:\n  help: {}\n').entries, [])
  const ungrouped = parseKoishiYml('plugins:\n    custom: {}\n')
  assert.equal(ungrouped.entries[0].group, 'plugins')
})

test('listKoishiPlugins maps package names, versions, local and removable flags', () => {
  const plugins = listKoishiPlugins({ ymlText: FIXTURE_YML, packageJson: FIXTURE_PACKAGE })
  const byName = Object.fromEntries(plugins.map((plugin) => [plugin.name, plugin]))

  assert.equal(plugins.length, 7)
  assert.equal(byName.help.key, 'help:ss74sj')
  assert.equal(byName.help.packageName, '@koishijs/plugin-help')
  assert.equal(byName.help.version, '2.4.5')
  assert.equal(byName.help.enabled, true)
  assert.equal(byName.help.group, 'group:basic')
  assert.equal(byName.help.local, false)
  assert.equal(byName.help.removable, true)

  assert.equal(byName.market.enabled, false)
  assert.equal(byName.market.packageName, '@koishijs/plugin-market')
  assert.equal(byName.server.packageName, '@koishijs/plugin-server')

  assert.equal(byName['./plugins/core'].local, true)
  assert.equal(byName['./plugins/core'].packageName, './plugins/core')
  assert.equal(byName['./plugins/core'].version, null)
  assert.equal(byName['./plugins/core'].removable, false)
  assert.equal(byName['./plugins/core'].description, '本地插件')

  // Unknown npm plugin: no package.json match -> not removable.
  assert.equal(byName['./plugins/echo'].local, true)
  const unknown = listKoishiPlugins({
    ymlText: 'plugins:\n  group:x:\n    mystery:abc: {}\n',
    packageJson: FIXTURE_PACKAGE,
  })
  assert.equal(unknown[0].packageName, null)
  assert.equal(unknown[0].removable, false)

  assert.deepEqual(listKoishiPlugins({ ymlText: '', packageJson: null }), [])
})

test('setPluginEnabled toggles the ~ prefix and preserves nested config', () => {
  const disabled = setPluginEnabled(FIXTURE_YML, 'help:ss74sj', false)
  assert.notEqual(disabled, FIXTURE_YML)
  assert.match(disabled, /\n {4}~help:ss74sj: \{\}\n/u)
  assert.equal(entryOf(disabled, 'help:ss74sj').enabled, false)

  const enabled = setPluginEnabled(disabled, 'help', true)
  assert.equal(entryOf(enabled, 'help:ss74sj').enabled, true)
  assert.match(enabled, /\n {4}help:ss74sj: \{\}\n/u)

  const marketEnabled = setPluginEnabled(FIXTURE_YML, 'market:jgwg4c', true)
  assert.match(marketEnabled, /\n {4}market:jgwg4c:\n {6}search:\n/u)
  assert.equal(entryOf(marketEnabled, 'market:jgwg4c').enabled, true)

  // Already in the requested state: text is returned unchanged.
  assert.equal(setPluginEnabled(FIXTURE_YML, 'help', true), FIXTURE_YML)
  assert.equal(setPluginEnabled(FIXTURE_YML, 'market', false), FIXTURE_YML)

  assert.throws(() => setPluginEnabled(FIXTURE_YML, 'missing-plugin', false), /未找到插件配置/u)

  const ambiguous = 'plugins:\n  group:x:\n    help:a: {}\n    help:b: {}\n'
  assert.throws(() => setPluginEnabled(ambiguous, 'help', false), /不唯一/u)
})

test('addPluginEntry inserts entries at the right indentation', () => {
  const plain = addPluginEntry(FIXTURE_YML, 'my-plugin')
  assert.match(plain, /plugins:\n {4}my-plugin: \{\}\n {2}group:server:/u)
  assert.equal(entryOf(plain, 'my-plugin').group, 'plugins')
  assert.equal(entryOf(plain, 'my-plugin').indent, 4)

  const grouped = addPluginEntry(FIXTURE_YML, 'more-local', { group: 'local' })
  const parsedGrouped = parseKoishiYml(grouped)
  assert.equal(parsedGrouped.entries.find((entry) => entry.key === 'more-local').group, 'group:local')
  assert.ok(grouped.indexOf('more-local') > grouped.indexOf('./plugins/echo:m9a6fn'))
  assert.ok(grouped.indexOf('more-local') < grouped.length)

  const newGroup = addPluginEntry(FIXTURE_YML, 'new-plugin', { group: 'extra' })
  assert.match(newGroup, /\n {2}group:extra:\n {4}new-plugin: \{\}\n?$/u)
  assert.ok(parseKoishiYml(newGroup).groups.includes('group:extra'))
  assert.equal(entryOf(newGroup, 'new-plugin').group, 'group:extra')

  // A full key also works for group names.
  const fullGroup = addPluginEntry(FIXTURE_YML, 'second', { group: 'group:extra' })
  assert.equal(entryOf(fullGroup, 'second').group, 'group:extra')

  assert.throws(() => addPluginEntry(FIXTURE_YML, 'help'), /已存在/u)
  assert.throws(() => addPluginEntry(FIXTURE_YML, 'help:ss74sj'), /已存在/u)
  assert.throws(() => addPluginEntry(FIXTURE_YML, '   '), /不能为空/u)

  const empty = addPluginEntry('', 'foo', { group: 'local' })
  assert.equal(empty, 'plugins:\n  group:local:\n    foo: {}\n')
  assert.equal(entryOf(empty, 'foo').group, 'group:local')

  const noSection = addPluginEntry('prefix: []\n', 'bar')
  assert.ok(noSection.includes('plugins:'))
  assert.equal(entryOf(noSection, 'bar').group, 'plugins')

  const inline = addPluginEntry('prefix: []\nplugins: {}\n', 'baz')
  assert.ok(inline.includes('    baz: {}'))
  assert.equal(entryOf(inline, 'baz').group, 'plugins')

  const scoped = addPluginEntry(FIXTURE_YML, '@scope/plugin-foo')
  assert.equal(entryOf(scoped, '@scope/plugin-foo').key, '@scope/plugin-foo')
})

test('removePluginEntry deletes the entry, its config block and empty groups', () => {
  const withoutMarket = removePluginEntry(FIXTURE_YML, 'market:jgwg4c')
  assert.equal(withoutMarket.includes('market'), false)
  assert.equal(withoutMarket.includes('registry.koishi.chat'), false)
  assert.equal(parseKoishiYml(withoutMarket).entries.length, 6)
  assert.equal(entryOf(withoutMarket, 'help:ss74sj').enabled, true)

  const withoutHelp = removePluginEntry(FIXTURE_YML, 'help')
  assert.equal(withoutHelp.includes('help:ss74sj'), false)
  assert.equal(parseKoishiYml(withoutHelp).entries.length, 6)

  let localGone = removePluginEntry(FIXTURE_YML, './plugins/core:orq22s')
  assert.equal(localGone.includes('logMessages'), false)
  localGone = removePluginEntry(localGone, './plugins/echo')
  assert.equal(localGone.includes('group:local'), false)
  assert.equal(localGone.includes('keyword: ping'), false)
  assert.equal(parseKoishiYml(localGone).entries.length, 5)

  assert.throws(() => removePluginEntry(FIXTURE_YML, 'missing-plugin'), /未找到插件配置/u)
  assert.equal(removePluginEntry('plugins:\n    only: {}\n', 'only'), 'plugins:\n')
})

test('normalizePluginKey strips the common package prefixes', () => {
  assert.equal(normalizePluginKey('koishi-plugin-help'), 'help')
  assert.equal(normalizePluginKey('@koishijs/plugin-help'), 'help')
  assert.equal(normalizePluginKey('@scope/koishi-plugin-foo'), 'foo')
  assert.equal(normalizePluginKey('koishi-plugin-adapter-onebot@6.9.5'), 'adapter-onebot')
  assert.equal(normalizePluginKey('plain-name'), 'plain-name')
  assert.equal(normalizePluginKey('./plugins/core'), './plugins/core')
  assert.equal(normalizePluginKey(''), '')
  assert.equal(normalizePluginKey(undefined), '')
})

test('manager.list reads the project fixture files', async (t) => {
  const dir = await makeProject(t)
  const manager = makeManager(dir)
  const plugins = await manager.list()
  assert.equal(plugins.length, 7)
  assert.equal(plugins.find((plugin) => plugin.name === 'help').packageName, '@koishijs/plugin-help')

  const emptyDir = await makeProject(t, { yml: null })
  assert.deepEqual(await makeManager(emptyDir).list(), [])
})

test('manager.toggle writes koishi.yml and restarts on demand', async (t) => {
  const dir = await makeProject(t)
  let restartCalls = 0
  const manager = makeManager(dir, {
    restart: async () => {
      restartCalls += 1
      return { ok: true, message: 'restarted' }
    },
  })

  const disabled = await manager.toggle('help:ss74sj', false, { restart: true })
  assert.deepEqual(
    {
      ok: disabled.ok,
      action: disabled.action,
      key: disabled.key,
      packageName: disabled.packageName,
      textChanged: disabled.textChanged,
      restarted: disabled.restarted,
    },
    {
      ok: true,
      action: 'toggle',
      key: 'help:ss74sj',
      packageName: '@koishijs/plugin-help',
      textChanged: true,
      restarted: true,
    },
  )
  assert.equal(restartCalls, 1)
  const onDisk = await readFile(join(dir, 'koishi.yml'), 'utf8')
  assert.match(onDisk, /~help:ss74sj/u)
  assert.equal(entryOf(onDisk, 'help:ss74sj').enabled, false)

  // Already disabled -> no write and no restart.
  const noop = await manager.toggle('help', false, { restart: true })
  assert.equal(noop.textChanged, false)
  assert.equal(noop.restarted, false)
  assert.equal(restartCalls, 1)

  const enabled = await manager.toggle('help', true)
  assert.equal(enabled.textChanged, true)
  assert.equal(entryOf(await readFile(join(dir, 'koishi.yml'), 'utf8'), 'help:ss74sj').enabled, true)

  // A restart failure keeps the file change and reports the error.
  const failing = makeManager(dir, {
    restart: async () => ({ ok: false, error: 'boom' }),
  })
  const failed = await failing.toggle('help', false, { restart: true })
  assert.equal(failed.ok, true)
  assert.equal(failed.restarted, false)
  assert.match(failed.error, /重启失败：boom/u)
})

test('manager.install runs npm install then writes group:local', async (t) => {
  const dir = await makeProject(t)
  const calls = []
  const exec = async (file, args, options) => {
    calls.push({ file, args, options })
    return { code: 0, stdout: 'added 1 package in 1s', stderr: '' }
  }
  const manager = makeManager(dir, { exec })

  const result = await manager.install('@koishijs/plugin-echo@^1.2.3')
  assert.equal(result.ok, true)
  assert.equal(result.action, 'install')
  assert.equal(result.key, 'echo')
  assert.equal(result.packageName, '@koishijs/plugin-echo')
  assert.equal(result.textChanged, true)
  assert.equal(result.restarted, false)
  assert.match(result.output, /added 1 package/u)

  assert.equal(calls.length, 1)
  assert.equal(calls[0].file, 'npm')
  assert.deepEqual(calls[0].args, ['install', '@koishijs/plugin-echo@^1.2.3', '--no-audit', '--no-fund'])
  assert.equal(calls[0].options.cwd, dir)

  const onDisk = await readFile(join(dir, 'koishi.yml'), 'utf8')
  assert.equal(entryOf(onDisk, 'echo').group, 'group:local')
  assert.ok(onDisk.indexOf('echo: {}') > onDisk.indexOf('group:local'))

  // Installing the same plugin twice does not duplicate the yml entry.
  const again = await manager.install('koishi-plugin-echo')
  assert.equal(again.key, 'echo')
  assert.equal(again.textChanged, false)
  assert.match(again.output, /已存在/u)
  assert.equal(parseKoishiYml(await readFile(join(dir, 'koishi.yml'), 'utf8')).entries.filter((entry) => entry.key === 'echo').length, 1)
})

test('manager.install keeps koishi.yml untouched when npm fails', async (t) => {
  const dir = await makeProject(t)
  const manager = makeManager(dir, {
    exec: async () => ({ code: 1, stdout: '', stderr: 'npm ERR! 404 not found' }),
  })

  await assert.rejects(manager.install('koishi-plugin-nope'), /安装 koishi-plugin-nope 失败/u)
  assert.equal(await readFile(join(dir, 'koishi.yml'), 'utf8'), FIXTURE_YML)
  await assert.rejects(manager.install('   '), /不能为空/u)
})

test('manager.install restarts Koishi when asked', async (t) => {
  const dir = await makeProject(t)
  let restartCalls = 0
  const manager = makeManager(dir, {
    exec: async () => ({ code: 0, stdout: 'ok', stderr: '' }),
    restart: async () => {
      restartCalls += 1
      return { ok: true }
    },
  })

  const result = await manager.install('koishi-plugin-extra', { restart: true })
  assert.equal(result.ok, true)
  assert.equal(result.restarted, true)
  assert.equal(restartCalls, 1)
  assert.equal(entryOf(await readFile(join(dir, 'koishi.yml'), 'utf8'), 'extra').group, 'group:local')
})

test('manager.uninstall runs npm uninstall and removes the yml entry', async (t) => {
  const dir = await makeProject(t)
  const calls = []
  const exec = async (file, args, options) => {
    calls.push({ file, args, options })
    return { code: 0, stdout: 'removed 1 package', stderr: '' }
  }
  const manager = makeManager(dir, { exec })

  const result = await manager.uninstall('market')
  assert.equal(result.ok, true)
  assert.equal(result.action, 'uninstall')
  assert.equal(result.key, 'market:jgwg4c')
  assert.equal(result.packageName, '@koishijs/plugin-market')
  assert.equal(result.textChanged, true)
  assert.deepEqual(calls[0].args, ['uninstall', '@koishijs/plugin-market', '--no-audit', '--no-fund'])
  assert.equal(calls[0].options.cwd, dir)
  const onDisk = await readFile(join(dir, 'koishi.yml'), 'utf8')
  assert.equal(onDisk.includes('market'), false)

  await assert.rejects(manager.uninstall('missing-plugin'), /未找到插件配置/u)
})

test('manager.uninstall removes a local plugin from the yml without npm', async (t) => {
  const dir = await makeProject(t)
  let calls = 0
  const manager = makeManager(dir, {
    exec: async () => {
      calls += 1
      return { code: 0, stdout: '', stderr: '' }
    },
  })

  const result = await manager.uninstall('./plugins/core:orq22s')
  assert.equal(result.ok, true)
  assert.equal(result.key, './plugins/core:orq22s')
  assert.match(result.output, /本地插件/u)
  assert.equal(calls, 0)
  assert.equal((await readFile(join(dir, 'koishi.yml'), 'utf8')).includes('./plugins/core'), false)
})

test('manager reports an error when npm uninstall fails', async (t) => {
  const dir = await makeProject(t)
  const manager = makeManager(dir, {
    exec: async () => ({ code: 1, stdout: '', stderr: 'npm ERR! code ELIFECYCLE' }),
  })

  await assert.rejects(manager.uninstall('help'), /卸载 @koishijs\/plugin-help 失败/u)
  assert.equal(await readFile(join(dir, 'koishi.yml'), 'utf8'), FIXTURE_YML)
})

test('manager never reaches outside the configured project directory', async (t) => {
  const dir = await makeProject(t)
  const manager = makeManager(dir)
  assert.equal(manager.projectDir, dir)
  assert.equal(manager.ymlPath, join(dir, 'koishi.yml'))
  assert.equal(manager.packagePath, join(dir, 'package.json'))
  assert.equal(manager.koishi, null)

  const noManager = await manager.toggle('help', false, { restart: true })
  assert.equal(noManager.ok, true)
  assert.match(noManager.error, /缺少 Koishi 管理器/u)
  assert.equal((await readFile(join(dir, 'koishi.yml'), 'utf8')).includes('~help:ss74sj'), true)
})
