import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  accessPath,
  defaultPolicy,
  normalizePolicy,
  parseIdList,
  readPolicy,
  summarizePolicy,
  writePolicy,
} from '../host/services/access/index.js'

test('normalizePolicy: defaults and invalid values', () => {
  const policy = normalizePolicy({
    inbound: {
      groups: { mode: 'whitelist', ids: ['123456', '123456', 987654] },
      private: { mode: 'nonsense', ids: [] },
      quiet: { enabled: true, prefixes: ['/', '/', '!'] },
    },
    outbound: { groups: { mode: 'blacklist', ids: ['111111111111111111111'] } },
  })
  assert.equal(policy.inbound.groups.mode, 'whitelist')
  assert.deepEqual(policy.inbound.groups.ids, ['123456', '987654'])
  assert.equal(policy.inbound.private.mode, 'all')
  assert.deepEqual(policy.inbound.quiet, { enabled: true, prefixes: ['/', '!'] })
  assert.equal(policy.outbound.groups.mode, 'blacklist')
  assert.deepEqual(policy.outbound.groups.ids, [])
  assert.equal(typeof policy.updatedAt, 'string')
})

test('normalizePolicy: empty quiet prefixes fall back to /', () => {
  const policy = normalizePolicy({ inbound: { quiet: { enabled: true, prefixes: [] } } })
  assert.deepEqual(policy.inbound.quiet.prefixes, ['/'])
})

test('parseIdList: separators, dedupe, invalid ids', () => {
  const ids = parseIdList('123456, 654321\n123456，111111 ; abc 123')
  assert.deepEqual(ids, ['111111', '123456', '654321'])
  assert.deepEqual(parseIdList(''), [])
})

test('readPolicy/writePolicy: full round trip and defaults', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-qqbot-access-'))
  const settings = { projectDir: dir }
  const file = accessPath(settings)
  assert.equal(file, join(dir, 'data', 'access.json'))

  const missing = await readPolicy(file)
  assert.equal(missing.exists, false)
  assert.equal(missing.policy.inbound.groups.mode, 'all')

  const written = await writePolicy(file, {
    inbound: { groups: { mode: 'whitelist', ids: ['123456', '123456'] }, quiet: { enabled: true } },
  })
  assert.deepEqual(written.inbound.groups.ids, ['123456'])
  const stored = JSON.parse(await readFile(file, 'utf8'))
  assert.equal(stored.inbound.quiet.enabled, true)
  assert.match(stored.updatedAt, /^\d{4}-\d{2}-\d{2}T/u)

  const reread = await readPolicy(file)
  assert.equal(reread.exists, true)
  assert.equal(reread.policy.inbound.groups.mode, 'whitelist')
})

test('readPolicy: malformed JSON falls back without throwing', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-qqbot-access-bad-'))
  const file = join(dir, 'access.json')
  await writeFile(file, '{not json', 'utf8')
  const result = await readPolicy(file)
  assert.equal(result.exists, true)
  assert.equal(result.policy.inbound.groups.mode, 'all')
})

test('summarizePolicy: counts and quiet state', () => {
  const summary = summarizePolicy({
    inbound: {
      groups: { mode: 'whitelist', ids: ['123456', '654321'] },
      private: { mode: 'whitelist', ids: [] },
      quiet: { enabled: true, prefixes: ['/'] },
    },
    outbound: { groups: { mode: 'blacklist', ids: ['111111'] } },
  })
  assert.deepEqual(summary.inbound, {
    groups: 'whitelist',
    groupCount: 2,
    private: 'whitelist',
    privateCount: 0,
    quiet: true,
    prefixes: ['/'],
  })
  assert.equal(summary.outbound.groupCount, 1)
  assert.equal(summary.outbound.private, 'all')
})

test('defaultPolicy is a fresh object each call', () => {
  const first = defaultPolicy()
  first.inbound.groups.ids.push('123456')
  assert.deepEqual(defaultPolicy().inbound.groups.ids, [])
})
