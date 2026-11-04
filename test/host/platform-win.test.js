/**
 * Windows platform-layer contract tests: capability reporting, QQ/NapCat
 * detection, netstat parsing and the npm/cmd.exe invocation shape. All paths
 * are temp directories; no real QQ/Docker process is touched.
 */

import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import * as facade from '../../host/platform/index.js'
import * as macIndex from '../../host/platform/mac/index.js'
import * as winIndex from '../../host/platform/win/index.js'
import {
  DEFAULT_SETTINGS,
  detectNapcat,
  detectQq,
  hostPlatform,
  platformInfo,
  resolveSettings,
} from '../../host/platform/win/index.js'
import { npmCommand, npmExecutable, parseNetstatPid } from '../../host/platform/win/process.js'

test('windows platform: project supports Windows (Docker-backed NapCat is included)', () => {
  assert.equal(hostPlatform('win32'), 'windows')
  assert.equal(hostPlatform('darwin'), 'macos')
  assert.equal(hostPlatform('linux'), 'linux')
  assert.equal(hostPlatform('freebsd'), 'other')
  const info = platformInfo('win32')
  assert.equal(info.id, 'windows')
  assert.equal(info.label, 'Windows')
  assert.equal(info.supported, true)
  assert.equal(info.napcatSupported, true)
  assert.equal(info.koishiSupported, true)
  assert.equal(platformInfo('darwin').napcatSupported, true)
})

test('windows platform: settings defaults and Docker settings', () => {
  const settings = resolveSettings()
  assert.equal(settings.koishiPort, DEFAULT_SETTINGS.koishiPort)
  assert.equal(settings.napcatPort, DEFAULT_SETTINGS.napcatPort)
  assert.equal(settings.reversePath, '/onebot')
  assert.equal(settings.napcatBackend, 'docker')
  assert.equal(settings.dockerNapcatImage, 'mlikiowa/napcat-docker:latest')
  const custom = resolveSettings({ napcatBackend: 'docker', dockerNapcatHost: 'gateway.local' })
  assert.equal(custom.napcatBackend, 'docker')
  assert.equal(custom.dockerNapcatHost, 'gateway.local')
})

test('windows platform: detectQq honors an explicit QQNT path', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-qqbot-win-qq-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const qq = join(dir, 'QQ.exe')
  await writeFile(qq, '')
  assert.deepEqual(detectQq({ qqPath: qq }), { installed: true, path: qq, version: null })
  assert.equal(detectQq({ qqPath: join(dir, 'missing.exe') }).installed, false)
})

test('windows platform: detectNapcat reads an explicit install directory', async (t) => {
  const installDir = await mkdtemp(join(tmpdir(), 'dsh-qqbot-win-napcat-'))
  t.after(() => rm(installDir, { recursive: true, force: true }))
  const configDir = join(installDir, 'config')
  await mkdir(configDir, { recursive: true })
  await writeFile(join(installDir, 'package.json'), JSON.stringify({ version: '4.18.42' }), 'utf8')
  await writeFile(join(configDir, 'onebot11_12345.json'), '{}', 'utf8')
  await writeFile(join(configDir, 'webui.json'), JSON.stringify({ port: 6099, token: 'test-token' }), 'utf8')

  const detected = detectNapcat({ napcatDir: installDir, napcatPort: 6099 })
  assert.equal(detected.installed, true)
  assert.equal(detected.installDir, installDir)
  assert.equal(detected.version, '4.18.42')
  assert.deepEqual(detected.accounts.map((account) => account.uin), ['12345'])
  assert.deepEqual(detected.webui, { port: 6099, token: 'test-token' })

  const missing = detectNapcat({ napcatPort: 6099 })
  assert.equal(missing.installed, false)
  assert.deepEqual(missing.accounts, [])
})

test('windows platform: netstat listener parsing and npm cmd wrapper', () => {
  const output = [
    '  协议  本地地址          外部地址        状态           PID',
    '  TCP    127.0.0.1:5140      0.0.0.0:0       LISTENING       1234',
    '  TCP    127.0.0.1:6099      0.0.0.0:0       LISTENING       5678',
    '  TCP    127.0.0.1:9000      0.0.0.0:0       ESTABLISHED     9999',
  ].join('\r\n')
  assert.equal(parseNetstatPid(output, 5140), 1234)
  assert.equal(parseNetstatPid(output, 6099), 5678)
  assert.equal(parseNetstatPid(output, 9000), null)
  assert.equal(npmExecutable(), 'npm.cmd')
  assert.deepEqual(npmCommand(['install', '--no-audit']), { file: 'cmd.exe', args: ['/c', 'npm', 'install', '--no-audit'] })
})

test('windows platform: index exports every macOS capability', () => {
  for (const name of Object.keys(macIndex)) {
    assert.ok(name in winIndex, `win/index.js is missing export ${name}`)
  }
})

test('platform facade: selects the Windows implementation on win32', { skip: process.platform !== 'win32' }, () => {
  assert.equal(facade.platformInfo().id, 'windows')
  assert.equal(facade.bundleKey(), 'win32-x64')
  assert.equal(facade.npmExecutable(), 'npm.cmd')
  assert.equal(facade.DEFAULT_SETTINGS.napcatBackend, 'docker')
})
