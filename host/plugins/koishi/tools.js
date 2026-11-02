/**
 * Koishi agent tool: list/install/uninstall/enable/disable project plugins.
 */

import { textOutput } from '../../kernel/http.js'

/** @param {object} api plugin API @param {object} plugins KoishiPluginsManager */
export function tools(api, plugins) {
  return [
    {
      name: 'qqbot_plugin',
      description: 'Manage Koishi plugins in the local Koishi project: list them, install from npm, uninstall, or enable/disable one. Changes are written to koishi.yml; pass restart=true to restart Koishi afterwards.',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['list', 'install', 'uninstall', 'enable', 'disable'], description: 'Plugin operation.' },
          name: { type: 'string', description: 'npm spec for install, or the koishi.yml plugin key for uninstall/enable/disable.' },
          restart: { type: 'boolean', description: 'Restart Koishi after the change.' },
        },
        required: ['action'],
        additionalProperties: false,
      },
      output: textOutput(),
      execute: async (args) => {
        const action = String(args?.action ?? 'list')
        if (action === 'list') {
          const list = await plugins.list()
          return { text: list.map((plugin) => `${plugin.enabled ? '✓' : '✗'} ${plugin.key}${plugin.version ? ` @${plugin.version}` : ''}`).join('\n') || '没有检测到插件' }
        }
        const restart = args?.restart === true
        const spec = typeof args?.name === 'string' ? args.name.trim() : ''
        if (spec === '') throw new Error('name is required')
        const result = await api.serialize(async () => {
          if (action === 'install') return plugins.install(spec, { restart })
          if (action === 'uninstall') return plugins.uninstall(spec, { restart })
          return plugins.toggle(spec, action === 'enable', { restart })
        })
        return { text: result?.ok === false ? `失败：${result.error ?? ''}` : `${action} 完成${result?.key ? `：${result.key}` : ''}${restart ? '（已重启 Koishi）' : ''}` }
      },
    },
  ]
}
