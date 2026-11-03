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
  assert.ok(Math.abs(character.emotion.valence - 0.1388) < 1e-9, `valence=${character.emotion.valence}`)
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

test('emotion deltas are capped and silent loops ignore model deltas', async () => {
  const { root, store } = await workspace()
  const character = await store.loadCharacter()
  await store.saveCharacter({ ...character, emotion: { valence: 0.99, arousal: 0.9, energy: 0.04, socialBattery: 0.1, stress: 0.6 } })
  const patches = { memory: [], userProfiles: [], groupState: {}, emotion: { valenceDelta: 0.5, arousalDelta: -0.5 } }
  await store.applyStateUpdate({ loopId: 'active', groupId: 'g1', patches, participants: [], emotionActive: true })
  const active = await store.loadCharacter()
  assert.ok(active.emotion.valence < 0.99, 'valence should regress')
  assert.ok(active.emotion.valence > 0.9, 'one update should not reset the current value')
  assert.ok(active.emotion.arousal < 0.9, 'negative capped delta should apply')
  assert.ok(active.emotion.valence - 0.99 < 0.04, 'delta is capped')
  await store.applyStateUpdate({ loopId: 'silent', groupId: 'g1', patches: { ...patches, emotion: { valenceDelta: -1 } }, participants: [], emotionActive: false })
  const silent = await store.loadCharacter()
  assert.ok(silent.emotion.valence < active.emotion.valence, 'time regression still applies')
  assert.ok(silent.emotion.valence > 0.9, 'silent model delta must not be applied')
  await rm(root, { recursive: true, force: true })
})

test('energy and social recover by elapsed time and speech costs energy', async () => {
  const { root, store } = await workspace()
  const character = await store.loadCharacter()
  const stale = {
    ...character,
    updatedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    emotion: { valence: 0.5, arousal: 0.5, energy: 0.1, socialBattery: 0.1, stress: 0.4 },
  }
  await writeFile(store.characterPath, JSON.stringify(stale), 'utf8')
  await store.applyStateUpdate({
    loopId: 'recover', groupId: 'g1', participants: [], emotionActive: false,
    patches: { memory: [], userProfiles: [], groupState: {}, emotion: {} },
  })
  const recovered = await store.loadCharacter()
  assert.ok(recovered.emotion.energy > 0.1, `energy=${recovered.emotion.energy}`)
  assert.ok(recovered.emotion.socialBattery > 0.1, `social=${recovered.emotion.socialBattery}`)
  assert.notEqual(recovered.emotion.stress, 0.4, 'work/off-hours stress schedule should move stress')
  await store.saveCharacter({ ...recovered, emotion: { ...recovered.emotion, energy: 0.5 } })
  await store.applyStateUpdate({
    loopId: 'speak', groupId: 'g1', participants: [], emotionActive: true,
    patches: { memory: [], userProfiles: [], groupState: {}, emotion: {} },
  })
  const spoke = await store.loadCharacter()
  assert.ok(spoke.emotion.energy < 0.5, `speech should cost energy, got ${spoke.emotion.energy}`)
  await rm(root, { recursive: true, force: true })
})

test('social stress also lowers valence when the model omits a negative valence delta', async () => {
  const { root, store } = await workspace()
  const character = await store.loadCharacter()
  await store.saveCharacter({ ...character, emotion: { valence: 0.5, arousal: 0.5, energy: 0.5, socialBattery: 0.5, stress: 0.2 } })
  await store.applyStateUpdate({
    loopId: 'unhappy', groupId: 'g1', participants: [], emotionActive: true,
    patches: { memory: [], userProfiles: [], groupState: {}, emotion: { valenceDelta: 0, stressDelta: 0.03 } },
  })
  const after = await store.loadCharacter()
  assert.ok(after.emotion.stress > 0.2, `stress=${after.emotion.stress}`)
  assert.ok(after.emotion.valence < 0.5, `valence=${after.emotion.valence}`)
  await rm(root, { recursive: true, force: true })
})
