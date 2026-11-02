import {
  requestJson, messageOf, aiSettingsDraftFrom, aiSettingsBodyFrom, draftFromPersona, personaBody,
  profileDraftFrom, profileBodyFrom, AI_TEST_PROMPT
} from '../../runtime/api.js'

export async function loadPersona(panel) {
  const { setPersonaDraft, setPersonaPreview, setPersonaPath, setPersonaPhase, setPersonaError } = panel
  setPersonaPhase('loading')
  try {
    const payload = await requestJson('/qqbot/persona')
    const data = payload && payload.data
    if (data === null || typeof data !== 'object' || data.persona === null || typeof data.persona !== 'object') {
      throw new Error('unexpected payload')
    }
    setPersonaDraft(draftFromPersona(data.persona))
    setPersonaPreview(typeof data.promptPreview === 'string' ? data.promptPreview : '')
    setPersonaPath(typeof data.path === 'string' ? data.path : null)
    setPersonaError(null)
    setPersonaPhase('ready')
  } catch (error) {
    setPersonaError(messageOf(error))
    setPersonaPhase('error')
  }
}

export async function loadAiSettings(panel) {
  const {
    setAiSettingsDraft, setAiSettingsDefaults, setAiSettingsPath, setAiSettingsPhase, setAiSettingsError
  } = panel
  setAiSettingsPhase('loading')
  try {
    const payload = await requestJson('/qqbot/ai/settings')
    const data = payload && payload.data
    if (data === null || typeof data !== 'object' || data.settings === null || typeof data.settings !== 'object') {
      throw new Error('unexpected payload')
    }
    setAiSettingsDraft(aiSettingsDraftFrom(data.settings))
    setAiSettingsDefaults(data.defaults !== null && typeof data.defaults === 'object' ? data.defaults : null)
    setAiSettingsPath(typeof data.path === 'string' ? data.path : null)
    setAiSettingsError(null)
    setAiSettingsPhase('ready')
  } catch (error) {
    setAiSettingsError(messageOf(error))
    setAiSettingsPhase('error')
  }
}

export async function loadProfiles(panel, search) {
  const { setProfiles, setProfilesPhase, setProfilesError, profilesSearch, setProfilesPath } = panel
  const query = typeof search === 'string' ? search : profilesSearch
  setProfilesPhase('loading')
  try {
    const payload = await requestJson(`/qqbot/profiles?search=${encodeURIComponent(query)}`)
    const data = payload && payload.data
    if (data === null || typeof data !== 'object' || !Array.isArray(data.profiles)) throw new Error('unexpected payload')
    setProfiles(data.profiles)
    setProfilesPath(typeof data.path === 'string' ? data.path : null)
    setProfilesError(null)
    setProfilesPhase('ready')
  } catch (error) {
    setProfilesError(messageOf(error))
    setProfilesPhase('error')
  }
}

export async function loadPersonaPresets(panel) {
  const { setPersonaPresets, setPersonaPresetsPhase, setPersonaPresetsError, setPersonaPresetsPath } = panel
  setPersonaPresetsPhase('loading')
  try {
    const payload = await requestJson('/qqbot/persona/presets')
    const data = payload && payload.data
    if (data === null || typeof data !== 'object' || !Array.isArray(data.presets)) throw new Error('unexpected payload')
    setPersonaPresets(data.presets)
    setPersonaPresetsPath(typeof data.path === 'string' ? data.path : null)
    setPersonaPresetsError(null)
    setPersonaPresetsPhase('ready')
  } catch (error) {
    setPersonaPresetsError(messageOf(error))
    setPersonaPresetsPhase('error')
  }
}

export async function loadLastPrompt(panel) {
  const { setLastPromptState } = panel
  setLastPromptState((previous) => ({ ...previous, phase: 'loading', error: null }))
  try {
    const payload = await requestJson('/qqbot/ai/last-prompt')
    const data = payload && payload.data
    setLastPromptState({
      phase: 'ready',
      prompt: data !== null && typeof data === 'object' && data.prompt !== undefined ? data.prompt : null,
      error: null,
    })
  } catch (error) {
    setLastPromptState((previous) => ({ ...previous, phase: 'error', error: messageOf(error) }))
  }
}

