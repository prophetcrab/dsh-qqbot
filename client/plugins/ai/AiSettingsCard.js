
/**
 * Reply behavior form: runtime AI settings with a probability slider, timing
 * fields, batching window and the save/reset/path affordances.
 */
export function renderAiSettingsCard(panel) {
  const {
    t, aiSettingsDraft, setAiSettingsDraft, aiSettingsDefaults, aiSettingsPath, aiSettingsPhase,
    aiSettingsError, busyOf, loadAiSettings, saveAiSettings, resetAiSettingsDraft, h
  } = panel
  const draft = aiSettingsDraft
  const saving = busyOf('ai-settings-save')
  const updateDraft = (patch) => setAiSettingsDraft((previous) => (previous === null ? previous : { ...previous, ...patch }))
  const head = h('div', { className: 'qqbot-card-head' },
    h('div', null,
      h('h2', { className: 'qqbot-card-title' }, t('aiSettingsTitle')),
      h('span', { className: 'qqbot-card-sub' }, t('aiSettingsSubtitle'))),
    draft !== null
      ? h('span', { className: `qqbot-pill qqbot-pill-${draft.enabled ? 'ok' : 'warn'}` },
        h('i', { className: 'qqbot-pill-dot' }),
        h('span', { className: 'qqbot-pill-text' }, draft.enabled ? t('aiSettingsOn') : t('aiSettingsOff')))
      : null)
  if (draft === null) {
    return h('section', { className: 'qqbot-card qqbot-ai-settings-card', 'data-testid': 'qqbot-ai-settings-card' },
      head,
      aiSettingsPhase === 'error'
        ? h('div', { className: 'qqbot-empty' },
          h('p', { className: 'qqbot-error', 'data-testid': 'qqbot-ai-settings-error' }, `${t('aiSettingsLoadFail')}${aiSettingsError !== null ? `: ${aiSettingsError}` : ''}`),
          h('button', { type: 'button', className: 'qqbot-btn', 'aria-label': t('retry'), onClick: () => { loadAiSettings() } }, t('retry')))
        : h('div', { className: 'qqbot-empty', role: 'status' }, t('aiSettingsLoading')))
  }

  const numberField = (testid, label, value, onChange, options) => {
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

  const probability = Number(draft.replyProbabilityPercent)
  const probabilityValue = Number.isFinite(probability) ? Math.min(100, Math.max(0, probability)) : 0
  const probabilityBlock = h('div', { className: 'qqbot-field qqbot-ai-probability' },
    h('div', { className: 'qqbot-field-row' },
      h('label', { className: 'qqbot-field-label', htmlFor: 'qqbot-ai-settings-probability' }, t('aiSettingsProbability')),
      h('div', { className: 'qqbot-ai-probability-value' },
        h('input', {
          id: 'qqbot-ai-settings-probability-value',
          className: 'qqbot-input qqbot-input-number',
          type: 'number',
          min: 0,
          max: 100,
          step: 1,
          'data-testid': 'qqbot-ai-settings-probability-value',
          'aria-label': t('aiSettingsProbabilityValue'),
          value: draft.replyProbabilityPercent,
          onChange: (event) => { updateDraft({ replyProbabilityPercent: event.currentTarget.value === '' ? '' : Number(event.currentTarget.value) }) },
        }),
        h('span', { className: 'qqbot-ai-probability-unit' }, '%'))),
    h('input', {
      id: 'qqbot-ai-settings-probability',
      className: 'qqbot-range',
      type: 'range',
      min: 0,
      max: 100,
      step: 1,
      'data-testid': 'qqbot-ai-settings-probability',
      'aria-label': t('aiSettingsProbability'),
      value: probabilityValue,
      onChange: (event) => { updateDraft({ replyProbabilityPercent: event.currentTarget.value === '' ? '' : Number(event.currentTarget.value) }) },
    }),
    h('div', { className: 'qqbot-meter', 'aria-hidden': true },
      h('i', { className: 'qqbot-meter-fill', style: { width: `${probabilityValue}%` } })),
    h('p', { className: 'qqbot-hint' }, t('aiSettingsProbabilityHint')))

  const enabledToggle = h('label', { className: 'qqbot-switch-row' },
    h('input', {
      type: 'checkbox',
      className: 'qqbot-switch-input',
      'data-testid': 'qqbot-ai-settings-enabled',
      checked: draft.enabled,
      onChange: (event) => { updateDraft({ enabled: event.currentTarget.checked }) },
    }),
    h('span', { className: 'qqbot-switch-track', 'aria-hidden': true }, h('i', { className: 'qqbot-switch-knob' })),
    h('span', { className: 'qqbot-switch-label' }, t('aiSettingsEnabled')),
    h('span', { className: `qqbot-pill qqbot-pill-${draft.enabled ? 'ok' : 'warn'}` },
      h('span', { className: 'qqbot-pill-text' }, draft.enabled ? t('aiSettingsOn') : t('aiSettingsOff'))))

  return h('section', { className: 'qqbot-card qqbot-ai-settings-card', 'data-testid': 'qqbot-ai-settings-card' },
    head,
    h('div', { className: 'qqbot-form' },
      enabledToggle,
      probabilityBlock,
      h('div', { className: 'qqbot-field-label qqbot-ai-settings-group' }, t('aiSettingsTimingTitle')),
      h('div', { className: 'qqbot-ai-settings-grid' },
        numberField('qqbot-ai-settings-followup', t('aiSettingsFollowUp'), draft.followUpMinutes,
          (value) => { updateDraft({ followUpMinutes: value === '' ? '' : Number(value) }) },
          { min: 0, max: 60, step: 1 }),
        numberField('qqbot-ai-settings-history', t('aiSettingsHistory'), draft.historyLimit,
          (value) => { updateDraft({ historyLimit: value === '' ? '' : Number(value) }) },
          { min: 0, max: 200, step: 1 })),
      h('div', { className: 'qqbot-field-label qqbot-ai-settings-group' }, t('aiSettingsBatchTitle')),
      h('div', { className: 'qqbot-ai-settings-grid' },
        numberField('qqbot-ai-settings-batch-window', t('aiSettingsBatchWindow'), draft.batchWindowMs,
          (value) => { updateDraft({ batchWindowMs: value === '' ? '' : Number(value) }) },
          { min: 0, max: 10000, step: 100 }),
        numberField('qqbot-ai-settings-batch-max', t('aiSettingsBatchMax'), draft.batchMaxWaitMs,
          (value) => { updateDraft({ batchMaxWaitMs: value === '' ? '' : Number(value) }) },
          { min: 0, max: 30000, step: 100 })),
      h('p', { className: 'qqbot-hint' }, t('aiSettingsBatchHint')),
      h('div', { className: 'qqbot-field-label qqbot-ai-settings-group' }, t('aiSettingsBudgetTitle')),
      h('div', { className: 'qqbot-ai-settings-grid' },
        numberField('qqbot-ai-settings-min-interval', t('aiSettingsMinInterval'), draft.minIntervalSeconds,
          (value) => { updateDraft({ minIntervalSeconds: value === '' ? '' : Number(value) }) },
          { min: 0, max: 600, step: 1 }),
        numberField('qqbot-ai-settings-max-per-window', t('aiSettingsMaxPerWindow'), draft.maxPerWindow,
          (value) => { updateDraft({ maxPerWindow: value === '' ? '' : Number(value) }) },
          { min: 1, max: 100, step: 1 }),
        numberField('qqbot-ai-settings-window-minutes', t('aiSettingsWindowMinutes'), draft.windowMinutes,
          (value) => { updateDraft({ windowMinutes: value === '' ? '' : Number(value) }) },
          { min: 1, max: 60, step: 1 })),
      h('p', { className: 'qqbot-hint' }, t('aiSettingsBudgetHint'))),
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
