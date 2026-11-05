/** Pure shaping helpers for `/钓鱼 抽卡记录` (no state, no rendering). */
export const SOURCE_LABELS = Object.freeze({
  singleTicket: '单抽券',
  tenTicket: '十连券',
  coin: '钓鱼币',
})

/** ISO time -> `MM-DD HH:mm` in Asia/Shanghai. */
export function formatHistoryTime(value) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(date)
    const get = (type) => parts.find((part) => part.type === type)?.value ?? ''
    return `${get('month')}-${get('day')} ${get('hour')}:${get('minute')}`
  } catch {
    return value.slice(5, 16).replace('T', ' ')
  }
}

/** Tier from a catalog item, falling back to the stored rarity label. */
function tierOf(entry, item) {
  const tier = Number(item?.tier)
  if (Number.isInteger(tier) && tier > 0) return tier
  const rarity = String(entry?.rarity ?? '')
  if (rarity === 'Legendary') return 4
  const match = /^Lv\.(\d+)$/u.exec(rarity)
  return match === null ? 1 : Number(match[1])
}

/**
 * Newest-first rows for the history renderer.
 *
 * @param {any[]} history stored oldest-first
 * @param {Map<string, any>} itemById rod/bait catalog entries
 */
export function buildHistoryRows(history, itemById) {
  const list = Array.isArray(history) ? history.slice(-50) : []
  const catalog = itemById instanceof Map ? itemById : new Map()
  return list.slice().reverse().map((entry) => {
    const item = catalog.get(String(entry?.itemId ?? ''))
    const tier = tierOf(entry, item)
    const rarity = String(entry?.rarity ?? '')
    return {
      drawNo: Number.isSafeInteger(entry?.drawNo) ? entry.drawNo : 0,
      timeLabel: formatHistoryTime(entry?.at),
      sourceLabel: SOURCE_LABELS[String(entry?.source ?? '')] ?? String(entry?.source ?? '—'),
      itemId: String(entry?.itemId ?? ''),
      name: String(entry?.itemName ?? item?.name ?? entry?.itemId ?? '未知'),
      kind: entry?.kind === 'rod' ? 'rod' : 'bait',
      tier,
      rarityLabel: rarity === 'Legendary' ? '传奇' : (rarity || `Lv.${tier}`),
      pity: entry?.pityTriggered !== null && entry?.pityTriggered !== undefined,
      duplicateSold: Number.isSafeInteger(entry?.duplicateSold) && entry.duplicateSold > 0 ? entry.duplicateSold : 0,
    }
  })
}

/**
 * Header summary for the history renderer.
 *
 * @param {ReturnType<typeof buildHistoryRows>} rows
 * @param {any} gacha current gacha counters
 * @param {{ rod: number, lv3Rod: number, legendaryBait: number, legendaryRod: number }} limits
 */
export function buildHistorySummary(rows, gacha, limits) {
  const list = Array.isArray(rows) ? rows : []
  const counters = gacha !== null && typeof gacha === 'object' ? gacha : {}
  const clampProgress = (value, limit) => {
    const max = Number.isInteger(limit) && limit > 0 ? limit : 1
    const current = Number(counters[value])
    return { value: Number.isInteger(current) && current > 0 ? Math.min(current, max) : 0, limit: max }
  }
  return {
    totalDraws: Number.isSafeInteger(counters.totalDraws) && counters.totalDraws > 0 ? counters.totalDraws : list.length,
    shown: list.length,
    legendary: list.filter((row) => row.tier >= 4).length,
    duplicateCoins: list.reduce((sum, row) => sum + row.duplicateSold, 0),
    pity: {
      rod: clampProgress('rodPity', limits?.rod),
      lv3Rod: clampProgress('lv3RodPity', limits?.lv3Rod),
      legendaryBait: clampProgress('legendaryBaitPity', limits?.legendaryBait),
      legendaryRod: clampProgress('legendaryRodPity', limits?.legendaryRod),
    },
  }
}
