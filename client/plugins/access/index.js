import { useAccess, loadAccess, saveAccess, renderAccess } from './AccessTab.js'

export const id = 'access'
export const labelKey = 'tabAccess'
export const handlers = { loadAccess, saveAccess }

export function use(panel) {
  useAccess(panel)
  return () => renderAccess(panel)
}
