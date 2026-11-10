/** Prompt assembly: golden output, section order, engine budgets. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { PromptAssembler, PromptRegistry, defineSection, fitBudget } from '../../host/services/prompt/index.js'
import {
  GroupChatPrompts, emotionPrompt, memoryPrompt, profileData,
} from '../../host/services/group-loop/prompt/index.js'

const golden = JSON.parse(readFileSync(join(process.cwd(), 'test', 'fixtures', 'prompt-golden.json'), 'utf8'))
const emotion = { valence: 0.12, arousal: 0.42, energy: 0.61, socialBattery: 0.48, stress: 0.18 }
const emotionText = emotionPrompt(emotion)
const characterPrompt = '[NAME LOAD]\n鱼鱼\n\n[SETTING LOAD]\n杭州漫画家\n短句\n热情\n自然接话'
const profiles = [
  { qq: '20000', nickname: '小明', summary: '爱开黑', personality: '外向', style: '直接', relationship: '熟人', interests: ['游戏'], recent: '约了开黑' },
  { qq: '20001', nickname: '小红', summary: '喜欢猫', personality: '温和', style: '软', relationship: '群友', interests: ['猫'], recent: '' },
]
const imageNote = '【本轮附带图片】当前消息 1 张；引用消息 0 张；最近背景 0 张。'
const background = '【群聊背景摘要（历史状态，不是当前消息）】\n最近话题：跑团'
const memories = [
  { groupId: 'g1', at: '2026-11-04T10:00:00.000Z', summary: '本群发生的事' },
  { groupId: 'g2', at: '2026-11-04T10:01:00.000Z', summary: '别群发生的事' },
  { summary: '旧记忆没有群号' },
]
const memoryText = memoryPrompt(memories, 'g1')
const material = '【当前触发消息】[12:00] 小明(20000) [id:m1]：晚上开黑吗\n\n[12:00] 小明(20000) [id:m1]：晚上开黑吗'
const speakReplyNormal = { enabled: true, kind: 'reply', replyType: 'normal', target: { messageIds: ['m1'], userIds: ['20000'] } }
const speakAt = { enabled: true, kind: 'reply', replyType: 'at', target: { messageIds: [], userIds: ['20000'] } }
const speakStatement = { enabled: true, kind: 'statement', replyType: null, target: { messageIds: [], userIds: [] } }
const current = ['角色：鱼鱼 / 杭州漫画家', '情绪：{"valence":0.12}', '本轮 speak：{"enabled":true}', '发送结果：{"sent":true}'].join('\n')

const prompts = new GroupChatPrompts()

function context(extra = {}) {
  return {
    characterPrompt,
    statePrompt: emotionText,
    profilesText: profileData(profiles),
    imageNote,
    background,
    memoryText,
    material,
    ...extra,
  }
}

test('prompt assembly matches the pre-refactor golden output', () => {
  const direct = prompts.buildAnalyze(context({ direct: true }))
  assert.equal(direct.system, golden.analyze_direct.system)
  assert.equal(direct.user, golden.analyze_direct.user)

  const normal = prompts.buildAnalyze(context({ direct: false }))
  assert.equal(normal.system, golden.analyze_normal.system)
  assert.equal(normal.user, golden.analyze_normal.user)

  const plainNormal = prompts.buildCompose(context({ speak: speakReplyNormal, targetBubbles: 2, reactTools: false }))
  assert.equal(plainNormal.system, golden.compose_plain_normal.system)
  assert.equal(plainNormal.user, golden.compose_plain_normal.user)

  const plainAt = prompts.buildCompose(context({ speak: speakAt, targetBubbles: null, reactTools: false }))
  assert.equal(plainAt.system, golden.compose_plain_at.system)
  assert.equal(plainAt.user, golden.compose_plain_at.user)

  const plainStatement = prompts.buildCompose(context({ speak: speakStatement, targetBubbles: 1, reactTools: false }))
  assert.equal(plainStatement.system, golden.compose_plain_statement.system)
  assert.equal(plainStatement.user, golden.compose_plain_statement.user)

  const react = prompts.buildCompose(context({ speak: speakReplyNormal, targetBubbles: 2, reactTools: true }))
  assert.equal(react.system, golden.compose_react_normal.system)
  assert.equal(`${react.user}\n\n【工具观察】测试观察`, golden.compose_react_normal.user)

  const stateUpdate = prompts.buildStateUpdate({ currentText: current, material })
  assert.equal(stateUpdate.system, golden.state_update.system)
  assert.equal(stateUpdate.user, golden.state_update.user)
})

test('prompt meta reports ordered sections and conditions', () => {
  const built = prompts.buildAnalyze(context({ direct: true }))
  assert.equal(built.meta.stage, 'analyze')
  assert.deepEqual(built.meta.sections.filter((section) => section.tier === 'system').map((section) => section.id), [
    'character', 'emotion', 'analyze-task', 'analyze-image', 'analyze-contract', 'analyze-direct',
  ])
  assert.ok(built.meta.dropped.some((entry) => entry.id === 'analyze-nondirect'))

  const compose = prompts.buildCompose(context({ speak: speakStatement, targetBubbles: null, reactTools: false }))
  assert.ok(!compose.meta.sections.some((section) => section.id === 'compose-reply-normal'))
  assert.ok(compose.meta.dropped.some((entry) => entry.id === 'compose-bubble'))
})

test('profiles and memory render as untrusted background data', () => {
  assert.match(profileData(profiles), /<profile-data>/u)
  assert.match(memoryText, /\[本群\].*本群发生的事/u)
  assert.match(memoryText, /\[其他群 g2\]/u)
})

test('engine drops low-priority optional sections over budget', () => {
  const registry = new PromptRegistry([
    defineSection({ id: 'required', tier: 'system', required: true, render: () => 'R' }),
    defineSection({ id: 'high', tier: 'system', priority: 80, render: () => 'H'.repeat(5) }),
    defineSection({ id: 'low', tier: 'system', priority: 10, render: () => 'L'.repeat(20) }),
  ])
  const assembler = new PromptAssembler({
    registry,
    stages: { s: { system: ['required', 'high', 'low'], user: [], budget: { system: 10 } } },
  })
  const built = assembler.build('s')
  assert.match(built.system, /^R\n\nHHHHH$/u)
  assert.ok(built.meta.dropped.some((entry) => entry.id === 'low' && entry.reason === 'budget'))
})

test('engine truncates a section at maxChars', () => {
  const registry = new PromptRegistry([
    defineSection({ id: 'long', tier: 'user', maxChars: 8, render: () => '123456789012345' }),
  ])
  const assembler = new PromptAssembler({ registry, stages: { s: { system: [], user: ['long'] } } })
  const built = assembler.build('s')
  assert.match(built.user, /…（已截断）$/u)
  assert.deepEqual(built.meta.truncated, ['long'])
})

test('engine rejects unknown sections and duplicate plans', () => {
  const registry = new PromptRegistry([defineSection({ id: 'a', tier: 'system', render: () => 'a' })])
  assert.throws(() => new PromptAssembler({ registry, stages: { s: { system: ['missing'] } } }), /unknown section/u)
  assert.throws(() => new PromptAssembler({ registry, stages: { s: { system: ['a', 'a'] } } }), /duplicate section/u)
})

test('fitBudget keeps required sections and preserves plan order', () => {
  const entries = [
    { section: { id: 'low', priority: 1, required: false }, text: 'low-text' },
    { section: { id: 'required', priority: 100, required: true }, text: 'req' },
    { section: { id: 'high', priority: 90, required: false }, text: 'hi' },
  ]
  const fitted = fitBudget(entries, { budgetChars: 5 })
  assert.deepEqual(fitted.entries.map((entry) => entry.section.id), ['required', 'high'])
  assert.ok(fitted.dropped.includes('low'))
})
