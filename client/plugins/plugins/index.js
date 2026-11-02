import { registerTab } from '../../runtime/tab-registry.js'
import {
  usePlugins, loadPlugins, installPlugin, refreshAfterPluginChange, renderPlugins,
} from './PluginsTab.js'

registerTab({
  id: 'plugins',
  labelKey: 'tabPlugins',
  order: 4,
  use(panel) {
    usePlugins(panel)
    return () => renderPlugins(panel)
  },
  handlers: {
    loadPlugins,
    installPlugin,
    refreshAfterPluginChange,
  },
})
