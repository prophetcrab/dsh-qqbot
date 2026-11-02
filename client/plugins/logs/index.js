import { registerTab } from '../../runtime/tab-registry.js'
import { useLogs, loadLogs, renderLogs } from './LogsTab.js'

registerTab({
  id: 'logs',
  labelKey: 'tabLogs',
  order: 6,
  use(panel) {
    useLogs(panel)
    return () => renderLogs(panel)
  },
  handlers: {
    loadLogs,
  },
})
