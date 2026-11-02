import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fetchContacts, normalizeContacts } from '../host/plugins/napcat/contacts.js'

test('normalizeContacts: groups, friends, sorting and missing fields', () => {
  const contacts = normalizeContacts({
    ok: true,
    selfId: '676512192',
    groups: [
      { id: '222222', name: 'B 群', memberCount: 12 },
      { id: '111111', name: 'A 群' },
      { id: '', name: '坏数据' },
    ],
    friends: [
      { id: '333333', name: '好友 B' },
      { id: '222222', name: '好友 A' },
    ],
  })
  assert.equal(contacts.ok, true)
  assert.equal(contacts.selfId, '676512192')
  assert.deepEqual(contacts.groups.map((group) => group.name), ['A 群', 'B 群'])
  assert.equal(contacts.groups[1].memberCount, 12)
  assert.deepEqual(contacts.friends.map((friend) => friend.id), ['222222', '333333'])
})

test('normalizeContacts: failure payload still returns lists', () => {
  const contacts = normalizeContacts({ ok: false, error: 'offline', groups: null, friends: undefined })
  assert.equal(contacts.ok, false)
  assert.equal(contacts.error, 'offline')
  assert.deepEqual(contacts.groups, [])
  assert.deepEqual(contacts.friends, [])
})

test('fetchContacts: success and transport failure', async () => {
  const success = await fetchContacts({ koishiPort: 5140 }, {
    httpJson: async (url) => {
      assert.match(url, /:5140\/api\/qqbot\/contacts$/u)
      return { ok: true, status: 200, data: { ok: true, groups: [{ id: '123456', name: '群' }], friends: [] } }
    },
  })
  assert.equal(success.ok, true)
  assert.equal(success.groups.length, 1)

  const failure = await fetchContacts({ koishiPort: 5140 }, {
    httpJson: async () => ({ ok: false, status: 0, data: null, error: 'ECONNREFUSED' }),
  })
  assert.equal(failure.ok, false)
  assert.equal(failure.error, 'ECONNREFUSED')
  assert.deepEqual(failure.groups, [])
})
