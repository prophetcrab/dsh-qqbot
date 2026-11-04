/**
 * Public surface of the Windows host platform layer.
 *
 * Services and plugins import from the selected platform facade
 * (`host/platform/index.js`) or a specific module, never from
 * `node:child_process`/`node:fs` directly, which keeps platform code isolated
 * and testable.
 */

export * from './paths.js'
export * from './process.js'
export * from './http.js'
export * from './capabilities.js'

export * from './data-paths.js'
