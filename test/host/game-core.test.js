/** Per-group player registration, bag and daily check-in tests. */
import assert from 'node:assert/strict'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { GameCore } from '../../host/services/game-core/index.js'
import { FISH_STATS } from '../../host/services/game-core/fishing-data.js'

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
  await rm(root, { recursive: true, force: true })
})

test('view and change equipped rod', async () => {
  const { root, game } = await gachaWorkspace()
  await game.command({ groupId: 'g1', userId: '20000', nickname: '小明', command: '/注册' })
  await seedPlayer(game, {
    fishing: { rods: { owned: ['bamboo_hand', 'walton'], equipped: 'bamboo_hand' } },
  })
  const current = await game.command({ groupId: 'g1', userId: '20000', nickname: '小明', command: '/钓鱼 查看鱼竿' })
  assert.match(current.replies[0], /当前鱼竿：竹制手竿/u)
  assert.equal(current.image?.width, 1080)
  const changed = await game.command({ groupId: 'g1', userId: '20000', nickname: '小明', command: '/钓鱼 更换鱼竿 沃尔顿竿' })
  assert.match(changed.replies[0], /已更换为「沃尔顿竿」/u)
  assert.equal((await readGroup(root, 'g1')).players['20000'].fishing.rods.equipped, 'walton')
  const notOwned = await game.command({ groupId: 'g1', userId: '20000', nickname: '小明', command: '/钓鱼 更换鱼竿 碳素手竿' })
  assert.match(notOwned.replies[0], /你还没有「碳素手竿」/u)
  assert.equal((await readGroup(root, 'g1')).players['20000'].fishing.rods.equipped, 'walton')
  await rm(root, { recursive: true, force: true })
})

test('fishing pool command renders rates and pity progress', async () => {
  const { root, game } = await gachaWorkspace()
  await game.command({ groupId: 'g1', userId: '20000', nickname: '小明', command: '/注册' })
  await seedPlayer(game, {
    fishing: { gacha: { rodPity: 3, lv3RodPity: 12, legendaryBaitPity: 20, legendaryRodPity: 45 } },
  })
  const result = await game.command({ groupId: 'g1', userId: '20000', nickname: '小明', command: '/钓鱼 卡池' })
  assert.equal(result.ok, true)
  assert.match(result.replies[0], /钓鱼卡池/u)
  assert.match(result.replies[0], /鱼竿 3\/10/u)
  assert.match(result.replies[0], /传奇竿 45\/150/u)
  assert.match(result.replies[0], /太公竿/u)
  assert.match(result.replies[0], /拉帕拉原版浮水米诺/u)
  assert.equal(result.image?.width, 1080)
  assert.ok(result.image?.height > 1200)
  await rm(root, { recursive: true, force: true })
})

test('legendary pity uses the current UP selection', async () => {
  const { root, game } = await gachaWorkspace(() => 0)
  await game.command({ groupId: 'g1', userId: '20000', nickname: '小明', command: '/注册' })
  await seedPlayer(game, {
    fishingCoins: 0,
    fishing: {
      tickets: { singleTickets: 1, tenTickets: 0 },
      gacha: { rodPity: 0, lv3RodPity: 0, legendaryBaitPity: 0, legendaryRodPity: 149 },
    },
  })
  const result = await game.command({ groupId: 'g1', userId: '20000', nickname: '小明', command: '/钓鱼 抽卡' })
  assert.match(result.replies[0], /太公竿/u)
  await rm(root, { recursive: true, force: true })
})

