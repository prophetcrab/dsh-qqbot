/**
 * Unit tests for lib/koishi.js: project status, dependency install, managed
 * process start/stop, health probing and port/PID lookup.
 *
 * Everything is injected: no real Koishi process is started, no real HTTP
 * request is made and no real signal is sent.
 */

import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { KoishiManager, findPidByPort } from '../lib/koishi.js'

const QUIET_LOGGER = { info() {}, warn() {}, error() {}, debug() {} }
const TEST_PORT = 5199

/** Build a temporary Koishi project directory with a package.json. */
async function makeProject(t, { packageJson = true } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-koishi-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  if (packageJson) {
    await writeFile(join(dir, 'package.json'), JSON.stringify({ name: 'fake-koishi', scripts: { start: 'koishi start' } }), 'utf8')
  }
  return dir
}

/** Manager with quiet logging, immediate sleep and a test port. */
function makeManager(projectDir, overrides = {}) {
  return new KoishiManager({
    settings: { projectDir, koishiPort: TEST_PORT },
    logger: QUIET_LOGGER,
    sleep: async () => {},
    ...overrides,
  })
}

/** A fetch response whose body is the given JSON value. */
function healthResponse(data, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(data),
  }
}

/** Health payload with one online bot. */
function onlineHealth(selfId = '10001') {
  return healthResponse({
    ok: true,
    bots: [{ platform: 'onebot', selfId, online: true }],
    stats: { messagesReceived: 3, messagesSent: 1 },
  })
}

/** Health payload where Koishi runs but the bot is offline. */
function offlineHealth(selfId = '10001') {
  return healthResponse({
    ok: false,
    bots: [{ platform: 'onebot', selfId, online: false }],
    stats: {},
  })
}

/** Fetch that fails like a closed local port. */
async function unreachable() {
  throw new Error('connect ECONNREFUSED 127.0.0.1')
}

/**
 * Fetch returning a scripted sequence of responses; the last entry repeats.
 * @param {Array<object|Function>} steps
 */
function sequencedFetch(steps) {
  const queue = [...steps]
  const fetch = async () => {
    const next = queue.length > 1 ? queue.shift() : queue[0]
    if (typeof next === 'function') return next()
    return next
  }
  fetch.queue = queue
  return fetch
}

/** Executor used for "no process listens on the port" answers. */
function execNoListener() {
  const calls = []
  const exec = async (file, args, options) => {
    calls.push({ file, args, options })
    return { code: 1, stdout: '', stderr: '' }
  }
  exec.calls = calls
  return exec
}

/** Fake child process with EventEmitter streams. */
function fakeChild(pid = 4321) {
  const child = new EventEmitter()
  child.pid = pid
  child.stdout = new EventEmitter()
  child.stderr = new EventEmitter()
  child.unref = () => {
    child.unrefCalled = true
  }
  return child
}

/** Stateful kill implementation: SIGTERM/SIGKILL mark the process dead. */
function fakeKiller() {
  const state = { alive: true, calls: [] }
  const kill = (pid, signal) => {
    state.calls.push({ pid, signal })
    if (signal === 0) return state.alive
    if (signal === 'SIGTERM' || signal === 'SIGKILL') {
      state.alive = false
      return true
    }
    return true
  }
  kill.state = state
  return kill
}

test('status reports a missing project without touching the network', async (t) => {
  const parent = await mkdtemp(join(tmpdir(), 'dsh-koishi-'))
  t.after(() => rm(parent, { recursive: true, force: true }))
  const missing = join(parent, 'does-not-exist')
  let networkCalls = 0
  const manager = makeManager(missing, {
    fetch: async () => {
      networkCalls += 1
      throw new Error('unexpected network access')
    },
  })

  const status = await manager.status()
  assert.equal(status.projectDir, missing)
  assert.equal(status.exists, false)
  assert.equal(status.hasPackageJson, false)
  assert.equal(status.depsInstalled, false)
  assert.equal(status.running, false)
  assert.equal(status.managed, false)
  assert.equal(status.pid, null)
  assert.equal(status.port, TEST_PORT)
  assert.equal(status.online, false)
  assert.deepEqual(status.logs, [])
  assert.match(status.error, /项目不存在/u)
  assert.equal(networkCalls, 0)
})

