/**
 * Host contracts: the stable DTO/schema boundary shared by HTTP routes, the
 * web panel and the Koishi side.
 *
 * Layer rule: contracts never import platform/services/plugins/kernel.
 */

import { validateAgainstSchema as validateAgainstSchemaLocal } from './validate.js'
import statusSchema from './status.schema.json' with { type: 'json' }
import panelSchema from './panel.schema.json' with { type: 'json' }
import configSchema from './config.schema.json' with { type: 'json' }
import pluginManifestSchema from './plugin-manifest.schema.json' with { type: 'json' }

export { statusSchema, panelSchema, configSchema, pluginManifestSchema }
export { validateAgainstSchema } from './validate.js'

/**
 * Validate a status snapshot returned by `/qqbot/status`.
 * @param {unknown} snapshot
 */
export function validateStatusSnapshot(snapshot) {
  return validateAgainstSchemaLocal(snapshot, statusSchema)
}

/** Validate a feature descriptor contributed by a plugin. */
export function validatePanelFeature(feature) {
  return validateAgainstSchemaLocal(feature, panelSchema.definitions.feature)
}

/** Validate a client tab descriptor contributed by a plugin. */
export function validateClientTab(tab) {
  return validateAgainstSchemaLocal(tab, panelSchema.definitions.clientTab)
}

/** Validate a resolved host configuration object. */
export function validateHostConfig(config) {
  return validateAgainstSchemaLocal(config, configSchema)
}
