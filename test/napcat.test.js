/**
 * Unit tests for the NapCat manager.
 *
 * Every test runs against temporary directories and injected fakes: no real QQ
 * process is started or stopped, no real NapCat config is read or written and
 * no network request is made.
 */

import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import {
  NapcatManager,
  listWebsocketClients,
  maskOnebotConfig,
  upsertWebsocketClient,
} from '../lib/napcat.js'
import { resolveSettings } from '../lib/platform.js'
import { maskToken, sha256Hex } from '../lib/util.js'

const noopLogger = { info() {}, warn() {}, error() {} }

/** Resolved settings pointing at a throw-away installer directory. */
function makeSettings(overrides = {}) {
  return resolveSettings({
    koishiPort: 5140,
    reversePath: '/onebot',
    installerDir: join(tmpdir(), `dsh-qqbot-test-installer-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
    ...overrides,
  })
}

/** Fake platform seams; individual tests override what they need. */
function fakePlatform(overrides = {}) {
  return {
    detectNapcat: () => ({
      installed: false,
      installDir: null,
      configDir: null,
      version: null,
      accounts: [],
      webui: { port: 6099, token: null },
    }),
    detectQq: () => ({ installed: true, path: '/Applications/QQ.app', version: '9.9.9' }),
    findProcess: () => ({ running: false, pid: null }),
    ...overrides,
  }
}

/** Register a temp dir cleanup on the test context. */
async function makeTempDir(t) {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-qqbot-napcat-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  return dir
}

/** A realistic empty `onebot11_<uin>.json` payload. */
function emptyOnebotConfig() {
  return {
    network: {
      httpServers: [],
      httpSseServers: [],
      httpClients: [],
      websocketServers: [],
      websocketClients: [],
      plugins: [],
    },
    musicSignUrl: '',
    enableLocalFile2Url: false,
    parseMultMsg: false,
    imageDownloadProxy: '',
    timeout: {
      baseTimeout: 10000,
      uploadSpeedKBps: 256,
      downloadSpeedKBps: 256,
      maxTimeout: 1800000,
    },
  }
}

/** Construct a manager with fakes pre-wired. */
function makeManager({ settings = makeSettings(), platform = fakePlatform(), logger = noopLogger, deps = {} } = {}) {
  return new NapcatManager({ settings, logger, deps: { platform, ...deps } })
}

// ------------------------------------------------------------ pure functions --

test('upsertWebsocketClient adds the koishi client to an empty config', () => {
  const original = emptyOnebotConfig()
  const { config, changed } = upsertWebsocketClient(original, {
    url: 'ws://127.0.0.1:5140/onebot',
    token: 'tok-1',
  })
  assert.equal(changed, true)
  assert.equal(config.network.websocketClients.length, 1)
  assert.deepEqual(config.network.websocketClients[0], {
    name: 'koishi',
    enable: true,
    url: 'ws://127.0.0.1:5140/onebot',
    messagePostFormat: 'array',
    reportSelfMessage: false,
    reconnectInterval: 5000,
    token: 'tok-1',
    debug: false,
    heartInterval: 30000,
  })
  // deep copy: the input stays untouched
  assert.deepEqual(original.network.websocketClients, [])
})

test('upsertWebsocketClient updates the same-name client and keeps other clients', () => {
  const original = emptyOnebotConfig()
  original.network.websocketClients.push(
    { name: 'koishi', enable: false, url: 'ws://old:1/x', token: 'old', verifyCertificate: true },
    { name: 'other', enable: true, url: 'ws://127.0.0.1:6000/onebot', token: 'other-token' },
  )
  const snapshot = JSON.parse(JSON.stringify(original))

  const { config, changed } = upsertWebsocketClient(original, {
    url: 'ws://127.0.0.1:5140/onebot',
    token: 'new-token',
  })

  assert.equal(changed, true)
  assert.equal(config.network.websocketClients.length, 2)
  const koishi = config.network.websocketClients.find((client) => client.name === 'koishi')
  assert.equal(koishi.url, 'ws://127.0.0.1:5140/onebot')
  assert.equal(koishi.token, 'new-token')
  assert.equal(koishi.enable, true)
  // unknown keys of an existing client are preserved
  assert.equal(koishi.verifyCertificate, true)
  assert.deepEqual(
    config.network.websocketClients.find((client) => client.name === 'other'),
    snapshot.network.websocketClients[1],
  )
  assert.deepEqual(original, snapshot)
})

test('upsertWebsocketClient is idempotent on an already-configured file', () => {
  const options = { url: 'ws://127.0.0.1:5140/onebot', token: 'tok-1' }
  const first = upsertWebsocketClient(emptyOnebotConfig(), options)
  const second = upsertWebsocketClient(first.config, options)
  assert.equal(second.changed, false)
  assert.equal(second.config.network.websocketClients.length, 1)
  assert.deepEqual(second.config, first.config)
})

test('upsertWebsocketClient rejects programmer errors with TypeError', () => {
  assert.throws(() => upsertWebsocketClient(null, { url: 'ws://x' }), TypeError)
  assert.throws(() => upsertWebsocketClient({}, { url: '' }), TypeError)
})

test('listWebsocketClients exposes name/url/enable only', () => {
  const config = {
    network: {
      websocketClients: [
        { name: 'koishi', url: 'ws://a', enable: true, token: 'secret' },
        { url: 'ws://b' },
        'not-a-client',
      ],
    },
  }
  assert.deepEqual(listWebsocketClients(config), [
    { name: 'koishi', url: 'ws://a', enable: true },
    { name: '', url: 'ws://b', enable: true },
  ])
  assert.deepEqual(listWebsocketClients(null), [])
})

test('maskOnebotConfig never leaks tokens', () => {
  const original = emptyOnebotConfig()
  original.network.websocketClients.push({
    name: 'koishi',
    enable: true,
    url: 'ws://127.0.0.1:5140/onebot',
    token: 'super-secret-token',
  })
  original.network.httpServers.push({ host: '127.0.0.1', port: 3000, token: 'http-secret' })

  const masked = maskOnebotConfig(original)
  const json = JSON.stringify(masked)
  assert.equal(json.includes('super-secret-token'), false)
  assert.equal(json.includes('http-secret'), false)
  assert.equal(masked.network.websocketClients[0].token, 'supe…')
  assert.equal(masked.network.httpServers[0].token, 'http…')
  assert.equal(masked.network.websocketClients[0].url, 'ws://127.0.0.1:5140/onebot')
  assert.equal(original.network.websocketClients[0].token, 'super-secret-token')
  assert.equal(maskOnebotConfig(null), null)
})

// ----------------------------------------------------------------- configure --

test('configure writes the koishi client and hot-applies it through the WebUI API', async (t) => {
  const dir = await makeTempDir(t)
  const configDir = join(dir, 'config')
  await mkdir(configDir, { recursive: true })
  const configPath = join(configDir, 'onebot11_123456.json')
  await writeFile(configPath, JSON.stringify(emptyOnebotConfig(), null, 2))
  await writeFile(join(configDir, 'webui.json'), JSON.stringify({ port: 6099, token: 'ui-token-abc' }))

  const calls = []
  const http = async (url, options = {}) => {
    calls.push({ url, options })
    if (url.endsWith('/api/auth/login')) {
      return { ok: true, status: 200, data: { code: 0, data: { Credential: 'cred-1' } } }
    }
    if (url.endsWith('/api/OB11Config/SetConfig')) {
      return { ok: true, status: 200, data: { code: 0 } }
    }
    return { ok: false, status: 404, data: null }
  }
  const logs = []
  const logger = {
    info: (...args) => logs.push(args.join(' ')),
    warn: (...args) => logs.push(args.join(' ')),
    error: (...args) => logs.push(args.join(' ')),
  }
  const manager = makeManager({
    settings: makeSettings({ napcatToken: 'koishi-side-token' }),
    logger,
    platform: fakePlatform({
      detectNapcat: () => ({
        installed: true,
        installDir: dir,
        configDir,
        version: '4.18.41',
        accounts: [{ uin: '123456', configPath }],
        webui: { port: 6099, token: 'ui-token-abc' },
      }),
    }),
    deps: { http },
  })

  const result = await manager.configure()

  assert.equal(result.ok, true)
  assert.equal(result.accounts.length, 1)
  assert.equal(result.accounts[0].uin, '123456')
  assert.equal(result.accounts[0].path, configPath)
  assert.equal(result.accounts[0].changed, true)
  assert.equal(result.accounts[0].applied, true)
  assert.match(result.message, /热应用/)

  const written = JSON.parse(await readFile(configPath, 'utf8'))
  const client = written.network.websocketClients[0]
  assert.equal(client.name, 'koishi')
  assert.equal(client.url, 'ws://127.0.0.1:5140/onebot')
  assert.equal(client.token, 'koishi-side-token')
  assert.equal(client.enable, true)

  const login = calls.find((call) => call.url.endsWith('/api/auth/login'))
  assert.ok(login)
  assert.deepEqual(login.options.body, { hash: sha256Hex('ui-token-abc.napcat') })

  const setConfig = calls.find((call) => call.url.endsWith('/api/OB11Config/SetConfig'))
  assert.ok(setConfig)
  assert.equal(setConfig.options.headers.authorization, 'Bearer cred-1')
  assert.equal(typeof setConfig.options.body.config, 'string')
  const sent = JSON.parse(setConfig.options.body.config)
  assert.equal(sent.network.websocketClients[0].url, 'ws://127.0.0.1:5140/onebot')

  // The WebUI token must never be logged.
  assert.equal(JSON.stringify(logs).includes('ui-token-abc'), false)
})

test('configure writes the file and reports applied:false when the WebUI API fails', async (t) => {
  const dir = await makeTempDir(t)
  const configDir = join(dir, 'config')
  await mkdir(configDir, { recursive: true })
  const configPath = join(configDir, 'onebot11_123456.json')
  await writeFile(configPath, JSON.stringify(emptyOnebotConfig(), null, 2))
  await writeFile(join(configDir, 'webui.json'), JSON.stringify({ port: 6099, token: 'ui-token-abc' }))

  const http = async (url) => {
    if (url.endsWith('/api/auth/login')) {
      return { ok: true, status: 200, data: { code: 0, data: { Credential: 'cred-1' } } }
    }
    return { ok: false, status: 500, data: { code: -1 } }
  }
  const manager = makeManager({
    platform: fakePlatform({
      detectNapcat: () => ({
        installed: true,
        installDir: dir,
        configDir,
        version: '4.18.41',
        accounts: [{ uin: '123456', configPath }],
        webui: { port: 6099, token: 'ui-token-abc' },
      }),
    }),
    deps: { http },
  })

  const result = await manager.configure()
  assert.equal(result.ok, true)
  assert.equal(result.accounts[0].applied, false)
  assert.equal(result.accounts[0].changed, true)
  assert.equal(result.message, '已写入文件，重启 NapCat 生效')
  const written = JSON.parse(await readFile(configPath, 'utf8'))
  assert.equal(written.network.websocketClients[0].url, 'ws://127.0.0.1:5140/onebot')
})

test('configure returns a friendly error when the NapCat config dir is missing', async () => {
  const manager = makeManager({
    deps: {
      http: async () => {
        throw new Error('configure must not call the WebUI without a config dir')
      },
    },
  })
  const result = await manager.configure()
  assert.equal(result.ok, false)
  assert.equal(result.error, 'napcat-config-missing')
  assert.match(result.message, /配置目录/)
})

test('configure returns a friendly error for an unknown uin', async (t) => {
  const dir = await makeTempDir(t)
  const configDir = join(dir, 'config')
  await mkdir(configDir, { recursive: true })
  const manager = makeManager({
    platform: fakePlatform({
      detectNapcat: () => ({
        installed: true,
        installDir: dir,
        configDir,
        version: '4.18.41',
        accounts: [{ uin: '111', configPath: join(configDir, 'onebot11_111.json') }],
        webui: { port: 6099, token: 'ui-token-abc' },
      }),
    }),
  })
  const result = await manager.configure({ uin: '222' })
  assert.equal(result.ok, false)
  assert.equal(result.error, 'account-not-found')
  assert.match(result.message, /222/)
})

// -------------------------------------------------------------------- status --

test('status tolerates a missing NapCat installation without throwing', async () => {
  const manager = makeManager({
    settings: makeSettings({ installerDir: join(tmpdir(), 'dsh-qqbot-napcat-no-installer') }),
    platform: fakePlatform(),
    deps: {
      http: async () => {
        throw new Error('status must not probe the WebUI without a token')
      },
    },
  })
  const status = await manager.status()
  assert.equal(status.installed, false)
  assert.equal(status.installDir, null)
  assert.equal(status.configDir, null)
  assert.equal(status.running, false)
  assert.equal(status.pid, null)
  assert.equal(status.loggedIn, false)
  assert.equal(status.qq, null)
  assert.equal(status.nickname, null)
  assert.deepEqual(status.webui, { port: 6099, tokenMasked: null, reachable: false })
  assert.deepEqual(status.accounts, [])
  assert.equal(status.configApplied, false)
  assert.deepEqual(status.installer, { downloaded: false, appPath: null, version: null })
  assert.equal(status.error, undefined)
})

test('status reports installation, login and account config without leaking tokens', async (t) => {
  const dir = await makeTempDir(t)
  const configDir = join(dir, 'config')
  await mkdir(configDir, { recursive: true })
  const configPath = join(configDir, 'onebot11_123456.json')
  const config = emptyOnebotConfig()
  config.network.websocketClients.push({
    name: 'koishi',
    enable: true,
    url: 'ws://127.0.0.1:5140/onebot',
    token: 'ws-token-xyz',
  })
  await writeFile(configPath, JSON.stringify(config))
  await writeFile(join(configDir, 'webui.json'), JSON.stringify({ port: 6099, token: 'ui-token-abc' }))

  let loginCalls = 0
  const http = async (url) => {
    if (url.endsWith('/api/auth/login')) {
      loginCalls += 1
      return { ok: true, status: 200, data: { code: 0, data: { Credential: 'cred-status' } } }
    }
    if (url.endsWith('/api/QQLogin/CheckLoginStatus')) {
      return { ok: true, status: 200, data: { code: 0, data: { isLogin: true } } }
    }
    if (url.endsWith('/api/QQLogin/GetQQLoginInfo')) {
      return { ok: true, status: 200, data: { code: 0, data: { uin: '123456', nick: '小号' } } }
    }
    return { ok: false, status: 404, data: null }
  }
  const manager = makeManager({
    platform: fakePlatform({
      detectNapcat: () => ({
        installed: true,
        installDir: dir,
        configDir,
        version: '4.18.41',
        accounts: [{ uin: '123456', configPath }],
        webui: { port: 6099, token: 'ui-token-abc' },
      }),
      findProcess: () => ({ running: true, pid: 4321 }),
    }),
    deps: { http },
  })

  const status = await manager.status()
  assert.equal(status.installed, true)
  assert.equal(status.version, '4.18.41')
  assert.equal(status.running, true)
  assert.equal(status.pid, 4321)
  assert.equal(status.loggedIn, true)
  assert.equal(status.qq, '123456')
  assert.equal(status.nickname, '小号')
  assert.equal(status.webui.port, 6099)
  assert.equal(status.webui.tokenMasked, maskToken('ui-token-abc'))
  assert.equal(status.webui.reachable, true)
  assert.equal(status.accounts.length, 1)
  assert.equal(status.accounts[0].uin, '123456')
  assert.deepEqual(status.accounts[0].wsClients, [
    { name: 'koishi', url: 'ws://127.0.0.1:5140/onebot', enable: true },
  ])
  assert.equal(status.accounts[0].applied, true)
  assert.equal(status.configApplied, true)
  assert.equal(loginCalls, 1)

  const serialized = JSON.stringify(status)
  assert.equal(serialized.includes('ui-token-abc'), false)
  assert.equal(serialized.includes('ws-token-xyz'), false)
})

test('loginStatus caches the WebUI credential across calls', async (t) => {
  const dir = await makeTempDir(t)
  const configDir = join(dir, 'config')
  await mkdir(configDir, { recursive: true })
  await writeFile(join(configDir, 'webui.json'), JSON.stringify({ port: 6099, token: 'ui-token-abc' }))

  let loginCalls = 0
  let checkCalls = 0
  const http = async (url) => {
    if (url.endsWith('/api/auth/login')) {
      loginCalls += 1
      return { ok: true, status: 200, data: { code: 0, data: { Credential: 'cred-cache' } } }
    }
    if (url.endsWith('/api/QQLogin/CheckLoginStatus')) {
      checkCalls += 1
      return { ok: true, status: 200, data: { code: 0, data: { isLogin: true } } }
    }
    if (url.endsWith('/api/QQLogin/GetQQLoginInfo')) {
      return { ok: true, status: 200, data: { code: 0, data: { uin: '123456', nickname: '昵称' } } }
    }
    return { ok: false, status: 404, data: null }
  }
  const manager = makeManager({
    platform: fakePlatform({
      detectNapcat: () => ({
        installed: true,
        installDir: dir,
        configDir,
        version: '4.18.41',
        accounts: [],
        webui: { port: 6099, token: 'ui-token-abc' },
      }),
    }),
    deps: { http },
  })

  const first = await manager.loginStatus()
  const second = await manager.loginStatus()
  assert.deepEqual(first, { loggedIn: true, qq: '123456', nickname: '昵称' })
  assert.deepEqual(second, first)
  assert.equal(loginCalls, 1)
  assert.equal(checkCalls, 2)
})

// ----------------------------------------------------------------- installer --

test('downloadInstaller downloads and extracts the latest release', async (t) => {
  const installerDir = await makeTempDir(t)
  const downloads = []
  const runs = []
  const http = async (url, options = {}) => {
    assert.match(url, /api\.github\.com\/repos\/NapNeko\/NapCat-Mac-Installer\/releases\/latest/u)
    assert.equal(options.headers['user-agent'], 'dsh-qqbot')
    return {
      ok: true,
      status: 200,
      data: {
        tag_name: 'v1.2.3',
        assets: [
          { name: 'NapCatInstaller_1.2.3.zip', browser_download_url: 'https://example.invalid/NapCatInstaller.zip' },
        ],
      },
    }
  }
  const download = async (url, zipPath) => {
    downloads.push({ url, zipPath })
    await writeFile(zipPath, Buffer.from('fake-zip'))
  }
  const run = async (file, args) => {
    runs.push([file, ...args])
    if (file === '/usr/bin/ditto') {
      await mkdir(join(args[3], 'NapCatInstaller.app'), { recursive: true })
    }
    return { code: 0, stdout: '', stderr: '' }
  }
  const manager = makeManager({
    settings: makeSettings({ installerDir }),
    deps: { http, download, run },
  })

  const result = await manager.downloadInstaller()
  assert.equal(result.ok, true)
  assert.equal(result.version, '1.2.3')
  assert.equal(result.zipPath, join(installerDir, '1.2.3', 'NapCatInstaller.zip'))
  assert.equal(result.appPath, join(installerDir, '1.2.3', 'extracted', 'NapCatInstaller.app'))
  assert.equal(downloads.length, 1)
  assert.deepEqual(runs[0].slice(0, 4), ['/usr/bin/ditto', '-x', '-k', result.zipPath])

  const status = await manager.status()
  assert.deepEqual(status.installer, {
    downloaded: true,
    appPath: result.appPath,
    version: '1.2.3',
  })
})

test('downloadInstaller turns a failed GitHub request into a structured error', async () => {
  const manager = makeManager({
    deps: {
      http: async () => ({ ok: false, status: 500, data: null }),
      // Disable the system-curl fallback so the test never touches the network.
      run: async () => ({ code: 1, stdout: '', stderr: 'no network' }),
    },
  })
  const result = await manager.downloadInstaller()
  assert.equal(result.ok, false)
  assert.equal(result.error, 'github-api-failed')
  assert.match(result.message, /获取 NapCat 安装器发布信息失败/u)
})

test('install opens the downloaded installer and reports failures', async () => {
  const runs = []
  const manager = makeManager({
    deps: {
      run: async (file, args) => {
        runs.push([file, ...args])
        return { code: 0, stdout: '', stderr: '' }
      },
    },
  })

  manager.downloadInstaller = async () => ({
    ok: true,
    zipPath: '/tmp/NapCatInstaller.zip',
    appPath: '/tmp/extracted/NapCatInstaller.app',
    version: '1.2.3',
  })
  const installed = await manager.install()
  assert.equal(installed.ok, true)
  assert.equal(installed.version, '1.2.3')
  assert.equal(installed.appPath, '/tmp/extracted/NapCatInstaller.app')
  assert.match(installed.message, /安装器已打开/u)
  assert.deepEqual(runs, [['/usr/bin/open', '/tmp/extracted/NapCatInstaller.app']])

  manager.downloadInstaller = async () => ({ ok: false, error: 'github-api-failed', message: '获取失败' })
  const failed = await manager.install()
  assert.equal(failed.ok, false)
  assert.equal(failed.error, 'github-api-failed')
  assert.equal(failed.message, '获取失败')
})

// ------------------------------------------------------------------- start --

test('start launches NapCat with --no-sandbox and reports login', async () => {
  const runs = []
  let launched = false
  const manager = makeManager({
    deps: {
      run: async (file, args) => {
        runs.push([file, ...args])
        launched = true
        return { code: 0, stdout: '', stderr: '' }
      },
      now: () => 0,
    },
  })
  manager.loginStatus = async () => launched
    ? { loggedIn: true, qq: '10001', nickname: '机器人' }
    : { loggedIn: false, qq: null, nickname: null }

  const result = await manager.start({ timeoutMs: 5000 })
  assert.equal(result.ok, true)
  assert.equal(result.loggedIn, true)
  assert.equal(result.qq, '10001')
  assert.deepEqual(runs, [['/usr/bin/open', '-a', '/Applications/QQ.app', '--args', '--no-sandbox']])
})

test('start does not launch a second instance when NapCat is already logged in', async () => {
  const runs = []
  const manager = makeManager({
    deps: { run: async (file, args) => { runs.push([file, ...args]); return { code: 0, stdout: '', stderr: '' } } },
  })
  manager.loginStatus = async () => ({ loggedIn: true, qq: '10001', nickname: '机器人' })
  const result = await manager.start()
  assert.equal(result.ok, true)
  assert.equal(result.alreadyRunning, true)
  assert.deepEqual(runs, [])
})

test('start does not relaunch when NapCat is waiting for a QR scan', async () => {
  const runs = []
  const manager = makeManager({
    deps: { run: async (file, args) => { runs.push([file, ...args]); return { code: 0, stdout: '', stderr: '' } } },
  })
  manager.loginStatus = async () => ({ loggedIn: false, qq: null, nickname: null })
  manager.webuiReachable = true
  const result = await manager.start()
  assert.equal(result.ok, true)
  assert.equal(result.alreadyRunning, true)
  assert.match(result.message, /扫码/u)
  assert.deepEqual(runs, [])
})

test('start times out and asks the user to scan the QR code', async () => {
  let clock = 0
  const sleeps = []
  let probes = 0
  const manager = makeManager({
    deps: {
      run: async () => ({ code: 0, stdout: '', stderr: '' }),
      sleep: async (ms) => {
        sleeps.push(ms)
        clock += 1000
      },
      now: () => clock,
    },
  })
  manager.loginStatus = async () => {
    probes += 1
    return { loggedIn: false, qq: null, nickname: null }
  }

  const result = await manager.start({ timeoutMs: 3000 })
  assert.equal(result.ok, true)
  assert.equal(result.loggedIn, false)
  assert.equal(result.timedOut, true)
  assert.match(result.message, /扫码/u)
  assert.equal(sleeps.length, 3)
  assert.equal(probes, 5)
})

test('start refuses to run when QQ.app is missing', async () => {
  const runs = []
  const manager = makeManager({
    platform: fakePlatform({ detectQq: () => ({ installed: false, path: null, version: null }) }),
    deps: {
      run: async (file, args) => {
        runs.push([file, ...args])
        return { code: 0, stdout: '', stderr: '' }
      },
    },
  })
  const result = await manager.start()
  assert.equal(result.ok, false)
  assert.equal(result.error, 'qq-not-installed')
  assert.deepEqual(runs, [])
})

// -------------------------------------------------------------------- stop --

test('stop sends SIGTERM and waits for the QQ process to exit', async () => {
  const responses = [
    { running: true, pid: 4242 },
    { running: true, pid: 4242 },
    { running: false, pid: null },
  ]
  let index = 0
  let clock = 0
  const kills = []
  const manager = makeManager({
    platform: fakePlatform({ findProcess: () => responses[Math.min(index++, responses.length - 1)] }),
    deps: {
      processKill: (pid, signal) => kills.push([pid, signal]),
      sleep: async (ms) => {
        clock += ms
      },
      now: () => clock,
    },
  })

  const result = await manager.stop({ timeoutMs: 1000 })
  assert.equal(result.ok, true)
  assert.equal(result.pid, 4242)
  assert.equal(result.message, 'NapCat 已停止')
  assert.deepEqual(kills, [[4242, 'SIGTERM']])
})

test('stop escalates to SIGKILL and reports failure when the process survives', async () => {
  let clock = 0
  const kills = []
  const manager = makeManager({
    platform: fakePlatform({ findProcess: () => ({ running: true, pid: 4242 }) }),
    deps: {
      processKill: (pid, signal) => kills.push([pid, signal]),
      sleep: async (ms) => {
        clock += ms
      },
      now: () => clock,
    },
  })

  const result = await manager.stop({ timeoutMs: 1000 })
  assert.equal(result.ok, false)
  assert.equal(result.error, 'kill-failed')
  assert.deepEqual(kills, [[4242, 'SIGTERM'], [4242, 'SIGKILL']])
})

test('stop is a no-op when NapCat is not running', async () => {
  const kills = []
  const manager = makeManager({
    deps: { processKill: (pid, signal) => kills.push([pid, signal]) },
  })
  const result = await manager.stop()
  assert.equal(result.ok, true)
  assert.equal(result.alreadyStopped, true)
  assert.deepEqual(kills, [])
})
