import {
  usePlugins, loadPlugins, installPlugin, refreshAfterPluginChange, renderPlugins
} from './PluginsTab.js'

export const id = 'plugins'
export const labelKey = 'tabPlugins'
export const handlers = { loadPlugins, installPlugin, refreshAfterPluginChange }

export function use(panel) {
  usePlugins(panel)
  return () => renderPlugins(panel)
}
