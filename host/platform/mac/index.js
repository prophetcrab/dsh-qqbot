/**
 * Public surface of the macOS host platform layer.
 *
 * Services and plugins import from here (or from a specific module) and never
 * from `node:child_process`/`node:fs` directly, which keeps platform code
 * isolated and testable.
 */

export * from './paths.js'
export * from './process.js'
export * from './http.js'
export * from './capabilities.js'