test('status reports an existing project whose port is owned by a foreign PID', async (t) => {
  const dir = await makeProject(t)
  const manager = makeManager(dir, {
    fetch: unreachable,
    exec: async (file, args) => {
      assert.equal(file, '/usr/sbin/lsof')
      assert.deepEqual(args, ['-nP', `-iTCP:${TEST_PORT}`, '-sTCP:LISTEN'])
      return { code: 0, stdout: 'COMMAND PID USER\nnode 777 crab\n', stderr: '' }
    },
  })

  const status = await manager.status()
  assert.equal(status.exists, true)
  assert.equal(status.hasPackageJson, true)
  assert.equal(status.running, true)
  assert.equal(status.pid, 777)
  assert.equal(status.managed, false)
  assert.equal(status.online, false)
  assert.equal(status.error, undefined)
  assert.deepEqual(status.logs, [])
})

test('start returns alreadyRunning when the health endpoint answers', async (t) => {
  const dir = await makeProject(t)
  const manager = makeManager(dir, {
    fetch: async () => onlineHealth('10001'),
    exec: execNoListener(),
    spawn: () => {
      throw new Error('spawn must not be called when Koishi is already running')
    },
  })

  const result = await manager.start()
  assert.equal(result.ok, true)
  assert.equal(result.alreadyRunning, true)
  assert.equal(result.online, true)
  assert.match(result.message, /已在运行/u)

  const status = await manager.status()
  assert.equal(status.online, true)
  assert.equal(status.selfId, '10001')
  assert.equal(status.platform, 'onebot')
  assert.equal(status.stats.messagesReceived, 3)
})

test('start spawns npm start detached and polls health until online', async (t) => {
  const dir = await makeProject(t)
  const child = fakeChild(4321)
  const spawnCalls = []
  const exec = execNoListener()
  let sleepCalls = 0
  const manager = makeManager(dir, {
    fetch: sequencedFetch([unreachable, unreachable, onlineHealth('10001')]),
    exec,
    spawn: (file, args, options) => {
      spawnCalls.push({ file, args, options })
      return child
    },
    sleep: async () => {
      sleepCalls += 1
    },
  })

  const result = await manager.start()
  assert.equal(result.ok, true)
  assert.equal(result.online, true)
  assert.equal(result.pid, 4321)
  assert.match(result.message, /已启动/u)

  assert.equal(spawnCalls.length, 1)
  assert.equal(spawnCalls[0].file, 'npm')
  assert.deepEqual(spawnCalls[0].args, ['start'])
  assert.equal(spawnCalls[0].options.cwd, dir)
  assert.equal(spawnCalls[0].options.detached, true)
  assert.deepEqual(spawnCalls[0].options.stdio, ['ignore', 'pipe', 'pipe'])
  assert.equal(child.unrefCalled, true)
  assert.ok(sleepCalls > 0)

  // stdout/stderr are captured into the managed log ring.
  child.stdout.emit('data', 'koishi ready\n')
  child.stderr.emit('data', 'warn: onebot offline\n')
  assert.deepEqual(manager.logs(10), ['koishi ready', 'warn: onebot offline'])
  assert.equal(manager.isManaged(), true)

  for (let index = 0; index < 35; index += 1) child.stdout.emit('data', `line-${index}\n`)
  assert.equal(manager.logs(5).length, 5)

  const status = await manager.status()
  assert.equal(status.managed, true)
  assert.equal(status.pid, 4321)
  assert.equal(status.running, true)
  assert.equal(status.online, true)
  assert.equal(status.logs.length, 30)
  assert.equal(status.logs.at(-1), 'line-34')
})

test('start fails fast when the spawned process exits', async (t) => {
  const dir = await makeProject(t)
  const child = fakeChild(4322)
  const manager = makeManager(dir, {
    fetch: unreachable,
    exec: execNoListener(),
    spawn: () => {
      queueMicrotask(() => child.emit('exit', 1, null))
      return child
    },
  })

  const result = await manager.start()
  assert.equal(result.ok, false)
  assert.match(result.error, /进程已退出/u)
  assert.equal(manager.isManaged(), false)
})