/**
 * Ask the Host's local AI bridge for a fixed self-test reply. The route
 * answers 200 with `ok:false` on failure, so it opts out of the global
 * throw and renders the error inside the card.
 */
export async function testAi(panel) {
  const { t, setBusy, setAiReply, setAiError, busyOf } = panel
  if (busyOf('ai-test')) return
  setBusy((previous) => ({ ...previous, 'ai-test': true }))
  setAiReply(null)
  setAiError(null)
  try {
    const result = await requestJson('/qqbot/ai/chat', {
      method: 'POST',
      body: { messages: [{ role: 'user', text: AI_TEST_PROMPT }] },
      acceptNotOk: true,
    })
    if (result !== null && result.ok === true && typeof result.reply === 'string') {
      setAiReply(result.reply)
    } else {
      const reason = result !== null && typeof result.error === 'string' && result.error !== ''
        ? result.error
        : result !== null && typeof result.code === 'string' ? result.code : t('aiTestFailed')
      setAiError(reason)
    }
  } catch (error) {
    setAiError(messageOf(error))
  } finally {
    setBusy((previous) => {
      const next = { ...previous }
      delete next['ai-test']
      return next
    })
  }
}

export function applyPersonaPayload(panel, result) {
  const { setPersonaDraft, setPersonaPreview, setPersonaPath, setPersonaPhase, setPersonaError } = panel
  const data = result && result.data
  if (data === null || typeof data !== 'object' || data.persona === null || typeof data.persona !== 'object') return false
  setPersonaDraft(draftFromPersona(data.persona))
  setPersonaPreview(typeof data.promptPreview === 'string' ? data.promptPreview : '')
  setPersonaPath(typeof data.path === 'string' ? data.path : null)
  setPersonaError(null)
  setPersonaPhase('ready')
  return true
}

export async function savePersona(panel) {
  const { t, setBanner, setBusy, personaDraft, setPersonaError, busyOf, applyPersonaPayload } = panel
  if (personaDraft === null || busyOf('persona-save')) return
  setBusy((previous) => ({ ...previous, 'persona-save': true }))
  setPersonaError(null)
  try {
    const result = await requestJson('/qqbot/persona/save', {
      method: 'POST',
      body: { persona: personaBody(personaDraft) },
      acceptNotOk: true,
    })
    if (result !== null && result.ok === true && applyPersonaPayload(result)) {
      setBanner({ kind: 'ok', text: t('personaSaved') })
    } else {
      setPersonaError(result !== null && typeof result.error === 'string' && result.error !== ''
        ? result.error
        : t('personaSaveFail'))
    }
  } catch (error) {
    setPersonaError(messageOf(error))
  } finally {
    setBusy((previous) => {
      const next = { ...previous }
      delete next['persona-save']
      return next
    })
  }
}

export async function resetPersona(panel) {
  const { t, setBanner, setBusy, setPersonaError, busyOf, applyPersonaPayload } = panel
  if (busyOf('persona-reset')) return
  setBusy((previous) => ({ ...previous, 'persona-reset': true }))
  setPersonaError(null)
  try {
    const result = await requestJson('/qqbot/persona/save', {
      method: 'POST',
      body: { reset: true },
      acceptNotOk: true,
    })
    if (result !== null && result.ok === true && applyPersonaPayload(result)) {
      setBanner({ kind: 'ok', text: t('personaResetDone') })
    } else {
      setPersonaError(result !== null && typeof result.error === 'string' && result.error !== ''
        ? result.error
        : t('personaSaveFail'))
    }
  } catch (error) {
    setPersonaError(messageOf(error))
  } finally {
    setBusy((previous) => {
      const next = { ...previous }
      delete next['persona-reset']
      return next
    })
  }
}

export function applyAiSettingsPayload(panel, result) {
  const {
    setAiSettingsDraft, setAiSettingsDefaults, setAiSettingsPath, setAiSettingsPhase, setAiSettingsError
  } = panel
  const data = result && result.data
  if (data === null || typeof data !== 'object' || data.settings === null || typeof data.settings !== 'object') return false
  setAiSettingsDraft(aiSettingsDraftFrom(data.settings))
  if (data.defaults !== null && typeof data.defaults === 'object') setAiSettingsDefaults(data.defaults)
  if (typeof data.path === 'string') setAiSettingsPath(data.path)
  setAiSettingsError(null)
  setAiSettingsPhase('ready')
  return true
}

