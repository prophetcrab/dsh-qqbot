import { useMessages, loadMessages, renderMessages } from './MessagesTab.js'

export const id = 'messages'
export const labelKey = 'tabMessages'
export const handlers = { loadMessages }

export function use(panel) {
  useMessages(panel)
  return () => renderMessages(panel)
}
