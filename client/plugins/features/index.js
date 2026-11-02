import { useFeatures, loadFeatures, runFeatureAction, renderFeatures } from './FeaturesTab.js'

export const id = 'features'
export const labelKey = 'tabFeatures'
export const handlers = { loadFeatures, runFeatureAction }

export function use(panel) {
  useFeatures(panel)
  return () => renderFeatures(panel)
}
