/** Per-group player registration, bag and daily check-in tests. */
import assert from 'node:assert/strict'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { GameCore } from '../../host/services/game-core/index.js'

const NOW = new Date('2026-11-03T08:00:00+08:00')

async function workspace() {
  const root = await mkdtemp(join(tmpdir(), 'dsh-game-core-'))
  return { root, game: new GameCore({ projectDir: root, logger: { warn() {} }, random: () => 0, now: () => NOW }) }
}

async function readGroup(root, groupId) {
  return JSON.parse(await readFile(join(root, `data/state/games/players/${groupId}.json`), 'utf8'))
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
  const file = await readGroup(root, 'g1')
  assert.equal(file.players['20000'].nickname, '小明 /签到')
  assert.equal(file.players['20000'].coins, 0)
  await rm(root, { recursive: true, force: true })
})

test('check-in grants 10-30 once per group per Shanghai day', async () => {
  const { root, game } = await workspace()
  await game.command({ groupId: 'g1', userId: '20000', nickname: '小明', command: '/注册' })
  const first = await game.command({ groupId: 'g1', userId: '20000', nickname: '小明', command: '/签到' })
  assert.match(first.replies[0], /\+10 金币/u)
  assert.match(first.replies[0], /当前金币 10/u)
  const again = await game.command({ groupId: 'g1', userId: '20000', nickname: '小明', command: '/签到' })
  assert.match(again.replies[0], /已经签到/u)
  const file = await readGroup(root, 'g1')
  assert.equal(file.players['20000'].coins, 10)
  await rm(root, { recursive: true, force: true })
})

test('backpack is scoped to the current group and groups are independent', async () => {
  const { root, game } = await workspace()
  await game.command({ groupId: 'g1', userId: '20000', nickname: '小明', command: '/注册' })
  await game.command({ groupId: 'g1', userId: '20000', nickname: '小明', command: '/签到' })
  const bag = await game.command({ groupId: 'g1', userId: '20000', nickname: '小明', command: '/账号背包' })
  assert.match(bag.replies[0], /金币：10/u)
  const otherBag = await game.command({ groupId: 'g2', userId: '20000', nickname: '小明', command: '/账号背包' })
  assert.match(otherBag.replies[0], /先发送 \/注册/u)
  await game.command({ groupId: 'g2', userId: '20000', nickname: '小明', command: '/注册' })
  const otherCheckin = await game.command({ groupId: 'g2', userId: '20000', nickname: '小明', command: '/签到' })
  assert.match(otherCheckin.replies[0], /\+10 金币/u)
  assert.equal((await readGroup(root, 'g1')).players['20000'].coins, 10)
  assert.equal((await readGroup(root, 'g2')).players['20000'].coins, 10)
  await rm(root, { recursive: true, force: true })
})

test('unregistered and unsafe inputs are rejected safely', async () => {
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
  const game = new GameCore({ projectDir: root, logger: { warn() {} }, random: () => 0.999999, now: () => NOW })
  await game.command({ groupId: 'g1', userId: '20000', nickname: '小明', command: '/注册' })
  const result = await game.command({ groupId: 'g1', userId: '20000', nickname: '小明', command: '/签到' })
  assert.match(result.replies[0], /\+30 金币/u)
  await rm(root, { recursive: true, force: true })
})

test('help is generated from the command registry', async () => {
  const { root, game } = await workspace()
  const help = await game.command({ groupId: 'g1', userId: '20000', nickname: '小明', command: '/help' })
  assert.equal(help.ok, true)
  assert.match(help.replies[0], /可用命令/u)
  assert.match(help.replies[0], /\/注册/u)
  assert.match(help.replies[0], /\/签到/u)
  assert.match(help.replies[0], /\/账号背包/u)
  assert.match(help.replies[0], /\/help/u)
  const alias = await game.command({ groupId: 'g1', userId: '20000', nickname: '小明', command: '/帮助' })
  assert.match(alias.replies[0], /\/注册/u)
  await rm(root, { recursive: true, force: true })
})

