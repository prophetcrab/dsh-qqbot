

export function renderLoginCard(panel) {
  const {
    t, loginInfo, loginError, qrTicket, qrBroken, setQrBroken, busyOf, startNapcat, refreshLoginQr,
    hasSnapshot, napcatSupported, napcatRunning, napcatLoggedIn, h
  } = panel
  if (!hasSnapshot || napcatLoggedIn) return null
  const info = loginInfo
  const reachable = info !== null && info.reachable === true
  const phase = info !== null && typeof info.phase === 'string' ? info.phase : null
  const phaseText = info === null
    ? t('loginPhaseUnknown')
    : phase === 'waiting_qrcode'
      ? t('loginPhaseWaiting')
      : phase === 'qrcode_scanned'
        ? t('loginPhaseScanned')
        : phase === 'initializing'
          ? t('loginPhaseInitializing')
          : phase === 'reconnecting'
            ? t('loginPhaseReconnecting')
            : t('loginPhaseUnknown')
  const hasQr = reachable && (
    info.qrAvailable === true
    || (info.qrAvailable === undefined && typeof info.qrUrl === 'string' && info.qrUrl !== '')
  )
  const qrVisible = hasQr && (phase === null || phase === 'waiting_qrcode' || phase === 'qrcode_scanned')
  const refreshBusy = busyOf('login-refresh')
  const startBusy = busyOf('napcat-start')
  return h('section', { className: 'qqbot-card qqbot-login-card', 'data-testid': 'qqbot-login-card' },
    h('div', { className: 'qqbot-card-head' },
      h('h2', { className: 'qqbot-card-title' }, t('loginTitle')),
      h('span', { className: 'qqbot-card-sub', 'data-testid': 'qqbot-login-phase' }, phaseText)),
    h('p', { className: napcatSupported ? 'qqbot-hint' : 'qqbot-warn' },
      napcatSupported ? t('loginHint') : t('loginUnsupported')),
    loginError !== null ? h('p', { className: 'qqbot-error' }, loginError) : null,
    qrVisible
      ? h('div', { className: 'qqbot-login-qr-wrap' },
        qrBroken
          ? h('div', { className: 'qqbot-login-qr-missing' },
            h('p', { className: 'qqbot-error' }, t('loginQrFail')),
            h('button', {
              type: 'button',
              className: 'qqbot-btn',
              'data-testid': 'qqbot-login-retry',
              'aria-label': t('loginRetry'),
              onClick: refreshLoginQr,
            }, t('loginRetry')))
          : h('img', {
            className: 'qqbot-login-qr',
            'data-testid': 'qqbot-login-qr',
            src: `/qqbot/napcat/qr?t=${encodeURIComponent(String((info && info.qrUpdatedAt) || qrTicket))}`,
            alt: t('loginTitle'),
            width: 240,
            height: 240,
            onError: () => { setQrBroken(true) },
          }))
      : h('div', { className: 'qqbot-empty qqbot-login-empty' },
        info === null || reachable ? t('loginQrLoading') : t('loginNotRunning')),
    h('div', { className: 'qqbot-btns' },
      h('button', {
        type: 'button',
        className: 'qqbot-btn',
        'data-testid': 'qqbot-login-refresh',
        'aria-label': t('loginRefresh'),
        'aria-busy': refreshBusy ? 'true' : undefined,
        disabled: !reachable || refreshBusy,
        onClick: refreshLoginQr,
      }, refreshBusy ? t('working') : t('loginRefresh')),
      h('button', {
        type: 'button',
        className: 'qqbot-btn qqbot-btn-primary',
        'data-testid': 'qqbot-login-start',
        'aria-label': t('loginStart'),
        'aria-busy': startBusy ? 'true' : undefined,
        disabled: napcatRunning || startBusy,
        onClick: startNapcat,
      }, napcatRunning ? t('loginRunning') : startBusy ? t('working') : t('loginStart'))))
}
