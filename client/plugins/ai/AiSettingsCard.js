

export function renderAiSettingsCard(panel) {
  const {
    t, aiSettingsDraft, setAiSettingsDraft, aiSettingsDefaults, aiSettingsPath, aiSettingsPhase,
    aiSettingsError, busyOf, loadAiSettings, saveAiSettings, resetAiSettingsDraft, h
  } = panel
  const draft = aiSettingsDraft
  const saving = busyOf('ai-settings-save')
  const updateDraft = (patch) => setAiSettingsDraft((previous) => (previous === null ? previous : { ...previous, ...patch }))
  const head = h('div', { className: 'qqbot-card-head' },
    h('h2', { className: 'qqbot-card-title' }, t('aiSettingsTitle')),
    h('span', { className: 'qqbot-card-sub' }, t('aiSettingsSubtitle')))
  if (draft === null) {
    return h('section', { className: 'qqbot-card', 'data-testid': 'qqbot-ai-settings-card' },
      head,
      aiSettingsPhase === 'error'
        ? h('div', { className: 'qqbot-empty' },
          h('p', { className: 'qqbot-error', 'data-testid': 'qqbot-ai-settings-error' }, `${t('aiSettingsLoadFail')}${aiSettingsError !== null ? `: ${aiSettingsError}` : ''}`),
          h('button', { type: 'button', className: 'qqbot-btn', 'aria-label': t('retry'), onClick: () => { loadAiSettings() } }, t('retry')))
        : h('div', { className: 'qqbot-empty', role: 'status' }, t('aiSettingsLoading')))
  }
  const field = (testid, label, value, onChange, options) => {
    const extra = options || {}
    return h('div', { className: 'qqbot-field' },
      h('label', { className: 'qqbot-field-label', htmlFor: testid }, label),
      h('input', {
        id: testid,
        className: 'qqbot-input',
        type: 'number',
        min: extra.min,
        max: extra.max,
        step: extra.step,
        'data-testid': testid,
        value,
        onChange: (event) => { onChange(event.currentTarget.value) },
      }))
  }
  return h('section', { className: 'qqbot-card', 'data-testid': 'qqbot-ai-settings-card' },
    head,
    h('div', { className: 'qqbot-form' },
      h('label', { className: 'qqbot-check' },
        h('input', {
          type: 'checkbox',
          'data-testid': 'qqbot-ai-settings-enabled',
          checked: draft.enabled,
          onChange: (event) => { updateDraft({ enabled: event.currentTarget.checked }) },
        }),
        t('aiSettingsEnabled')),
      h('div', { className: 'qqbot-ai-settings-grid' },
        field('qqbot-ai-settings-probability', t('aiSettingsProbability'), draft.replyProbabilityPercent,
          (value) => { updateDraft({ replyProbabilityPercent: value === '' ? '' : Number(value) }) },
          { min: 0, max: 100, step: 1 }),
        field('qqbot-ai-settings-followup', t('aiSettingsFollowUp'), draft.followUpMinutes,
          (value) => { updateDraft({ followUpMinutes: value === '' ? '' : Number(value) }) },
          { min: 0, max: 60, step: 1 }),
        field('qqbot-ai-settings-history', t('aiSettingsHistory'), draft.historyLimit,
          (value) => { updateDraft({ historyLimit: value === '' ? '' : Number(value) }) },
          { min: 0, max: 200, step: 1 }),
        field('qqbot-ai-settings-batch-window', t('aiSettingsBatchWindow'), draft.batchWindowMs,
          (value) => { updateDraft({ batchWindowMs: value === '' ? '' : Number(value) }) },
          { min: 0, max: 10000, step: 100 }),
        field('qqbot-ai-settings-batch-max', t('aiSettingsBatchMax'), draft.batchMaxWaitMs,
          (value) => { updateDraft({ batchMaxWaitMs: value === '' ? '' : Number(value) }) },
          { min: 0, max: 30000, step: 100 })),
      h('p', { className: 'qqbot-hint' }, t('aiSettingsProbabilityHint')),
      h('p', { className: 'qqbot-hint' }, t('aiSettingsBatchHint'))),
    h('div', { className: 'qqbot-btns' },
      h('button', {
        type: 'button',
        className: 'qqbot-btn qqbot-btn-primary',
        'data-testid': 'qqbot-ai-settings-save',
        'aria-label': t('aiSettingsSave'),
        'aria-busy': saving ? 'true' : undefined,
        disabled: saving,
        onClick: () => { saveAiSettings() },
      }, saving ? t('working') : t('aiSettingsSave')),
      h('button', {
        type: 'button',
        className: 'qqbot-btn',
        'data-testid': 'qqbot-ai-settings-reset',
        'aria-label': t('aiSettingsReset'),
        disabled: saving || aiSettingsDefaults === null,
        onClick: resetAiSettingsDraft,
      }, t('aiSettingsReset'))),
    aiSettingsError !== null && aiSettingsPhase === 'ready'
      ? h('p', { className: 'qqbot-error', 'data-testid': 'qqbot-ai-settings-error' }, aiSettingsError)
      : null,
    aiSettingsPath !== null ? h('p', { className: 'qqbot-hint qqbot-mono' }, aiSettingsPath) : null)
}
