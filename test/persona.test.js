import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import {
  DEFAULT_PERSONA, buildCharacterPrompt, buildPersonaPrompt, buildSettingLoad,
  normalizePersona, readPersonaFile, writePersonaFile,
} from '../host/services/persona/index.js'

test('default persona uses the real name and generic settings', () => {
  assert.equal(DEFAULT_PERSONA.name, '天青色瞪眼鱼')
  assert.equal(DEFAULT_PERSONA.version, 2)
  assert.ok(DEFAULT_PERSONA.settings.length >= 1)
  assert.doesNotMatch(DEFAULT_PERSONA.settings.join('\n'), /^名称：|^角色：/mu)
})

test('normalizePersona: keeps v2 fields, drops empty examples, caps settings', () => {
  const card = normalizePersona({
    name: '  小助手 ',
    settings: ['  young girl ', 'whale musume', '', 'young girl'],
    keywords: ['猫', ''],
    examples: [
      { user: '你好', assistant: '在的' },
      { user: '', assistant: '空 user 应丢弃' },
      { user: '只有用户' },
    ],
  })
  assert.equal(card.version, 2)
  assert.equal(card.name, '小助手')
  assert.deepEqual(card.settings, ['young girl', 'whale musume'])
  assert.deepEqual(card.keywords, ['猫'])
  assert.deepEqual(card.examples, [{ user: '你好', assistant: '在的' }])
})

test('buildSettingLoad: header plus one entry per line, no labels', () => {
  assert.deepEqual(buildSettingLoad({ settings: ['young girl', 'whale musume'] }), {
    header: '[SETTING LOAD]',
    entries: ['young girl', 'whale musume'],
  })
  assert.equal(buildCharacterPrompt({ settings: ['young girl', 'whale musume'] }), '[SETTING LOAD]\nyoung girl\nwhale musume')
  assert.equal(buildCharacterPrompt({}), '')
})

test('buildPersonaPrompt: setting block followed by few-shot examples', () => {
  const prompt = buildPersonaPrompt({
    name: '猫娘',
    settings: ['young girl', 'whale musume'],
    examples: [{ user: '你好', assistant: '你好喵' }],
  })
  assert.match(prompt, /^\[SETTING LOAD\]\nyoung girl\nwhale musume/u)
  assert.match(prompt, /【对话示例】/u)
  assert.match(prompt, /用户：你好\n回应：你好喵/u)
})

test('buildPersonaPrompt: empty card returns empty string', () => {
  assert.equal(buildPersonaPrompt(normalizePersona({})), '')
})

test('file roundtrip: write stamps updatedAt and read normalizes v2', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-persona-'))
  const file = join(dir, 'persona.json')
  const saved = await writePersonaFile(file, { ...DEFAULT_PERSONA, name: '测试角色', settings: ['young girl'] })
  assert.equal(saved.name, '测试角色')
  assert.deepEqual(saved.settings, ['young girl'])
  assert.equal(typeof saved.updatedAt, 'string')
  const loaded = await readPersonaFile(file)
  assert.equal(loaded.name, '测试角色')
  assert.deepEqual(loaded.settings, ['young girl'])
  assert.equal(loaded.version, 2)
  const raw = JSON.parse(await readFile(file, 'utf8'))
  assert.equal(raw.updatedAt, saved.updatedAt)
  await rm(dir, { recursive: true, force: true })
})

test('readPersonaFile: missing or invalid file returns null', async () => {
  assert.equal(await readPersonaFile('/definitely/missing/persona.json'), null)
})
