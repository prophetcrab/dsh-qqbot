/**
 * Persona plugin: the AI character card and its named presets.
 */

import { join } from 'node:path'
import {
  DEFAULT_PERSONA,
  buildPersonaPrompt,
  normalizePersona,
  readPersonaFile,
  writePersonaFile,
} from '../../services/persona/index.js'
import {
  loadPresetStore,
  removePreset,
  savePresetStore,
  upsertPreset,
} from '../../services/persona/presets.js'
import { routes } from './routes.js'

export const name = 'persona'
export const version = '1.0.0'

export default {
  id: 'qqbot-persona',
  name,
  version,
  inject: [],
  provides: ['persona'],
  description: 'Active persona card, prompt preview and persona presets.',
  async apply(api) {
    const path = join(api.settings.projectDir, 'data', 'persona.json')
    const presetsPath = join(api.settings.projectDir, 'data', 'persona-presets.json')
    const service = {
      path,
      presetsPath,
      defaults: DEFAULT_PERSONA,
      read: () => readPersonaFile(path),
      write: (persona) => writePersonaFile(path, persona),
      normalize: normalizePersona,
      buildPrompt: buildPersonaPrompt,
      loadPresets: () => loadPresetStore(presetsPath),
      savePresets: (store) => savePresetStore(presetsPath, store),
      upsertPreset,
      removePreset,
    }
    api.provide('persona', service)
    api.registerRoutes(routes(api, service))
    api.registerStatusProvider(async () => {
      const card = (await readPersonaFile(path)) ?? normalizePersona(DEFAULT_PERSONA)
      return {
        persona: {
          name: card.name,
          examples: card.examples.length,
          updatedAt: card.updatedAt ?? null,
        },
      }
    })
  },
}
