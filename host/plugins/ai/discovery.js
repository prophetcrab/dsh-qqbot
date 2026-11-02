/**
 * Publish the local AI bridge endpoint for the Koishi `ai-chat` plugin by
 * updating `<projectDir>/sdata/state/ai.json`. Retried on every status read; a write
 * failure never breaks the panel.
 */

import { dataPaths, ensureDir, writeFileAtomic } from '../../platform/mac/index.js'

/** @param {object} api plugin API @param {object} ai AiChatService */
export function createDiscovery(api, ai) {
  let lastText = ''
  return async function ensureAiEndpoint() {
    try {
      const origin = typeof api.ctx?.webServer?.getOrigin === 'function'
        ? api.ctx.webServer.getOrigin()
        : null
      if (typeof origin !== 'string' || origin === '') return null
      const endpoint = `${origin}/qqbot/ai/chat`
      const selection = ai.resolveSelection()
      const text = JSON.stringify({
        version: 1,
        endpoint,
        provider: selection.provider,
        model: selection.model,
        updatedAt: new Date().toISOString(),
      }, null, 2)
      if (text !== lastText) {
        const file = dataPaths(api.settings.projectDir).state.aiDiscovery
        await ensureDir(dataPaths(api.settings.projectDir).root)
        await writeFileAtomic(file, `${text}\n`)
        lastText = text
      }
      return endpoint
    } catch {
      return null
    }
  }
}
