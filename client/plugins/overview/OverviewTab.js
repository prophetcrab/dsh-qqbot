import React from 'react'
import { compactValue, POLL_MS } from '../../runtime/api.js'
import { renderLoginCard } from './LoginCard.js'
import { renderSetupCard } from './SetupCard.js'

export function renderOverview(panel) {
  const {
    t, loading, loadError, loadStatus, startAll, stopAll, installNapcat, configureNapcat, startNapcat,
    stopNapcat, startKoishi, stopKoishi, restartKoishi, installDeps, hasSnapshot, napcat, koishi, qq,
    settings, napcatSupported, platformInstallHint, napcatAccounts, wsClients, napcatInstalled,
    napcatRunning, napcatLoggedIn, koishiRunning, botOnline, row, actionButton, h
  } = panel
  if (!hasSnapshot) {
    if (loading) return h('div', { className: 'qqbot-empty', role: 'status' }, t('loading'))
    return h('div', { className: 'qqbot-empty', role: 'alert' },
      h('p', { className: 'qqbot-error' }, `${t('loadFail')}: ${loadError || ''}`),
      h('button', {
        type: 'button',
        className: 'qqbot-btn',
        'aria-label': t('retry'),
        onClick: () => { loadStatus() },
      }, t('retry')))
  }

  const webui = napcat.webui || {}
  const napcatRows = [
    row(t('lblInstall'), napcatInstalled ? `${t('stInstalled')}${napcat.version ? ` · v${napcat.version}` : ''}` : t('stMissing'), napcatInstalled ? 'ok' : 'bad'),
    row(t('lblProcess'), napcatRunning ? `${t('stRunning')}${napcat.pid ? ` · PID ${napcat.pid}` : ''}` : t('stStopped'), napcatRunning ? 'ok' : 'warn'),
    row(t('lblLogin'), napcatLoggedIn
      ? `${t('stLoggedIn')}${napcat.qq ? ` · ${napcat.qq}` : ''}${napcat.nickname ? ` (${napcat.nickname})` : ''}`
      : t('stLoggedOut'), napcatLoggedIn ? 'ok' : 'warn'),
    row(t('lblWebui'), `${webui.port || settings.napcatPort || '—'} · ${webui.reachable === true ? t('stReachable') : t('stUnreachable')}`, webui.reachable === true ? 'ok' : 'warn'),
    row(t('lblConfig'), napcat.configApplied === true ? t('stApplied') : t('stNotApplied'), napcat.configApplied === true ? 'ok' : 'warn'),
    row(t('lblAccounts'), String(napcatAccounts.length)),
    row(t('lblWs'), wsClients.length === 0 ? t('noWs') : wsClients.join(' · '), wsClients.length === 0 ? 'warn' : 'ok', true),
  ]
  if (typeof napcat.error === 'string' && napcat.error !== '') napcatRows.push(row(t('lblError'), napcat.error, 'bad'))

  const koishiRows = [
    row(t('lblProject'), koishi.projectDir || settings.projectDir || '—', null, true),
    row(t('lblDeps'), koishi.depsInstalled === true ? t('stInstalled') : t('stMissing'), koishi.depsInstalled === true ? 'ok' : 'warn'),
    row(t('lblProcess'), koishiRunning
      ? `${t('stRunning')}${koishi.managed === true ? ` · ${t('managed')}` : ''}${koishi.pid ? ` · PID ${koishi.pid}` : ''}`
      : t('stStopped'), koishiRunning ? 'ok' : 'warn'),
    row(t('lblPort'), String(koishi.port || settings.koishiPort || '—'), null, true),
    row(t('lblOnline'), botOnline
      ? `${t('stOnline')}${koishi.selfId ? ` · ${koishi.selfId}` : ''}${koishi.platform ? ` · ${koishi.platform}` : ''}`
      : t('stOffline'), botOnline ? 'ok' : 'warn'),
  ]
  if (koishi.stats !== null && typeof koishi.stats === 'object') {
    koishiRows.push(row(t('lblStats'), compactValue(koishi.stats), null, true))
  }
  if (typeof koishi.error === 'string' && koishi.error !== '') koishiRows.push(row(t('lblError'), koishi.error, 'bad'))

  const napcatCard = h('section', { className: 'qqbot-card' },
    h('div', { className: 'qqbot-card-head' },
      h('h2', { className: 'qqbot-card-title' }, t('napcatTitle')),
      h('span', { className: 'qqbot-card-sub' }, `QQ · ${qq.installed === true ? t('stInstalled') : t('stMissing')}`)),
    h('div', { className: 'qqbot-rows' }, ...napcatRows),
    h('div', { className: 'qqbot-actions-row' },
      actionButton('napcat-start', t('napcatStart'), null, startNapcat, { disabled: napcatRunning }),
      actionButton('napcat-stop', t('napcatStop'), 'danger', stopNapcat, { disabled: !napcatRunning })))

  const koishiCard = h('section', { className: 'qqbot-card' },
    h('div', { className: 'qqbot-card-head' },
      h('h2', { className: 'qqbot-card-title' }, t('koishiTitle')),
      h('span', { className: 'qqbot-card-sub' }, `${t('lblPort')} · ${koishi.port || settings.koishiPort || '—'}`)),
    h('div', { className: 'qqbot-rows' }, ...koishiRows),
    h('div', { className: 'qqbot-actions-row' },
      actionButton('koishi-start', t('koishiStart'), null, startKoishi, { disabled: koishiRunning }),
      actionButton('koishi-stop', t('koishiStop'), 'danger', stopKoishi, { disabled: !koishiRunning }),
      actionButton('koishi-restart', t('koishiRestart'), null, restartKoishi)))

  return h('div', { className: 'qqbot-stack' },
    h('div', { className: 'qqbot-grid' }, napcatCard, koishiCard),
    renderLoginCard(panel),
    renderSetupCard(panel),
    h('section', { className: 'qqbot-card' },
      h('div', { className: 'qqbot-card-head' },
        h('h2', { className: 'qqbot-card-title' }, t('actionsTitle'))),
      h('div', { className: 'qqbot-btns' },
        actionButton('all-start', t('startAll'), 'primary', startAll),
        actionButton('all-stop', t('stopAll'), 'danger', stopAll),
        !napcatInstalled
          ? actionButton('napcat-install', t('installNapcat'), null, installNapcat, {
            disabled: !napcatSupported,
            title: napcatSupported ? undefined : t('setupNapcatUnsupported'),
            ariaLabel: napcatSupported ? t('installNapcat') : `${t('installNapcat')} (${t('setupNapcatUnsupported')})`,
          })
          : null,
        actionButton('napcat-configure', t('configureNapcat'), null, configureNapcat),
        koishi.depsInstalled === false ? actionButton('koishi-install-deps', t('installDeps'), null, installDeps) : null),
      !napcatInstalled ? h('p', { className: 'qqbot-hint' }, platformInstallHint) : null))
}

