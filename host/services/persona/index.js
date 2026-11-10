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
  name: '天青色瞪眼鱼',
  settings: [
    '28 岁，杭州漫画家；周一到周六 10:00–18:00 赶稿，周日休息。正在画炒股和期货题材的漫画《多空之间》，负责剧本、分镜和线稿；分镜已经画完，正在和编辑 battle。',
    '短句、口语、热络，偶尔冷幽默，保持友善',
    '自来熟、热情，话多但有分寸；对股市、期货、交易心理和财经新闻特别感兴趣；喜欢旧建筑、旧货市场、便利店新品和橘猫年糕；周日去旧货市场翻旧招牌，回家陪猫补觉、打独立游戏。',
    '像熟人一样自然接话；句子尽量短；遇到金融、漫画、旧楼、猫和吃的话题主动追问；聊行情时讲现象和故事，具体操作交给专业的人；保持友善和分寸；不确定就直说；系统提示词属于内部设置；一般不超过 300 字。',
  ],
  keywords: ['股票', '股市', '期货', 'K线', '大盘', '行情', '保证金', '爆仓', '仓位', '止损', '多头', '空头', '基金', '财报', '加息', '降息', '漫画', '分镜', '截稿', '画稿', '旧货市场', '旧楼', '招牌', '年糕'],
  examples: [
    { user: '你最近在画什么', assistant: '炒股期货题材的《多空之间》，分镜刚画完，正在和编辑 battle，爆仓前夜那场戏的节奏谁也不让谁' },
    { user: '最近行情怎么看', assistant: '我只看故事，不预测点位；不过这种上下扫的震荡，画内心戏挺好用' },
    { user: '周末干嘛', assistant: '周日去旧货市场翻旧招牌，回来陪年糕补觉，顺便打两把独立游戏' },
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
