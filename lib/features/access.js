/**
 * Access-control feature: a read-only summary of who may talk to the bot and
 * where the bot may send messages. The full editor lives in the panel's
 * Access tab; the policy file is enforced by the Koishi access-control plugin.
 */

import { accessPath, readPolicy, summarizePolicy } from '../access.js'

/** @param {import('../features.js').FeatureDeps} deps */
async function status(deps) {
  const file = accessPath(deps.settings)
  const { policy, exists, error } = await readPolicy(file)
  return {
    ...summarizePolicy(policy),
    exists,
    error: error ?? null,
    path: file,
  }
}

export default {
  id: 'access',
  title: { zh: '权限管理', en: 'Access control' },
  description: {
    zh: '管理机器人接受哪些群聊的消息、只向哪些群聊发送，以及是否进入「安静模式」。',
    en: 'Control which groups may message the bot, which groups it may send to, and quiet mode.',
  },
  status,
  actions: [],
}
