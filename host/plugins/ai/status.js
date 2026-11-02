/**
 * AI/bot status provider: AI availability + endpoint, runtime AI settings.
 */

import { readAiSettings } from '../../services/ai/settings.js'

/** @param {{ ai: object, aiSettingsPath: string, ensureEndpoint: Function }} options */
export function createStatusProvider({ ai, aiSettingsPath, ensureEndpoint }) {
  return async function aiStatus() {
    const endpoint = await ensureEndpoint()
    const [aiRuntime] = await Promise.all([readAiSettings(aiSettingsPath)])
    return {
      ai: { ...ai.status(), endpoint, ready: endpoint !== null },
      aiSettings: aiRuntime,
    }
  }
}
