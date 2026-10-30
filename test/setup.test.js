import { EventEmitter } from 'node:events'
import { mkdtemp, mkdir, readFile, rm, writeFile, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SetupManager } from '../lib/setup.js'

const logger = { info() {}, warn() {}, error() {}, debug() {} }

/** Build a tiny template directory for scaffolding tests. */
async function makeTemplate(root) {
  await mkdir(join(root, 'plugins', 'demo'), { recursive: true })
  await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'demo', version: '1.0.0', dependencies: { koishi: '^4' } }))
  await writeFile(join(root, 'koishi.yml'), 'plugins:\n  demo: {}\n')
  await writeFile(join(root, 'plugins', 'demo', 'index.js'), 'export default {}\n')
  await mkdir(join(root, 'node_modules'), { recursive: true })
  return root
}

async function makeSettings(root) {
  const projectDir = join(root, 'runtime-project')
  return { projectDir, autoInstallDeps: true, koishiPort: 5140, installerDir: join(projectDir, 'runtime', 'napcat-installer') }
}

function fakeSpawn({ code = 0, stdout = 'installed\n' } = {}) {
  return () => {
    const child = new EventEmitter()
    child.stdout = new EventEmitter()
    child.stderr = new EventEmitter()
    setTimeout(() => {
      child.stdout.emit('data', stdout)
      child.emit('close', code)
    }, 0)
    return child
  }
}

test('ensureProject: scaffolds template without node_modules/data', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-setup-'))
  const templateDir = await makeTemplate(join(root, 'template'))
  const settings = await makeSettings(root)
  const setup = new SetupManager({ settings, logger, deps: { templateDir } })
  const result = await setup.ensureProject()
  assert.equal(result.ok, true)
  assert.equal(result.created, true)
  assert.ok(existsSync(join(settings.projectDir, 'package.json')))
  assert.ok(existsSync(join(settings.projectDir, 'koishi.yml')))
  assert.ok(existsSync(join(settings.projectDir, 'plugins', 'demo', 'index.js')))
  assert.ok(existsSync(join(settings.projectDir, 'data')))
  assert.ok(existsSync(join(settings.projectDir, 'runtime')))
  assert.equal(existsSync(join(settings.projectDir, 'node_modules')), false)
})

test('ensureProject: existing package.json is left untouched', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-setup-'))
  const templateDir = await makeTemplate(join(root, 'template'))
  const settings = await makeSettings(root)
  await mkdir(settings.projectDir, { recursive: true })
  await writeFile(join(settings.projectDir, 'package.json'), '{"name":"existing"}')
  const setup = new SetupManager({ settings, logger, deps: { templateDir } })
  const result = await setup.ensureProject()
  assert.equal(result.ok, true)
  assert.equal(result.created, false)
  assert.equal(await readFile(join(settings.projectDir, 'package.json'), 'utf8'), '{"name":"existing"}')
})

test('ensureProject: non-empty foreign directory is refused', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-setup-'))
  const templateDir = await makeTemplate(join(root, 'template'))
  const settings = await makeSettings(root)
  await mkdir(settings.projectDir, { recursive: true })
  const setup = new SetupManager({ settings, logger, deps: { templateDir } })
  const result = await setup.ensureProject()
  assert.equal(result.ok, false)
  assert.equal(result.error, 'project-not-empty')
})

test('installDeps: runs npm install and captures logs', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-setup-'))
  const templateDir = await makeTemplate(join(root, 'template'))
  const settings = await makeSettings(root)
  const calls = []
  const setup = new SetupManager({
    settings,
    logger,
    deps: {
      templateDir,
      // Keep the historical POSIX expectations deterministic on any host.
      hostPlatform: () => 'macos',
      npmExecutable: () => 'npm',
      spawn: (file, args, options) => {
        calls.push([file, ...args, options.cwd])
        return fakeSpawn({ code: 0, stdout: 'added 1 package\n' })()
      },
    },
  })
  const result = await setup.installDeps()
  assert.equal(result.ok, true)
  assert.equal(result.code, 0)
  assert.deepEqual(calls[0], ['npm', 'install', '--no-audit', '--no-fund', settings.projectDir])
  assert.match(setup.logs().join('\n'), /added 1 package/u)
  const status = await setup.status()
  assert.equal(status.installing, false)
  assert.equal(status.lastInstall.ok, true)
})

test('installDeps: non-zero npm exit is reported', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-setup-'))
  const templateDir = await makeTemplate(join(root, 'template'))
  const settings = await makeSettings(root)
  const setup = new SetupManager({
    settings,
    logger,
    deps: { templateDir, spawn: () => fakeSpawn({ code: 1, stdout: 'error\n' })() },
  })
  const result = await setup.installDeps()
  assert.equal(result.ok, false)
  assert.match(result.error, /退出码 1/u)
})

test('autoBootstrap: scaffolds + installs when project is missing', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-setup-'))
  const templateDir = await makeTemplate(join(root, 'template'))
  const settings = await makeSettings(root)
  let spawned = 0
  const setup = new SetupManager({
    settings,
    logger,
    deps: { templateDir, spawn: () => { spawned += 1; return fakeSpawn()() } },
  })
  const result = await setup.autoBootstrap()
  assert.equal(result.ok, true)
  assert.equal(spawned, 1)
})

