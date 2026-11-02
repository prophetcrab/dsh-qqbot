/**
 * Offline-payload contract tests: manifest shape, archive selection, version
 * pinning and the macOS paths the installer writes. No archive is extracted and
 * nothing is downloaded.
 */

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import {
  defaultVendorDir,
  macContainerPaths,
  macLoaderSource,
  readManifest,
  resolvePayload,
  verifyArchive,
} from '../../host/services/napcat/offline.js'

test('offline: the bundled vendor manifest resolves a real payload', async () => {
  const vendorDir = defaultVendorDir()
  const manifest = await readManifest(vendorDir)
  assert.equal(manifest.format, 1)
  assert.equal(typeof manifest.napcat.version, 'string')
  const payload = await resolvePayload(vendorDir)
  assert.equal(payload.version, manifest.napcat.version)
  assert.ok(payload.shellPath.endsWith(payload.shell.file))
  assert.ok(payload.shell.bytes >= 1024 * 1024, 'NapCat archive must carry a real payload')
})

test('offline: version pinning fails closed on mismatch', async () => {
  const vendorDir = defaultVendorDir()
  await assert.rejects(resolvePayload(vendorDir, { version: '0.0.0-not-installed' }), /与请求的/u)
})

test('offline: manifest validation rejects missing fields', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-qqbot-offline-contract-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  await writeFile(join(dir, 'manifest.json'), JSON.stringify({ format: 1, napcat: { version: '' } }), 'utf8')
  await assert.rejects(readManifest(dir), /napcat\.version/u)
  await writeFile(join(dir, 'manifest.json'), JSON.stringify({ format: 2, napcat: { version: '1' } }), 'utf8')
  await assert.rejects(readManifest(dir), /format/u)
})

test('offline: archive verification checks size and sha256', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-qqbot-offline-archive-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const file = join(dir, 'napcat.zip')
  const content = 'napcat-offline-payload'
  await writeFile(file, content, 'utf8')
  const sha256 = createHash('sha256').update(content).digest('hex')

  const ok = await verifyArchive(file, { bytes: Buffer.byteLength(content), sha256 })
  assert.equal(ok.ok, true)
  assert.equal(ok.sha256, sha256)

  const sizeMismatch = await verifyArchive(file, { bytes: 1 })
  assert.equal(sizeMismatch.ok, false)
  assert.equal(sizeMismatch.error, 'archive-size-mismatch')

  const digestMismatch = await verifyArchive(file, { sha256: '0'.repeat(64) })
  assert.equal(digestMismatch.ok, false)
  assert.equal(digestMismatch.error, 'archive-digest-mismatch')

  const missing = await verifyArchive(join(dir, 'nope.zip'), {})
  assert.equal(missing.error, 'archive-missing')
})

test('offline: runtime bundle key selects darwin-arm64 under template', async () => {
  const { SetupManager } = await import('../../host/services/setup/index.js')
  const manager = new SetupManager({ settings: { projectDir: '/tmp/qq-bot' }, deps: { templateDir: '/repo/template', bundleKey: 'darwin-arm64' } })
  assert.equal(manager.bundlePath(), '/repo/template/runtime-bundles/node_modules-darwin-arm64.tar.gz')
})

test('offline: macOS container paths and loader source target the QQ container', () => {
  const paths = macContainerPaths('/Users/tester')
  assert.equal(paths.napcatDir, '/Users/tester/Library/Containers/com.tencent.qq/Data/Documents/napcat')
  assert.ok(paths.loaderPath.endsWith('/Documents/loadNapCat.js'))
  const loader = macLoaderSource('/Applications/QQ.app')
  assert.match(loader, /--no-sandbox/u)
  assert.match(loader, /napcat\/napcat\.mjs/u)
})