export async function saveAiSettings(panel) {
  const { t, setBanner, setBusy, aiSettingsDraft, setAiSettingsError, busyOf, applyAiSettingsPayload } = panel
  if (aiSettingsDraft === null || busyOf('ai-settings-save')) return
  setBusy((previous) => ({ ...previous, 'ai-settings-save': true }))
  setAiSettingsError(null)
  try {
    const result = await requestJson('/qqbot/ai/settings', {
      method: 'POST',
      body: aiSettingsBodyFrom(aiSettingsDraft),
      acceptNotOk: true,
    })
    if (result !== null && result.ok === true && applyAiSettingsPayload(result)) {
      setBanner({ kind: 'ok', text: t('aiSettingsSaved') })
    } else {
      setAiSettingsError(result !== null && typeof result.error === 'string' && result.error !== ''
        ? result.error
        : t('aiSettingsError'))
    }
  } catch (error) {
    setAiSettingsError(messageOf(error))
  } finally {
    setBusy((previous) => {
      const next = { ...previous }
      delete next['ai-settings-save']
      return next
    })
  }
}

export function resetAiSettingsDraft(panel) {
  const { t, setBanner, setAiSettingsDraft, aiSettingsDefaults } = panel
  if (aiSettingsDefaults === null) return
  setAiSettingsDraft(aiSettingsDraftFrom(aiSettingsDefaults))
  setBanner({ kind: 'ok', text: t('aiSettingsResetDone') })
}

export function selectProfile(panel, profile) {
  const { setSelectedProfileKey, setProfileDraft } = panel
  const draft = profileDraftFrom(profile)
  setSelectedProfileKey(draft.key)
  setProfileDraft(draft)
}

export async function saveProfile(panel) {
  const {
    t, setBanner, setBusy, setProfilesError, profilesSearch, setSelectedProfileKey, profileDraft,
    setProfileDraft, busyOf, loadProfiles
  } = panel
  if (profileDraft === null || busyOf('profile-save')) return
  setBusy((previous) => ({ ...previous, 'profile-save': true }))
  try {
    const result = await requestJson('/qqbot/profiles/save', {
      method: 'POST',
      body: { profile: profileBodyFrom(profileDraft) },
      acceptNotOk: true,
    })
    const data = result && result.data
    if (result !== null && result.ok === true && data !== null && typeof data === 'object' && data.profile !== null && typeof data.profile === 'object') {
      const saved = profileDraftFrom(data.profile)
      setSelectedProfileKey(saved.key)
      setProfileDraft(saved)
      setBanner({ kind: 'ok', text: t('profilesSaved') })
      await loadProfiles(profilesSearch)
    } else {
      setProfilesError(result !== null && typeof result.error === 'string' && result.error !== ''
        ? result.error
        : t('profilesSaveFail'))
    }
  } catch (error) {
    setProfilesError(messageOf(error))
  } finally {
    setBusy((previous) => {
      const next = { ...previous }
      delete next['profile-save']
      return next
    })
  }
}

export async function deleteProfile(panel) {
  const {
    t, setBanner, setBusy, setProfilesError, profilesSearch, setSelectedProfileKey, profileDraft,
    setProfileDraft, busyOf, loadProfiles
  } = panel
  if (profileDraft === null || busyOf('profile-delete')) return
  const key = profileDraft.key
  setBusy((previous) => ({ ...previous, 'profile-delete': true }))
  try {
    const result = await requestJson('/qqbot/profiles/delete', {
      method: 'POST',
      body: { key },
      acceptNotOk: true,
    })
    if (result !== null && result.ok === true) {
      setProfileDraft(null)
      setSelectedProfileKey(null)
      setBanner({ kind: 'ok', text: t('profilesDeleted') })
      await loadProfiles(profilesSearch)
    } else {
      setProfilesError(result !== null && typeof result.error === 'string' && result.error !== ''
        ? result.error
        : t('profilesDeleteFail'))
    }
  } catch (error) {
    setProfilesError(messageOf(error))
  } finally {
    setBusy((previous) => {
      const next = { ...previous }
      delete next['profile-delete']
      return next
    })
  }
}

