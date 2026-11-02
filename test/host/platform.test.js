/**
 * Platform-boundary tests: settings/data compatibility, macOS capability
 * reporting and the "no process.platform outside host/platform" rule.
 */

import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import {
  DEFAULT_SETTINGS,
  detectKoishiProject,
  detectNapcat,
  hostPlatform,
  macInfo,
  platformInfo,
  resolveSettings,
} from '../../host/platform/mac/index.js'

const ROOT = new URL('../..', import.meta.url)

async function listJs(urlOrPath) {
  const dir = typeof urlOrPath === 'string' ? urlOrPath : fileURLToPath(urlOrPath)
  const output = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) output.push(...await listJs(path))
    else if (entry.isFile() && entry.name.endsWith('.js')) output.push(path)
  }
  return output
}

test('settings: defaults keep the legacy data directory contract', () => {
  const settings = resolveSettings()
  assert.equal(settings.projectDir, `${process.env.HOME}/project/qq-bot`)
  assert.equal(settings.koishiPort, DEFAULT_SETTINGS.koishiPort)
  assert.equal(settings.napcatPort, DEFAULT_SETTINGS.napcatPort)
  assert.equal(settings.reversePath, '/onebot')
  assert.equal(settings.logLines, 200)

  const custom = resolveSettings({ projectDir: '/tmp/qq-bot', koishiPort: '6000', napcatPort: 0, reversePath: 'ws', logLines: 99999 })
  assert.equal(custom.projectDir, '/tmp/qq-bot')
  assert.equal(custom.koishiPort, 6000)
  assert.equal(custom.napcatPort, DEFAULT_SETTINGS.napcatPort)
  assert.equal(custom.reversePath, '/ws')
  assert.equal(custom.logLines, 2000)
})

test('platform: only macOS reports NapCat/Koishi support', () => {
  assert.equal(hostPlatform('darwin'), 'macos')
  assert.equal(hostPlatform('win32'), 'other')
  assert.equal(hostPlatform('linux'), 'other')
  assert.equal(platformInfo('darwin').label, 'macOS')
  assert.equal(platformInfo('darwin').napcatSupported, true)
  assert.equal(platformInfo('win32').napcatSupported, false)
  assert.equal(typeof macInfo().arch, 'string')
})

test('platform: detectors never throw on blank settings', () => {
  const missing = detectKoishiProject({ projectDir: '/tmp/dsh-qqbot-does-not-exist' })
  assert.equal(missing.exists, false)
  assert.equal(missing.hasPackageJson, false)
  const napcat = detectNapcat({ napcatPort: 6099 })
  assert.equal(typeof napcat.installed, 'boolean')
  assert.ok(Array.isArray(napcat.accounts))
  assert.equal(typeof napcat.webui.port, 'number')
})

test('architecture: no process.platform leakage into services or plugins', async () => {
  for (const dir of ['host/services', 'host/plugins', 'host/kernel', 'host/contracts']) {
    for (const file of await listJs(new URL(dir, ROOT))) {
      const text = await readFile(file, 'utf8')
      assert.equal(/\bprocess\.platform\b/u.test(text), false, `${file} leaks process.platform`)
    }
  }
  const hostApp = await readFile(new URL('host/app.js', ROOT), 'utf8')
  assert.equal(/\bprocess\.platform\b/u.test(hostApp), false, 'host/app.js leaks process.platform')
})

test('architecture: entry point stays a composition module', async () => {
  const entry = await readFile(new URL('index.js', ROOT), 'utf8')
  const lines = entry.split('\n').length - (entry.endsWith('\n') ? 1 : 0)
  assert.ok(lines <= 80, `index.js is ${lines} lines`)
  assert.match(entry, /applyHost/u)
  assert.doesNotMatch(entry, /\.\/lib\//u)
  assert.doesNotMatch(entry, /\.\/client/u)
})

test('architecture: plugins never import the legacy lib shims', async () => {
  for (const file of await listJs(new URL('host/plugins', ROOT))) {
    const text = await readFile(file, 'utf8')
    assert.doesNotMatch(text, /from\s+['"][^'"]*\/lib\//u, `${file} imports a legacy lib module`)
  }
})
