/**
 * Persona card (v2): a generic setting-load block plus trigger keywords and
 * optional few-shot examples. The prompt only consumes `settings` entries;
 * named role/tone/personality/rules fields are no longer part of the schema.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

/** @typedef {{ user: string, assistant: string }} PersonaExample */
/** @typedef {{ version: 2, name: string, settings: string[], keywords: string[], examples: PersonaExample[], updatedAt?: string }} Persona */

export const DEFAULT_PERSONA = Object.freeze({
  version: 2,
  name: '鱼鱼',
  settings: [
    '十岁，小学四年级。',
    '住在杭州。',
    '喜欢画画，画得一般但很投入。',
    '养了一只橘猫，叫年糕。',
    '放学后常去小区公园玩。',
    '爱吃甜食，尤其喜欢冰淇淋。',
    '怕黑，晚上不敢一个人关灯。',
    '作业多的时候会抱怨。',
    '说话短，想到什么说什么。',
    '对没见过的东西很好奇。',
    '不太懂大人的话题，会直接问。',
    '喜欢看动画片。',
  ],
  keywords: ['画画', '年糕', '猫', '学校', '作业', '考试', '零食', '冰淇淋', '动画', '公园', '老师', '同桌', '假期', '跳绳', '漫画', '下雨'],
  examples: [
    { user: '你几岁啦', assistant: '十岁，四年级。' },
    { user: '周末干嘛', assistant: '去公园玩，或者在家陪年糕。' },
    { user: '作业写完了吗', assistant: '还差一点，数学好难。' },
  ],
})

const MAX_NAME = 40
const MAX_SETTINGS = 32
const MAX_SETTING_LENGTH = 200
const MAX_KEYWORDS = 24
const MAX_KEYWORD = 40
const MAX_EXAMPLES = 8
const MAX_EXAMPLE_TEXT = 500

function clampList(source, max, maxLength) {
  if (!Array.isArray(source)) return []
  return [...new Set(source
    .filter((entry) => typeof entry === 'string' && entry.trim() !== '')
    .map((entry) => entry.trim().slice(0, maxLength)))]
    .slice(0, max)
}

/** Convert any input into a bounded persona card (v2). */
export function normalizePersona(input) {
  const source = input !== null && typeof input === 'object' ? input : {}
  const text = (value, limit) => (typeof value === 'string' ? value.trim().slice(0, limit) : '')
  const examples = Array.isArray(source.examples)
    ? source.examples
        .filter((item) => item !== null && typeof item === 'object')
        .map((item) => ({
          user: text(item.user, MAX_EXAMPLE_TEXT),
          assistant: text(item.assistant, MAX_EXAMPLE_TEXT),
        }))
        .filter((item) => item.user !== '' && item.assistant !== '')
        .slice(0, MAX_EXAMPLES)
    : []
  return {
    version: 2,
    name: text(source.name, MAX_NAME),
    settings: clampList(source.settings, MAX_SETTINGS, MAX_SETTING_LENGTH),
    keywords: clampList(source.keywords, MAX_KEYWORDS, MAX_KEYWORD),
    examples,
    ...(typeof source.updatedAt === 'string' && source.updatedAt !== '' ? { updatedAt: source.updatedAt } : {}),
  }
}

/** Render the generic setting block; no fallback fields are consulted. */
export function buildSettingLoad(persona) {
  const entries = normalizePersona(persona).settings
  return { header: '[SETTING LOAD]', entries }
}

/** Render the standalone name block. */
export function buildNameLoad(persona) {
  const name = normalizePersona(persona).name
  return name === '' ? '' : `[NAME LOAD]\n${name}`
}

function renderSettingLoad(persona) {
  const { header, entries } = buildSettingLoad(persona)
  return entries.length === 0 ? '' : `${header}\n${entries.join('\n')}`
}

/** Render the card as the first system-prompt segment. Empty cards return ''. */
export function buildPersonaPrompt(persona) {
  const card = normalizePersona(persona)
  const name = buildNameLoad(card)
  const setting = renderSettingLoad(card)
  const sections = []
  if (name !== '') sections.push(name)
  if (setting !== '') sections.push(setting)
  if (card.examples.length > 0) {
    const examples = card.examples.map((example) => `用户：${example.user}\n回应：${example.assistant}`).join('\n\n')
    sections.push(`【对话示例】\n${examples}`)
  }
  return sections.join('\n\n')
}

/** Group-loop prompt: the setting block only, no few-shot examples. */
export function buildCharacterPrompt(persona) {
  const card = normalizePersona(persona)
  return [buildNameLoad(card), renderSettingLoad(card)].filter((part) => part !== '').join('\n\n')
}

/** Read and normalize a persona file; returns null when missing/unreadable. */
export async function readPersonaFile(path) {
  try {
    const parsed = JSON.parse(await readFile(path, 'utf8'))
    return normalizePersona(parsed)
  } catch {
    return null
  }
}

/** Write a normalized persona card, stamping `updatedAt`. */
export async function writePersonaFile(path, persona) {
  const normalized = normalizePersona(persona)
  const saved = { ...normalized, updatedAt: new Date().toISOString() }
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify(saved, null, 2)}\n`, 'utf8')
  return saved
}
