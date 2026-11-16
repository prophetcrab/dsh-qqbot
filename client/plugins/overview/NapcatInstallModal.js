/** First-install progress dialog for the NapCat Docker image. */

function formatBytes(value) {
  const bytes = Number(value)
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB'
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`
  return `${Math.round(bytes / 1024 ** 2)} MB`
}

export function renderNapcatInstallModal(panel) {
  const { t, napcatInstall, napcatInstallOpen, setNapcatInstallOpen, h } = panel
  if (napcatInstallOpen !== true) return null
  const info = napcatInstall !== null && typeof napcatInstall === 'object'
    ? napcatInstall
    : { active: true, phase: 'starting', bytes: 0, total: 0, percent: 0 }
  const phase = typeof info.phase === 'string' ? info.phase : 'starting'
  const failed = phase === 'failed' || (typeof info.error === 'string' && info.error !== '')
  const total = Number(info.total) || 0
  const bytes = Number(info.bytes) || 0
  const percent = Number.isFinite(Number(info.percent))
    ? Math.max(0, Math.min(100, Math.round(Number(info.percent))))
    : total > 0 ? Math.round((bytes / total) * 100) : 0
  const phaseKey = {
    starting: 'napcatInstallPhaseStarting',
    'checking-engine': 'napcatInstallPhaseEngine',
    downloading: 'napcatInstallPhaseDownload',
    verifying: 'napcatInstallPhaseVerify',
    loading: 'napcatInstallPhaseLoad',
    'checking-image': 'napcatInstallPhaseCheck',
    pulling: 'napcatInstallPhasePull',
    done: 'napcatInstallPhaseDone',
    failed: 'napcatInstallPhaseFailed',
  }[phase] || 'napcatInstallPhaseStarting'
  const showBytes = phase === 'downloading' && total > 0
  return h('div', { className: 'qqbot-modal-backdrop', role: 'presentation' },
    h('div', {
      className: 'qqbot-modal',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': t('napcatInstallTitle'),
      'data-testid': 'qqbot-napcat-install-modal',
    },
      h('div', { className: 'qqbot-modal-head' },
        h('h2', { className: 'qqbot-modal-title' }, t('napcatInstallTitle')),
        h('span', { className: `qqbot-modal-percent${failed ? ' is-bad' : ''}` }, failed ? '!' : `${percent}%`)),
      h('p', { className: 'qqbot-modal-phase', 'data-testid': 'qqbot-napcat-install-phase' }, t(phaseKey)),
      h('div', {
        className: 'qqbot-modal-track',
        role: 'progressbar',
        'aria-valuemin': '0',
        'aria-valuemax': '100',
        'aria-valuenow': String(percent),
        'data-testid': 'qqbot-napcat-install-progress',
      }, h('div', {
        className: `qqbot-modal-fill${phase === 'starting' || phase === 'pulling' || (phase === 'downloading' && bytes === 0) ? ' is-indeterminate' : ''}`,
        style: { width: `${percent}%` },
      })),
      showBytes
        ? h('p', { className: 'qqbot-modal-meta' }, `${formatBytes(bytes)} / ${formatBytes(total)}`)
        : null,
      h('p', { className: 'qqbot-modal-hint' }, t('napcatInstallHint')),
      failed
        ? h('p', { className: 'qqbot-modal-error' }, typeof info.error === 'string' ? info.error : t('napcatInstallFailed'))
        : null,
      failed
        ? h('div', { className: 'qqbot-modal-actions' },
          h('button', {
            type: 'button',
            className: 'qqbot-btn',
            'data-testid': 'qqbot-napcat-install-close',
            onClick: () => { setNapcatInstallOpen(false) },
          }, t('close')))
        : null))
}