test('start reports a timeout when health never comes online', async (t) => {
  const dir = await makeProject(t)
  const manager = makeManager(dir, {
    fetch: unreachable,
    exec: execNoListener(),
    spawn: () => fakeChild(4323),
  })

  const result = await manager.start({ timeoutMs: 20 })
  assert.equal(result.ok, false)
  assert.match(result.error, /超时/u)
  assert.equal(result.pid, 4323)
})

test('start refuses to start when the port is occupied by an unhealthy process', async (t) => {
  const dir = await makeProject(t)
  const manager = makeManager(dir, {
    fetch: unreachable,
    exec: async () => ({ code: 0, stdout: 'COMMAND PID USER\nnode 888 crab\n', stderr: '' }),
    spawn: () => {
      throw new Error('spawn must not be called when the port is busy')
    },
  })

  const result = await manager.start()
  assert.equal(result.ok, false)
  assert.match(result.error, /占用/u)
  assert.match(result.error, /888/u)
})

test('stop uses the managed PID and never a broad process match', async (t) => {
  const dir = await makeProject(t)
  const child = fakeChild(4321)
  const kill = fakeKiller()
  const manager = makeManager(dir, {
    fetch: sequencedFetch([unreachable, onlineHealth()]),
    exec: execNoListener(),
    spawn: () => child,
    processKill: kill,
  })

  const started = await manager.start()
  assert.equal(started.ok, true)

  const stopped = await manager.stop()
  assert.equal(stopped.ok, true)
  assert.match(stopped.message, /4321/u)
  assert.equal(manager.isManaged(), false)
  assert.equal(manager.managedPid, null)
  assert.deepEqual(manager.logs(10), [])
  assert.deepEqual(kill.state.calls[0], { pid: 4321, signal: 'SIGTERM' })
  assert.ok(kill.state.calls.some((call) => call.signal === 0))
})

test('stop escalates to SIGKILL when SIGTERM is ignored', async (t) => {
  const dir = await makeProject(t)
  const child = fakeChild(4324)
  const calls = []
  let alive = true
  const kill = (pid, signal) => {
    calls.push({ pid, signal })
    if (signal === 0) return alive
    if (signal === 'SIGKILL') {
      alive = false
      return true
    }
    return true
  }
  const manager = makeManager(dir, {
    fetch: sequencedFetch([unreachable, onlineHealth()]),
    exec: execNoListener(),
    spawn: () => child,
    processKill: kill,
  })

  assert.equal((await manager.start()).ok, true)
  const stopped = await manager.stop({ gracefulTimeoutMs: 40, killTimeoutMs: 40 })
  assert.equal(stopped.ok, true)
  assert.ok(calls.some((call) => call.signal === 'SIGKILL'))
})

test('stop reports that Koishi is not running', async (t) => {
  const dir = await makeProject(t)
  const kill = fakeKiller()
  const manager = makeManager(dir, {
    fetch: unreachable,
    exec: execNoListener(),
    processKill: kill,
  })

  const result = await manager.stop()
  assert.equal(result.ok, true)
  assert.match(result.message, /未在运行/u)
  assert.equal(kill.state.calls.length, 0)
})

test('findPidByPort parses lsof output and never runs on invalid ports', async () => {
  const calls = []
  const exec = async (file, args) => {
    calls.push({ file, args })
    return {
      code: 0,
      stdout: 'COMMAND PID USER FD TYPE DEVICE SIZE/OFF NODE NAME\nnode 12345 crab 23u IPv6 0x1 0t0 TCP *:5199 (LISTEN)\n',
      stderr: '',
    }
  }

  assert.equal(await findPidByPort(TEST_PORT, { exec }), 12345)
  assert.equal(calls[0].file, '/usr/sbin/lsof')
  assert.deepEqual(calls[0].args, ['-nP', `-iTCP:${TEST_PORT}`, '-sTCP:LISTEN'])
  assert.equal(await findPidByPort(TEST_PORT, { exec: async () => ({ code: 1, stdout: '', stderr: '' }) }), null)
  assert.equal(await findPidByPort('not-a-port', { exec: async () => {
    throw new Error('exec must not run for an invalid port')
  } }), null)
  assert.equal(await findPidByPort(0, { exec: async () => ({ code: 0, stdout: 'x 1 y\n', stderr: '' }) }), null)
})

