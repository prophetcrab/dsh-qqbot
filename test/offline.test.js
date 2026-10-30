/**
 * Offline NapCat bundle: manifest validation, archive verification, and the
 * Windows extraction path. The end-to-end case uses the committed vendor
 * payload and is skipped when the bundle is absent.
 */

import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  defaultVendorDir,
  installMacOffline,
  installWindowsOffline,
  macContainerPaths,
  macLoaderSource,
  readManifest,
  resolvePayload,
  verifyArchive,
} from '../lib/offline.js'
import { NapcatManager } from '../lib/napcat.js'
import { resolveSettings } from '../lib/platform.js'
import { run as execFileRun } from '../lib/util.js'

/** A throw-away directory removed after the test. */
async function tempDir(t) {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-qqbot-offline-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  return dir
}

/** Write a manifest with one shell entry. */
async function writeVendor(dir, shell, extra = {}) {
  const manifest = {
    format: 1,
    napcat: { version: '9.9.9', shell },
    ...extra,
  }
  await writeFile(join(dir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
}

test('readManifest rejects a missing manifest', async (t) => {
  const dir = await tempDir(t)
  await assert.rejects(() => readManifest(dir), /清单缺失/u)
})

test('readManifest rejects a wrong format and missing fields', async (t) => {
  const dir = await tempDir(t)
  await writeFile(join(dir, 'manifest.json'), JSON.stringify({ format: 2 }), 'utf8')
  await assert.rejects(() => readManifest(dir), /format 必须为 1/u)
  await writeFile(join(dir, 'manifest.json'), JSON.stringify({ format: 1, napcat: {} }), 'utf8')
  await assert.rejects(() => readManifest(dir), /napcat\.version/u)
})

test('resolvePayload refuses a path that escapes the vendor directory', async (t) => {
  const dir = await tempDir(t)
  await writeVendor(dir, { file: '../../outside.zip', bytes: 2000000, sha256: 'x' })
  await assert.rejects(() => resolvePayload(dir), /路径越界/u)
})

test('resolvePayload refuses a version pin that differs from the bundle', async (t) => {
  const root = defaultVendorDir()
  if (!existsSync(join(root, 'manifest.json'))) {
    t.skip('vendor bundle is not present')
    return
  }
  await assert.rejects(() => resolvePayload(root, { version: '0.0.1' }), /不一致/u)
})

test('verifyArchive checks size and SHA-256', async (t) => {
  const dir = await tempDir(t)
  const file = join(dir, 'payload.bin')
  const body = Buffer.alloc(70_000, 7)
  await writeFile(file, body)
  const digest = createHash('sha256').update(body).digest('hex')
  assert.equal((await verifyArchive(file, { bytes: body.length, sha256: digest })).ok, true)
  const wrongSize = await verifyArchive(file, { bytes: body.length + 1, sha256: digest })
  assert.equal(wrongSize.ok, false)
  assert.equal(wrongSize.error, 'archive-size-mismatch')
  const wrongDigest = await verifyArchive(file, { bytes: body.length, sha256: '0'.repeat(64) })
  assert.equal(wrongDigest.ok, false)
  assert.equal(wrongDigest.error, 'archive-digest-mismatch')
})

test('macContainerPaths stays inside the QQ container', () => {
  const paths = macContainerPaths('/Users/example')
  assert.ok(paths.napcatDir.endsWith(join('Data', 'Documents', 'napcat')))
  assert.ok(paths.loaderPath.endsWith(join('Documents', 'loadNapCat.js')))
  assert.ok(paths.versionsDir.endsWith(join('Application Support', 'QQ', 'versions')))
})

test('macLoaderSource boots NapCat only with --no-sandbox', () => {
  const source = macLoaderSource('/Applications/QQ.app')
  assert.ok(source.includes("process.argv.includes('--no-sandbox')"))
  assert.ok(source.includes(`require(${JSON.stringify(join('/Applications/QQ.app', 'Contents/Resources/app/package.json'))})`))
  assert.ok(source.includes('napcat/napcat.mjs'))
  assert.ok(source.includes('QQUpdate.app'))
})

test('installWindowsOffline extracts the committed bundle', async (t) => {
  if (process.platform !== 'win32') {
    t.skip('Windows extraction path')
    return
  }
  const vendorDir = defaultVendorDir()
  if (!existsSync(join(vendorDir, 'manifest.json'))) {
    t.skip('vendor bundle is not present')
    return
  }
  const targetDir = join(await tempDir(t), 'NapCat.test.Shell')
  const logger = { info: () => {}, warn: () => {} }
  const installed = await installWindowsOffline({ vendorDir, targetDir, logger })
  assert.equal(installed.ok, true, installed.message)
  assert.equal(installed.reused, false)
  assert.equal(installed.version, '4.18.42')
  assert.ok(existsSync(join(targetDir, 'launcher.bat')))
  assert.ok(existsSync(join(targetDir, 'launcher-win10.bat')))
  const stamped = JSON.parse(await readFile(join(targetDir, 'package.json'), 'utf8'))
  assert.equal(stamped.version, '4.18.42')
  const again = await installWindowsOffline({ vendorDir, targetDir, logger })
  assert.equal(again.ok, true)
  assert.equal(again.reused, true)
  assert.ok((await stat(join(targetDir, 'napcat.mjs'))).size > 1024)
})

test('NapcatManager.install prefers the offline bundle over the network', async (t) => {  if (process.platform !== 'win32') {
    t.skip('Windows offline path')
    return
  }
  const vendorDir = defaultVendorDir()
  if (!existsSync(join(vendorDir, 'manifest.json'))) {
    t.skip('vendor bundle is not present')
    return
  }
  const targetDir = join(await tempDir(t), 'NapCat.manager.Shell')
  const logger = { info: () => {}, warn: () => {} }
  let networkCalls = 0
  const manager = new NapcatManager({
    settings: resolveSettings({
      offlineInstall: true,
      offlineVendorDir: vendorDir,
      napcatDir: targetDir,
    }),
    logger,
    deps: {
      platform: {
        detectNapcat: () => ({ installed: false, installDir: null, configDir: null, version: null, accounts: [], webui: { port: 6099, token: null } }),
        detectQq: () => ({ installed: true, path: 'C:/Program Files/Tencent/QQNT/QQ.exe', version: '9.9.9' }),
        findProcess: () => ({ running: false, pid: null }),
      },
      http: async () => {
        networkCalls += 1
        throw new Error('network must not be used while the offline bundle is valid')
      },
    },
  })
  const result = await manager.install()
  assert.equal(result.ok, true, result.message)
  assert.equal(result.offline, true)
  assert.equal(result.configured, false)
  assert.equal(result.installDir, targetDir)
  assert.equal(networkCalls, 0)
})

test('installMacOffline stages the payload and patches the QQ loader', async (t) => {
  const vendorDir = defaultVendorDir()
  if (!existsSync(join(vendorDir, 'manifest.json'))) {
    t.skip('vendor bundle is not present')
    return
  }
  const root = await tempDir(t)
  const appDir = join(root, 'QQ.app')
  const appRoot = join(appDir, 'Contents/Resources/app')
  await mkdir(appRoot, { recursive: true })
  await writeFile(join(appRoot, 'package.json'), `${JSON.stringify({ main: './app_launcher/index.js', buildVersion: '30000' }, null, 2)}\n`, 'utf8')
  const home = join(root, 'home')
  const updateApp = join(home, 'Library/Containers/com.tencent.qq/Data/Library/Application Support/QQ/versions/1.0/QQUpdate.app/Contents/Resources/app')
  await mkdir(updateApp, { recursive: true })
  await writeFile(join(updateApp, 'package.json'), `${JSON.stringify({ main: './app_launcher/index.js', buildVersion: '30000' }, null, 2)}\n`, 'utf8')
  // `ditto` is macOS-only; the test extracts with tar so the rest of the port
  // (payload merge, loader, patches) is exercised on any host.
  const run = async (file, args) => file === '/usr/bin/ditto'
    ? execFileRun('tar', ['-xf', args[2], '-C', args[3]], { timeoutMs: 120_000 })
    : { code: 0, stdout: '', stderr: '' }
  const result = await installMacOffline({ vendorDir, appDir, home, run, skipPrivileged: true })
  assert.equal(result.ok, true, result.message)
  assert.ok(existsSync(join(result.installDir, 'napcat.mjs')))
  assert.ok(existsSync(join(result.installDir, 'config')))
  const loader = await readFile(result.loaderPath, 'utf8')
  assert.ok(loader.includes("process.argv.includes('--no-sandbox')"))
  const appPackage = JSON.parse(await readFile(join(appRoot, 'package.json'), 'utf8'))
  assert.ok(String(appPackage.main).includes('loadNapCat.js'))
  const hotPackage = JSON.parse(await readFile(join(updateApp, 'package.json'), 'utf8'))
  assert.ok(String(hotPackage.main).includes('loadNapCat.js'))
  assert.equal(result.patchedHotUpdates, 1)
  const again = await installMacOffline({ vendorDir, appDir, home, run, skipPrivileged: true })
  assert.equal(again.reused, true)
})
