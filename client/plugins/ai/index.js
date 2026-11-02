import { useAi, renderAiTab } from './AiTab.js'
import {
  loadPersona, loadAiSettings, loadProfiles, loadPersonaPresets, loadLastPrompt,
  testAi, applyPersonaPayload, savePersona, resetPersona,
  applyAiSettingsPayload, saveAiSettings, resetAiSettingsDraft,
  selectProfile, saveProfile, deleteProfile,
  savePersonaPreset, loadPersonaPreset, deletePersonaPreset,
} from './AiActions.js'

export const id = 'ai'
export const labelKey = 'tabAi'
export const handlers = {
  loadPersona, loadAiSettings, loadProfiles, loadPersonaPresets, loadLastPrompt,
  testAi, applyPersonaPayload, savePersona, resetPersona,
  applyAiSettingsPayload, saveAiSettings, resetAiSettingsDraft,
  selectProfile, saveProfile, deleteProfile,
  savePersonaPreset, loadPersonaPreset, deletePersonaPreset,
}

export function use(panel) {
  useAi(panel)
  return () => renderAiTab(panel)
}
