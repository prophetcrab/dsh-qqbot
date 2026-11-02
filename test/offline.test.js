/**
 * Offline NapCat bundle: manifest validation, archive verification, and the
 * macOS install port. The end-to-end case uses the committed vendor payload
 * and is skipped when the bundle is absent.
 */

import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  defaultVendorDir,
  installMacOffline,
  macContainerPaths,
  macLoaderSource,
  readManifest,
  resolvePayload,
  verifyArchive,
} from '../host/services/napcat/offline.js'
import { run as execFileRun } from '../host/platform/mac/index.js'

async function tempDir(t) {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-qqbot-offline-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  return dir
}

async function writeVendor(dir, shell) {
  const manifest = { format: 1, platform: 'macos', napcat: { version: '9.9.9', shell } }
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
  assert.ok(paths.loaderPath.endsWith(join('Data', 'Documents', 'loadNapCat.js')))
})

test('macLoaderSource only boots NapCat with --no-sandbox', () => {
  const source = macLoaderSource('/Applications/QQ.app')
  assert.match(source, /process\.argv\.includes\('--no-sandbox'\)/u)
  assert.match(source, /napcat\/napcat\.mjs/u)
  assert.match(source, /QQUpdate\.app/u)
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
  // Use tar instead of ditto so the rest of the port is exercised portably.
  const run = async (file, args) => file === '/usr/bin/ditto'
    ? execFileRun('tar', ['-xf', args[2], '-C', args[3]], { timeoutMs: 120_000 })
    : { code: 0, stdout: '', stderr: '' }
  const result = await installMacOffline({ vendorDir, appDir, home, run, skipPrivileged: true })
  assert.equal(result.ok, true, result.message)
  assert.ok(existsSync(join(result.installDir, 'napcat.mjs')))
  assert.ok(existsSync(result.loaderPath))
  assert.ok((await readFile(join(appRoot, 'package.json'), 'utf8')).includes('loadNapCat.js'))
  const again = await installMacOffline({ vendorDir, appDir, home, run, skipPrivileged: true })
  assert.equal(again.ok, true)
  assert.equal(again.reused, true)
})
