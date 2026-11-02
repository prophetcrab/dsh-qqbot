import { useLogs, loadLogs, renderLogs } from './LogsTab.js'

export const id = 'logs'
export const labelKey = 'tabLogs'
export const handlers = { loadLogs }

export function use(panel) {
  useLogs(panel)
  return () => renderLogs(panel)
}
