import React from 'react'
import { messageOf, requestJson } from './api.js'

/**
 * Turn the Host status snapshot into the flat display model every renderer
 * consumes. Pure: no state, no side effects except remembering the last
 * signed-in flag for the pollers.
 */
export function deriveStatus(snapshot, t, loggedInRef) {
  const hasSnapshot = snapshot !== null
  const napcat = (snapshot && snapshot.napcat) || {}
  const koishi = (snapshot && snapshot.koishi) || {}
  const bot = (snapshot && snapshot.bot) || {}
  const qq = (snapshot && snapshot.qq) || {}
  const settings = (snapshot && snapshot.settings) || {}
  // Host platform metadata (id/label/support flags). Older Hosts only send
  // `isMac`, so fall back to that before declaring the platform unknown.
  const platformInfo = snapshot && snapshot.platform !== null && typeof snapshot.platform === 'object'
    ? snapshot.platform
    : null
  const rawPlatformId = platformInfo && typeof platformInfo.id === 'string' ? platformInfo.id : ''
  const platformId = ['macos', 'other'].includes(rawPlatformId)
    ? rawPlatformId
    : platformInfo !== null && platformInfo.isMac === true ? 'macos' : 'other'
  const platformLabel = platformInfo !== null && typeof platformInfo.label === 'string' && platformInfo.label !== ''
    ? platformInfo.label
    : platformInfo === null
      ? t('platformUnknown')
      : platformId === 'macos' ? 'macOS' : t('platformUnknown')
  const platformArch = platformInfo !== null && typeof platformInfo.arch === 'string' ? platformInfo.arch : ''
  const platformBadgeText = platformInfo === null
    ? t('platformUnknown')
    : `${platformLabel}${platformArch !== '' ? ` · ${platformArch}` : ''}`
  const napcatSupported = platformInfo === null
    ? true
    : platformInfo.napcatSupported === undefined
      ? platformId === 'macos'
      : platformInfo.napcatSupported === true
  const platformInstallHint = platformInfo === null
    ? t('installNapcatHintGeneric')
    : napcatSupported
      ? t('installNapcatHintMac')
      : t('installNapcatHintUnsupported')
  const napcatAccounts = Array.isArray(napcat.accounts) ? napcat.accounts : []
  const wsClients = []
  for (const account of napcatAccounts) {
    const clients = account && Array.isArray(account.wsClients) ? account.wsClients : []
    for (const client of clients) {
      wsClients.push(`${client.name || 'ws'} → ${client.url || '—'}${client.enable === false ? ` (${t('stStopped')})` : ''}`)
    }
  }

  const napcatInstalled = napcat.installed === true
  const napcatRunning = napcat.running === true
  const napcatLoggedIn = napcat.loggedIn === true
  const koishiExists = koishi.exists !== false
  const koishiRunning = koishi.running === true
  const botOnline = bot.online === true

  const napcatText = !hasSnapshot ? '—' : !napcatInstalled ? t('stMissing') : napcatRunning ? t('stRunning') : t('stStopped')
  const napcatTone = !hasSnapshot ? 'warn' : !napcatInstalled ? 'bad' : napcatRunning && napcatLoggedIn ? 'ok' : 'warn'
  const koishiText = !hasSnapshot ? '—' : !koishiExists ? t('stMissingProject') : koishiRunning ? t('stRunning') : t('stStopped')
  const koishiTone = !hasSnapshot ? 'warn' : !koishiExists ? 'bad' : koishiRunning ? 'ok' : 'warn'
  const botText = !hasSnapshot ? '—' : botOnline ? t('stOnline') : t('stOffline')
  const botTone = !hasSnapshot ? 'warn' : botOnline ? 'ok' : 'warn'
  loggedInRef.current = napcatLoggedIn
  return {
    hasSnapshot, napcat, koishi, bot, qq, settings,
    platformInfo, rawPlatformId, platformId, platformLabel, platformArch, platformBadgeText,
    napcatSupported, platformInstallHint, napcatAccounts, wsClients,
    napcatInstalled, napcatRunning, napcatLoggedIn,
    koishiExists, koishiRunning, botOnline,
    napcatText, napcatTone, koishiText, koishiTone, botText, botTone,
  }
}

/**
 * The panel's shared state store. Every useState/useRef of the panel lives
 * here so plugins stay stateless renderers over one source of truth; the
 * status snapshot and contact list are polled from one place.
 */
