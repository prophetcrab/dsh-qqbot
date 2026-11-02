import { registerTab } from '../../runtime/tab-registry.js'
import { useMessages, loadMessages, renderMessages } from './MessagesTab.js'

registerTab({
  id: 'messages',
  labelKey: 'tabMessages',
  order: 2,
  use(panel) {
    useMessages(panel)
    return () => renderMessages(panel)
  },
  handlers: {
    loadMessages,
  },
})
