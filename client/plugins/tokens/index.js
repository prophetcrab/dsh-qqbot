import { registerTab } from '../../runtime/tab-registry.js'
import { useTokensTab } from './TokensTab.js'

registerTab({
  id: 'tokens',
  labelKey: 'tabTokens',
  order: 8,
  use(panel) {
    return useTokensTab(panel)
  },
  handlers: {},
})
