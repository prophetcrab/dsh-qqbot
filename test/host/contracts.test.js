/**
 * Contract tests: status DTO, panel descriptors, config schema and the
 * lightweight schema validator.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  panelSchema,
  validateAgainstSchema,
  validateClientTab,
  validateHostConfig,
  validatePanelFeature,
  validateStatusSnapshot,
} from '../../host/contracts/index.js'

test('status contract: validates the stable snapshot shape', () => {
  const snapshot = {
    platform: { id: 'macos', label: 'macOS', supported: true, napcatSupported: true, koishiSupported: true },
    settings: { projectDir: '/tmp/qq-bot', koishiPort: 5140, napcatPort: 6099, reversePath: '/onebot' },
    qq: { installed: true, path: '/Applications/QQ.app', version: '6.9' },
    napcat: { installed: true, running: false },
    koishi: { exists: true, running: false },
    bot: { online: false, selfId: null, platform: null },
    persona: { name: 'p' },
    features: [],
    clientTabs: [],
    updatedAt: new Date().toISOString(),
  }
  assert.deepEqual(validateStatusSnapshot(snapshot), { valid: true, errors: [] })
  assert.equal(validateStatusSnapshot({ ...snapshot, platform: undefined }).valid, false)
})

test('panel contract: feature and tab descriptors', () => {
  assert.equal(validatePanelFeature({ id: 'x', title: { zh: 'x', en: 'x' }, description: { zh: '', en: '' }, actions: [] }).valid, true)
  assert.equal(validatePanelFeature({ id: 'x' }).valid, false)
  assert.equal(validateClientTab({ id: 't', title: { zh: 't', en: 't' }, order: 1 }).valid, true)
  assert.equal(validateClientTab({ title: { zh: 't', en: 't' } }).valid, false)
  assert.ok(panelSchema.definitions.feature)
})

test('config contract: resolved settings validate against the schema', () => {
  const resolved = {
    projectDir: '/tmp/qq-bot',
    koishiPort: 5140,
    napcatPort: 6099,
    reversePath: '/onebot',
    napcatToken: '',
    qqPath: '',
    napcatDir: '',
    offlineVendorDir: '',
    offlineNapcatVersion: '',
    autoRestartKoishi: true,
    autoInstallDeps: true,
    logLines: 200,
  }
  assert.equal(validateHostConfig(resolved).valid, true)
  assert.equal(validateHostConfig({ ...resolved, koishiPort: 0 }).valid, false)
})

test('validator: supports the schema subset used by contracts', () => {
  const schema = {
    type: 'object',
    properties: {
      name: { type: 'string', minLength: 1 },
      count: { type: 'integer', minimum: 1, maximum: 3 },
      tags: { type: 'array', maxItems: 2, items: { type: 'string' } },
      mode: { type: 'string', enum: ['a', 'b'] },
    },
    required: ['name'],
    additionalProperties: false,
  }
  assert.equal(validateAgainstSchema({ name: 'x', count: 2, tags: ['a'], mode: 'b' }, schema).valid, true)
  assert.equal(validateAgainstSchema({}, schema).valid, false)
  assert.equal(validateAgainstSchema({ name: 'x', count: 4 }, schema).valid, false)
  assert.equal(validateAgainstSchema({ name: 'x', tags: ['a', 'b', 'c'] }, schema).valid, false)
  assert.equal(validateAgainstSchema({ name: 'x', mode: 'c' }, schema).valid, false)
  assert.equal(validateAgainstSchema({ name: 'x', extra: 1 }, schema).valid, false)
  assert.equal(validateAgainstSchema({ name: '' }, schema).valid, false)
})