test('gold and fishing coins exchange both directions with correct rounding', async () => {
  const { root, game } = await workspace()
  await game.command({ groupId: 'g1', userId: '20000', nickname: '小明', command: '/注册' })
  await game.command({ groupId: 'g1', userId: '20000', nickname: '小明', command: '/签到' })
  const buy = await game.command({ groupId: 'g1', userId: '20000', nickname: '小明', command: '/兑换钓鱼币 5' })
  assert.match(buy.replies[0], /-5 金币/u)
  assert.match(buy.replies[0], /\+50 钓鱼币/u)
  let player = (await readGroup(root, 'g1')).players['20000']
  assert.equal(player.coins, 5)
  assert.equal(player.fishingCoins, 50)

  const sell = await game.command({ groupId: 'g1', userId: '20000', nickname: '小明', command: '/钓鱼 兑换金币 25' })
  assert.match(sell.replies[0], /-20 钓鱼币/u)
  assert.match(sell.replies[0], /\+2 金币/u)
  player = (await readGroup(root, 'g1')).players['20000']
  assert.equal(player.coins, 7)
  assert.equal(player.fishingCoins, 30)

  const capped = await game.command({ groupId: 'g1', userId: '20000', nickname: '小明', command: '/钓鱼 兑换金币 999' })
  assert.match(capped.replies[0], /-30 钓鱼币/u)
  assert.match(capped.replies[0], /\+3 金币/u)
  player = (await readGroup(root, 'g1')).players['20000']
  assert.equal(player.coins, 10)
  assert.equal(player.fishingCoins, 0)

  const empty = await game.command({ groupId: 'g1', userId: '20000', nickname: '小明', command: '/钓鱼 兑换金币 10' })
  assert.match(empty.replies[0], /钓鱼币不足 10/u)
  const invalid = await game.command({ groupId: 'g1', userId: '20000', nickname: '小明', command: '/兑换钓鱼币 1.5' })
  assert.match(invalid.replies[0], /正整数/u)
  assert.equal((await readGroup(root, 'g1')).players['20000'].coins, 10)
  await rm(root, { recursive: true, force: true })
})

test('help includes fishing exchange commands', async () => {
  const { root, game } = await workspace()
  const help = await game.command({ groupId: 'g1', userId: '20000', nickname: '小明', command: '/help' })
  assert.match(help.replies[0], /兑换钓鱼币/u)
  assert.match(help.replies[0], /兑换金币/u)
  assert.match(help.replies[0], /钓鱼 抽卡/u)
  assert.match(help.replies[0], /钓鱼 十连/u)
  await rm(root, { recursive: true, force: true })
})

const ASSETS_DIR = join(process.cwd(), 'assets')

async function gachaWorkspace(random = () => 0) {
  const root = await mkdtemp(join(tmpdir(), 'dsh-gacha-'))
  return { root, game: new GameCore({ projectDir: root, assetsDir: ASSETS_DIR, logger: { warn() {} }, random, now: () => NOW }) }
}

async function seedPlayer(game, fields) {
  await game.store.mutate('g1', (state) => {
    const player = state.players['20000']
    Object.assign(player, fields)
  })
}

test('single draw consumes a single ticket before coins', async () => {
  const { root, game } = await gachaWorkspace()
  await game.command({ groupId: 'g1', userId: '20000', nickname: '小明', command: '/注册' })
  await seedPlayer(game, { fishingCoins: 100, fishing: { tickets: { singleTickets: 1, tenTickets: 1 } } })
  const result = await game.command({ groupId: 'g1', userId: '20000', nickname: '小明', command: '/钓鱼 抽卡' })
  assert.match(result.replies[0], /单抽结果/u)
  assert.equal(result.image?.mime, 'image/png')
  assert.equal(result.image?.width, 1080)
  const player = (await readGroup(root, 'g1')).players['20000']
  assert.equal(player.fishing.tickets.singleTickets, 0)
  assert.equal(player.fishing.tickets.tenTickets, 1)
  assert.equal(player.fishingCoins, 100)
  assert.equal(player.fishing.gacha.history.length, 1)
  await rm(root, { recursive: true, force: true })
})

test('ten draw consumes ten ticket before single tickets and coins', async () => {
  const { root, game } = await gachaWorkspace()
  await game.command({ groupId: 'g1', userId: '20000', nickname: '小明', command: '/注册' })
  await seedPlayer(game, { fishingCoins: 50, fishing: { tickets: { singleTickets: 2, tenTickets: 1 } } })
  const result = await game.command({ groupId: 'g1', userId: '20000', nickname: '小明', command: '/钓鱼 十连' })
  assert.match(result.replies[0], /十连结果/u)
  const player = (await readGroup(root, 'g1')).players['20000']
  assert.equal(player.fishing.tickets.tenTickets, 0)
  assert.equal(player.fishing.tickets.singleTickets, 2)
  assert.equal(player.fishingCoins, 50)
  assert.equal(player.fishing.gacha.history.length, 10)
  await rm(root, { recursive: true, force: true })
})

test('ten draw fills remaining pulls with coins after single tickets', async () => {
  const { root, game } = await gachaWorkspace()
  await game.command({ groupId: 'g1', userId: '20000', nickname: '小明', command: '/注册' })
  await seedPlayer(game, { fishingCoins: 50, fishing: { tickets: { singleTickets: 5, tenTickets: 0 } } })
  const result = await game.command({ groupId: 'g1', userId: '20000', nickname: '小明', command: '/钓鱼 十连' })
  assert.equal(result.ok, true)
  assert.match(result.replies[0], /5 张单抽券 \+ 50 钓鱼币/u)
  const player = (await readGroup(root, 'g1')).players['20000']
  assert.equal(player.fishing.tickets.singleTickets, 0)
  assert.equal(player.fishingCoins, 0)
  await rm(root, { recursive: true, force: true })
})

