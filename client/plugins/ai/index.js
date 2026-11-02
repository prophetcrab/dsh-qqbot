import { registerTab } from '../../runtime/tab-registry.js'
import { useAi, renderAiTab } from './AiTab.js'

registerTab({
  id: 'ai',
  labelKey: 'tabAi',
  order: 1,
  use(panel) {
    return useAi(panel)
  },
  handlers: {},
})
