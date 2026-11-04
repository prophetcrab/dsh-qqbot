/**
 * Docker backend contract tests: compose generation, OneBot host URL rewrite,
 * lifecycle commands and failure surfaces. Docker is always faked; nothing is
 * pulled or started.
 */

import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { apply } from '../../index.js'
import { DockerNapcatManager } from '../../host/services/napcat/docker.js'
import { NapcatManager } from '../../host/services/napcat/index.js'
import { resolveSettings } from '../../host/platform/mac/index.js'
import { createFakeContext } from './helpers.js'

const noopLogger = { info() {}, warn() {}, error() {} }

const CONTAINER_RUNNING = 'true|container-id'

/** Settings pointing at a throw-away data directory. */
function makeSettings(dir, overrides = {}) {
  return resolveSettings({
    projectDir: dir,
    napcatBackend: 'docker',
    dockerNapcatDataDir: join(dir, 'napcat-docker'),
    koishiPort: 5140,
    napcatPort: 6099,
    ...overrides,
  })
}

/**
 * Create a manager with a scripted `docker` executor.
 * `handler(file, args, options)` returns the execFile-style result.
 */
async function makeManager(t, handler, { http, settings } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-qqbot-docker-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const resolved = settings ?? makeSettings(dir)
  const calls = []
  const run = async (file, args, options) => {
    calls.push([file, ...args])
    return handler(file, args, options, calls)
  }
  const manager = new DockerNapcatManager({
    settings: resolved,
    logger: noopLogger,
    deps: { run, http: http ?? (async () => ({ ok: false, status: 0, data: null })) },
  })
  return { manager, calls, dir, settings: resolved }
}

const defaultHandler = () => ({ code: 1, stdout: '', stderr: 'not found' })

test('docker backend: compose file pins image, ports, volumes and reverse-WS URL', async (t) => {
  const { manager, dir } = await makeManager(t, defaultHandler)
  await manager.ensureCompose()
  const composePath = join(dir, 'napcat-docker', 'compose.yaml')
  const compose = await readFile(composePath, 'utf8')
  assert.match(compose, /image: "mlikiowa\/napcat-docker:latest"/u)
  assert.match(compose, /container_name: "dsh-qqbot-napcat"/u)
  assert.match(compose, /ONEBOT_URL: "ws:\/\/host\.docker\.internal:5140\/onebot"/u)
  assert.match(compose, /"127\.0\.0\.1:6099:6099"/u)
  assert.match(compose, /data\/napcat-config:\/app\/napcat\/config/u)
  assert.match(compose, /data\/qq:\/app\/\.config\/QQ/u)
  assert.match(compose, /data\/napcat-cache:\/app\/napcat\/cache/u)
  assert.match(compose, /MODE: "reverse_ws"/u)

  const token = (await readFile(join(dir, 'napcat-docker', 'webui-token.txt'), 'utf8')).trim()
  assert.match(token, /^[0-9a-f]{36}$/u)
  assert.match(compose, new RegExp(`WEBUI_TOKEN: "${token}"`, 'u'))

  // Re-running keeps the same token and does not rewrite the file.
  await manager.ensureCompose()
  assert.equal((await readFile(composePath, 'utf8')), compose)
})

test('docker backend: configure writes the container-to-host OneBot URL', async (t) => {
  const { manager, dir } = await makeManager(t, defaultHandler)
  const configDir = join(dir, 'napcat-docker', 'data', 'napcat-config')
  await manager.ensureCompose()
  const accountPath = join(configDir, 'onebot11_12345.json')
  await writeFile(accountPath, JSON.stringify({
    network: { websocketClients: [] },
  }), 'utf8')

  await manager.refresh()
  const result = await manager.configure()
  assert.equal(result.ok, true)
  const written = JSON.parse(await readFile(accountPath, 'utf8'))
  assert.equal(written.network.websocketClients[0].url, 'ws://host.docker.internal:5140/onebot')
  assert.equal(written.network.websocketClients[0].name, 'koishi')
})

test('docker backend: start runs compose up and reports the login state', async (t) => {
  let running = false
  const handler = (file, args) => {
    if (args[0] === 'image') return { code: 1, stdout: '', stderr: 'no image' }
    if (args[0] === 'inspect') {
      return running
        ? { code: 0, stdout: CONTAINER_RUNNING, stderr: '' }
        : { code: 1, stdout: '', stderr: 'no such container' }
    }
    if (args.includes('up')) {
      running = true
      return { code: 0, stdout: '', stderr: '' }
    }
    return { code: 1, stdout: '', stderr: 'unexpected' }
  }
  const http = async (url) => {
    if (url.includes('/api/auth/login')) return { ok: true, status: 200, data: { data: { Credential: 'cred' } } }
    if (url.includes('/CheckLoginStatus')) return { ok: true, status: 200, data: { data: { isLogin: true } } }
    if (url.includes('/GetQQLoginInfo')) return { ok: true, status: 200, data: { data: { uin: '12345', nick: '机器人' } } }
    return { ok: false, status: 404, data: null }
  }
  const { manager, calls } = await makeManager(t, handler, { http })
  const result = await manager.start({ timeoutMs: 1000 })
  assert.equal(result.ok, true)
  assert.equal(result.loggedIn, true)
  assert.equal(result.qq, '12345')
  assert.ok(calls.some((call) => call.includes('compose') && call.includes('up') && call.includes('-d')))
})

