import { formatTime, SETUP_STEP_KEYS } from '../../runtime/api.js'

export function renderSetupCard(panel) {
  const {
    t, setupInfo, setupPhase, setupError, setupLogs, setupSteps, setupResultMsg, setupExpanded,
    setSetupExpanded, busyOf, loadSetup, installKoishiEnv, runSetupFull, installSetupNapcat, napcat,
    napcatSupported, platformInstallHint, napcatInstalled, row, h
  } = panel
  const data = setupInfo
  const installing = (data !== null && data.installing === true)
    || busyOf('setup-install')
    || busyOf('setup-full')
  const ready = data !== null
    && data.projectExists === true
    && data.hasPackageJson === true
    && data.hasNodeModules === true
  const templateAvailable = data !== null && data.templateAvailable === true
  const projectCreated = data !== null && data.projectExists === true && data.hasPackageJson === true
  const statusItems = data === null
    ? [{ key: 'loading', label: t('setupTitle'), value: setupPhase === 'error' ? t('setupUnknown') : t('loading') }]
    : [
      { key: 'project', label: t('setupProject'), value: `${projectCreated ? t('setupCreated') : t('setupMissing')} · ${data.projectDir || '—'}` },
      { key: 'deps', label: t('setupDeps'), value: installing ? t('setupInstalling') : data.hasNodeModules === true ? t('setupInstalled') : t('setupNotInstalled') },
      { key: 'bundle', label: t('setupBundle'), value: data.bundleAvailable === true ? t('setupBundleAvailable') : t('setupBundleMissing') },
      { key: 'template', label: t('setupTemplate'), value: templateAvailable ? t('setupAvailable') : t('setupMissingTemplate') },
      { key: 'napcat', label: t('setupNapcat'), value: napcatInstalled ? t('stInstalled') : t('stMissing') },
      { key: 'onebot', label: t('setupOneBot'), value: napcat.configApplied === true ? t('setupConfigured') : t('setupPending') },
    ]
  const summary = h('div', { className: 'qqbot-setup-summary', 'data-testid': 'qqbot-setup-status' },
    ...statusItems.map((item) => h('span', { key: item.key, className: 'qqbot-setup-item' },
      h('span', { className: 'qqbot-setup-label' }, `${item.label} `),
      h('span', { className: 'qqbot-setup-value' }, item.value))))

  // Compact row once everything is installed: keep the card, hide the noise.
  if (data !== null && ready && !installing && !setupExpanded) {
    return h('section', { className: 'qqbot-card qqbot-setup-card', 'data-testid': 'qqbot-setup-card' },
      h('div', { className: 'qqbot-card-head' },
        h('h2', { className: 'qqbot-card-title' }, t('setupTitle')),
        h('span', { className: 'qqbot-card-sub', 'data-testid': 'qqbot-setup-status' }, t('setupReady'))),
      h('div', { className: 'qqbot-btns' },
        h('button', {
          type: 'button',
          className: 'qqbot-btn',
          'data-testid': 'qqbot-setup-refresh',
          'aria-label': t('refresh'),
          onClick: () => { loadSetup() },
        }, t('refresh')),
        h('button', {
          type: 'button',
          className: 'qqbot-btn',
          'data-testid': 'qqbot-setup-install',
          'aria-label': t('setupReinstall'),
          'aria-busy': busyOf('setup-install') ? 'true' : undefined,
          disabled: busyOf('setup-install'),
          onClick: installKoishiEnv,
        }, busyOf('setup-install') ? t('working') : t('setupReinstall')),
        h('button', {
          type: 'button',
          className: 'qqbot-btn',
          'data-testid': 'qqbot-setup-expand',
          'aria-label': t('setupExpand'),
          onClick: () => { setSetupExpanded(true) },
        }, t('setupExpand'))))
  }

  const details = []
  if (data !== null) {
    if (typeof data.nodeVersion === 'string' && data.nodeVersion !== '') {
      details.push(row(t('setupNode'), data.nodeVersion, null, true))
    }
    if (data.packageJson !== null && typeof data.packageJson === 'object') {
      const dependencyCount = Number(data.packageJson.dependencyCount)
      details.push(row(t('setupPackage'),
        `${data.packageJson.name || '—'}${data.packageJson.version ? ` v${data.packageJson.version}` : ''} · ${Number.isFinite(dependencyCount) ? dependencyCount : 0} ${t('setupDepsCount')}`,
        null, true))
    }
    if (data.lastInstall !== null && typeof data.lastInstall === 'object') {
      details.push(row(t('setupLastInstall'),
        `${data.lastInstall.ok === true ? t('setupInstallOk') : t('setupInstallFail')} · ${formatTime(data.lastInstall.finishedAt)}`,
        data.lastInstall.ok === true ? 'ok' : 'bad'))
    }
  }

  return h('section', { className: 'qqbot-card qqbot-setup-card', 'data-testid': 'qqbot-setup-card' },
    h('div', { className: 'qqbot-card-head' },
      h('h2', { className: 'qqbot-card-title' }, t('setupTitle')),
      h('span', { className: 'qqbot-card-sub' }, ready ? t('setupReady') : t('setupSubtitle'))),
    summary,
    details.length > 0 ? h('div', { className: 'qqbot-rows qqbot-setup-details' }, ...details) : null,
    h('div', { className: 'qqbot-btns' },
      h('button', {
        type: 'button',
        className: 'qqbot-btn qqbot-btn-primary',
        'data-testid': 'qqbot-setup-install',
        'aria-label': ready ? t('setupReinstall') : t('setupInstall'),
        'aria-busy': busyOf('setup-install') ? 'true' : undefined,
        disabled: installing,
        onClick: installKoishiEnv,
      }, busyOf('setup-install') ? t('working') : ready ? t('setupReinstall') : t('setupInstall')),
      h('button', {
        type: 'button',
        className: 'qqbot-btn',
        'data-testid': 'qqbot-setup-full',
        'aria-label': t('setupFull'),
        'aria-busy': busyOf('setup-full') ? 'true' : undefined,
        disabled: installing,
        onClick: runSetupFull,
      }, busyOf('setup-full') ? t('working') : t('setupFull')),
      h('button', {
        type: 'button',
        className: 'qqbot-btn',
        'data-testid': 'qqbot-setup-refresh',
        'aria-label': t('refresh'),
        onClick: () => { loadSetup() },
      }, t('refresh')),
      h('button', {
        type: 'button',
        className: 'qqbot-btn',
        'data-testid': 'qqbot-setup-napcat',
        'aria-label': napcatSupported ? t('setupNapcatInstall') : `${t('setupNapcatInstall')} (${t('setupNapcatUnsupported')})`,
        title: napcatSupported ? undefined : t('setupNapcatUnsupported'),
        'aria-busy': busyOf('setup-napcat') ? 'true' : undefined,
        disabled: installing || napcatInstalled || !napcatSupported || busyOf('setup-napcat'),
        onClick: installSetupNapcat,
      }, napcatInstalled ? t('stInstalled') : t('setupNapcatInstall')),
      ready ? h('button', {
        type: 'button',
        className: 'qqbot-btn',
        'data-testid': 'qqbot-setup-collapse',
        'aria-label': t('setupCollapse'),
        onClick: () => { setSetupExpanded(false) },
      }, t('setupCollapse')) : null),
    installing ? h('p', { className: 'qqbot-hint' }, t('setupInstallingHint')) : null,
    !napcatInstalled ? h('p', { className: 'qqbot-hint' }, platformInstallHint) : null,
    setupError !== null
      ? h('div', { className: 'qqbot-banner qqbot-banner-error', role: 'alert' }, `${t('setupLoadFail')}: ${setupError}`)
      : null,
    installing || setupLogs.length > 0
      ? h('pre', { className: 'qqbot-pre qqbot-setup-logs', 'data-testid': 'qqbot-setup-logs', 'aria-label': t('setupLogs') },
        setupLogs.length > 0 ? setupLogs.join('\n') : t('setupLogsEmpty'))
      : null,
    setupResultMsg !== null ? h('p', { className: 'qqbot-hint' }, setupResultMsg) : null,
    setupSteps !== null && setupSteps.length > 0
      ? h('div', { className: 'qqbot-setup-steps' },
        ...setupSteps.map((step, index) => h('div', {
          key: `${step.step || 'step'}-${index}`,
          className: `qqbot-setup-step${step.ok === false ? ' is-bad' : step.skipped === true ? ' is-skip' : ' is-ok'}`,
          'data-testid': 'qqbot-setup-step',
        },
          h('span', { className: 'qqbot-setup-step-icon' }, step.ok === false ? '✗' : step.skipped === true ? '–' : '✓'),
          h('span', { className: 'qqbot-setup-step-name' }, t(SETUP_STEP_KEYS[step.step] || 'setupStepOther')),
          h('span', { className: 'qqbot-setup-step-message' }, typeof step.message === 'string' ? step.message : ''))))
      : null)
}
