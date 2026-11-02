import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { DEFAULT_PERSONA, buildPersonaPrompt, normalizePersona, readPersonaFile, writePersonaFile } from '../host/services/persona/index.js'

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

test('buildPersonaPrompt: persona block first with role fields and few-shot examples', () => {
  const prompt = buildPersonaPrompt({
    name: '猫娘',
    role: '群里的猫娘助手',
    tone: '软萌',
    personality: '好奇',
    rules: '句尾带喵',
    examples: [{ user: '你好', assistant: '你好喵' }],
  })
  assert.match(prompt, /^【角色设定】/u)
  assert.match(prompt, /名称：猫娘/u)
  assert.match(prompt, /【对话示例】/u)
  assert.match(prompt, /用户：你好\n助手：你好喵/u)
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
  assert.equal(loaded.examples.length, 1)
  const raw = JSON.parse(await readFile(file, 'utf8'))
  assert.equal(raw.updatedAt, saved.updatedAt)
  await rm(dir, { recursive: true, force: true })
})

test('readPersonaFile: missing or invalid file returns null', async () => {
  assert.equal(await readPersonaFile('/definitely/missing/persona.json'), null)
})
