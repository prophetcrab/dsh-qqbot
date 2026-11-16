import React from 'react'
import { POLL_MS } from '../../runtime/api.js'
import { renderLoginCard } from './LoginCard.js'

export function renderOverview(panel) {
  const {
    t, loading, loadError, loadStatus, startAll, stopAll, installNapcat, configureNapcat, startNapcat,
    stopNapcat, startKoishi, stopKoishi, installDeps, reinstallEnvironment, hasSnapshot, napcat, koishi,
    settings, napcatSupported, platformInstallHint, napcatInstalled,
    napcatRunning, napcatLoggedIn, koishiRunning, botOnline, row, actionButton, lifecycleBusy, h
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
  const napcatState = !napcatInstalled
    ? t('stMissing')
    : !napcatRunning
      ? t('stStopped')
      : webui.reachable === true
        ? t('stRunning')
        : t('stStarting')
  const napcatRows = [
    row(t('lblStatus'), napcatState, !napcatInstalled ? 'bad' : napcatRunning && webui.reachable === true ? 'ok' : 'warn'),
    ...(napcatInstalled ? [
      row(t('lblLogin'), napcatLoggedIn
        ? `${t('stLoggedIn')}${napcat.qq ? ` · ${napcat.qq}` : ''}${napcat.nickname ? ` (${napcat.nickname})` : ''}`
        : t('stLoggedOut'), napcatLoggedIn ? 'ok' : 'warn'),
      row(t('lblConfig'), napcat.configApplied === true ? t('stApplied') : t('stNotApplied'), napcat.configApplied === true ? 'ok' : 'warn'),
    ] : []),
  ]
  if (typeof napcat.error === 'string' && napcat.error !== '') napcatRows.push(row(t('lblError'), napcat.error, 'bad'))

  const koishiRows = [
    row(t('lblStatus'), koishiRunning ? t('stRunning') : t('stStopped'), koishiRunning ? 'ok' : 'warn'),
    row(t('lblOnline'), botOnline
      ? `${t('stOnline')}${koishi.selfId ? ` · ${koishi.selfId}` : ''}${koishi.platform ? ` · ${koishi.platform}` : ''}`
      : t('stOffline'), botOnline ? 'ok' : 'warn'),
  ]
  if (koishi.depsInstalled === false) koishiRows.push(row(t('lblDeps'), t('stMissing'), 'bad'))
  if (typeof koishi.error === 'string' && koishi.error !== '') koishiRows.push(row(t('lblError'), koishi.error, 'bad'))

  const napcatCard = h('section', { className: 'qqbot-card qqbot-overview-card' },
    h('div', { className: 'qqbot-card-head' },
      h('h2', { className: 'qqbot-card-title' }, t('napcatTitle')),
      h('span', { className: 'qqbot-card-sub' }, `Docker · ${napcatInstalled ? t('stInstalled') : t('stMissing')}`)),
    h('div', { className: 'qqbot-rows' }, ...napcatRows),
    h('div', { className: 'qqbot-actions-row' },
      actionButton('napcat-start', t('napcatStart'), 'primary', startNapcat, { disabled: napcatRunning || lifecycleBusy }),
      actionButton('napcat-stop', t('napcatStop'), 'danger', stopNapcat, { disabled: !napcatRunning || lifecycleBusy })))

  const koishiCard = h('section', { className: 'qqbot-card qqbot-overview-card' },
    h('div', { className: 'qqbot-card-head' },
      h('h2', { className: 'qqbot-card-title' }, t('koishiTitle')),
      h('span', { className: 'qqbot-card-sub' }, `${t('lblPort')} · ${koishi.port || settings.koishiPort || '—'}`)),
    h('div', { className: 'qqbot-rows' }, ...koishiRows),
    h('div', { className: 'qqbot-actions-row' },
      actionButton('koishi-start', t('koishiStart'), 'primary', startKoishi, { disabled: koishiRunning || lifecycleBusy }),
      actionButton('koishi-stop', t('koishiStop'), 'danger', stopKoishi, { disabled: !koishiRunning || lifecycleBusy })))

  return h('div', { className: 'qqbot-stack' },
    h('div', { className: 'qqbot-grid' }, napcatCard, koishiCard),
    renderLoginCard(panel),
    h('section', { className: 'qqbot-card' },
      h('div', { className: 'qqbot-card-head' },
        h('h2', { className: 'qqbot-card-title' }, t('actionsTitle'))),
      h('div', { className: 'qqbot-btns' },
        actionButton('all-start', t('startAll'), 'primary', startAll, { disabled: lifecycleBusy }),
        actionButton('all-stop', t('stopAll'), 'danger', stopAll, { disabled: lifecycleBusy }),
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
 * Overview hooks: status polling and the QR-login state machine. The card
 * renderers below are pure functions of the panel.
 */
export function useOverview(panel) {
  const {
    hasSnapshot, napcatLoggedIn, tabRef, loggedInRef, loadStatus, loadLogin
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

}