test('cast waits for the ready time, consumes bait and stores a fish', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-cast-'))
  const clock = { at: new Date('2026-11-04T08:00:00+08:00') }
  const game = new GameCore({ projectDir: root, assetsDir: ASSETS_DIR, logger: { warn() {} }, random: () => 0.5, now: () => clock.at })
  await game.command({ groupId: 'g1', userId: '20000', nickname: '小明', command: '/注册' })
  await game.store.mutate('g1', (state) => {
    const p = state.players['20000']
    p.fishing = { rods: { owned: ['bamboo_hand'], equipped: 'bamboo_hand' }, baits: { counts: { dough: 2 }, selected: 'dough' } }
  })
  const cast = await game.command({ groupId: 'g1', userId: '20000', nickname: '小明', command: '/钓鱼 抛竿 面团饵' })
  assert.match(cast.replies[0], /正在钓鱼/u)
  let player = (await readGroup(root, 'g1')).players['20000']
  assert.equal(player.fishing.baits.counts.dough, 1)
  const early = await game.command({ groupId: 'g1', userId: '20000', nickname: '小明', command: '/钓鱼 收竿' })
  assert.match(early.replies[0], /还需约/u)
  clock.at = new Date('2026-11-04T08:00:06+08:00')
  const caught = await game.command({ groupId: 'g1', userId: '20000', nickname: '小明', command: '/钓鱼 收竿' })
  assert.equal(caught.ok, true)
  assert.match(caught.replies[0], /收竿/u)
  assert.equal(caught.image?.width, 1080)
  player = (await readGroup(root, 'g1')).players['20000']
  assert.equal(player.fishing.cast, null)
  assert.equal(player.fishing.fishWarehouse.length, 1)
  const again = await game.command({ groupId: 'g1', userId: '20000', nickname: '小明', command: '/钓鱼 收竿' })
  assert.match(again.replies[0], /当前没有在钓鱼/u)
  await rm(root, { recursive: true, force: true })
})

test('cast fails when the player has no bait and no taigong free cast', async () => {
  const { root, game } = await gachaWorkspace()
  await game.command({ groupId: 'g1', userId: '20000', nickname: '小明', command: '/注册' })
  await seedPlayer(game, { fishing: { rods: { owned: ['bamboo_hand'], equipped: 'bamboo_hand' }, baits: { counts: {} } } })
  const result = await game.command({ groupId: 'g1', userId: '20000', nickname: '小明', command: '/钓鱼 抛竿' })
  assert.match(result.replies[0], /没有鱼饵/u)
  assert.equal((await readGroup(root, 'g1')).players['20000'].fishing.cast, null)
  await rm(root, { recursive: true, force: true })
})

test('legendary rod effects: grey guarantees lv3 and taigong casts without bait', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-cast-effects-'))
  const clock = { at: new Date('2026-11-04T08:00:00+08:00') }
  const game = new GameCore({ projectDir: root, assetsDir: ASSETS_DIR, logger: { warn() {} }, random: () => 0.1, now: () => clock.at })
  await game.command({ groupId: 'g1', userId: '20000', nickname: '小明', command: '/注册' })
  await game.store.mutate('g1', (state) => {
    const p = state.players['20000']
    p.fishing = { rods: { owned: ['grey'], equipped: 'grey' }, baits: { counts: { dough: 1 }, selected: 'dough' } }
  })
  await game.command({ groupId: 'g1', userId: '20000', nickname: '小明', command: '/钓鱼 抛竿 面团饵' })
  clock.at = new Date('2026-11-04T08:00:06+08:00')
  const grey = await game.command({ groupId: 'g1', userId: '20000', nickname: '小明', command: '/钓鱼 收竿' })
  assert.match(grey.replies[0], /Lv\.[345]/u)

  await game.store.mutate('g1', (state) => {
    const p = state.players['20000']
    p.fishing = { rods: { owned: ['taigong'], equipped: 'taigong' }, baits: { counts: {} } }
  })
  clock.at = new Date('2026-11-04T08:01:00+08:00')
  const taigong = await game.command({ groupId: 'g1', userId: '20000', nickname: '小明', command: '/钓鱼 抛竿' })
  assert.match(taigong.replies[0], /正在钓鱼/u)
  assert.ok((await readGroup(root, 'g1')).players['20000'].fishing.cast.effects.length > 0)
  clock.at = new Date('2026-11-04T08:01:06+08:00')
  const caught = await game.command({ groupId: 'g1', userId: '20000', nickname: '小明', command: '/钓鱼 收竿' })
  assert.equal(caught.ok, true)
  await rm(root, { recursive: true, force: true })
})

