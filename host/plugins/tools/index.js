/**
 * Tools plugin: cross-cutting agent tools (status/control/logs) and the
 * system-prompt section that documents them.
 *
 * Tool definitions live in tools.js; this file is manifest + registration only.
 */

import { createTools } from './tools.js'

export const name = 'tools'
export const version = '1.0.0'

const SYSTEM_PROMPT = 'QQ bot control center: qqbot_status reads the local QQ/NapCat/Koishi state; qqbot_control starts/stops NapCat or Koishi; qqbot_configure writes the OneBot reverse WebSocket config; qqbot_plugin lists/installs/enables/uninstalls Koishi plugins; qqbot_logs tails the managed Koishi process. '
  + 'NapCat is installed from the bundled offline payload on macOS; logging into QQ still needs the user to scan the QR code. '
  + 'Never expose tokens; the panel and tools mask secrets.'

export default {
  id: 'qqbot-tools',
  name,
  version,
  inject: ['napcat', 'koishi', 'koishiPlugins', 'lifecycle'],
  provides: [],
  description: 'Agent tools for status, lifecycle control and log tailing.',
  async apply(api) {
    for (const tool of createTools(api)) api.registerTool(tool)
    api.registerSystemPrompt({ name: 'tool:qqbot', order: 2380, text: SYSTEM_PROMPT })
  },
}
