import { registerTab } from '../../runtime/tab-registry.js'
import { useFeatures, loadFeatures, renderFeatures } from './FeaturesTab.js'

registerTab({
  id: 'features',
  labelKey: 'tabFeatures',
  order: 9,
  use(panel) {
    useFeatures(panel)
    return () => renderFeatures(panel)
  },
  handlers: {
    loadFeatures,
  },
})