test('isPortListening uses lsof and falls back to a TCP probe', async (t) => {
  const dir = await makeProject(t)
  const listening = makeManager(dir, {
    exec: async () => ({ code: 0, stdout: 'COMMAND PID USER\nnode 1 crab\n', stderr: '' }),
  })
  assert.equal(await listening.isPortListening(TEST_PORT), true)

  const closed = makeManager(dir, {
    exec: async () => ({ code: 1, stdout: '', stderr: '' }),
  })
  assert.equal(await closed.isPortListening(TEST_PORT), false)

  // ENOENT means lsof is unavailable -> probe an unused port instead.
  const noLsof = makeManager(dir, {
    exec: async () => ({ code: 1, stdout: '', stderr: '', error: 'spawn /usr/sbin/lsof ENOENT' }),
  })
  assert.equal(await noLsof.isPortListening(1), false)
})

test('health parses the endpoint payload and reports failures', async (t) => {
  const dir = await makeProject(t)
  const online = makeManager(dir, { fetch: async () => onlineHealth('4242') })
  const health = await online.health()
  assert.equal(health.ok, true)
  assert.equal(health.reachable, true)
  assert.equal(health.bots[0].selfId, '4242')
  assert.equal(health.stats.messagesReceived, 3)

  const offline = makeManager(dir, { fetch: async () => offlineHealth() })
  const offlineResult = await offline.health()
  assert.equal(offlineResult.ok, false)
  assert.equal(offlineResult.reachable, true)

  const down = makeManager(dir, { fetch: unreachable })
  const downResult = await down.health()
  assert.equal(downResult.ok, false)
  assert.equal(downResult.reachable, false)
  assert.match(downResult.error, /ECONNREFUSED/u)
})

test('installDeps runs npm install with an argv array and honours force', async (t) => {
  const dir = await makeProject(t)
  const exec = async (file, args, options) => {
    exec.call = { file, args, options }
    return { code: 0, stdout: 'added 1 package', stderr: '' }
  }
  const manager = makeManager(dir, { exec })

  const result = await manager.installDeps()
  assert.equal(result.ok, true)
  assert.equal(exec.call.file, 'npm')
  assert.deepEqual(exec.call.args, ['install', '--no-audit', '--no-fund'])
  assert.equal(exec.call.options.cwd, dir)
  assert.match(result.output, /added 1 package/u)

  await mkdir(join(dir, 'node_modules'))
  let calls = 0
  const skipManager = makeManager(dir, {
    exec: async () => {
      calls += 1
      return { code: 0, stdout: '', stderr: '' }
    },
  })
  const skipped = await skipManager.installDeps()
  assert.equal(skipped.ok, true)
  assert.equal(skipped.skipped, true)
  assert.equal(calls, 0)

  const forced = await skipManager.installDeps({ force: true })
  assert.equal(forced.ok, true)
  assert.equal(forced.skipped, undefined)
  assert.equal(calls, 1)
})

test('installDeps reports missing project and package.json', async (t) => {
  const parent = await mkdtemp(join(tmpdir(), 'dsh-koishi-'))
  t.after(() => rm(parent, { recursive: true, force: true }))
  const missing = await makeManager(join(parent, 'nope'), { exec: async () => ({ code: 0, stdout: '', stderr: '' }) }).installDeps()
  assert.equal(missing.ok, false)
  assert.match(missing.error, /项目不存在/u)

  const emptyDir = join(parent, 'empty')
  await mkdir(emptyDir)
  const noPackage = await makeManager(emptyDir, { exec: async () => ({ code: 0, stdout: '', stderr: '' }) }).installDeps()
  assert.equal(noPackage.ok, false)
  assert.match(noPackage.error, /package\.json/u)
})

