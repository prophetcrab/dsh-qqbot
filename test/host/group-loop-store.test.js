/** Module tests for the group-loop durable store and loop contracts. */
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { GroupLoopStore } from '../../host/services/group-loop/store.js'
import { validateAnalyze, validateCompose, validateStateUpdate } from '../../host/services/group-loop/contracts.js'

const logger = { warn() {} }

async function workspace() {
  const root = await mkdtemp(join(tmpdir(), 'dsh-group-loop-'))
  const store = new GroupLoopStore({
    projectDir: root,
    personaPath: join(root, 'persona.json'),
    profilesPath: join(root, 'profiles.json'),
    logger,
  })
  return { root, store, profilesPath: join(root, 'profiles.json') }
}

test('group loop contracts reject malformed direct requests', () => {
  assert.equal(validateAnalyze({ groupId: 'g1', material: 'hi' }).ok, true)
  assert.equal(validateAnalyze({ groupId: '', material: 'hi' }).ok, false)
  assert.equal(validateAnalyze({ groupId: 'g1', material: '' }).ok, false)
  assert.equal(validateAnalyze({ apiVersion: 99, groupId: 'g1', material: 'hi' }).ok, false)
  assert.equal(validateAnalyze({ groupId: 'g1', material: 'hi', trigger: { reason: 'keyword' } }).ok, true)
  assert.equal(validateCompose({ groupId: 'g1', material: 'hi', speak: { enabled: false } }).ok, false)
  assert.equal(validateStateUpdate({ groupId: 'g1', material: 'hi' }).ok, false, 'loopId is required')
  const clean = validateAnalyze({ groupId: 'g1', material: 'hi', participants: [{ qq: '20000', nickname: '小明' }, { qq: '' }] })
  assert.deepEqual(clean.value.participants, [{ qq: '20000', nickname: '小明' }])
  const withImages = validateAnalyze({
    groupId: 'g1',
    material: 'hi',
    images: [{ mediaType: 'image/png', data: 'abc' }, { mediaType: 'text/plain', data: 'bad' }],
    quotedImages: [{ mediaType: 'image/jpeg', data: 'xyz' }],
  })
  assert.deepEqual(withImages.value.images, [{ mediaType: 'image/png', data: 'abc' }])
  assert.deepEqual(withImages.value.quotedImages, [{ mediaType: 'image/jpeg', data: 'xyz' }])
})

test('group loop store serializes concurrent state updates without losing emotion', async () => {
  const { store } = await workspace()
  await store.loadCharacter()
  const base = { memory: [], userProfiles: [], groupState: {} }
  await Promise.all([
    store.applyStateUpdate({ loopId: 'loop-a', groupId: 'g1', patches: { ...base, emotion: { valenceDelta: 0.1 } }, participants: [] }),
    store.applyStateUpdate({ loopId: 'loop-b', groupId: 'g2', patches: { ...base, emotion: { valenceDelta: 0.2 } }, participants: [] }),
  ])
  const character = await store.loadCharacter()
  assert.ok(Math.abs(character.emotion.valence - 0.38) < 1e-9, `valence=${character.emotion.valence}`)
  const groups = await store.loadGroups()
  assert.equal(groups.groups.g1.lastLoop, 'loop-a')
  assert.equal(groups.groups.g2.lastLoop, 'loop-b')
})

test('group loop store persists loop idempotency and memory once', async () => {
  const { store } = await workspace()
  const patches = { memory: [{ summary: '记住这件事' }], userProfiles: [], emotion: {}, groupState: { topic: '测试' } }
  const first = await store.applyStateUpdate({ loopId: 'loop-once', groupId: 'g1', patches, participants: [] })
  const second = await store.applyStateUpdate({ loopId: 'loop-once', groupId: 'g1', patches, participants: [] })
  assert.equal(first.duplicate, false)
  assert.equal(second.duplicate, true)
  assert.equal(second.result.memory, 1)
  assert.deepEqual(await store.memories().then((rows) => rows.map((row) => row.loopId)), ['loop-once'])
})

test('group loop store applies participant nickname and only the selected group profile', async () => {
  const { store, profilesPath } = await workspace()
  const participants = [{ qq: '20000', nickname: '小明' }]
  await store.applyStateUpdate({
    loopId: 'loop-profile',
    groupId: 'g1',
    participants,
    patches: {
      memory: [],
      userProfiles: [{ qq: '20000', patch: { summary: '喜欢游戏', interests: ['游戏'] } }],
      emotion: {},
      groupState: {},
    },
  })
  const profiles = await store.profilesFor('g1', ['20000'])
  assert.equal(profiles[0].nickname, '小明')
  assert.equal(profiles[0].summary, '喜欢游戏')
  assert.deepEqual(profiles[0].interests, ['游戏'])
  const other = await store.profilesFor('g2')
  assert.equal(other.length, 0)
  const dashboard = await store.dashboard(join(profilesPath, '..', 'listener.json'), 'g1')
  assert.equal(dashboard.profiles.length, 1)
  const globalDashboard = await store.dashboard(join(profilesPath, '..', 'listener.json'))
  assert.deepEqual(globalDashboard.profiles, [])
})

test('group loop store reports corrupt state instead of silently resetting it', async () => {
  const { root, store } = await workspace()
  const dir = join(root, 'data', 'state', 'group-loop')
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'character.json'), '{broken', 'utf8')
  await assert.rejects(() => store.loadCharacter(), /unreadable/)
  await rm(root, { recursive: true, force: true })
})

test('character initialization inherits persona interest keywords', async () => {
  const { root, store } = await workspace()
  const { writeFile } = await import('node:fs/promises')
  await writeFile(join(root, 'persona.json'), JSON.stringify({ name: '测试角色', keywords: ['股票', '漫画'] }), 'utf8')
  const character = await store.loadCharacter()
  assert.deepEqual(character.core.keywords, ['股票', '漫画'])
  await rm(root, { recursive: true, force: true })
})
