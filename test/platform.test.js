import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  DEFAULT_SETTINGS,
  detectKoishiProject,
  detectNapcat,
  resolveSettings,
} from '../lib/platform.js'

test('resolveSettings: defaults, ~ expansion, port clamping', () => {
  const defaults = resolveSettings()
  assert.equal(defaults.koishiPort, DEFAULT_SETTINGS.koishiPort)
  assert.equal(defaults.reversePath, '/onebot')
  const custom = resolveSettings({
    projectDir: '~/project/qq-bot',
    koishiPort: '6000',
    napcatPort: 0,
    reversePath: 'ws',
    logLines: 99999,
  })
  assert.match(custom.projectDir, /\/project\/qq-bot$/u)
  assert.ok(!custom.projectDir.startsWith('~'))
  assert.equal(custom.koishiPort, 6000)
  assert.equal(custom.napcatPort, DEFAULT_SETTINGS.napcatPort)
  assert.equal(custom.reversePath, '/ws')
  assert.equal(custom.logLines, 2000)
})

test('detectKoishiProject: missing project reports empty state', () => {
  const project = detectKoishiProject({ projectDir: '/tmp/dsh-qqbot-does-not-exist' })
  assert.equal(project.exists, false)
  assert.equal(project.hasPackageJson, false)
  assert.equal(project.hasNodeModules, false)
})

test('detectNapcat: never throws on a blank settings object', () => {
  const napcat = detectNapcat({ napcatPort: 6099 })
  assert.equal(typeof napcat.installed, 'boolean')
  assert.ok(Array.isArray(napcat.accounts))
  assert.equal(typeof napcat.webui.port, 'number')
})

import { hostPlatform, platformInfo, parseNetstatPid, windowsQqCandidates, windowsNapcatCandidates } from '../lib/platform.js'

test('hostPlatform/platformInfo: macOS and Windows are supported', () => {
  assert.equal(hostPlatform('darwin'), 'macos')
  assert.equal(hostPlatform('win32'), 'windows')
  assert.equal(hostPlatform('linux'), 'linux')
  assert.equal(platformInfo('darwin').label, 'macOS')
  assert.equal(platformInfo('win32').napcatSupported, true)
  assert.equal(platformInfo('linux').napcatSupported, false)
})

test('windowsQqCandidates: common QQNT locations', () => {
  const candidates = windowsQqCandidates({ ProgramFiles: 'C:\\Program Files', LOCALAPPDATA: 'C:\\Users\\u\\AppData\\Local' })
  assert.ok(candidates.some((path) => path.endsWith('Tencent\\QQNT\\QQ.exe')))
  assert.ok(candidates.every((path) => path.startsWith('C:\\')))
})

test('windowsNapcatCandidates: explicit dir, env and NapCat*.Shell folders', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-win-napcat-'))
  const shell = join(root, 'NapCat.4.18.41.Shell')
  await mkdir(join(shell, 'config'), { recursive: true })
  const candidates = windowsNapcatCandidates({ USERPROFILE: root }, { napcatDir: 'C:\\custom\\NapCat' })
  assert.ok(candidates.includes('C:\\custom\\NapCat'))
  assert.ok(candidates.some((path) => path.includes('NapCat.4.18.41.Shell')))
})

test('parseNetstatPid: LISTENING line for the requested port', () => {
  const output = [
    '  TCP    127.0.0.1:5140         0.0.0.0:0              LISTENING       4321',
    '  TCP    127.0.0.1:6099         0.0.0.0:0              LISTENING       8765',
  ].join('\n')
  assert.equal(parseNetstatPid(output, 5140), 4321)
  assert.equal(parseNetstatPid(output, 6099), 8765)
  assert.equal(parseNetstatPid(output, 1234), null)
})


test('resolveSettings: autoOpenInstaller defaults to true and can be disabled', () => {
  assert.equal(resolveSettings().autoOpenInstaller, true)
  assert.equal(resolveSettings({ autoOpenInstaller: false }).autoOpenInstaller, false)
  assert.equal(resolveSettings({ autoOpenInstaller: true }).autoOpenInstaller, true)
})