test('restart stops and starts again', async (t) => {
  const dir = await makeProject(t)
  const child = fakeChild(4325)
  const kill = fakeKiller()
  const manager = makeManager(dir, {
    // health: stop() probe (down), start() pre-check (down), poll (online)
    fetch: sequencedFetch([unreachable, unreachable, onlineHealth()]),
    exec: execNoListener(),
    spawn: () => child,
    processKill: kill,
  })

  const result = await manager.restart()
  assert.equal(result.ok, true)
  assert.match(result.message, /重启/u)
})

/** Fake portPid dependency: returns a fixed PID (or a function result), records calls. */
function fakePortPid(pid) {
  const calls = []
  const fn = async (port) => {
    calls.push(port)
    return typeof pid === 'function' ? pid(port) : pid
  }
  fn.calls = calls
  return fn
}

test('findPidByPort: portPid 优先于 exec，非法 PID 归一为 null', async () => {
  const calls = []
  const pid = await findPidByPort(TEST_PORT, {
    portPid: async (port) => {
      calls.push(port)
      return 3456
    },
    exec: async () => {
      throw new Error('exec must not run when portPid is provided')
    },
  })
  assert.equal(pid, 3456)
  assert.deepEqual(calls, [TEST_PORT])

  assert.equal(await findPidByPort(TEST_PORT, { portPid: async () => null }), null)
  assert.equal(await findPidByPort(TEST_PORT, { portPid: async () => 'oops' }), null)
  assert.equal(await findPidByPort(0, { portPid: async () => {
    throw new Error('portPid must not run for an invalid port')
  } }), null)
})

test('windows: status 与 isPortListening 使用注入的 portPid（netstat 语义）', async (t) => {
  const dir = await makeProject(t)
  const openPortPid = fakePortPid(4567)
  const manager = makeManager(dir, {
    hostPlatform: () => 'windows',
    portPid: openPortPid,
    fetch: unreachable,
  })

  const status = await manager.status()
  assert.equal(status.running, true)
  assert.equal(status.pid, 4567)
  assert.equal(status.managed, false)
  assert.equal(status.online, false)
  assert.deepEqual(openPortPid.calls, [TEST_PORT])
  assert.equal(await manager.isPortListening(), true)

  // 同时覆盖 options.deps 依赖包注入形式
  const closedPortPid = fakePortPid(null)
  const closed = makeManager(dir, {
    deps: { hostPlatform: () => 'windows', portPid: closedPortPid },
    fetch: unreachable,
  })
  const closedStatus = await closed.status()
  assert.equal(closedStatus.running, false)
  assert.equal(closedStatus.pid, null)
  assert.deepEqual(closedPortPid.calls, [TEST_PORT])
  assert.equal(await closed.isPortListening(), false)
})

test('windows: start 通过 cmd.exe /c npm start 启动，并把端口探测交给 portPid', async (t) => {
  const dir = await makeProject(t)
  const child = fakeChild(5100)
  const spawnCalls = []
  const portPid = fakePortPid(null)
  let execCalls = 0
  const manager = makeManager(dir, {
    hostPlatform: () => 'windows',
    portPid,
    spawn: (file, args, options) => {
      spawnCalls.push({ file, args, options })
      return child
    },
    fetch: sequencedFetch([unreachable, unreachable, onlineHealth('10001')]),
    exec: async () => {
      execCalls += 1
      return { code: 1, stdout: '', stderr: '' }
    },
  })

  const result = await manager.start()
  assert.equal(result.ok, true)
  assert.equal(result.online, true)
  assert.equal(result.pid, 5100)
  assert.equal(spawnCalls.length, 1)
  // Windows 不直接 spawn .cmd（EINVAL），统一走 cmd.exe /c npm ...
  assert.equal(spawnCalls[0].file, 'cmd.exe')
  assert.deepEqual(spawnCalls[0].args, ['/c', 'npm', 'start'])
  assert.equal(spawnCalls[0].file.endsWith('.cmd'), false)
  assert.equal(spawnCalls[0].options.cwd, dir)
  assert.equal(spawnCalls[0].options.detached, true)
  assert.deepEqual(spawnCalls[0].options.stdio, ['ignore', 'pipe', 'pipe'])
  assert.equal(child.unrefCalled, true)
  // Windows 下端口探测走 portPid，不再调用 lsof/exec
  assert.deepEqual(portPid.calls, [TEST_PORT])
  assert.equal(execCalls, 0)
})

