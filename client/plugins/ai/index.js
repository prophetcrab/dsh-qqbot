import { registerTab } from '../../runtime/tab-registry.js'
import { useAi, renderAiTab } from './AiTab.js'
import {
  loadPersona, loadAiSettings, loadProfiles, loadPersonaPresets, loadLastPrompt,
  testAi, applyPersonaPayload, savePersona, resetPersona,
  applyAiSettingsPayload, saveAiSettings, resetAiSettingsDraft,
  selectProfile, saveProfile, deleteProfile,
  savePersonaPreset, loadPersonaPreset, deletePersonaPreset,
} from './AiActions.js'

registerTab({
  id: 'ai',
  labelKey: 'tabAi',
  order: 1,
  use(panel) {
    useAi(panel)
    return () => renderAiTab(panel)
  },
  handlers: {
    loadPersona, loadAiSettings, loadProfiles, loadPersonaPresets, loadLastPrompt,
    testAi, applyPersonaPayload, savePersona, resetPersona,
    applyAiSettingsPayload, saveAiSettings, resetAiSettingsDraft,
    selectProfile, saveProfile, deleteProfile,
    savePersonaPreset, loadPersonaPreset, deletePersonaPreset,
  },
})
