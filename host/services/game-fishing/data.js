/** Fishing catalogs that are not part of the generated art JSON. */
export const FISH_STATS = Object.freeze({
  crucian: { minKg: 0.15, maxKg: 1.0, basePricePerKg: 11, weightBonus: 0.15 },
  whitebait: { minKg: 0.05, maxKg: 0.30, basePricePerKg: 13, weightBonus: 0.15 },
  loach: { minKg: 0.05, maxKg: 0.20, basePricePerKg: 12, weightBonus: 0.15 },
  small_carp: { minKg: 0.30, maxKg: 1.50, basePricePerKg: 10, weightBonus: 0.15 },
  bass: { minKg: 0.40, maxKg: 3.0, basePricePerKg: 22, weightBonus: 0.20 },
  bream: { minKg: 0.30, maxKg: 2.5, basePricePerKg: 19, weightBonus: 0.20 },
  yellow_catfish: { minKg: 0.10, maxKg: 1.2, basePricePerKg: 24, weightBonus: 0.20 },
  grass_carp: { minKg: 1.0, maxKg: 6.0, basePricePerKg: 17, weightBonus: 0.20 },
  mandarin_fish: { minKg: 0.80, maxKg: 5.0, basePricePerKg: 17, weightBonus: 0.25 },
  snakehead: { minKg: 1.0, maxKg: 7.0, basePricePerKg: 15, weightBonus: 0.25 },
  black_carp: { minKg: 2.0, maxKg: 12.0, basePricePerKg: 13, weightBonus: 0.25 },
  koi: { minKg: 0.50, maxKg: 8.0, basePricePerKg: 19, weightBonus: 0.25 },
  golden_scale_carp: { minKg: 2.0, maxKg: 15.0, basePricePerKg: 13, weightBonus: 0.35 },
  moon_shade_mandarin: { minKg: 1.5, maxKg: 10.0, basePricePerKg: 15, weightBonus: 0.35 },
  red_fin_sturgeon: { minKg: 5.0, maxKg: 30.0, basePricePerKg: 11, weightBonus: 0.35 },
  cloud_eel: { minKg: 2.0, maxKg: 12.0, basePricePerKg: 14, weightBonus: 0.35 },
  dragon_scale_koi: { minKg: 3.0, maxKg: 20.0, basePricePerKg: 11, weightBonus: 0.50 },
  star_river_mandarin: { minKg: 2.0, maxKg: 15.0, basePricePerKg: 13, weightBonus: 0.50 },
  void_kun: { minKg: 20.0, maxKg: 100.0, basePricePerKg: 9, weightBonus: 0.50 },
  glazed_dragonfish: { minKg: 5.0, maxKg: 25.0, basePricePerKg: 12, weightBonus: 0.50 },
})

export const NORMAL_BAIT_COEFFICIENTS = Object.freeze({
  dough: [1.06, 1.02, 0.98, 0.97, 0.97],
  red_worm: [0.98, 1.06, 1.02, 0.97, 0.97],
  rice_wine: [0.98, 1.00, 1.06, 1.00, 0.97],
  shrimp_powder: [1.00, 1.10, 1.03, 0.96, 0.94],
  corn: [0.93, 1.04, 1.10, 1.00, 0.94],
  worm_paste: [0.88, 0.98, 1.10, 1.08, 0.96],
  secret_fish: [0.88, 1.00, 1.18, 1.10, 0.94],
  golden_insect: [0.78, 0.92, 1.16, 1.22, 1.00],
  aged_grain: [0.70, 0.86, 1.08, 1.30, 1.08],
})

export const LEGENDARY_BAIT_EFFECTS = Object.freeze([
  'rapala_floater',
  'mepps_aglia',
  'dardevle',
  'adams_dry_fly',
  'royal_coachman',
])

export const SPECIAL_WEIGHTS = Object.freeze({ low: 0.7, high: 0.3 })

/** Static rod gameplay data: 5 tier weights, sell price and effect text. */
export const ROD_INFO = Object.freeze({
  bamboo_hand: { weights: [60, 30, 8, 2, 0], sellPrice: 3, effect: '无特殊效果' },
  fiberglass_hand: { weights: [58, 31, 8, 3, 0], sellPrice: 4, effect: '无特殊效果' },
  fiberglass_surf: { weights: [62, 28, 8, 2, 0], sellPrice: 3, effect: '无特殊效果' },
  carbon_hand: { weights: [35, 35, 20, 8, 2], sellPrice: 7, effect: '无特殊效果' },
  carbon_iso: { weights: [30, 38, 22, 8, 2], sellPrice: 8, effect: '无特殊效果' },
  carbon_lure: { weights: [40, 32, 18, 8, 2], sellPrice: 7, effect: '无特殊效果' },
  high_carbon_hand: { weights: [13, 25, 32, 20, 10], sellPrice: 15, effect: '无特殊效果' },
  high_carbon_lure: { weights: [10, 23, 33, 22, 12], sellPrice: 18, effect: '无特殊效果' },
  high_carbon_surf: { weights: [15, 25, 31, 19, 10], sellPrice: 16, effect: '无特殊效果' },
  taigong: { weights: [3, 14, 30, 32, 21], sellPrice: 100, effect: '每日第一次钓鱼不消耗鱼饵，并随机获得一种传奇鱼饵效果' },
  ziling: { weights: [2, 12, 30, 34, 22], sellPrice: 120, effect: '全天鱼获重量 +15%' },
  walton: { weights: [2, 13, 31, 33, 21], sellPrice: 110, effect: '每日第一次钓鱼的那条鱼重量翻倍' },
  grey: { weights: [1, 10, 28, 36, 25], sellPrice: 140, effect: '每次钓鱼保底 Lv.3+ 鱼' },
  hemingway: { weights: [1, 7, 24, 38, 30], sellPrice: 160, effect: '每 20 次钓鱼，本次保底 Lv.5 鱼' },
})

/** Pull counts that trigger pity for each pool. */
export const PITY_LIMITS = Object.freeze({
  rod: 10,
  lv3Rod: 50,
  legendaryBait: 60,
  legendaryRod: 150,
})

/** Base gacha category rates (percent) shared by the draw and the pool view. */
export const CATEGORY_RATES = Object.freeze({
  bait: Object.freeze({ 1: 37.5, 2: 30, 3: 20, 4: 2.5 }),
  rod: Object.freeze({ 1: 5, 2: 2.857, 3: 1.786, 4: 0.357 }),
})
