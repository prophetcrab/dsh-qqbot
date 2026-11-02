/**
 * Access agent tool: read or replace the access policy.
 */

import { textOutput } from '../../kernel/http.js'
import { describePolicySummary } from '../../services/access/index.js'

/** @param {object} api plugin API @param {object} access access service */
export function tools(api, access) {
  return [
    {
      name: 'qqbot_access',
      description: 'Read or replace the QQ bot access policy: which groups may message the bot (inbound), which groups it may send to (outbound), and quiet mode. The policy is enforced by the Koishi access-control plugin and written to the Koishi project data/access.json.',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['get', 'set'], description: 'Read the current policy or replace it.' },
          policy: { type: 'object', description: 'Full policy object when action=set (inbound/outbound modes, ids, quiet).' },
        },
        required: ['action'],
        additionalProperties: false,
      },
      output: textOutput(),
      execute: async (args) => {
        if (String(args?.action ?? 'get') === 'get') {
          const { policy, exists } = await access.read()
          const summary = access.summarizePolicy(policy)
          return { text: describePolicySummary(summary, access.path, exists) }
        }
        const raw = args?.policy
        if (raw === null || typeof raw !== 'object') throw new Error('policy object is required for action=set')
        const normalized = access.normalizePolicy(raw, { stamp: true })
        await api.serialize(() => access.write(normalized))
        return { text: `已更新权限策略：${describePolicySummary(access.summarizePolicy(normalized), access.path, true)}` }
      },
    },
  ]
}
