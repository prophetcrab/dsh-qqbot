import React from 'react'
import { renderAiCard } from './AiCard.js'
import { renderAiRuntimeCard } from './AiRuntimeCard.js'
import { renderAiSettingsCard } from './AiSettingsCard.js'
import { renderFullPromptCard } from './PromptCard.js'
import { renderPersonaCard } from './PersonaCard.js'
import { renderProfilesCard } from './ProfilesCard.js'

const AI_VIEWS = [
  { id: 'config', labelKey: 'aiSubnavConfig', hintKey: 'aiSubnavConfigHint' },
  { id: 'runtime', labelKey: 'aiSubnavRuntime', hintKey: 'aiSubnavRuntimeHint' },
]

export function renderAiTab(panel) {
  const { h, aiView, setAiView } = panel
  const view = aiView === 'runtime' ? 'runtime' : 'config'
  const subnav = h('div', { className: 'qqbot-ai-subnav', role: 'tablist', 'aria-label': panel.t('aiSubnavLabel') },
    ...AI_VIEWS.map((item) => h('button', {
      key: item.id,
      type: 'button',
      role: 'tab',
      'aria-selected': view === item.id ? 'true' : 'false',
      'data-testid': `qqbot-ai-subtab-${item.id}`,
      className: `qqbot-ai-subnav-btn${view === item.id ? ' is-active' : ''}`,
      onClick: () => { setAiView(item.id) },
    },
      h('span', { className: 'qqbot-ai-subnav-label' }, panel.t(item.labelKey)),
      h('span', { className: 'qqbot-ai-subnav-hint' }, panel.t(item.hintKey)))))
  // Card-first layout: the two compact cards share a row, the editing cards
  // below get full width. No extra section headings: each card already has a
  // title and a short subtitle, which keeps the page calm and scannable.
  const config = h('div', { className: 'qqbot-ai-view qqbot-ai-config' },
    renderAiCard(panel),
    renderAiSettingsCard(panel),
    renderFullPromptCard(panel),
    renderPersonaCard(panel),
    renderProfilesCard(panel))
  const diagnostics = h('div', { className: 'qqbot-ai-view qqbot-ai-diagnostics' },
    renderAiRuntimeCard(panel))
  return h('div', { className: 'qqbot-ai-tab' }, subnav, view === 'runtime' ? diagnostics : config)
}

/**
 * AI tab hooks: lazy-load the runtime/settings/presets/profiles/prompt cards
 * the first time the tab is opened, and read the persona card on mount.
 */
export function useAi(panel) {
  const {
    tab, aiView, aiSettingsPhase, aiRuntimePhase, profilesPhase, personaPresetsPhase, lastPromptState, profilesSearch,
    loadAiSettings, loadAiRuntime, loadProfiles, loadPersonaPresets, loadLastPrompt, loadPersona
  } = panel

  React.useEffect(() => {
    if (tab !== 'ai') return
    if (aiView === 'runtime') {
      if (aiRuntimePhase === 'idle') loadAiRuntime()
      return
    }
    if (aiSettingsPhase === 'idle') loadAiSettings()
    if (profilesPhase === 'idle') loadProfiles(profilesSearch)
    if (personaPresetsPhase === 'idle') loadPersonaPresets()
    if (lastPromptState.phase === 'idle') loadLastPrompt()
  }, [tab, aiView, aiSettingsPhase, aiRuntimePhase, profilesPhase, personaPresetsPhase, lastPromptState.phase])

  React.useEffect(() => {
    loadPersona()
  }, [])
}
