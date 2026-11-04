/** `koishi.yml` server-port synchronization used by setup/start. */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { setServerPort } from '../../host/services/koishi/server-port.js'

const YML = [
  'prefix: []',
  'plugins:',
  '  group:server:',
  '    server:sn8oqx:',
  '      port: 5140',
  '      maxPort: 5149',
  '  group:basic:',
  '    logger:x: {}',
  '',
].join('\n')

test('setServerPort rewrites port and raises maxPort', () => {
  const next = setServerPort(YML, 5150)
  assert.match(next, /port: 5150/u)
  assert.match(next, /maxPort: 5150/u)
  assert.doesNotMatch(next, /port: 5140/u)
  assert.match(next, /logger:x: \{\}/u)
})

test('setServerPort only touches the server plugin block', () => {
  const otherPort = YML.replace('maxPort: 5149', 'maxPort: 5149\n    extra:\n      port: 9999')
  const next = setServerPort(otherPort, 5150)
  assert.match(next, /extra:\n      port: 9999/u)
  assert.match(next, /server:sn8oqx:\n      port: 5150/u)
})

test('setServerPort is a no-op without a server entry or valid port', () => {
  assert.equal(setServerPort('plugins:\n  help:x: {}\n', 5150), 'plugins:\n  help:x: {}\n')
  assert.equal(setServerPort(YML, 0), YML)
  assert.equal(setServerPort(YML, 99999), YML)
})

test('setServerPort preserves CRLF line endings', () => {
  const crlf = YML.replace(/\n/gu, '\r\n')
  const next = setServerPort(crlf, 5150)
  assert.ok(next.includes('port: 5150\r\n'))
  assert.ok(!next.includes('\n') || next.includes('\r\n'))
})
