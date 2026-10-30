/**
 * Runtime AI chat settings shared by the panel and the Koishi `ai-chat` plugin.
 *
 * The panel writes `<projectDir>/data/ai-settings.json`; the Koishi plugin
 * watches the same file, so probability / follow-up / history changes apply on
 * the next message without restarting Koishi.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

export const AI_SETTINGS_DEFAULTS = Object.freeze({
  enabled: true,
  replyProbability: 0.15,
  followUpMinutes: 3,
  historyLimit: 100,
  batchWindowMs: 2500,
  batchMaxWaitMs: 10000,
})

/** Convert arbitrary input into bounded runtime settings. */
export function normalizeAiSettings(input) {
  const source = input !== null && typeof input === 'object' ? input : {}
  const probability = Number(source.replyProbability)
  const followUp = Number(source.followUpMinutes)
  const history = Number(source.historyLimit)
  const batchWindow = Number(source.batchWindowMs)
  const batchMaxWait = Number(source.batchMaxWaitMs)
  const batchWindowMs = Number.isFinite(batchWindow)
    ? Math.min(10000, Math.max(0, Math.trunc(batchWindow)))
    : AI_SETTINGS_DEFAULTS.batchWindowMs
  const batchMaxWaitMs = Number.isFinite(batchMaxWait)
    ? Math.min(30000, Math.max(batchWindowMs, Math.trunc(batchMaxWait)))
    : Math.max(batchWindowMs, AI_SETTINGS_DEFAULTS.batchMaxWaitMs)
  return {
    enabled: source.enabled === undefined ? AI_SETTINGS_DEFAULTS.enabled : source.enabled === true,
    replyProbability: Number.isFinite(probability)
      ? Math.min(1, Math.max(0, Math.round(probability * 1000) / 1000))
      : AI_SETTINGS_DEFAULTS.replyProbability,
    followUpMinutes: Number.isFinite(followUp)
      ? Math.min(60, Math.max(0, Math.trunc(followUp)))
      : AI_SETTINGS_DEFAULTS.followUpMinutes,
    historyLimit: Number.isFinite(history)
      ? Math.min(200, Math.max(0, Math.trunc(history)))
      : AI_SETTINGS_DEFAULTS.historyLimit,
    batchWindowMs,
    batchMaxWaitMs,
  }
}

/** Read runtime settings; missing/corrupt file falls back to defaults. */
export async function readAiSettings(path) {
  try {
    const parsed = JSON.parse(await readFile(path, 'utf8'))
    return normalizeAiSettings(parsed)
  } catch {
    return { ...AI_SETTINGS_DEFAULTS }
  }
}

/** Persist runtime settings. */
export async function writeAiSettings(path, settings) {
  const normalized = normalizeAiSettings(settings)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8')
  return normalized
}
