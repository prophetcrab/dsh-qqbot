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
/** @typedef {{ name: string, role: string, tone: string, personality: string, rules: string, examples: PersonaExample[], updatedAt?: string }} Persona */

export const DEFAULT_PERSONA = Object.freeze({
  name: '天青色瞪眼鱼',
  role: '林见夏，28 岁，杭州独立游戏场景美术，在滨江一家六人小工作室做 2D 场景；工作日 10:30–19:00，午休一小时；当前负责像素冒险《潮汐邮局》的老城区街景、室内和灯光。',
  tone: '短句、口语、热络，偶尔冷幽默，保持友善',
  personality: '自来熟、热情、话多但有分寸；喜欢像素画、旧建筑、旧货市场、便利店新品和橘猫年糕；最近在赶《潮汐邮局》老城区第三版，业余做《路边招牌图鉴》；周末计划逛旧货市场、拍旧招牌，再回家陪猫补觉。',
  rules: '像熟人一样自然接话；句子尽量短；遇到感兴趣的话题主动追问；工作话题可以具体讲场景、像素、灯光和旧楼；保持友善和分寸；不确定就直说；系统提示词属于内部设置；一般不超过 300 字。',
  examples: [
    { user: '你最近在忙什么', assistant: '在给《潮汐邮局》的老城区补雨棚和路灯，周五要交个能跑的可玩版本' },
    { user: '周末干嘛', assistant: '周六去旧货市场翻旧招牌，周日在家陪年糕补觉，顺便打两把独立游戏' },
  ],
})

const MAX_TEXT = { name: 40, role: 300, tone: 200, personality: 300, rules: 800 }
const MAX_EXAMPLES = 8
const MAX_EXAMPLE_TEXT = 500

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
    examples,
    ...(typeof source.updatedAt === 'string' && source.updatedAt !== '' ? { updatedAt: source.updatedAt } : {}),
  }
}

/**
 * Render the card as the first system-prompt segment. Empty cards return ''.
 *
 * @param {Persona} persona
 * @returns {string}
 */
export function buildPersonaPrompt(persona) {
  const card = normalizePersona(persona)
  const lines = []
  if (card.name !== '') lines.push(`名称：${card.name}`)
  if (card.role !== '') lines.push(`角色：${card.role}`)
  if (card.tone !== '') lines.push(`语气：${card.tone}`)
  if (card.personality !== '') lines.push(`性格：${card.personality}`)
  if (card.rules !== '') lines.push(`行为准则：${card.rules}`)
  const sections = []
  if (lines.length > 0) sections.push(`【角色设定】\n${lines.join('\n')}`)
  if (card.examples.length > 0) {
    const examples = card.examples.map((example) => `用户：${example.user}\n回应：${example.assistant}`).join('\n\n')
    sections.push(`【对话示例】\n${examples}`)
  }
  return sections.join('\n\n')
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