test('status: reflects project and template state', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-setup-'))
  const templateDir = await makeTemplate(join(root, 'template'))
  const settings = await makeSettings(root)
  const setup = new SetupManager({ settings, logger, deps: { templateDir } })
  const before = await setup.status()
  assert.equal(before.hasPackageJson, false)
  assert.equal(before.templateAvailable, true)
  await setup.ensureProject()
  const after = await setup.status()
  assert.equal(after.hasPackageJson, true)
  assert.equal(after.hasKoishiYml, true)
  assert.equal(after.runtimeDir, join(settings.projectDir, 'runtime'))
})


test('setKoishiSelfId: updates the adapter selfId and validates input', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-setup-'))
  const templateDir = await makeTemplate(join(root, 'template'))
  await writeFile(join(templateDir, 'koishi.yml'), "prefix: ['/']\nplugins:\n  group:adapter:\n    adapter-onebot:abc:\n      selfId: '10000'\n      protocol: ws-reverse\n")
  const settings = await makeSettings(root)
  const setup = new SetupManager({ settings, logger, deps: { templateDir } })
  await setup.ensureProject()
  const updated = await setup.setKoishiSelfId('123456789')
  assert.equal(updated.ok, true)
  assert.equal(updated.changed, true)
  const text = await readFile(join(settings.projectDir, 'koishi.yml'), 'utf8')
  assert.match(text, /selfId: '123456789'/u)
  const again = await setup.setKoishiSelfId('123456789')
  assert.equal(again.changed, false)
  const invalid = await setup.setKoishiSelfId('abc')
  assert.equal(invalid.ok, false)
  assert.equal(invalid.error, 'invalid-qq')
})


test('offline bundle: installDeps extracts node_modules without npm', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-setup-'))
  const templateDir = await makeTemplate(join(root, 'template'))
  const settings = await makeSettings(root)
  const bundleDir = join(templateDir, 'runtime-bundles')
  await mkdir(bundleDir, { recursive: true })
  const bundle = join(bundleDir, `node_modules-${process.platform}-${process.arch}.tar.gz`)
  await writeFile(bundle, 'fake-bundle')
  let spawned = 0
  const setup = new SetupManager({
    settings,
    logger,
    deps: {
      templateDir,
      spawn: () => { spawned += 1; return fakeSpawn()() },
      run: async (file, args) => {
        assert.equal(file, 'tar')
        assert.equal(args[0], '-xzf')
        assert.equal(args[1], bundle)
        await mkdir(join(settings.projectDir, 'node_modules', 'koishi'), { recursive: true })
        return { code: 0, stdout: '', stderr: '' }
      },
    },
  })
  await setup.ensureProject()
  const status = await setup.status()
  assert.equal(status.bundleAvailable, true)
  assert.equal(status.bundleKey, `${process.platform}-${process.arch}`)
  await rm(join(settings.projectDir, 'node_modules'), { recursive: true, force: true })
  const result = await setup.installDeps()
  assert.equal(result.ok, true)
  assert.equal(result.bundled, true)
  assert.equal(spawned, 0)
})

test('offline bundle: ensureProject extracts bundled dependencies', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-setup-'))
  const templateDir = await makeTemplate(join(root, 'template'))
  const settings = await makeSettings(root)
  const bundleDir = join(templateDir, 'runtime-bundles')
  await mkdir(bundleDir, { recursive: true })
  await writeFile(join(bundleDir, `node_modules-${process.platform}-${process.arch}.tar.gz`), 'fake')
  const setup = new SetupManager({
    settings,
    logger,
    deps: {
      templateDir,
      run: async () => {
        await mkdir(join(settings.projectDir, 'node_modules'), { recursive: true })
        return { code: 0, stdout: '', stderr: '' }
      },
    },
  })
  const result = await setup.ensureProject()
  assert.equal(result.ok, true)
  assert.equal(result.bundled, true)
  assert.ok(existsSync(join(settings.projectDir, 'node_modules')))
})


test('offline bundle: selects the bundle matching the injected platform key', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-setup-'))
  const templateDir = await makeTemplate(join(root, 'template'))
  const bundleDir = join(templateDir, 'runtime-bundles')
  await mkdir(bundleDir, { recursive: true })
  const bundle = join(bundleDir, 'node_modules-win32-x64.tar.gz')
  await writeFile(bundle, 'fake-win-bundle')
  const settings = await makeSettings(root)
  const setup = new SetupManager({ settings, logger, deps: { templateDir, bundleKey: 'win32-x64' } })
  const status = await setup.status()
  assert.equal(status.bundleKey, 'win32-x64')
  assert.equal(status.bundlePath, bundle)
  assert.equal(status.bundleAvailable, true)
})


test('ensureProject: seeds shipped persona presets into data without overwriting', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-setup-'))
  const templateDir = await makeTemplate(join(root, 'template'))
  await mkdir(join(templateDir, 'presets'), { recursive: true })
  const seed = { version: 1, presets: [{ id: 'p1', name: '预设', persona: { name: 'A' } }] }
  await writeFile(join(templateDir, 'presets', 'persona-presets.json'), JSON.stringify(seed))
  const settings = await makeSettings(root)
  const setup = new SetupManager({ settings, logger, deps: { templateDir } })
  await setup.ensureProject()
  const target = join(settings.projectDir, 'data', 'persona-presets.json')
  assert.equal(await readFile(target, 'utf8'), JSON.stringify(seed))
  await writeFile(target, '{"version":1,"presets":[]}')
  await setup.ensureProject()
  assert.equal(await readFile(target, 'utf8'), '{"version":1,"presets":[]}')
})
