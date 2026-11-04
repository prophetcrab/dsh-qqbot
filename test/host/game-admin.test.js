/** Admin console snapshots and per-group UP controls. */
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { createGame } from './game-harness.js'

const ASSETS = join(process.cwd(), 'assets')
const NOW = new Date('2026-11-04T12:00:00+08:00')

async function workspace() {
  const root = await mkdtemp(join(tmpdir(), 'dsh-game-admin-'))
  const game = createGame({ projectDir: root, assetsDir: ASSETS, logger: { warn() {} }, random: () => 0, now: () => NOW })
  await game.command({ groupId: 'g1', userId: '20000', nickname: '小明', command: '/注册' })
  await game.command({ groupId: 'g1', userId: '20001', nickname: '小红', command: '/注册' })
  await game.command({ groupId: 'g2', userId: '30000', nickname: '小刚', command: '/注册' })
  return { root, game }
}

test('admin lists groups, users and game state', async () => {
  const { root, game } = await workspace()
  const groups = await game.admin.listGroups()
  assert.equal(groups.groups.length, 2)
  const g1 = groups.groups.find((group) => group.groupId === 'g1')
  assert.equal(g1.userCount, 2)
  assert.equal(g1.games[0].id, 'fishing')

  const group = await game.admin.getGroup('g1')
  assert.equal(group.users.length, 2)
  assert.equal(group.games[0].playerCount, 2)

  await game.store.mutate('g1', (state) => {
    const p = state.players['20000']
    p.fishingCoins = 88
    p.fishing = {
      rods: { owned: ['taigong', 'bamboo_hand'], equipped: 'taigong' },
      baits: { counts: { dough: 3 }, selected: 'dough' },
      tickets: { singleTickets: 2, tenTickets: 1 },
      gacha: { rodPity: 4, lv3RodPity: 5, legendaryBaitPity: 6, legendaryRodPity: 7 },
      fishWarehouse: [{ id: 1, fishId: 'bass', value: 20 }],
    }
  })
  const detail = await game.admin.getGame('g1', 'fishing')
  assert.equal(detail.summary.totalFish, 1)
  assert.equal(detail.summary.totalFishValue, 20)
  assert.equal(detail.users.find((user) => user.qq === '20000').fishingCoins, 88)
  assert.deepEqual(detail.up.rodId, 'taigong')
  assert.deepEqual(detail.up.baitId, 'rapala_floater')
  await rm(root, { recursive: true, force: true })
})

test('admin can switch the per-group UP and gacha pool reads it', async () => {
  const { root, game } = await workspace()
  const detail = await game.admin.setGameUp('g1', 'fishing', { rodId: 'ziling', baitId: 'mepps_aglia' })
  assert.equal(detail.up.rodId, 'ziling')
  assert.equal(detail.up.baitId, 'mepps_aglia')
  assert.equal((await game.up.get('g2')).rod, 'taigong')
  const pool = await game.command({ groupId: 'g1', userId: '20000', nickname: '小明', command: '/钓鱼 卡池' })
  assert.match(pool.replies[0], /子陵竿/u)
  assert.match(pool.replies[0], /梅普斯旋转亮片/u)
  await assert.rejects(() => game.admin.setGameUp('g1', 'fishing', { rodId: 'bamboo_hand', baitId: 'mepps_aglia' }))
  await assert.rejects(() => game.admin.setGameUp('g1', 'fishing', { rodId: 'ziling', baitId: 'dough' }))
  await rm(root, { recursive: true, force: true })
})

test('gacha pity uses the switched per-group UP', async () => {
  const { root, game } = await workspace()
  await game.admin.setGameUp('g1', 'fishing', { rodId: 'ziling', baitId: 'mepps_aglia' })
  await game.store.mutate('g1', (state) => {
    const p = state.players['20000']
    p.fishing = {
      tickets: { singleTickets: 1, tenTickets: 0 },
      gacha: { rodPity: 0, lv3RodPity: 0, legendaryBaitPity: 0, legendaryRodPity: 149 },
    }
  })
  const draw = await game.command({ groupId: 'g1', userId: '20000', nickname: '小明', command: '/钓鱼 抽卡' })
  assert.match(draw.replies[0], /子陵竿/u)
  await rm(root, { recursive: true, force: true })
})
