/**
 * Locale namespace and dictionaries. `en` is the fallback DSH locale; `zh`
 * mirrors every key so switching language never falls back mid-panel.
 */
import { en } from './locale/en.js'
import { zh } from './locale/zh.js'

export const NS = 'qqbot'
export const dictionaries = { en, zh }
export { en, zh }