test('fish warehouse shows numbered fish and sells by number', async () => {
  const { root, game } = await gachaWorkspace()
  await game.command({ groupId: 'g1', userId: '20000', nickname: '小明', command: '/注册' })
  await seedPlayer(game, {
    fishingCoins: 0,
    fishing: {
      fishSeq: 2,
      fishWarehouse: [
        { id: 1, fishId: 'crucian', name: '鲫鱼', tier: 1, weightKg: 0.6, basePricePerKg: 11, pricePerKg: 12, value: 7, caughtAt: NOW.toISOString() },
        { id: 2, fishId: 'bass', name: '鲈鱼', tier: 2, weightKg: 1.2, basePricePerKg: 22, pricePerKg: 24, value: 29, caughtAt: NOW.toISOString() },
      ],
    },
  })
  const warehouse = await game.command({ groupId: 'g1', userId: '20000', nickname: '小明', command: '/钓鱼 鱼仓' })
  assert.match(warehouse.replies[0], /共有 2 条鱼/u)
  assert.equal(warehouse.image?.width, 1080)
  const sold = await game.command({ groupId: 'g1', userId: '20000', nickname: '小明', command: '/钓鱼 卖鱼 1' })
  assert.match(sold.replies[0], /\+7 钓鱼币/u)
  const player = (await readGroup(root, 'g1')).players['20000']
  assert.equal(player.fishingCoins, 7)
  assert.equal(player.fishing.fishWarehouse.length, 1)
  assert.equal(player.fishing.fishWarehouse[0].id, 2)
  const missing = await game.command({ groupId: 'g1', userId: '20000', nickname: '小明', command: '/钓鱼 卖鱼 99' })
  assert.match(missing.replies[0], /没有 #99/u)
  await rm(root, { recursive: true, force: true })
})

test('legendary rod and bait effects apply', async () => {
  const { root, game } = await gachaWorkspace()
  game.cast.load()
  const seq = (values) => { let i = 0; return () => values[i++] ?? 0.5 }
  const cast = (overrides = {}) => ({
    rodId: 'bamboo_hand', effects: [], normalCoefficient: null, waltonFirst: false, forceFive: false, ...overrides,
  })
  const resolve = (overrides, random) => game.cast.resolve({ fishing: { rodDaily: {} }, cast: cast(overrides), random, now: NOW })

  const grey = resolve({ rodId: 'grey' }, seq([0.5, 0.1, 0.5, 0.5]))
  assert.ok(grey.tier >= 3)
  const hemingway = resolve({ rodId: 'hemingway', forceFive: true }, seq([0.5, 0.5, 0.5, 0.5]))
  assert.equal(hemingway.tier, 5)

  const waltonBase = resolve({ rodId: 'walton' }, seq([0.5, 0.5, 0.5, 0.5]))
  const waltonFirst = resolve({ rodId: 'walton', waltonFirst: true }, seq([0.5, 0.5, 0.5, 0.5]))
  assert.equal(waltonFirst.weightKg, Math.round(waltonBase.weightKg * 2 * 100) / 100)

  const ziling = resolve({ rodId: 'ziling' }, seq([0.5, 0.5, 0.5, 0.5]))
  const zilingStats = FISH_STATS[ziling.item.id]
  const zilingExpected = Math.round((zilingStats.minKg + 0.5 * (zilingStats.maxKg - zilingStats.minKg)) * 1.15 * 100) / 100
  assert.equal(ziling.weightKg, zilingExpected)

  const base = resolve({}, seq([0.5, 0.5, 0.5, 0.5]))
  const rapala = resolve({ effects: ['rapala_floater'] }, seq([0.5, 0.5, 0.5, 0.5]))
  assert.equal(rapala.copies, 2)
  const royal = resolve({ effects: ['royal_coachman'] }, seq([0.5, 0.5, 0.5, 0.5]))
  assert.equal(royal.value, Math.round(base.value * 1.5))
  const adams = resolve({ effects: ['adams_dry_fly'] }, seq([0.5, 0.5, 0.5, 0.5]))
  assert.equal(adams.tier, Math.min(5, base.tier + 1))
  assert.equal(typeof adams.extraBait, 'string')
  const dardevle = resolve({ effects: ['dardevle'] }, seq([0.5, 0.5, 0.5, 0.5]))
  assert.equal(typeof dardevle.extraSpecial?.name, 'string')

  const low = game.cast.resolveSpecial({}, { effects: [] }, seq([0.0, 0.5]))
  const high = game.cast.resolveSpecial({}, { effects: [] }, seq([0.99, 0.5]))
  assert.equal(low.tier, 'low')
  assert.equal(high.tier, 'high')

  await rm(root, { recursive: true, force: true })
})

test('mepps bait shortens the cast and the resulting fish gets a numeric id', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-mepps-'))
  const clock = { at: new Date('2026-11-04T09:00:00+08:00') }
  const game = new GameCore({ projectDir: root, assetsDir: ASSETS_DIR, logger: { warn() {} }, random: () => 0.5, now: () => clock.at })
  await game.command({ groupId: 'g1', userId: '20000', nickname: '小明', command: '/注册' })
  await game.store.mutate('g1', (state) => {
    const p = state.players['20000']
    p.fishing = { rods: { owned: ['bamboo_hand'], equipped: 'bamboo_hand' }, baits: { counts: { mepps_aglia: 1 } } }
  })
  await game.command({ groupId: 'g1', userId: '20000', nickname: '小明', command: '/钓鱼 抛竿 梅普斯旋转亮片' })
  let player = (await readGroup(root, 'g1')).players['20000']
  const duration = new Date(player.fishing.cast.readyAt).getTime() - new Date(player.fishing.cast.startedAt).getTime()
  assert.ok(duration > 3000 && duration < 3500)
  clock.at = new Date(new Date(player.fishing.cast.readyAt).getTime() + 1000)
  await game.command({ groupId: 'g1', userId: '20000', nickname: '小明', command: '/钓鱼 收竿' })
  player = (await readGroup(root, 'g1')).players['20000']
  assert.equal(player.fishing.fishWarehouse.length, 1)
  assert.equal(player.fishing.fishWarehouse[0].id, 1)
  await rm(root, { recursive: true, force: true })
})

test('hemingway every 20th cast forces lv5', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-hemingway-'))
  const clock = { at: new Date('2026-11-04T11:00:00+08:00') }
  const game = new GameCore({ projectDir: root, assetsDir: ASSETS_DIR, logger: { warn() {} }, random: () => 0.5, now: () => clock.at })
  await game.command({ groupId: 'g1', userId: '20000', nickname: '小明', command: '/注册' })
  await game.store.mutate('g1', (state) => {
    const p = state.players['20000']
    p.fishing = { rods: { owned: ['hemingway'], equipped: 'hemingway' }, baits: { counts: { dough: 1 } }, castCount: 19 }
  })
  await game.command({ groupId: 'g1', userId: '20000', nickname: '小明', command: '/钓鱼 抛竿 面团饵' })
  clock.at = new Date('2026-11-04T11:00:06+08:00')
  const result = await game.command({ groupId: 'g1', userId: '20000', nickname: '小明', command: '/钓鱼 收竿' })
  assert.match(result.replies[0], /Lv\.5/u)
  await rm(root, { recursive: true, force: true })
})
