/**
 * Agent tool definitions: status snapshot, lifecycle control and log tail.
 */

import { textOutput } from '../../kernel/http.js'
import { renderStatus } from './render.js'

/** @param {object} api plugin API */
export function createTools(api) {
  return [statusTool(api), controlTool(api), logsTool(api)]
}

function statusTool(api) {
  return {
    name: 'qqbot_status',
    description: 'Read the QQ bot control center status: QQ/NapCat/Koishi installation, running state, bot online state, and Koishi plugin counts.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    output: textOutput(),
    execute: async () => {
      const snapshot = await api.kernel.statusSnapshot()
      return { text: renderStatus(snapshot) }
    },
  }
}

function controlTool(api) {
  const napcat = api.get('napcat')
  const koishi = api.get('koishi')
  return {
    name: 'qqbot_control',
    description: 'Start, stop or restart the local QQ bot stack (NapCat and/or Koishi). Use qqbot_status first to see the current state.',
    parameters: {
      type: 'object',
      properties: {
        target: { type: 'string', enum: ['all', 'napcat', 'koishi'], description: 'Which part to control.' },
        action: { type: 'string', enum: ['start', 'stop', 'restart'], description: 'Operation to perform.' },
      },
      required: ['target', 'action'],
      additionalProperties: false,
    },
    output: textOutput(),
    execute: async (args) => {
      const target = String(args?.target ?? 'all')
      const action = String(args?.action ?? 'start')
      if (!['all', 'napcat', 'koishi'].includes(target)) throw new Error('target must be all|napcat|koishi')
      if (!['start', 'stop', 'restart'].includes(action)) throw new Error('action must be start|stop|restart')
      const result = await api.serialize(async () => {
        if (target === 'all') {
          const feature = action === 'stop' ? 'all-stop' : 'all-start'
          const outcome = await api.kernel.featureRegistry.run('lifecycle', feature, {})
          return { ok: outcome?.ok !== false, message: outcome?.message ?? '', steps: outcome?.steps ?? [] }
        }
        if (action === 'restart') {
          if (target !== 'koishi') throw new Error('restart is only supported for target=koishi')
          return koishi.restart()
        }
        const run = action === 'start'
          ? (target === 'napcat' ? () => napcat.start() : () => koishi.start())
          : (target === 'napcat' ? () => napcat.stop() : () => koishi.stop())
        return run()
      })
      return { text: `${result?.ok === false ? '失败' : '完成'}${result?.message ? `：${result.message}` : ''}` }
    },
  }
}

function logsTool(api) {
  const koishi = api.get('koishi')
  return {
    name: 'qqbot_logs',
    description: 'Read the tail of the managed Koishi process log.',
    parameters: {
      type: 'object',
      properties: {
        source: { type: 'string', enum: ['koishi', 'napcat'], description: 'Log source.' },
        lines: { type: 'number', description: 'How many trailing lines (1-2000).' },
      },
      additionalProperties: false,
    },
    output: textOutput(),
    execute: async (args) => {
      const source = String(args?.source ?? 'koishi')
      const lines = clampLines(args?.lines, api.settings.logLines)
      if (source === 'napcat') return { text: 'NapCat 日志请打开 NapCat WebUI → 日志 查看' }
      const tail = await koishi.logs(lines)
      return { text: tail.length === 0 ? '暂无日志（Koishi 可能不是由本插件启动）' : tail.join('\n') }
    },
  }
}

function clampLines(value, fallback) {
  const number = Number(value)
  if (!Number.isInteger(number)) return fallback
  return Math.min(2000, Math.max(1, number))
}
