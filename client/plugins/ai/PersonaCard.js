import { MAX_PERSONA_EXAMPLES } from '../../runtime/api.js'

export function renderPersonaCard(panel) {
  const {
    t, personaDraft, setPersonaDraft, personaPreview, personaPath, personaPhase, personaError,
    personaPreviewOpen, setPersonaPreviewOpen, personaPresets, personaPresetsPhase, personaPresetsError,
    personaPresetsPath, personaPresetName, setPersonaPresetName, busyOf, loadPersona, savePersona,
    resetPersona, savePersonaPreset, loadPersonaPreset, deletePersonaPreset, h
  } = panel
  const draft = personaDraft
  const saving = busyOf('persona-save')
  const resetting = busyOf('persona-reset')
  const busy = saving || resetting
  const updateDraft = (patch) => setPersonaDraft((previous) => (previous === null ? previous : { ...previous, ...patch }))
  const interestInput = typeof draft.interestInput === 'string' ? draft.interestInput : ''
  const splitInterestInput = (value) => [...new Set(String(value).split(/[，,、;；\s]+/u).map((item) => item.trim()).filter((item) => item !== ''))]
  const addInterests = (raw = interestInput) => {
    const incoming = splitInterestInput(raw)
    if (incoming.length === 0) return
    updateDraft({ interests: [...new Set([...draft.interests, ...incoming])], interestInput: '' })
  }
  const onInterestKeyDown = (event) => {
    if (event.nativeEvent?.isComposing === true) return
    if (event.key === 'Enter' || event.key === ',' || event.key === '，' || event.key === '、') {
      event.preventDefault()
      addInterests()
    }
  }
  const updateExample = (index, fieldName, value) => {
    setPersonaDraft((previous) => {
      if (previous === null) return previous
      const examples = previous.examples.map((example, current) => current === index ? { ...example, [fieldName]: value } : example)
      return { ...previous, examples }
    })
  }
  const addExample = () => {
    setPersonaDraft((previous) => {
      if (previous === null || previous.examples.length >= MAX_PERSONA_EXAMPLES) return previous
      return { ...previous, examples: [...previous.examples, { user: '', assistant: '' }] }
    })
  }
  const removeExample = (index) => {
    setPersonaDraft((previous) => {
      if (previous === null) return previous
      return { ...previous, examples: previous.examples.filter((unused, current) => current !== index) }
    })
  }
  const field = (testid, id, label, value, onChange, multiline) => h('div', { className: 'qqbot-field' },
    h('label', { className: 'qqbot-field-label', htmlFor: id }, label),
    multiline
      ? h('textarea', {
        id,
        className: 'qqbot-area qqbot-persona-area',
        'data-testid': testid,
        rows: 3,
        value,
        onChange: (event) => { onChange(event.currentTarget.value) },
      })
      : h('input', {
        id,
        className: 'qqbot-input',
        type: 'text',
        'data-testid': testid,
        value,
        onChange: (event) => { onChange(event.currentTarget.value) },
      }))

  const head = h('div', { className: 'qqbot-card-head' },
    h('h2', { className: 'qqbot-card-title' }, t('personaTitle')),
    h('span', { className: 'qqbot-card-sub' }, t('personaSubtitle')))

  if (draft === null) {
    return h('section', { className: 'qqbot-card qqbot-persona-card', 'data-testid': 'qqbot-persona-card' },
      head,
      personaPhase === 'error'
        ? h('div', { className: 'qqbot-empty' },
          h('p', { className: 'qqbot-error', 'data-testid': 'qqbot-persona-error' }, `${t('personaLoadFail')}${personaError !== null ? `: ${personaError}` : ''}`),
          h('button', { type: 'button', className: 'qqbot-btn', 'aria-label': t('retry'), onClick: () => { loadPersona() } }, t('retry')))
        : h('div', { className: 'qqbot-empty', role: 'status' }, t('personaLoading')))
  }

  const examples = draft.examples.map((example, index) => h('div', {
    key: `persona-example-${index}`,
    className: 'qqbot-persona-example',
    'data-testid': 'qqbot-persona-example',
    'data-index': String(index),
  },
    h('div', { className: 'qqbot-persona-example-head' },
      h('span', { className: 'qqbot-field-label' }, `${t('personaExamples')} ${index + 1}`),
      h('button', {
        type: 'button',
        className: 'qqbot-btn',
        'data-testid': 'qqbot-persona-example-remove',
        'aria-label': t('personaRemoveExample'),
        disabled: busy,
        onClick: () => { removeExample(index) },
      }, t('personaRemoveExample'))),
    field('qqbot-persona-example-user', `qqbot-persona-example-user-${index}`, t('personaExampleUser'), example.user,
      (value) => { updateExample(index, 'user', value) }, true),
    field('qqbot-persona-example-assistant', `qqbot-persona-example-assistant-${index}`, t('personaExampleAssistant'), example.assistant,
      (value) => { updateExample(index, 'assistant', value) }, true)))

  const previewBlock = personaPreview === ''
    ? null
    : h('div', { className: 'qqbot-persona-preview-wrap' },
      h('div', { className: 'qqbot-persona-preview-head' },
        h('span', { className: 'qqbot-field-label' }, t('personaPreview')),
        h('button', {
          type: 'button',
          className: 'qqbot-btn',
          'data-testid': 'qqbot-persona-preview-toggle',
          'aria-label': personaPreviewOpen ? t('personaPreviewHide') : t('personaPreviewShow'),
          onClick: () => { setPersonaPreviewOpen((previous) => !previous) },
        }, personaPreviewOpen ? t('personaPreviewHide') : t('personaPreviewShow'))),
      personaPreviewOpen
        ? h('pre', { className: 'qqbot-pre qqbot-persona-preview', 'data-testid': 'qqbot-persona-preview' }, personaPreview)
        : null)

  const presetSaving = busyOf('persona-preset-save')
  const presetLoading = busyOf('persona-preset-load')
  const presetDeleting = busyOf('persona-preset-delete')
  const presetList = Array.isArray(personaPresets) ? personaPresets : []
  const presetsBlock = h('div', { className: 'qqbot-persona-presets', 'data-testid': 'qqbot-persona-presets' },
    h('span', { className: 'qqbot-field-label' }, t('personaPresetsTitle')),
    h('p', { className: 'qqbot-hint' }, t('personaPresetsHint')),
    h('div', { className: 'qqbot-persona-presets-bar' },
      h('input', {
        className: 'qqbot-input',
        type: 'text',
        'data-testid': 'qqbot-persona-preset-name',
        'aria-label': t('personaPresetName'),
        placeholder: t('personaPresetName'),
        value: personaPresetName,
        onChange: (event) => { setPersonaPresetName(event.currentTarget.value) },
      }),
      h('button', {
        type: 'button',
        className: 'qqbot-btn qqbot-btn-primary',
        'data-testid': 'qqbot-persona-preset-save',
        'aria-label': t('personaPresetSave'),
        'aria-busy': presetSaving ? 'true' : undefined,
        disabled: presetSaving,
        onClick: () => { savePersonaPreset() },
      }, presetSaving ? t('working') : t('personaPresetSave'))),
    personaPresetsError !== null
      ? h('p', { className: 'qqbot-error', 'data-testid': 'qqbot-persona-presets-error' }, personaPresetsError)
      : null,
    personaPresetsPhase === 'loading' && personaPresets === null
      ? h('p', { className: 'qqbot-hint' }, t('personaPresetsLoading'))
      : null,
    personaPresets !== null && presetList.length === 0
      ? h('p', { className: 'qqbot-hint' }, t('personaPresetsEmpty'))
      : null,
    presetList.length > 0
      ? h('div', { className: 'qqbot-persona-preset-list' },
        ...presetList.map((preset) => h('div', {
          key: String(preset.id),
          className: 'qqbot-persona-preset-row',
          'data-testid': 'qqbot-persona-preset-row',
          'data-preset-id': String(preset.id),
        },
          h('div', { className: 'qqbot-persona-preset-main' },
            h('span', { className: 'qqbot-persona-preset-name' }, preset.name || String(preset.id)),
            h('span', { className: 'qqbot-persona-preset-role' },
              preset.persona !== null && typeof preset.persona === 'object' && preset.persona.name ? preset.persona.name : '—')),
          h('div', { className: 'qqbot-btns' },
            h('button', {
              type: 'button',
              className: 'qqbot-btn',
              'data-testid': 'qqbot-persona-preset-load',
              'aria-label': `${t('personaPresetLoad')} ${String(preset.name || '')}`,
              disabled: presetLoading || presetDeleting,
              onClick: () => { loadPersonaPreset(preset) },
            }, t('personaPresetLoad')),
            h('button', {
              type: 'button',
              className: 'qqbot-btn qqbot-btn-danger',
              'data-testid': 'qqbot-persona-preset-delete',
              'aria-label': `${t('personaPresetDelete')} ${String(preset.name || '')}`,
              disabled: presetLoading || presetDeleting,
              onClick: () => { deletePersonaPreset(preset) },
            }, t('personaPresetDelete'))))))
      : null,
    personaPresetsPath !== null ? h('p', { className: 'qqbot-hint qqbot-mono' }, personaPresetsPath) : null)

  return h('section', { className: 'qqbot-card qqbot-persona-card', 'data-testid': 'qqbot-persona-card' },
    head,
    h('div', { className: 'qqbot-form' },
      field('qqbot-persona-name', 'qqbot-persona-name', t('personaName'), draft.name, (value) => { updateDraft({ name: value }) }),
      field('qqbot-persona-role', 'qqbot-persona-role', t('personaRole'), draft.role, (value) => { updateDraft({ role: value }) }),
      field('qqbot-persona-tone', 'qqbot-persona-tone', t('personaTone'), draft.tone, (value) => { updateDraft({ tone: value }) }),
      field('qqbot-persona-personality', 'qqbot-persona-personality', t('personaPersonality'), draft.personality, (value) => { updateDraft({ personality: value }) }),
      field('qqbot-persona-rules', 'qqbot-persona-rules', t('personaRules'), draft.rules, (value) => { updateDraft({ rules: value }) }, true),
      h('div', { className: 'qqbot-field qqbot-persona-interest-field' },
        h('label', { className: 'qqbot-field-label', htmlFor: 'qqbot-persona-interest-input' }, t('personaInterests')),
        h('div', { className: 'qqbot-persona-interest-bar' },
          h('input', {
            id: 'qqbot-persona-interest-input',
            className: 'qqbot-input',
            type: 'text',
            'data-testid': 'qqbot-persona-interest-input',
            placeholder: t('personaInterestsPlaceholder'),
            value: interestInput,
            onChange: (event) => { updateDraft({ interestInput: event.currentTarget.value }) },
            onKeyDown: onInterestKeyDown,
            onBlur: () => { addInterests() },
          }),
          h('button', {
            type: 'button',
            className: 'qqbot-btn qqbot-btn-primary',
            'data-testid': 'qqbot-persona-interest-add',
            'aria-label': t('personaInterestsAdd'),
            onClick: () => { addInterests() },
          }, t('personaInterestsAdd'))),
        draft.interests.length === 0
          ? h('p', { className: 'qqbot-hint', 'data-testid': 'qqbot-persona-interest-empty' }, t('personaInterestsEmpty'))
          : h('div', { className: 'qqbot-persona-interest-tags', 'data-testid': 'qqbot-persona-interest-tags' },
            ...draft.interests.map((interest) => h('span', {
              key: `persona-interest-${interest}`,
              className: 'qqbot-persona-interest-tag',
              'data-testid': 'qqbot-persona-interest-chip',
            },
            h('span', null, interest),
            h('button', {
              type: 'button',
              className: 'qqbot-persona-interest-remove',
              'data-testid': 'qqbot-persona-interest-remove',
              'aria-label': `${t('personaInterestsRemove')} ${interest}`,
              onClick: () => { updateDraft({ interests: draft.interests.filter((item) => item !== interest) }) },
            }, '×')))),
        h('p', { className: 'qqbot-hint' }, t('personaInterestsHint')))),
    h('div', { className: 'qqbot-persona-examples' },
      h('span', { className: 'qqbot-field-label' }, t('personaExamples')),
      examples.length === 0 ? h('p', { className: 'qqbot-hint' }, t('personaNoExamples')) : null,
      ...examples,
      h('div', { className: 'qqbot-btns' },
        h('button', {
          type: 'button',
          className: 'qqbot-btn',
          'data-testid': 'qqbot-persona-example-add',
          'aria-label': t('personaAddExample'),
          disabled: busy || draft.examples.length >= MAX_PERSONA_EXAMPLES,
          onClick: addExample,
        }, t('personaAddExample')),
        h('span', { className: 'qqbot-hint' }, t('personaMaxExamples')))),
    h('div', { className: 'qqbot-btns' },
      h('button', {
        type: 'button',
        className: 'qqbot-btn qqbot-btn-primary',
        'data-testid': 'qqbot-persona-save',
        'aria-label': t('personaSave'),
        'aria-busy': saving ? 'true' : undefined,
        disabled: busy,
        onClick: () => { savePersona() },
      }, saving ? t('personaSaving') : t('personaSave')),
      h('button', {
        type: 'button',
        className: 'qqbot-btn',
        'data-testid': 'qqbot-persona-reset',
        'aria-label': t('personaReset'),
        'aria-busy': resetting ? 'true' : undefined,
        disabled: busy,
        onClick: () => { resetPersona() },
      }, resetting ? t('working') : t('personaReset'))),
    personaError !== null && personaPhase === 'ready'
      ? h('p', { className: 'qqbot-error', 'data-testid': 'qqbot-persona-error' }, personaError)
      : null,
    previewBlock,
    presetsBlock,
    personaPath !== null ? h('p', { className: 'qqbot-hint qqbot-mono' }, personaPath) : null)
}
