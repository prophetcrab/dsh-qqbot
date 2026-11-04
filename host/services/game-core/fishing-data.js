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
