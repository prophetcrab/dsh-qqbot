/**
 * Shared test helpers for the host test suite: a minimal fake Cordis context,
 * a temp project directory and an in-memory route invoker.
 */

import { EventEmitter } from 'node:events'
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apply } from '../../index.js'

/** Every route path that existed before the host refactor. */
export const LEGACY_ROUTE_PATHS = [
  '/qqbot/status',
  '/qqbot/features',
  '/qqbot/features/run',
  '/qqbot/access',
  '/qqbot/contacts',
  '/qqbot/napcat/login',
  '/qqbot/napcat/qr',
  '/qqbot/napcat/qr/refresh',
  '/qqbot/messages',
  '/qqbot/persona/presets',
  '/qqbot/persona/presets/save',
  '/qqbot/persona/presets/load',
  '/qqbot/persona/presets/delete',
  '/qqbot/persona',
  '/qqbot/persona/save',
  '/qqbot/ai/settings',
  '/qqbot/profiles',
  '/qqbot/profiles/save',
  '/qqbot/profiles/delete',
  '/qqbot/ai/last-prompt',
  '/qqbot/ai/status',
  '/qqbot/ai/chat',
  '/qqbot/setup',
  '/qqbot/setup/koishi',
  '/qqbot/setup/full',
  '/qqbot/logs',
  '/qqbot/napcat/install',
  '/qqbot/napcat/configure',
  '/qqbot/napcat/start',
  '/qqbot/napcat/stop',
  '/qqbot/koishi/install-deps',
  '/qqbot/koishi/start',
  '/qqbot/koishi/stop',
  '/qqbot/koishi/restart',
  '/qqbot/all/start',
  '/qqbot/all/stop',
  '/qqbot/koishi/plugins',
  '/qqbot/koishi/plugins/toggle',
  '/qqbot/koishi/plugins/install',
  '/qqbot/koishi/plugins/uninstall',
]

export const LEGACY_TOOL_NAMES = [
  'qqbot_status',
  'qqbot_control',
  'qqbot_configure',
  'qqbot_plugin',
  'qqbot_access',
  'qqbot_logs',
]

export const BUILTIN_FEATURE_IDS = ['overview', 'lifecycle', 'configuration', 'koishi-plugins', 'access']

/** Minimal fake Cordis context that records host contributions. */
export function createFakeContext() {
  const routes = new Map()
  const tools = new Map()
  const prompts = []
  let service = null
  const ctx = {
    logger: () => ({ info() {}, warn() {}, error() {}, debug() {} }),
    provide(serviceName) {
      this.provided = serviceName
    },
    set(serviceName, value) {
      if (serviceName === 'qqbot') service = value
    },
    get() {
      return undefined
    },
    on() {
      return () => {}
    },
    effect(factory) {
      const result = factory()
      return typeof result === 'function' ? result : () => {}
    },
    inject(_names, callback) {
      callback(ctx)
    },
    webServer: {
      register({ path, handler }) {
        routes.set(path, handler)
        return () => routes.delete(path)
      },
    },
    tools: {
      register(tool) {
        tools.set(tool.name, tool)
        return () => tools.delete(tool.name)
      },
    },
    systemPrompt: {
      section(section) {
        prompts.push(section)
        return () => {}
      },
    },
  }
  return { ctx, routes, tools, prompts, getService: () => service }
}

/**
 * Create a temp Koishi project dir plus load the full host against it.
 * Bootstrap is disabled so tests never install or start anything.
 */
export async function loadHost(t) {
  const projectDir = await mkdtemp(join(tmpdir(), 'dsh-qqbot-host-'))
  await mkdir(join(projectDir, 'data'), { recursive: true })
  t.after(() => rm(projectDir, { recursive: true, force: true }))
  const fake = createFakeContext()
  await apply(fake.ctx, { projectDir, bootstrap: false })
  const service = fake.getService()
  return { ...fake, projectDir, host: { kernel: service?.kernel } }
}

/**
 * Invoke one registered route handler with a fake Node request/response.
 * Resolves with `{ status, headers, body }`.
 */
export function invokeRoute(handler, { method = 'GET', url = '/', body } = {}) {
  return new Promise((resolvePromise, reject) => {
    const req = new EventEmitter()
    req.method = method
    req.url = url
    req.destroy = () => {}
    const res = {
      headersSent: false,
      status: null,
      headers: null,
      writeHead(status, headers) {
        this.status = status
        this.headers = headers
        this.headersSent = true
      },
      end(payload) {
        let parsed = null
        if (payload !== undefined && payload !== null) {
          const text = Buffer.isBuffer(payload) ? payload.toString('utf8') : String(payload)
          try {
            parsed = JSON.parse(text)
          } catch {
            parsed = text
          }
        }
        resolvePromise({ status: this.status, headers: this.headers, body: parsed })
      },
    }
    try {
      handler(req, res)
    } catch (error) {
      reject(error)
      return
    }
    setImmediate(() => {
      if (body !== undefined) req.emit('data', Buffer.from(body))
      req.emit('end')
    })
  })
}