test('draw fails atomically when resources cannot cover the whole pull', async () => {
  const { root, game } = await gachaWorkspace()
  await game.command({ groupId: 'g1', userId: '20000', nickname: '小明', command: '/注册' })
  await seedPlayer(game, { fishingCoins: 40, fishing: { tickets: { singleTickets: 5, tenTickets: 0 } } })
  const result = await game.command({ groupId: 'g1', userId: '20000', nickname: '小明', command: '/钓鱼 十连' })
  assert.match(result.replies[0], /十连失败/u)
  let player = (await readGroup(root, 'g1')).players['20000']
  assert.equal(player.fishing.tickets.singleTickets, 5)
  assert.equal(player.fishingCoins, 40)
  assert.equal(player.fishing.gacha.history.length, 0)

  await seedPlayer(game, { fishingCoins: 0, fishing: { tickets: { singleTickets: 0, tenTickets: 0 } } })
  const single = await game.command({ groupId: 'g1', userId: '20000', nickname: '小明', command: '/钓鱼 抽卡' })
  assert.match(single.replies[0], /单抽失败/u)
  player = (await readGroup(root, 'g1')).players['20000']
  assert.equal(player.fishing.gacha.history.length, 0)
  await rm(root, { recursive: true, force: true })
})

test('duplicate rods are auto-sold during ten draw', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-gacha-dupe-'))
  const game = new GameCore({ projectDir: root, assetsDir: ASSETS_DIR, logger: { warn() {} }, random: () => 0.95, now: () => NOW })
  await game.command({ groupId: 'g1', userId: '20000', nickname: '小明', command: '/注册' })
  const rods = JSON.parse(await readFile(join(ASSETS_DIR, 'rods/catalog.json'), 'utf8')).rods
  await seedPlayer(game, {
    fishingCoins: 0,
    fishing: {
      tickets: { singleTickets: 0, tenTickets: 1 },
      rods: { owned: rods.map((rod) => rod.id), equipped: 'bamboo_hand' },
    },
  })
  const result = await game.command({ groupId: 'g1', userId: '20000', nickname: '小明', command: '/钓鱼 十连' })
  assert.match(result.replies[0], /重复/u)
  const player = (await readGroup(root, 'g1')).players['20000']
  assert.ok(player.fishingCoins > 0)
  assert.equal(player.fishing.gacha.history.length, 10)
  await rm(root, { recursive: true, force: true })
})

test('same player gacha requests are serialized', async () => {
  const { root, game } = await gachaWorkspace()
  await game.command({ groupId: 'g1', userId: '20000', nickname: '小明', command: '/注册' })
  await seedPlayer(game, { fishingCoins: 100, fishing: { tickets: { singleTickets: 0, tenTickets: 1 } } })
  const first = game.command({ groupId: 'g1', userId: '20000', nickname: '小明', command: '/钓鱼 十连' })
  const second = game.command({ groupId: 'g1', userId: '20000', nickname: '小明', command: '/钓鱼 抽卡' })
  const results = await Promise.all([first, second])
  const busy = results.filter((result) => String(result.replies?.[0] ?? '').includes('正在抽卡'))
  assert.equal(busy.length, 1)
  assert.ok(results.some((result) => result.ok === true && result.image))
  const player = (await readGroup(root, 'g1')).players['20000']
  assert.equal(player.fishing.gacha.history.length, 10)
  await rm(root, { recursive: true, force: true })
})

test('fishing item library returns an image and owned items', async () => {
  const { root, game } = await gachaWorkspace()
  await game.command({ groupId: 'g1', userId: '20000', nickname: '小明', command: '/注册' })
  await seedPlayer(game, {
    fishingCoins: 42,
    fishing: {
      tickets: { singleTickets: 3, tenTickets: 2 },
      rods: { owned: ['bamboo_hand', 'walton'], equipped: 'walton' },
      baits: { counts: { dough: 4, mepps_aglia: 1 }, selected: 'mepps_aglia' },
    },
  })
  const result = await game.command({ groupId: 'g1', userId: '20000', nickname: '小明', command: '/钓鱼 道具库' })
  assert.equal(result.ok, true)
  assert.match(result.replies[0], /钓鱼道具库/u)
  assert.match(result.replies[0], /鱼竿 2 把/u)
  assert.equal(result.image?.mime, 'image/png')
  assert.equal(result.image?.width, 1080)
  const next = await game.command({ groupId: 'g1', userId: '20000', nickname: '小明', command: '/钓鱼 道具库 2' })
  assert.match(next.replies[0], /道具库只有 1 页/u)
  await rm(root, { recursive: true, force: true })
})
