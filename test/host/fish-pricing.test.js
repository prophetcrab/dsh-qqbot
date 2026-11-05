/** Fish pricing invariants: tier value bands must not overlap and stay in sync. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { FISH_STATS } from '../../host/services/game-fishing/data.js'

const FISH = JSON.parse(readFileSync(join(process.cwd(), 'assets', 'fish', 'catalog.json'), 'utf8')).fish
const tierOf = new Map(FISH.map((fish) => [fish.id, fish.tier]))

/**
 * Analytic expected value of the documented formula over the uniform weight
 * range (pricePerKg is treated as continuous, matching the design table).
 */
function expectedValue(stats) {
  const { minKg: a, maxKg: b, basePricePerKg: base, weightBonus: bonus } = stats
  const meanWeight = (a + b) / 2
  const meanSquare = (a * a + a * b + b * b) / 3
  const meanWeightRatio = (meanSquare - a * meanWeight) / (b - a)
  return base * (meanWeight + bonus * meanWeightRatio)
}

function bands() {
  const result = new Map()
  for (const [id, stats] of Object.entries(FISH_STATS)) {
    const tier = tierOf.get(id)
    assert.ok(Number.isInteger(tier), `fish ${id} is missing from the fish catalog`)
    const value = expectedValue(stats)
    const band = result.get(tier) ?? { min: Infinity, max: -Infinity, values: [] }
    band.min = Math.min(band.min, value)
    band.max = Math.max(band.max, value)
    band.values.push(value)
    result.set(tier, band)
  }
  return result
}

test('fish catalog and FISH_STATS stay in sync', () => {
  assert.equal(FISH.length, 20)
  assert.equal(Object.keys(FISH_STATS).length, FISH.length)
  for (const fish of FISH) assert.ok(FISH_STATS[fish.id] !== undefined, `missing stats for ${fish.id}`)
})

test('expected value bands do not overlap across tiers', () => {
  const valueBands = bands()
  const tiers = [...valueBands.keys()].sort((left, right) => left - right)
  assert.deepEqual(tiers, [1, 2, 3, 4, 5])
  for (let index = 0; index < tiers.length - 1; index += 1) {
    const current = valueBands.get(tiers[index])
    const next = valueBands.get(tiers[index + 1])
    assert.ok(
      current.max < next.min,
      `Lv.${tiers[index]} max ${current.max.toFixed(1)} must stay below Lv.${tiers[index + 1]} min ${next.min.toFixed(1)}`,
    )
  }
})

test('tier average values match the documented balance table', () => {
  const documented = { 1: 5.2, 2: 39.1, 3: 84.7, 4: 134.1, 5: 338.0 }
  const valueBands = bands()
  for (const [tier, average] of Object.entries(documented)) {
    const values = valueBands.get(Number(tier)).values
    const actual = values.reduce((sum, value) => sum + value, 0) / values.length
    assert.ok(Math.abs(actual - average) < 0.1, `Lv.${tier} average ${actual.toFixed(1)} != ${average}`)
  }
})
