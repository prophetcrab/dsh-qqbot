import { registerTab } from '../../runtime/tab-registry.js'
import { useAccess, loadAccess, saveAccess, renderAccess } from './AccessTab.js'

registerTab({
  id: 'access',
  labelKey: 'tabAccess',
  order: 3,
  use(panel) {
    useAccess(panel)
    return () => renderAccess(panel)
  },
  handlers: {
    loadAccess,
    saveAccess,
  },
})
