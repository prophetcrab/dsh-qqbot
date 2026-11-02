import { registerTab } from '../../runtime/tab-registry.js'
import { useFeatures, loadFeatures, runFeatureAction, renderFeatures } from './FeaturesTab.js'

registerTab({
  id: 'features',
  labelKey: 'tabFeatures',
  order: 5,
  use(panel) {
    useFeatures(panel)
    return () => renderFeatures(panel)
  },
  handlers: {
    loadFeatures,
    runFeatureAction,
  },
})
