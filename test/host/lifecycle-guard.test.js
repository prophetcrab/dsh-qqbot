/**
 * Lifecycle guard: watchdog spawn contract. No real process is started; the
 * spawn seam records the detached invocation and its env payload.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { startLifecycleWatchdog, stopLifecycleWatchdog } from '../../host/services/lifecycle/guard.js'

test('lifecycle guard: disabled by setting', () => {
  const child = startLifecycleWatchdog({ projectDir: '/tmp/qq-bot', lifecycleGuard: false })
  assert.equal(child, null)
})

test('lifecycle guard: spawns one detached watchdog with the DSH PID', () => {
  const calls = []
  const fakeChild = {
    killed: false,
    unref() { this.unrefCalled = true },
    kill() { this.killed = true },
  }
  const child = startLifecycleWatchdog(
    { projectDir: 'C:/qq-bot', dockerNapcatDataDir: 'C:/qq-bot/runtime/napcat-docker', lifecycleGuard: true },
    {
      spawn: (file, args, options) => {
        calls.push({ file, args, options })
        return fakeChild
      },
    },
  )
  assert.equal(child, fakeChild)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].file, process.execPath)
  assert.ok(calls[0].args[0].endsWith('watchdog.mjs'))
  assert.equal(calls[0].options.detached, true)
  assert.equal(calls[0].options.stdio, 'ignore')
  assert.equal(calls[0].options.env.ELECTRON_RUN_AS_NODE, '1')
  const config = JSON.parse(calls[0].options.env.DSH_QQBOT_WATCHDOG)
  assert.equal(config.parentPid, process.pid)
  assert.equal(config.projectDir, 'C:/qq-bot')
  assert.match(config.composePath, /runtime[\\/]napcat-docker[\\/]compose\.yaml/u)
  assert.equal(fakeChild.unrefCalled, true)

  // Idempotent: a second call reuses the live watchdog.
  assert.equal(startLifecycleWatchdog({ projectDir: 'C:/qq-bot' }, { spawn: () => { throw new Error('must not spawn') } }), fakeChild)

  stopLifecycleWatchdog(child)
  assert.equal(fakeChild.killed, true)
})