export function useStore(t) {
  const [tab, setTab] = React.useState('overview')
  const [snapshot, setSnapshot] = React.useState(null)
  const [loading, setLoading] = React.useState(true)
  const [loadError, setLoadError] = React.useState(null)
  const [banner, setBanner] = React.useState(null)
  const [plugins, setPlugins] = React.useState(null)
  const [pluginsPhase, setPluginsPhase] = React.useState('idle')
  const [pluginsError, setPluginsError] = React.useState(null)
  const [features, setFeatures] = React.useState(null)
  const [featuresPhase, setFeaturesPhase] = React.useState('idle')
  const [featuresError, setFeaturesError] = React.useState(null)
  const [logLines, setLogLines] = React.useState([])
  const [logsNote, setLogsNote] = React.useState(null)
  const [logsPhase, setLogsPhase] = React.useState('idle')
  const [logsError, setLogsError] = React.useState(null)
  const [logSource, setLogSource] = React.useState('koishi')
  const [installSpec, setInstallSpec] = React.useState('')
  const [restartAfter, setRestartAfter] = React.useState(false)
  const [busy, setBusy] = React.useState({})
  const [pendingUninstall, setPendingUninstall] = React.useState(null)
  const [accessPhase, setAccessPhase] = React.useState('idle')
  const [accessError, setAccessError] = React.useState(null)
  const [accessWarning, setAccessWarning] = React.useState(null)
  const [accessDraft, setAccessDraft] = React.useState(null)
  const [contacts, setContacts] = React.useState(null)
  const [contactsPhase, setContactsPhase] = React.useState('idle')
  const [contactsError, setContactsError] = React.useState(null)
  const [accessQuery, setAccessQuery] = React.useState({
    inboundGroups: '',
    inboundPrivate: '',
    outboundGroups: '',
    outboundPrivate: '',
  })
  const [loginInfo, setLoginInfo] = React.useState(null)
  const [loginError, setLoginError] = React.useState(null)
  const [qrTicket, setQrTicket] = React.useState(0)
  const [qrBroken, setQrBroken] = React.useState(false)
  const [messages, setMessages] = React.useState(null)
  const [messagesPhase, setMessagesPhase] = React.useState('idle')
  const [messagesError, setMessagesError] = React.useState(null)
  const [messagesFilter, setMessagesFilter] = React.useState('all')
  const [messagesUpdatedAt, setMessagesUpdatedAt] = React.useState(null)
  const [setupInfo, setSetupInfo] = React.useState(null)
  const [setupPhase, setSetupPhase] = React.useState('idle')
  const [setupError, setSetupError] = React.useState(null)
  const [setupLogs, setSetupLogs] = React.useState([])
  const [setupSteps, setSetupSteps] = React.useState(null)
  const [setupResultMsg, setSetupResultMsg] = React.useState(null)
  const [setupPolling, setSetupPolling] = React.useState(false)
  const [setupExpanded, setSetupExpanded] = React.useState(true)
  const [aiReply, setAiReply] = React.useState(null)
  const [aiError, setAiError] = React.useState(null)
  const [personaDraft, setPersonaDraft] = React.useState(null)
  const [personaPreview, setPersonaPreview] = React.useState('')
  const [personaPath, setPersonaPath] = React.useState(null)
  const [personaPhase, setPersonaPhase] = React.useState('idle')
  const [personaError, setPersonaError] = React.useState(null)
  const [personaPreviewOpen, setPersonaPreviewOpen] = React.useState(true)
  const [aiSettingsDraft, setAiSettingsDraft] = React.useState(null)
  const [aiSettingsDefaults, setAiSettingsDefaults] = React.useState(null)
  const [aiSettingsPath, setAiSettingsPath] = React.useState(null)
  const [aiSettingsPhase, setAiSettingsPhase] = React.useState('idle')
  const [aiSettingsError, setAiSettingsError] = React.useState(null)
  const [profiles, setProfiles] = React.useState(null)
  const [profilesPhase, setProfilesPhase] = React.useState('idle')
  const [profilesError, setProfilesError] = React.useState(null)
  const [profilesSearch, setProfilesSearch] = React.useState('')
  const [profilesPath, setProfilesPath] = React.useState(null)
  const [selectedProfileKey, setSelectedProfileKey] = React.useState(null)
  const [profileDraft, setProfileDraft] = React.useState(null)
  const [personaPresets, setPersonaPresets] = React.useState(null)
  const [personaPresetsPhase, setPersonaPresetsPhase] = React.useState('idle')
  const [personaPresetsError, setPersonaPresetsError] = React.useState(null)
  const [personaPresetsPath, setPersonaPresetsPath] = React.useState(null)
  const [personaPresetName, setPersonaPresetName] = React.useState('')
  const [lastPromptState, setLastPromptState] = React.useState({ phase: 'idle', prompt: null, error: null })
  const [fullPromptOpen, setFullPromptOpen] = React.useState(true)

  // Refs keep the 2s pollers from capturing stale state and from overlapping.
  const tabRef = React.useRef(tab)
  const loggedInRef = React.useRef(false)
  const loginPollRef = React.useRef({ busy: false, loggedIn: false })
  const contactsBusyRef = React.useRef(false)
  const messagesPollRef = React.useRef(false)
  const setupActionRef = React.useRef(false)
  tabRef.current = tab

  const busyOf = (key) => busy[key] === true

  const loadStatus = async () => {
    try {
      const payload = await requestJson('/qqbot/status')
      const data = payload && payload.data
      if (data === null || typeof data !== 'object') throw new Error('unexpected payload')
      setSnapshot(data)
      setLoadError(null)
    } catch (error) {
      setLoadError(messageOf(error))
    } finally {
      setLoading(false)
    }
  }

  const loadContacts = async () => {
    if (contactsBusyRef.current) return
    contactsBusyRef.current = true
    setContactsPhase('loading')
    try {
      const payload = await requestJson('/qqbot/contacts', { acceptNotOk: true })
      const list = payload !== null && typeof payload === 'object' ? payload : {}
      setContacts({
        groups: Array.isArray(list.groups) ? list.groups : [],
        friends: Array.isArray(list.friends) ? list.friends : [],
        selfId: typeof list.selfId === 'string' ? list.selfId : null,
        fetchedAt: typeof list.fetchedAt === 'string' ? list.fetchedAt : null,
      })
      if (list.ok === true) {
        setContactsError(null)
      } else {
        setContactsError(typeof list.error === 'string' && list.error !== '' ? list.error : t('accessContactsFail'))
      }
      setContactsPhase('ready')
    } catch (error) {
      setContacts({ groups: [], friends: [], selfId: null, fetchedAt: null })
      setContactsError(messageOf(error))
      setContactsPhase('ready')
    } finally {
      contactsBusyRef.current = false
    }
  }

  const runPost = async (key, path, body, after, successText, extraOptions) => {
    if (busyOf(key)) return null
    setBusy((previous) => ({ ...previous, [key]: true }))
    setBanner(null)
    let result = null
    try {
      result = await requestJson(path, { method: 'POST', body: body || {}, ...(extraOptions || {}) })
      if (result !== null && result.ok === false) {
        setBanner({ kind: 'error', text: `${t('actionFailed')}: ${result.message || result.error || ''}` })
      } else {
        setBanner({ kind: 'ok', text: successText || t('actionDone') })
      }
      if (typeof after === 'function') await after()
    } catch (error) {
      setBanner({ kind: 'error', text: `${t('actionFailed')}: ${messageOf(error)}` })
    } finally {
      setBusy((previous) => {
        const next = { ...previous }
        delete next[key]
        return next
      })
    }
    return result
  }

  return {
    tab, setTab, snapshot, setSnapshot, loading, setLoading,
    loadError, setLoadError, banner, setBanner, plugins, setPlugins,
    pluginsPhase, setPluginsPhase, pluginsError, setPluginsError, features, setFeatures,
    featuresPhase, setFeaturesPhase, featuresError, setFeaturesError, logLines, setLogLines,
    logsNote, setLogsNote, logsPhase, setLogsPhase, logsError, setLogsError,
    logSource, setLogSource, installSpec, setInstallSpec, restartAfter, setRestartAfter,
    busy, setBusy, pendingUninstall, setPendingUninstall, accessPhase, setAccessPhase,
    accessError, setAccessError, accessWarning, setAccessWarning, accessDraft, setAccessDraft,
    contacts, setContacts, contactsPhase, setContactsPhase, contactsError, setContactsError,
    accessQuery, setAccessQuery, loginInfo, setLoginInfo, loginError, setLoginError,
    qrTicket, setQrTicket, qrBroken, setQrBroken, messages, setMessages,
    messagesPhase, setMessagesPhase, messagesError, setMessagesError, messagesFilter, setMessagesFilter,
    messagesUpdatedAt, setMessagesUpdatedAt, setupInfo, setSetupInfo, setupPhase, setSetupPhase,
    setupError, setSetupError, setupLogs, setSetupLogs, setupSteps, setSetupSteps,
    setupResultMsg, setSetupResultMsg, setupPolling, setSetupPolling, setupExpanded, setSetupExpanded,
    aiReply, setAiReply, aiError, setAiError, personaDraft, setPersonaDraft,
    personaPreview, setPersonaPreview, personaPath, setPersonaPath, personaPhase, setPersonaPhase,
    personaError, setPersonaError, personaPreviewOpen, setPersonaPreviewOpen, aiSettingsDraft, setAiSettingsDraft,
    aiSettingsDefaults, setAiSettingsDefaults, aiSettingsPath, setAiSettingsPath, aiSettingsPhase, setAiSettingsPhase,
    aiSettingsError, setAiSettingsError, profiles, setProfiles, profilesPhase, setProfilesPhase,
    profilesError, setProfilesError, profilesSearch, setProfilesSearch, profilesPath, setProfilesPath,
    selectedProfileKey, setSelectedProfileKey, profileDraft, setProfileDraft, personaPresets, setPersonaPresets,
    personaPresetsPhase, setPersonaPresetsPhase, personaPresetsError, setPersonaPresetsError, personaPresetsPath, setPersonaPresetsPath,
    personaPresetName, setPersonaPresetName, lastPromptState, setLastPromptState, fullPromptOpen, setFullPromptOpen,
    tabRef, loggedInRef, loginPollRef, contactsBusyRef, messagesPollRef, setupActionRef,
    busyOf,
    loadStatus,
    loadContacts,
    runPost,
  }
}