export async function savePersonaPreset(panel) {
  const {
    t, setBanner, setBusy, personaDraft, setPersonaPresets, setPersonaPresetsPhase, setPersonaPresetsError,
    setPersonaPresetsPath, personaPresetName, setPersonaPresetName, busyOf
  } = panel
  if (personaDraft === null || busyOf('persona-preset-save')) return
  const name = personaPresetName.trim() !== '' ? personaPresetName.trim() : personaDraft.name
  setBusy((previous) => ({ ...previous, 'persona-preset-save': true }))
  setPersonaPresetsError(null)
  try {
    const result = await requestJson('/qqbot/persona/presets/save', {
      method: 'POST',
      body: { name, persona: personaBody(personaDraft) },
      acceptNotOk: true,
    })
    const data = result && result.data
    if (result !== null && result.ok === true && data !== null && typeof data === 'object' && Array.isArray(data.presets)) {
      setPersonaPresets(data.presets)
      if (typeof data.path === 'string') setPersonaPresetsPath(data.path)
      setPersonaPresetName('')
      setPersonaPresetsError(null)
      setPersonaPresetsPhase('ready')
      setBanner({ kind: 'ok', text: t('personaPresetSaved') })
    } else {
      setPersonaPresetsError(result !== null && typeof result.error === 'string' && result.error !== ''
        ? result.error
        : t('personaPresetsError'))
    }
  } catch (error) {
    setPersonaPresetsError(messageOf(error))
  } finally {
    setBusy((previous) => {
      const next = { ...previous }
      delete next['persona-preset-save']
      return next
    })
  }
}

export async function loadPersonaPreset(panel, preset) {
  const {
    t, setBanner, setBusy, setPersonaDraft, setPersonaPreview, setPersonaPath, setPersonaPhase,
    setPersonaError, setPersonaPresets, setPersonaPresetsError, busyOf
  } = panel
  if (busyOf('persona-preset-load')) return
  setBusy((previous) => ({ ...previous, 'persona-preset-load': true }))
  setPersonaPresetsError(null)
  try {
    const result = await requestJson('/qqbot/persona/presets/load', {
      method: 'POST',
      body: { id: preset.id },
      acceptNotOk: true,
    })
    const data = result && result.data
    if (result !== null && result.ok === true && data !== null && typeof data === 'object'
      && data.persona !== null && typeof data.persona === 'object') {
      setPersonaDraft(draftFromPersona(data.persona))
      setPersonaPreview(typeof data.promptPreview === 'string' ? data.promptPreview : '')
      if (typeof data.path === 'string') setPersonaPath(data.path)
      if (Array.isArray(data.presets)) setPersonaPresets(data.presets)
      setPersonaError(null)
      setPersonaPhase('ready')
      setBanner({ kind: 'ok', text: t('personaPresetLoaded') })
    } else {
      setPersonaPresetsError(result !== null && typeof result.error === 'string' && result.error !== ''
        ? result.error
        : t('personaPresetsError'))
    }
  } catch (error) {
    setPersonaPresetsError(messageOf(error))
  } finally {
    setBusy((previous) => {
      const next = { ...previous }
      delete next['persona-preset-load']
      return next
    })
  }
}

export async function deletePersonaPreset(panel, preset) {
  const {
    t, setBanner, setBusy, setPersonaPresets, setPersonaPresetsPhase, setPersonaPresetsError, busyOf
  } = panel
  if (busyOf('persona-preset-delete')) return
  setBusy((previous) => ({ ...previous, 'persona-preset-delete': true }))
  setPersonaPresetsError(null)
  try {
    const result = await requestJson('/qqbot/persona/presets/delete', {
      method: 'POST',
      body: { id: preset.id },
      acceptNotOk: true,
    })
    const data = result && result.data
    if (result !== null && result.ok === true && data !== null && typeof data === 'object' && Array.isArray(data.presets)) {
      setPersonaPresets(data.presets)
      setPersonaPresetsError(null)
      setPersonaPresetsPhase('ready')
      setBanner({ kind: 'ok', text: t('personaPresetDeleted') })
    } else {
      setPersonaPresetsError(result !== null && typeof result.error === 'string' && result.error !== ''
        ? result.error
        : t('personaPresetsError'))
    }
  } catch (error) {
    setPersonaPresetsError(messageOf(error))
  } finally {
    setBusy((previous) => {
      const next = { ...previous }
      delete next['persona-preset-delete']
      return next
    })
  }
}
