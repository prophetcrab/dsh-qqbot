/**
 * NapCat agent tool: write the OneBot reverse WebSocket configuration.
 */

import { textOutput } from '../../kernel/http.js'

/** @param {object} api plugin API @param {object} napcat NapcatManager */
export function tools(api, napcat) {
  return [
    {
      name: 'qqbot_configure',
      description: 'Write the OneBot reverse WebSocket client into every NapCat account config and hot-apply it through the NapCat WebUI API. Run this after installing NapCat and logging in.',
      parameters: {
        type: 'object',
        properties: {
          uin: { type: 'string', description: 'Only configure this QQ account number; omit for every detected account.' },
        },
        additionalProperties: false,
      },
      output: textOutput(),
      execute: async (args) => {
        const uin = typeof args?.uin === 'string' && args.uin.trim() !== '' ? args.uin.trim() : ''
        const result = await api.serialize(() => napcat.configure(uin === '' ? {} : { uin }))
        return { text: result?.message ?? (result?.ok ? '配置已写入' : '配置失败') }
      },
    },
  ]
}