test('docker backend: stop uses docker compose stop and reports the final state', async (t) => {
  let running = true
  const handler = (file, args) => {
    if (args[0] === 'inspect') {
      return running
        ? { code: 0, stdout: CONTAINER_RUNNING, stderr: '' }
        : { code: 0, stdout: 'false|container-id', stderr: '' }
    }
    if (args.includes('stop')) {
      running = false
      return { code: 0, stdout: '', stderr: '' }
    }
    return { code: 1, stdout: '', stderr: 'unexpected' }
  }
  const { manager, calls } = await makeManager(t, handler)
  const result = await manager.stop()
  assert.equal(result.ok, true)
  assert.ok(calls.some((call) => call.includes('compose') && call.includes('stop')))
})

test('docker backend: stop succeeds when compose exits non-zero but the container stopped', async (t) => {
  let running = true
  const handler = (file, args) => {
    if (args[0] === 'inspect') {
      return running
        ? { code: 0, stdout: CONTAINER_RUNNING, stderr: '' }
        : { code: 0, stdout: 'false|container-id', stderr: '' }
    }
    if (args.includes('stop')) {
      running = false
      return { code: 1, stdout: '', stderr: 'Container dsh-qqbot-napcat Stopping' }
    }
    return { code: 1, stdout: '', stderr: 'unexpected' }
  }
  const { manager } = await makeManager(t, handler)
  const result = await manager.stop()
  assert.equal(result.ok, true)
  assert.match(result.message, /已停止/u)
})

test('docker backend: install pulls the image when it is missing', async (t) => {
  const pulled = []
  const handler = (file, args) => {
    if (args[0] === 'image') return { code: 1, stdout: '', stderr: 'no image' }
    if (args.includes('pull')) {
      pulled.push(args)
      return { code: 0, stdout: '', stderr: '' }
    }
    return { code: 1, stdout: '', stderr: 'unexpected' }
  }
  const { manager } = await makeManager(t, handler, {
    http: async () => ({ ok: false, status: 0, data: null }),
  })
  const result = await manager.install()
  assert.equal(result.ok, true)
  assert.equal(pulled.length, 1)
})

test('docker backend: missing docker surfaces an actionable error', async (t) => {
  const handler = () => ({ code: 1, stdout: '', stderr: 'docker: command not found', error: 'spawn docker ENOENT' })
  const { manager } = await makeManager(t, handler)
  const result = await manager.start({ timeoutMs: 1000 })
  assert.equal(result.ok, false)
  assert.match(result.message, /docker/iu)
})

test('docker settings resolve data dir, image and host defaults', () => {
  const dir = 'C:\\tmp\\project'
  const settings = makeSettings(dir)
  assert.equal(settings.napcatBackend, 'docker')
  assert.equal(settings.dockerNapcatDataDir, join(dir, 'napcat-docker'))
  assert.equal(settings.dockerNapcatImage, 'mlikiowa/napcat-docker:latest')
  assert.equal(settings.dockerNapcatHost, 'host.docker.internal')
  const custom = resolveSettings({
    projectDir: dir,
    napcatBackend: 'docker',
    dockerNapcatImage: 'example/napcat:1.2.3',
    dockerNapcatHost: 'gateway.local',
    dockerNapcatContainer: 'my-napcat',
  })
  assert.equal(custom.dockerNapcatImage, 'example/napcat:1.2.3')
  assert.equal(custom.dockerNapcatHost, 'gateway.local')
  assert.equal(custom.dockerNapcatContainer, 'my-napcat')
})

test('host wires the backend selected by napcatBackend', async (t) => {
  const dockerDir = await mkdtemp(join(tmpdir(), 'dsh-qqbot-host-docker-'))
  const localDir = await mkdtemp(join(tmpdir(), 'dsh-qqbot-host-local-'))
  t.after(async () => {
    await rm(dockerDir, { recursive: true, force: true })
    await rm(localDir, { recursive: true, force: true })
  })

  const docker = createFakeContext()
  await apply(docker.ctx, { projectDir: dockerDir, bootstrap: false, napcatBackend: 'docker' })
  assert.ok(docker.getService().kernel.get('napcat') instanceof DockerNapcatManager)

  const local = createFakeContext()
  await apply(local.ctx, { projectDir: localDir, bootstrap: false, napcatBackend: 'local' })
  assert.ok(local.getService().kernel.get('napcat') instanceof NapcatManager)
})
