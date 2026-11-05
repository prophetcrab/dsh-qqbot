/**
 * Shared fishing player state: schema defaults and collection records.
 *
 * `ensureFishing` used to live in fishing-cast.js, but gacha and the catch loop
 * both need to write `/钓鱼 图鉴` records. Keeping the state helpers in their
 * own module avoids a gacha ⇄ cast import cycle.
 */

/**
 * Ensure every fishing sub-state exists and return `player.fishing`.
 *
 * Also creates the `codex` bucket that `/钓鱼 图鉴` reads:
 * - `codex.rods[id]  = { at: ISO|null }`  first time this rod was acquired
 * - `codex.baits[id] = { at: ISO|null }`  first time this bait was acquired
 * - `codex.fish[id]  = { maxWeightKg, at }` heaviest fish ever caught
 *
 * @param {any} player
 * @returns {any} the player's fishing state
 */
export function ensureFishing(player) {
  if (player.fishing === null || typeof player.fishing !== 'object') player.fishing = {}
  const f = player.fishing
  f.cast = f.cast !== null && typeof f.cast === 'object' ? f.cast : null
  f.rodDaily = f.rodDaily !== null && typeof f.rodDaily === 'object' ? f.rodDaily : {}
  f.castCount = Number.isSafeInteger(f.castCount) ? f.castCount : 0
  f.fishWarehouse = Array.isArray(f.fishWarehouse) ? f.fishWarehouse : []
  f.fishSeq = Number.isSafeInteger(f.fishSeq) ? f.fishSeq : 0
  for (const fish of f.fishWarehouse) {
    if (!Number.isSafeInteger(fish.id)) {
      f.fishSeq += 1
      fish.id = f.fishSeq
    } else {
      f.fishSeq = Math.max(f.fishSeq, fish.id)
    }
  }
  f.specials = f.specials !== null && typeof f.specials === 'object' ? f.specials : {}
  if (f.tickets === null || typeof f.tickets !== 'object') f.tickets = {}
  f.tickets.singleTickets = Number.isSafeInteger(f.tickets.singleTickets) ? f.tickets.singleTickets : 0
  f.tickets.tenTickets = Number.isSafeInteger(f.tickets.tenTickets) ? f.tickets.tenTickets : 0
  if (f.rods === null || typeof f.rods !== 'object') f.rods = {}
  f.rods.owned = Array.isArray(f.rods.owned) ? f.rods.owned : []
  if (typeof f.rods.equipped !== 'string') f.rods.equipped = null
  if (f.baits === null || typeof f.baits !== 'object') f.baits = {}
  if (f.baits.counts === null || typeof f.baits.counts !== 'object') f.baits.counts = {}
  if (f.codex === null || typeof f.codex !== 'object') f.codex = {}
  if (f.codex.rods === null || typeof f.codex.rods !== 'object') f.codex.rods = {}
  if (f.codex.baits === null || typeof f.codex.baits !== 'object') f.codex.baits = {}
  if (f.codex.fish === null || typeof f.codex.fish !== 'object') f.codex.fish = {}
  return f
}

/** Ensure only the codex bucket exists; returns null for an unusable state. */
function codexOf(fishing) {
  if (fishing === null || typeof fishing !== 'object') return null
  if (fishing.codex === null || typeof fishing.codex !== 'object') fishing.codex = {}
  if (fishing.codex.rods === null || typeof fishing.codex.rods !== 'object') fishing.codex.rods = {}
  if (fishing.codex.baits === null || typeof fishing.codex.baits !== 'object') fishing.codex.baits = {}
  if (fishing.codex.fish === null || typeof fishing.codex.fish !== 'object') fishing.codex.fish = {}
  return fishing.codex
}

/** Normalize an ISO/Date value to an ISO string, or null when unusable. */
function isoOrNull(value) {
  if (value === null || value === undefined) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function roundWeight(value) {
  return Math.round(value * 100) / 100
}

/**
 * Record the first acquisition time of a rod. Duplicates keep the first time.
 *
 * @param {any} fishing
 * @param {string} rodId
 * @param {string|Date} at
 */
export function recordRodAcquired(fishing, rodId, at) {
  if (typeof rodId !== 'string' || rodId === '') return
  const codex = codexOf(fishing)
  if (codex === null || codex.rods[rodId] !== undefined) return
  codex.rods[rodId] = { at: isoOrNull(at) }
}

/**
 * Record the first acquisition time of a bait. Restocking keeps the first time.
 *
 * @param {any} fishing
 * @param {string} baitId
 * @param {string|Date} at
 */
export function recordBaitAcquired(fishing, baitId, at) {
  if (typeof baitId !== 'string' || baitId === '') return
  const codex = codexOf(fishing)
  if (codex === null || codex.baits[baitId] !== undefined) return
  codex.baits[baitId] = { at: isoOrNull(at) }
}

/**
 * Keep the heaviest weight ever caught for one fish species.
 *
 * @param {any} fishing
 * @param {string} fishId
 * @param {number} weightKg
 * @param {string|Date} at
 */
export function recordFishCaught(fishing, fishId, weightKg, at) {
  const weight = Number(weightKg)
  if (typeof fishId !== 'string' || fishId === '' || !Number.isFinite(weight) || weight <= 0) return
  const codex = codexOf(fishing)
  if (codex === null) return
  const rounded = roundWeight(weight)
  const previous = codex.fish[fishId]
  if (previous !== undefined && Number(previous.maxWeightKg) >= rounded) return
  codex.fish[fishId] = { maxWeightKg: rounded, at: isoOrNull(at) }
}
