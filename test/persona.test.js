import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { DEFAULT_PERSONA, buildCharacterPrompt, buildPersonaPrompt, normalizePersona, readPersonaFile, writePersonaFile } from '../host/services/persona/index.js'


test('default persona uses the real name 天青色瞪眼鱼', () => {
  assert.equal(DEFAULT_PERSONA.name, '天青色瞪眼鱼')
  assert.match(DEFAULT_PERSONA.role, /^天青色瞪眼鱼，28 岁/u)
  assert.doesNotMatch(DEFAULT_PERSONA.role, /林见夏/u)
})

test('normalizePersona: trims fields, drops empty examples, caps lengths', () => {
  const card = normalizePersona({
    name: '  小助手 ',
    role: 'r',
    tone: 't',
    personality: 'p',
    rules: 'x'.repeat(2000),
    examples: [
      { user: '你好', assistant: '在的' },
      { user: '', assistant: '空 user 应丢弃' },
      { user: '只有用户' },
    ],
  })
  assert.equal(card.name, '小助手')
  assert.equal(card.rules.length, 800)
  assert.equal(card.examples.length, 1)
  assert.deepEqual(card.examples[0], { user: '你好', assistant: '在的' })
})

test('buildPersonaPrompt: generic setting entries + few-shot examples', () => {
  const prompt = buildPersonaPrompt({
    name: '猫娘',
    role: '群里的猫娘助手',
    tone: '软萌',
    personality: '好奇',
    rules: '句尾带喵',
    examples: [{ user: '你好', assistant: '你好喵' }],
  })
  assert.match(prompt, /^\[SETTING LOAD\]\n群里的猫娘助手\n软萌\n好奇\n句尾带喵/u)
  assert.match(prompt, /【对话示例】/u)
  assert.match(prompt, /用户：你好\n回应：你好喵/u)
})

test('buildPersonaPrompt: empty card returns empty string', () => {
  assert.equal(buildPersonaPrompt(normalizePersona({})), '')
})

test('file roundtrip: write stamps updatedAt and read normalizes', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-persona-'))
  const file = join(dir, 'persona.json')
  const saved = await writePersonaFile(file, { ...DEFAULT_PERSONA, name: '测试角色' })
  assert.equal(saved.name, '测试角色')
  assert.equal(typeof saved.updatedAt, 'string')
  const loaded = await readPersonaFile(file)
  assert.equal(loaded.name, '测试角色')
  assert.equal(loaded.examples.length, DEFAULT_PERSONA.examples.length)
  const raw = JSON.parse(await readFile(file, 'utf8'))
  assert.equal(raw.updatedAt, saved.updatedAt)
  await rm(dir, { recursive: true, force: true })
})

test('readPersonaFile: missing or invalid file returns null', async () => {
  assert.equal(await readPersonaFile('/definitely/missing/persona.json'), null)
})

test('buildCharacterPrompt: generic setting entries only, no keywords/examples', () => {
  const prompt = buildCharacterPrompt({
    name: '猫娘',
    role: '群里的猫娘助手',
    tone: '软萌',
    personality: '好奇、爱撒娇',
    rules: '句尾带喵；遇到不懂的先问',
    keywords: ['猫', '鱼'],
    examples: [{ user: '你好', assistant: '你好喵' }],
  })
  assert.equal(prompt, '[SETTING LOAD]\n群里的猫娘助手\n软萌\n好奇、爱撒娇\n句尾带喵；遇到不懂的先问')
  assert.doesNotMatch(prompt, /兴趣关键词|猫、鱼|对话示例|你好喵/u)
})

test('explicit persona.settings replaces derived setting entries', () => {
  const prompt = buildCharacterPrompt({
    name: '猫娘',
    role: '群里的猫娘助手',
    tone: '软萌',
    personality: '好奇',
    rules: '句尾带喵',
    settings: ['young girl', 'whale musume'],
  })
  assert.equal(prompt, '[SETTING LOAD]\nyoung girl\nwhale musume')
})
