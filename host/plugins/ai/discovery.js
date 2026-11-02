/**
 * Publish the local AI bridge endpoint for the Koishi `ai-chat` plugin by
 * updating `<projectDir>/data/ai.json`. Retried on every status read; a write
 * failure never breaks the panel.
 */

import { join } from 'node:path'
import { ensureDir, writeFileAtomic } from '../../platform/mac/index.js'

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
        const dataDir = join(api.settings.projectDir, 'data')
        await ensureDir(dataDir)
        await writeFileAtomic(join(dataDir, 'ai.json'), `${text}\n`)
        lastText = text
      }
      return endpoint
    } catch {
      return null
    }
  }
}
