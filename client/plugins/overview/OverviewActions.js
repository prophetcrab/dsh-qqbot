import { requestJson, messageOf } from '../../runtime/api.js'

/**
 * Read the NapCat QR-login state. On the transition to signed-in the
 * panel refreshes the status snapshot and the contact lists, so the
 * overview/login card and the message names update together.
 */
export async function loadLogin(panel) {
  const { setLoginInfo, setLoginError, loginPollRef, loadStatus, loadContacts } = panel
  if (loginPollRef.current.busy) return
  loginPollRef.current.busy = true
  try {
    const payload = await requestJson('/qqbot/napcat/login')
    const data = payload && payload.data
    if (data === null || typeof data !== 'object') throw new Error('unexpected payload')
    setLoginInfo(data)
    setLoginError(null)
    const wasLoggedIn = loginPollRef.current.loggedIn === true
    const nowLoggedIn = data.loggedIn === true
    loginPollRef.current.loggedIn = nowLoggedIn
    if (nowLoggedIn && !wasLoggedIn) {
      loadStatus()
      loadContacts()
    }
  } catch (error) {
    setLoginError(messageOf(error))
  } finally {
    loginPollRef.current.busy = false
  }
}

/**
 * Runtime setup snapshot. While the Host reports `installing` the panel
 * keeps polling until the install task finishes, then shows the log tail
 * and the ready state.
 */
export async function loadSetup(panel) {
  const { setSetupInfo, setSetupPhase, setSetupError, setSetupLogs, setSetupPolling, setupActionRef } = panel
  try {
    const payload = await requestJson('/qqbot/setup')
    const data = payload && payload.data
    if (data === null || typeof data !== 'object') throw new Error('unexpected payload')
    setSetupInfo(data)
    setSetupLogs(Array.isArray(data.logs) ? data.logs : [])
    setSetupError(null)
    setSetupPhase('ready')
    if (data.installing === true) {
      setSetupPolling(true)
    } else if (setupActionRef.current !== true) {
      setSetupPolling(false)
    }
  } catch (error) {
    setSetupError(messageOf(error))
    setSetupPhase('error')
    setSetupPolling(false)
  }
}

export function refreshLoginQr(panel) {
  const { t, setQrTicket, setQrBroken, loadLogin, runPost } = panel
  setQrBroken(false)
  runPost('login-refresh', '/qqbot/napcat/qr/refresh', {}, async () => {
    await loadLogin()
    setQrTicket((previous) => previous + 1)
  }, t('loginRefreshed'))
}

/**
 * Install/repair the Koishi runtime. The POST can run for tens of
 * seconds, so polling starts immediately and stops when it settles (or
 * when a poll reports `installing:false` and no action is in flight).
 */
export function installKoishiEnv(panel) {
  const {
    t, setSetupSteps, setSetupResultMsg, setSetupPolling, setSetupExpanded, setupActionRef, busyOf,
    loadStatus, loadSetup, runPost
  } = panel
  if (busyOf('setup-install')) return
  setupActionRef.current = true
  setSetupPolling(true)
  setSetupSteps(null)
  setSetupResultMsg(null)
  setSetupExpanded(true)
  runPost('setup-install', '/qqbot/setup/koishi', {}, async () => {
    await loadSetup()
    await loadStatus()
  }, t('setupInstallDone')).then((result) => {
    if (result !== null && result.ok !== false) setSetupExpanded(false)
  }).finally(() => {
    setupActionRef.current = false
    setSetupPolling(false)
    loadSetup()
  })
}

export function runSetupFull(panel) {
  const {
    t, setSetupSteps, setSetupResultMsg, setSetupPolling, setSetupExpanded, setupActionRef, busyOf,
    loadStatus, loadContacts, loadSetup, runPost
  } = panel
  if (busyOf('setup-full')) return
  setupActionRef.current = true
  setSetupPolling(true)
  setSetupSteps(null)
  setSetupResultMsg(null)
  setSetupExpanded(true)
  runPost('setup-full', '/qqbot/setup/full', {}, async () => {
    await loadSetup()
    await loadStatus()
    await loadContacts()
  }, t('setupFullDone'), { acceptNotOk: true }).then((result) => {
    if (result !== null && typeof result === 'object') {
      setSetupSteps(Array.isArray(result.steps) ? result.steps : [])
      setSetupResultMsg(typeof result.message === 'string' ? result.message : null)
    }
  }).finally(() => {
    setupActionRef.current = false
    setSetupPolling(false)
    loadSetup()
  })
}

export function installSetupNapcat(panel) {
  const { t, loadStatus, loadSetup, runPost } = panel
  runPost('setup-napcat', '/qqbot/napcat/install', {}, async () => {
    await loadSetup()
    await loadStatus()
  }, t('setupNapcatDone'))
}

export function startAll(panel) {
  const { loadStatus, runPost } = panel
  return runPost('all-start', '/qqbot/all/start', {}, loadStatus)
}

export function stopAll(panel) {
  const { loadStatus, runPost } = panel
  return runPost('all-stop', '/qqbot/all/stop', {}, loadStatus)
}

export function installNapcat(panel) {
  const { loadStatus, runPost } = panel
  return runPost('napcat-install', '/qqbot/napcat/install', {}, loadStatus)
}

export function configureNapcat(panel) {
  const { loadStatus, runPost } = panel
  return runPost('napcat-configure', '/qqbot/napcat/configure', {}, loadStatus)
}

export function startNapcat(panel) {
  const { loadStatus, runPost } = panel
  return runPost('napcat-start', '/qqbot/napcat/start', {}, loadStatus)
}

export function stopNapcat(panel) {
  const { loadStatus, runPost } = panel
  return runPost('napcat-stop', '/qqbot/napcat/stop', {}, loadStatus)
}

export function startKoishi(panel) {
  const { loadStatus, runPost } = panel
  return runPost('koishi-start', '/qqbot/koishi/start', {}, loadStatus)
}

export function stopKoishi(panel) {
  const { loadStatus, runPost } = panel
  return runPost('koishi-stop', '/qqbot/koishi/stop', {}, loadStatus)
}

export function restartKoishi(panel) {
  const { loadStatus, runPost } = panel
  return runPost('koishi-restart', '/qqbot/koishi/restart', {}, loadStatus)
}

export function installDeps(panel) {
  const { loadStatus, runPost } = panel
  return runPost('koishi-install-deps', '/qqbot/koishi/install-deps', {}, loadStatus)
}