test('windows: installDeps 通过 cmd.exe /c npm install 执行', async (t) => {
  const dir = await makeProject(t)
  const exec = async (file, args, options) => {
    exec.call = { file, args, options }
    return { code: 0, stdout: 'added 1 package', stderr: '' }
  }
  const manager = makeManager(dir, {
    hostPlatform: 'windows',
    portPid: fakePortPid(null),
    exec,
  })

  const result = await manager.installDeps()
  assert.equal(result.ok, true)
  // 不直接执行 npm.cmd（Windows EINVAL），统一走 cmd.exe /c npm ...
  assert.equal(exec.call.file, 'cmd.exe')
  assert.deepEqual(exec.call.args, ['/c', 'npm', 'install', '--no-audit', '--no-fund'])
  assert.equal(exec.call.file.endsWith('.cmd'), false)
  assert.equal(exec.call.options.cwd, dir)
})

test('windows: stop 使用 killPid(taskkill) 且不使用负 PID/信号', async (t) => {
  const dir = await makeProject(t)
  const state = { alive: true, signals: [] }
  const killCalls = []
  const killPid = async (pid, options = {}) => {
    killCalls.push({ pid, force: options.force === true })
    state.alive = false
    return { ok: true }
  }
  const manager = makeManager(dir, {
    hostPlatform: () => 'windows',
    portPid: fakePortPid(4321),
    fetch: unreachable,
    killPid,
    processKill: (pid, signal) => {
      state.signals.push({ pid, signal })
      return signal === 0 ? state.alive : true
    },
  })

  const stopped = await manager.stop()
  assert.equal(stopped.ok, true)
  assert.match(stopped.message, /4321/u)
  assert.deepEqual(killCalls, [{ pid: 4321, force: false }])
  assert.equal(killCalls.every((call) => call.pid > 0), true)
  // 只用 0 号信号探测存活，不发送 SIGTERM/SIGKILL
  assert.deepEqual(state.signals.map((call) => call.signal), [0])
  assert.equal(manager.isManaged(), false)
})

test('windows: stop 优雅停止超时后升级为 taskkill /F', async (t) => {
  const dir = await makeProject(t)
  const state = { alive: true }
  const killCalls = []
  const killPid = async (pid, options = {}) => {
    const force = options.force === true
    killCalls.push({ pid, force })
    if (force) state.alive = false
    return { ok: true }
  }
  const manager = makeManager(dir, {
    hostPlatform: 'windows',
    portPid: fakePortPid(4322),
    fetch: unreachable,
    killPid,
    processKill: (pid, signal) => (signal === 0 ? state.alive : true),
  })

  const stopped = await manager.stop({ gracefulTimeoutMs: 20, killTimeoutMs: 20 })
  assert.equal(stopped.ok, true)
  assert.equal(killCalls[0].force, false)
  assert.equal(killCalls.some((call) => call.force === true), true)
  assert.equal(killCalls.every((call) => call.pid === 4322), true)
})


test('startCommand: prefers the local Koishi CLI bundled with the project', async (t) => {
  const dir = await makeProject(t)
  await mkdir(join(dir, 'node_modules', 'koishi'), { recursive: true })
  await writeFile(join(dir, 'node_modules', 'koishi', 'bin.js'), '', 'utf8')
  const manager = makeManager(dir)
  const command = manager.startCommand(dir)
  assert.equal(command.local, true)
  assert.equal(command.file, process.execPath)
  assert.equal(command.args[0], join(dir, 'node_modules', 'koishi', 'bin.js'))
  assert.deepEqual(command.args.slice(1), ['start', '-r', 'tsx/cjs'])
  if (process.versions.electron !== undefined) assert.equal(command.env.ELECTRON_RUN_AS_NODE, '1')
})

test('startCommand: falls back to npm start without a local CLI', async (t) => {
  const dir = await makeProject(t)
  const manager = makeManager(dir)
  const command = manager.startCommand(dir)
  assert.notEqual(command.local, true)
  assert.match(command.file, /npm/u)
})
