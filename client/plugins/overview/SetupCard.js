import { SETUP_STEP_KEYS } from '../../runtime/api.js'

const STEP_ICONS = { pending: '○', running: '◌', ok: '✓', failed: '✗', skipped: '–' }

function stepClass(status) {
  if (status === 'failed') return 'is-bad'
  if (status === 'skipped') return 'is-skip'
  if (status === 'running') return 'is-running'
  if (status === 'ok') return 'is-ok'
  return 'is-pending'
}

export function renderSetupCard(panel) {
  const {
    t, setupInfo, setupPhase, setupError, setupLogs, setupSteps, setupResultMsg, setupExpanded,
    setSetupExpanded, busyOf, loadSetup, reinstallEnvironment, napcatSupported,
    napcatInstalled, napcat, row, h
  } = panel
  const data = setupInfo
  const job = data !== null && typeof data.reinstall === 'object' && data.reinstall !== null ? data.reinstall : null
  const jobRunning = job?.status === 'running'
  const installing = (data !== null && data.installing === true)
    || jobRunning
    || busyOf('setup-install')
    || busyOf('setup-reinstall')
  const ready = data !== null
    && data.projectExists === true
    && data.hasPackageJson === true
    && data.hasNodeModules === true
  const statusText = jobRunning
    ? t('setupReinstalling')
    : job?.status === 'failed'
      ? t('setupReinstallFailed')
      : ready ? t('setupReady') : t('setupSubtitle')
  const steps = job !== null && Array.isArray(job.steps)
    ? job.steps
    : (Array.isArray(setupSteps) ? setupSteps : [])
  const completed = steps.filter((step) => step.status === 'ok' || step.status === 'skipped' || step.ok === true || step.skipped === true).length
  const summaryItems = data === null
    ? [{ key: 'loading', label: t('setupTitle'), value: setupPhase === 'error' ? t('setupUnknown') : t('loading') }]
    : [
      { key: 'project', label: t('setupProject'), value: data.projectExists === true && data.hasPackageJson === true ? t('setupCreated') : t('setupMissing') },
      { key: 'deps', label: t('setupDeps'), value: installing ? t('setupInstalling') : data.hasNodeModules === true ? t('setupInstalled') : t('setupNotInstalled') },
      { key: 'napcat', label: t('setupNapcat'), value: napcatInstalled ? t('stInstalled') : t('stMissing') },
      { key: 'onebot', label: t('setupOneBot'), value: napcat.configApplied === true ? t('setupConfigured') : t('setupPending') },
      { key: 'source', label: t('setupSource'), value: `${data.githubRepo || '—'}@${data.githubRef || '—'}` },
    ]
  const summary = h('div', { className: 'qqbot-setup-summary', 'data-testid': 'qqbot-setup-summary' },
    ...summaryItems.map((item) => h('span', { key: item.key, className: 'qqbot-setup-item' },
      h('span', { className: 'qqbot-setup-label' }, `${item.label} `),
      h('span', { className: 'qqbot-setup-value' }, item.value))))

  const stepsBlock = steps.length === 0 ? null : h('div', { className: 'qqbot-setup-steps', 'data-testid': 'qqbot-setup-progress' },
    h('div', { className: 'qqbot-setup-step' },
      h('span', { className: 'qqbot-setup-step-icon' }, '▸'),
      h('span', { className: 'qqbot-setup-step-name' }, t('setupProgress')),
      h('span', { className: 'qqbot-setup-step-message' }, `${completed}/${steps.length}`)),
    ...steps.map((step, index) => {
      const status = step.status ?? (step.ok === false ? 'failed' : step.skipped === true ? 'skipped' : 'ok')
      const iconStyle = status === 'running'
        ? { color: 'var(--dsw-alias-state-warn-primary)' }
        : status === 'pending' ? { color: 'var(--dsw-alias-label-tertiary)' } : undefined
      return h('div', {
        key: `${step.step || 'step'}-${index}`,
        className: `qqbot-setup-step ${stepClass(status)}`,
        'data-testid': 'qqbot-setup-step',
      },
        h('span', { className: 'qqbot-setup-step-icon', style: iconStyle }, STEP_ICONS[status] ?? '○'),
        h('span', { className: 'qqbot-setup-step-name' }, t(SETUP_STEP_KEYS[step.step] || 'setupStepOther')),
        h('span', { className: 'qqbot-setup-step-message' }, typeof step.message === 'string' ? step.message : ''))
    }))

  const actions = h('div', { className: 'qqbot-btns' },
    h('button', {
      type: 'button',
      className: 'qqbot-btn qqbot-btn-primary',
      'data-testid': 'qqbot-setup-install',
      'aria-label': t('setupReinstall'),
      'aria-busy': installing ? 'true' : undefined,
      disabled: installing,
      onClick: reinstallEnvironment,
    }, installing ? t('working') : t('setupReinstall')),
    h('button', {
      type: 'button',
      className: 'qqbot-btn',
      'data-testid': 'qqbot-setup-refresh',
      'aria-label': t('refresh'),
      onClick: () => { loadSetup() },
    }, t('refresh')),
    ready && setupExpanded
      ? h('button', {
        type: 'button',
        className: 'qqbot-btn',
        'data-testid': 'qqbot-setup-collapse',
        'aria-label': t('setupCollapse'),
        onClick: () => { setSetupExpanded(false) },
      }, t('setupCollapse'))
      : ready ? h('button', {
        type: 'button',
        className: 'qqbot-btn',
        'data-testid': 'qqbot-setup-expand',
        'aria-label': t('setupExpand'),
        onClick: () => { setSetupExpanded(true) },
      }, t('setupExpand')) : null)

  if (data !== null && ready && !installing && !setupExpanded) {
    return h('section', { className: 'qqbot-card qqbot-setup-card', 'data-testid': 'qqbot-setup-card' },
      h('div', { className: 'qqbot-card-head' },
        h('h2', { className: 'qqbot-card-title' }, t('setupTitle')),
        h('span', { className: 'qqbot-card-sub', 'data-testid': 'qqbot-setup-status' }, statusText)),
      summary,
      actions)
  }

  return h('section', { className: 'qqbot-card qqbot-setup-card', 'data-testid': 'qqbot-setup-card' },
    h('div', { className: 'qqbot-card-head' },
      h('h2', { className: 'qqbot-card-title' }, t('setupTitle')),
      h('span', { className: 'qqbot-card-sub', 'data-testid': 'qqbot-setup-status' }, statusText)),
    summary,
    actions,
    stepsBlock,
    job?.status === 'failed' && typeof job.error === 'string'
      ? h('div', { className: 'qqbot-banner qqbot-banner-error', role: 'alert' }, job.error)
      : null,
    setupError !== null
      ? h('div', { className: 'qqbot-banner qqbot-banner-error', role: 'alert' }, `${t('setupLoadFail')}: ${setupError}`)
      : null,
    setupResultMsg !== null ? h('p', { className: 'qqbot-hint' }, setupResultMsg) : null,
    installing || setupLogs.length > 0
      ? h('pre', { className: 'qqbot-pre qqbot-setup-logs', 'data-testid': 'qqbot-setup-logs', 'aria-label': t('setupLogs') },
        setupLogs.length > 0 ? setupLogs.join('\n') : t('setupLogsEmpty'))
      : null)
}
