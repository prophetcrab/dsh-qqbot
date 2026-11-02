import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import {
  buildProfilePrompt,
  buildProfileUpdatePrompt,
  ensureProfile,
  loadProfileStore,
  mergeProfile,
  parseProfilePatch,
  profileKey,
  saveProfileStore,
} from '../host/services/profiles/index.js'

test('profileKey: one card per group + QQ', () => {
  assert.equal(profileKey('1026855069', '20000'), '1026855069:20000')
  assert.equal(profileKey(undefined, 20000), 'private:20000')
})

test('ensureProfile: creates a bounded basic card and keeps nickname fresh', () => {
  const store = { version: 1, profiles: {} }
  const first = ensureProfile(store, { groupId: '1026855069', userId: '20000', userName: '小明' })
  assert.equal(first.created, true)
  assert.equal(first.profile.nickname, '小明')
  assert.equal(first.profile.interactions, 0)
  const second = ensureProfile(store, { groupId: '1026855069', userId: '20000', userName: '小明改名' })
  assert.equal(second.created, false)
  assert.equal(second.profile.nickname, '小明改名')
})

test('buildProfilePrompt: renders the second system segment', () => {
  const prompt = buildProfilePrompt({
    nickname: '小明',
    qq: '20000',
    summary: '喜欢打游戏',
    personality: '话多',
    style: '网络用语',
    relationship: '常和机器人互怼',
    interests: ['游戏', '动漫'],
    recent: '刚聊了新番',
  })
  assert.match(prompt, /^【用户画像】/u)
  assert.match(prompt, /昵称：小明/u)
  assert.match(prompt, /兴趣话题：游戏、动漫/u)
})

test('mergeProfile: merges a parsed patch and increments interactions', () => {
  const base = { groupId: 'g', qq: '1', nickname: 'A', summary: '', personality: '', style: '', relationship: '', interests: [], recent: '', interactions: 2, firstSeen: '', updatedAt: '' }
  const next = mergeProfile(base, {
    summary: '新概要',
    personality: '新性格',
    interests: ['游戏', '音乐', ''],
  }, '机器人回复')
  assert.equal(next.summary, '新概要')
  assert.equal(next.personality, '新性格')
  assert.deepEqual(next.interests, ['游戏', '音乐'])
  assert.equal(next.interactions, 3)
  assert.equal(next.recent, '机器人回复')
})

test('parseProfilePatch: tolerates code fences and rejects garbage', () => {
  assert.deepEqual(parseProfilePatch('```json\n{"summary":"x"}\n```'), { summary: 'x' })
  assert.equal(parseProfilePatch('not json'), null)
  assert.equal(parseProfilePatch(''), null)
})

test('profile store roundtrip', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-profiles-'))
  const path = join(dir, 'profiles.json')
  const store = { version: 1, profiles: {} }
  ensureProfile(store, { groupId: 'g', userId: '1', userName: 'A' })
  await saveProfileStore(path, store)
  const loaded = await loadProfileStore(path)
  assert.equal(loaded.profiles['g:1'].nickname, 'A')
  assert.equal(loaded.profiles['g:1'].interactions, 0)
  await rm(dir, { recursive: true, force: true })
})

test('buildProfileUpdatePrompt: includes existing profile and latest exchange', () => {
  const prompt = buildProfileUpdatePrompt(
    { nickname: '小明', qq: '1', summary: '旧概要', personality: '', style: '', relationship: '', interests: [], recent: '', interactions: 1 },
    [{ role: 'user', text: '我喜欢打游戏' }, { role: 'assistant', text: '知道了' }],
    '那你常玩什么？',
  )
  assert.match(prompt, /【现有画像】/u)
  assert.match(prompt, /我喜欢打游戏/u)
  assert.match(prompt, /那你常玩什么/u)
  assert.match(prompt, /"summary"/u)
})
