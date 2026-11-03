/** Service-level tests for prompt boundaries, degraded updates and idempotency. */
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { GroupLoopService } from '../../host/services/group-loop/index.js'

async function setup(stream) {
  const root = await mkdtemp(join(tmpdir(), 'dsh-group-loop-service-'))
  const service = new GroupLoopService({
    ctx: { get: (name) => name === 'agentDefaultModel' ? { currentSelection: () => ({ provider: 'p', model: 'm' }) } : name === 'llm' ? { stream } : null },
    settings: { projectDir: root },
    logger: { warn() {} },
    personaPath: join(root, 'persona.json'),
    profilesPath: join(root, 'profiles.json'),
  })
  return { root, service }
}

test('profile data is placed in user content, never in the system prompt', async () => {
  let captured = null
  const stream = async function* (options) {
    captured = options
    yield { type: 'text-delta', text: '{"speak":{"enabled":false},"reason":"不接"}' }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
  const { root, service } = await setup(stream)
  await service.store.applyProfiles('g1', [{ qq: '20000', patch: { summary: '秘密画像摘要', interests: ['游戏'] } }], [{ qq: '20000', nickname: '小明' }])
  const result = await service.analyze({
    groupId: 'g1',
    material: '[2026] 小明(20000)：你好',
    participants: [{ qq: '20000', nickname: '小明' }],
    trigger: { reason: 'count' },
  })
  assert.equal(result.ok, true)
  assert.equal(result.speak.enabled, false)
  assert.equal(captured.system.includes('秘密画像摘要'), false)
  assert.equal(captured.messages[0].content[0].text.includes('<profile-data>'), true)
  assert.equal(captured.messages[0].content[0].text.includes('秘密画像摘要'), true)
  await rm(root, { recursive: true, force: true })
})

test('state update is idempotent and reports degraded LLM failures', async () => {
  let calls = 0
  const stream = async function* () {
    calls += 1
    yield { type: 'text-delta', text: '{"memory":[{"summary":"记住"}],"userProfiles":[],"emotion":{"valenceDelta":0.05},"groupState":{}}' }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
  const { root, service } = await setup(stream)
  const input = { loopId: 'loop-service', groupId: 'g1', material: '素材', participants: [], speak: { enabled: false }, sendResult: { sent: false } }
  const first = await service.stateUpdate(input)
  const second = await service.stateUpdate(input)
  assert.equal(first.degraded, false)
  assert.equal(first.memory, 1)
  assert.equal(second.duplicate, true)
  assert.equal(calls, 1)
  await rm(root, { recursive: true, force: true })

  const failing = async function* () { throw new Error('model down') }
  const fallback = await setup(failing)
  const degraded = await fallback.service.stateUpdate({ ...input, loopId: 'loop-degraded' })
  assert.equal(degraded.degraded, true)
  assert.match(degraded.error, /model down/)
  await rm(fallback.root, { recursive: true, force: true })
})

test('compose plans one to three short bubbles from JSON', async () => {
  const stream = async function* () {
    yield { type: 'text-delta', text: '{"parts":["第一句","第二句","第三句"]}' }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
  const { root, service } = await setup(stream)
  const result = await service.compose({
    groupId: 'g1',
    material: '素材',
    participants: [],
    speak: { enabled: true, kind: 'statement', replyType: null, target: { messageIds: [], userIds: [] } },
  })
  assert.equal(result.ok, true)
  assert.deepEqual(result.parts, ['第一句', '第二句', '第三句'])
  assert.equal(result.text, '第一句第二句第三句')
  await rm(root, { recursive: true, force: true })
})

test('compose attaches images as image content parts', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-group-loop-image-'))
  let captured = null
  const service = new GroupLoopService({
    ctx: { get: (name) => name === 'agentDefaultModel' ? { currentSelection: () => ({ provider: 'p', model: 'm' }) } : name === 'llm' ? {
      stream: async function* (options) {
        captured = options
        yield { type: 'text-delta', text: '{"parts":["看到了"]}' }
        yield { type: 'finish', reason: { kind: 'stop' } }
      },
    } : name === 'attachments' ? { saveImages: async (inputs) => inputs.map((_, index) => ({ attachmentId: `att-${index}` })) } : null },
    settings: { projectDir: root },
    logger: { warn() {} },
    personaPath: join(root, 'persona.json'),
    profilesPath: join(root, 'profiles.json'),
  })
  const result = await service.compose({
    groupId: 'g1', material: '素材', participants: [], speak: { enabled: true, kind: 'statement', replyType: null, target: {} },
    images: [{ mediaType: 'image/png', data: Buffer.from('x').toString('base64') }],
  })
  assert.equal(result.ok, true)
  assert.deepEqual(result.parts, ['看到了'])
  assert.ok(captured.messages[0].content.some((part) => part.type === 'image'))
  await rm(root, { recursive: true, force: true })
})
