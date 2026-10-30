import { test } from 'node:test'
import assert from 'node:assert/strict'
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
