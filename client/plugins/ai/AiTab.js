import React from 'react'
import { renderAiCard } from './AiCard.js'
import { renderAiRuntimeCard } from './AiRuntimeCard.js'
import { renderAiSettingsCard } from './AiSettingsCard.js'
import { renderFullPromptCard } from './PromptCard.js'
import { renderPersonaCard } from './PersonaCard.js'
import { renderProfilesCard } from './ProfilesCard.js'
import { renderSectionHead } from './SectionHead.js'

export function renderAiTab(panel) {
  const { h } = panel
  return h('div', { className: 'qqbot-stack qqbot-ai-tab' },
    renderSectionHead(panel, 'aiSectionStatus', 'aiSectionStatusHint'),
    renderAiCard(panel),
    renderAiRuntimeCard(panel),
    renderSectionHead(panel, 'aiSectionBehavior', 'aiSectionBehaviorHint'),
    renderAiSettingsCard(panel),
    renderSectionHead(panel, 'aiSectionPrompt', 'aiSectionPromptHint'),
    renderFullPromptCard(panel),
    renderPersonaCard(panel),
    renderProfilesCard(panel))
}

/**
 * AI tab hooks: lazy-load the runtime/settings/presets/profiles/prompt cards
 * the first time the tab is opened, and read the persona card on mount.
 */
export function useAi(panel) {
  const {
    tab, aiSettingsPhase, aiRuntimePhase, profilesPhase, personaPresetsPhase, lastPromptState, profilesSearch,
    loadAiSettings, loadAiRuntime, loadProfiles, loadPersonaPresets, loadLastPrompt, loadPersona
  } = panel

  React.useEffect(() => {
    if (tab === 'ai' && aiSettingsPhase === 'idle') loadAiSettings()
    if (tab === 'ai' && aiRuntimePhase === 'idle') loadAiRuntime()
    if (tab === 'ai' && profilesPhase === 'idle') loadProfiles(profilesSearch)
    if (tab === 'ai' && personaPresetsPhase === 'idle') loadPersonaPresets()
    if (tab === 'ai' && lastPromptState.phase === 'idle') loadLastPrompt()
  }, [tab, aiSettingsPhase, aiRuntimePhase, profilesPhase, personaPresetsPhase, lastPromptState.phase])

  React.useEffect(() => {
    loadPersona()
  }, [])
}