/**
 * Overview hooks: status polling, the QR-login state machine and the runtime
 * setup poller. The card renderers below are pure functions of the panel.
 */
export function useOverview(panel) {
  const {
    hasSnapshot, napcatLoggedIn, setupPolling, tabRef, loggedInRef, loadStatus, loadSetup, loadLogin
  } = panel

  // Poll the snapshot; the host route is cheap and read-only.
  React.useEffect(() => {
    let disposed = false
    const tick = () => { if (!disposed) loadStatus() }
    tick()
    const timer = setInterval(tick, POLL_MS)
    return () => {
      disposed = true
      clearInterval(timer)
    }
  }, [])

  // First paint also reads the setup state once.
  React.useEffect(() => {
    loadSetup()
  }, [])

  // Load the QR state as soon as the snapshot says the bot is signed out.
  React.useEffect(() => {
    if (hasSnapshot && napcatLoggedIn !== true) loadLogin()
  }, [hasSnapshot, napcatLoggedIn])

  // Keep the QR fresh while the overview is visible and signed out.
  React.useEffect(() => {
    let disposed = false
    const tick = () => {
      if (disposed) return
      if (tabRef.current === 'overview' && loggedInRef.current !== true) loadLogin()
    }
    const timer = setInterval(tick, 2000)
    return () => {
      disposed = true
      clearInterval(timer)
    }
  }, [])

  // Setup polling: keep reading /qqbot/setup while an install is running.
  React.useEffect(() => {
    if (!setupPolling) return undefined
    let disposed = false
    const tick = () => { if (!disposed) loadSetup() }
    tick()
    const timer = setInterval(tick, 2000)
    return () => {
      disposed = true
      clearInterval(timer)
    }
  }, [setupPolling])
}
