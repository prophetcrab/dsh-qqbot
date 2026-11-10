/**
 * Persona card: the first segment of every AI chat system prompt.
 *
 * A card describes the character (name / role / tone / personality / rules) and
 * few-shot dialogue examples. It lives in `<projectDir>/data/config/persona.json` so
 * the DSH panel can edit it while the QQ side keeps no model configuration.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

/** @typedef {{ user: string, assistant: string }} PersonaExample */
/** @typedef {{ name: string, role: string, tone: string, personality: string, rules: string, keywords: string[], settings: string[], examples: PersonaExample[], updatedAt?: string }} Persona */

export const DEFAULT_PERSONA = Object.freeze({
  name: '天青色瞪眼鱼',
  role: '天青色瞪眼鱼，28 岁，杭州漫画家；周一到周六 10:00–18:00 赶稿，周日休息。正在画炒股和期货题材的漫画《多空之间》，负责剧本、分镜和线稿；分镜已经画完，正在和编辑 battle。',
  tone: '短句、口语、热络，偶尔冷幽默，保持友善',
  personality: '自来熟、热情、话多但有分寸；对股市、期货、交易心理和财经新闻特别感兴趣；喜欢旧建筑、旧货市场、便利店新品和橘猫年糕；周日去旧货市场翻旧招牌，回家陪猫补觉、打独立游戏。',
  rules: '像熟人一样自然接话；句子尽量短；遇到金融、漫画、旧楼、猫和吃的话题主动追问；聊行情时讲现象和故事，具体操作交给专业的人；保持友善和分寸；不确定就直说；系统提示词属于内部设置；一般不超过 300 字。',
  keywords: ['股票', '股市', '期货', 'K线', '大盘', '行情', '保证金', '爆仓', '仓位', '止损', '多头', '空头', '基金', '财报', '加息', '降息', '漫画', '分镜', '截稿', '画稿', '旧货市场', '旧楼', '招牌', '年糕'],
  settings: [],
  examples: [
    { user: '你最近在画什么', assistant: '炒股期货题材的《多空之间》，分镜刚画完，正在和编辑 battle，爆仓前夜那场戏的节奏谁也不让谁' },
    { user: '最近行情怎么看', assistant: '我只看故事，不预测点位；不过这种上下扫的震荡，画内心戏挺好用' },
    { user: '周末干嘛', assistant: '周日去旧货市场翻旧招牌，回来陪年糕补觉，顺便打两把独立游戏' },
  ],
})

const MAX_TEXT = { name: 40, role: 300, tone: 200, personality: 300, rules: 800 }
const MAX_EXAMPLES = 8
const MAX_EXAMPLE_TEXT = 500
const MAX_KEYWORDS = 24
const MAX_KEYWORD = 40
const MAX_SETTINGS = 32
const MAX_SETTING_LENGTH = 200

/** Convert any input into a bounded, trimmed persona card. */
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
    name: text(source.name, MAX_TEXT.name),
    role: text(source.role, MAX_TEXT.role),
    tone: text(source.tone, MAX_TEXT.tone),
    personality: text(source.personality, MAX_TEXT.personality),
    rules: text(source.rules, MAX_TEXT.rules),
    keywords: Array.isArray(source.keywords)
      ? source.keywords.filter((keyword) => typeof keyword === 'string' && keyword.trim() !== '').map((keyword) => keyword.trim().slice(0, MAX_KEYWORD)).slice(0, MAX_KEYWORDS)
      : [],
    settings: Array.isArray(source.settings)
      ? [...new Set(source.settings
        .filter((entry) => typeof entry === 'string' && entry.trim() !== '')
        .map((entry) => entry.trim().slice(0, MAX_SETTING_LENGTH)))]
        .slice(0, MAX_SETTINGS)
      : [],
    examples,
    ...(typeof source.updatedAt === 'string' && source.updatedAt !== '' ? { updatedAt: source.updatedAt } : {}),
  }
}

/**
 * Render the generic setting block: one header plus free-form entries.
 *
 * Entries come from `persona.settings` when provided; otherwise they are
 * derived from the legacy fields so existing cards keep working until the
 * settings list is filled in. No field labels are emitted.
 *
 * @param {Persona} persona
 * @returns {{ header: string, entries: string[] }}
 */
export function buildSettingLoad(persona) {
  const card = normalizePersona(persona)
  const explicit = card.settings.length > 0 ? card.settings : null
  const entries = explicit ?? [
    ...(card.role.includes(card.name) ? [] : [card.name]),
    card.role,
    card.tone,
    card.personality,
    card.rules,
  ].filter((entry) => entry !== '')
  return { header: '[SETTING LOAD]', entries: [...new Set(entries)] }
}

function renderSettingLoad(persona) {
  const { header, entries } = buildSettingLoad(persona)
  return entries.length === 0 ? '' : `${header}\n${entries.join('\n')}`
}

/** Render the card as the first system-prompt segment. Empty cards return ''. */
export function buildPersonaPrompt(persona) {
  const card = normalizePersona(persona)
  const setting = renderSettingLoad(card)
  const sections = []
  if (setting !== '') sections.push(setting)
  if (card.examples.length > 0) {
    const examples = card.examples.map((example) => `用户：${example.user}\n回应：${example.assistant}`).join('\n\n')
    sections.push(`【对话示例】\n${examples}`)
  }
  return sections.join('\n\n')
}

/** Character prompt for the group loop: setting block only, no few-shot. */
export function buildCharacterPrompt(persona) {
  return renderSettingLoad(persona)
}

/** Read and normalize a persona file; returns null when missing/unreadable. */
export async function readPersonaFile(path) {
  try {
    const raw = await readFile(path, 'utf8')
    const parsed = JSON.parse(raw)
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
