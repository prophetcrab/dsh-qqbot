/**
 * macOS filesystem primitives: the shared implementation plus `findCommand`.
 */

import { run } from './process.js'

export * from '../common/paths.js'

/** Resolve an executable from PATH without a shell; returns null when missing. */
export async function findCommand(name) {
  const result = await run('/usr/bin/which', [name], { timeoutMs: 5000 })
  const path = result.stdout.trim().split('\n')[0]
  return result.code === 0 && path !== '' ? path : null
}
