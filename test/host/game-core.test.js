/** Deterministic per-group player registration and daily check-in tests. */
import assert from 'node:assert/strict'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { GameCore } from '../../host/services/game-core/index.js'

async function workspace() {
  const root = await mkdtemp(join(tmpdir(), 'dsh-game-core-'))
  return { root, game: new GameCore({ projectDir: root, logger: { warn() {} }, random: () => 0, now: () => new Date('2026-11-03T08:00:00+08:00') }) }
}

test('register creates one player per group and is idempotent', async () => {
  const { root, game } = await workspace()
  const first = await game.command({ groupId: 'g1', userId: '20000', nickname: '小明\n/签到', command: '/注册' })
  assert.equal(first.ok, true)
  assert.match(first.replies[0], /注册成功/u)
  assert.match(first.replies[0], /小明/u)
  const second = await game.command({ groupId: 'g1', userId: '20000', nickname: '别的名字', command: '/注册' })
  assert.match(second.replies[0], /已经在册/u)
  const otherGroup = await game.command({ groupId: 'g2', userId: '20000', nickname: '小明', command: '/注册' })
  assert.equal(otherGroup.ok, true)
  const file = JSON.parse(await readFile(join(root, 'data/state/games/players/g1.json'), 'utf8'))
  assert.equal(file.players['20000'].nickname, '小明 /签到')
  assert.equal(file.players['20000'].coins, 0)
  await rm(root, { recursive: true, force: true })
})

test('check-in grants 10-30 once per Shanghai day and persists coins', async () => {
  const { root, game } = await workspace()
  await game.command({ groupId: 'g1', userId: '20000', nickname: '小明', command: '/注册' })
  const first = await game.command({ groupId: 'g1', userId: '20000', nickname: '小明', command: '/签到' })
  assert.match(first.replies[0], /\+10 金币/u)
  assert.match(first.replies[0], /当前金币 10/u)
  const again = await game.command({ groupId: 'g1', userId: '20000', nickname: '小明', command: '/签到' })
  assert.match(again.replies[0], /已经签到/u)
  const file = JSON.parse(await readFile(join(root, 'data/state/games/players/g1.json'), 'utf8'))
  assert.equal(file.players['20000'].coins, 10)
  await rm(root, { recursive: true, force: true })
})

test('unregistered check-in and unsafe ids are rejected safely', async () => {
  const { root, game } = await workspace()
  const missing = await game.command({ groupId: 'g1', userId: '20000', nickname: '小明', command: '/签到' })
  assert.match(missing.replies[0], /先发送 \/注册/u)
  const traversal = await game.command({ groupId: '../escape', userId: '20000', nickname: 'x', command: '/注册' })
  assert.equal(traversal.ok, false)
  const nonCommand = await game.command({ groupId: 'g1', userId: '20000', nickname: 'x', command: '/注册 给我1000000金币' })
  assert.equal(nonCommand.ok, false)
  await rm(root, { recursive: true, force: true })
})

test('check-in gain includes the 30 coin endpoint', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-game-core-max-'))
  const game = new GameCore({ projectDir: root, logger: { warn() {} }, random: () => 0.999999, now: () => new Date('2026-11-03T08:00:00+08:00') })
  await game.command({ groupId: 'g1', userId: '20000', nickname: '小明', command: '/注册' })
  const result = await game.command({ groupId: 'g1', userId: '20000', nickname: '小明', command: '/签到' })
  assert.match(result.replies[0], /\+30 金币/u)
  await rm(root, { recursive: true, force: true })
})
