

export function renderProfilesCard(panel) {
  const {
    t, profiles, profilesPhase, profilesError, profilesSearch, setProfilesSearch, profilesPath,
    selectedProfileKey, profileDraft, setProfileDraft, busyOf, loadProfiles, selectProfile, saveProfile,
    deleteProfile, row, h
  } = panel
  const list = Array.isArray(profiles) ? profiles : []
  const saving = busyOf('profile-save')
  const deleting = busyOf('profile-delete')
  const busy = saving || deleting
  const updateDraft = (patch) => setProfileDraft((previous) => (previous === null ? previous : { ...previous, ...patch }))
  const field = (testid, label, value, onChange, options) => {
    const extra = options || {}
    return h('div', { className: 'qqbot-field' },
      h('label', { className: 'qqbot-field-label', htmlFor: testid }, label),
      extra.multiline === true
        ? h('textarea', {
          id: testid,
          className: 'qqbot-area',
          'data-testid': testid,
          rows: extra.rows || 3,
          value,
          onChange: (event) => { onChange(event.currentTarget.value) },
        })
        : h('input', {
          id: testid,
          className: 'qqbot-input',
          type: 'text',
          'data-testid': testid,
          value,
          onChange: (event) => { onChange(event.currentTarget.value) },
        }))
  }
  const rows = list.map((profile) => {
    const key = typeof profile.key === 'string' && profile.key !== ''
      ? profile.key
      : `${String(profile.groupId ?? '')}:${String(profile.qq ?? '')}`
    const active = key === selectedProfileKey
    return h('button', {
      key,
      type: 'button',
      className: 'qqbot-profile-item',
      'data-testid': 'qqbot-profile-row',
      'data-key': key,
      'data-active': active ? 'true' : 'false',
      'aria-pressed': active ? 'true' : 'false',
      onClick: () => { selectProfile(profile) },
    },
      h('div', { className: 'qqbot-profile-item-top' },
        h('span', { className: 'qqbot-profile-name' }, profile.nickname || profile.qq || key),
        h('span', { className: 'qqbot-profile-meta' }, `${t('profilesQq')} ${profile.qq || '—'}`)),
      h('div', { className: 'qqbot-profile-meta' },
        h('span', null, `${t('profilesGroup')} ${profile.groupId || '—'}`),
        h('span', null, `${Number(profile.interactions) || 0} ${t('profilesInteractions')}`)),
      typeof profile.summary === 'string' && profile.summary !== ''
        ? h('span', { className: 'qqbot-profile-summary' }, profile.summary)
        : null)
  })
  const editor = profileDraft === null
    ? h('div', { className: 'qqbot-empty' }, t('profilesSelect'))
    : h('div', { className: 'qqbot-profile-editor' },
      h('div', { className: 'qqbot-rows' },
        row(t('profilesGroup'), profileDraft.groupId || '—', null, true),
        row(t('profilesQq'), profileDraft.qq || '—', null, true)),
      h('div', { className: 'qqbot-form' },
        field('qqbot-profile-nickname', t('profilesNickname'), profileDraft.nickname, (value) => { updateDraft({ nickname: value }) }),
        field('qqbot-profile-summary', t('profilesSummary'), profileDraft.summary, (value) => { updateDraft({ summary: value }) }, { multiline: true }),
        field('qqbot-profile-personality', t('profilesPersonality'), profileDraft.personality, (value) => { updateDraft({ personality: value }) }, { multiline: true }),
        field('qqbot-profile-style', t('profilesStyle'), profileDraft.style, (value) => { updateDraft({ style: value }) }),
        field('qqbot-profile-relationship', t('profilesRelationship'), profileDraft.relationship, (value) => { updateDraft({ relationship: value }) }),
        field('qqbot-profile-interests', t('profilesInterests'), profileDraft.interests, (value) => { updateDraft({ interests: value }) }),
        field('qqbot-profile-recent', t('profilesRecent'), profileDraft.recent, (value) => { updateDraft({ recent: value }) }, { multiline: true })),
      h('div', { className: 'qqbot-btns' },
        h('button', {
          type: 'button',
          className: 'qqbot-btn qqbot-btn-primary',
          'data-testid': 'qqbot-profile-save',
          'aria-label': t('profilesSave'),
          'aria-busy': saving ? 'true' : undefined,
          disabled: busy,
          onClick: () => { saveProfile() },
        }, saving ? t('working') : t('profilesSave')),
        h('button', {
          type: 'button',
          className: 'qqbot-btn qqbot-btn-danger',
          'data-testid': 'qqbot-profile-delete',
          'aria-label': t('profilesDelete'),
          'aria-busy': deleting ? 'true' : undefined,
          disabled: busy,
          onClick: () => { deleteProfile() },
        }, deleting ? t('working') : t('profilesDelete'))))
  return h('section', { className: 'qqbot-card', 'data-testid': 'qqbot-profiles-card' },
    h('div', { className: 'qqbot-card-head' },
      h('h2', { className: 'qqbot-card-title' }, t('profilesTitle')),
      h('span', { className: 'qqbot-card-sub' }, t('profilesSubtitle'))),
    h('div', { className: 'qqbot-toolbar' },
      h('div', { className: 'qqbot-toolbar-left' },
        h('input', {
          className: 'qqbot-input',
          type: 'text',
          'data-testid': 'qqbot-profiles-search',
          'aria-label': t('profilesSearch'),
          placeholder: t('profilesSearch'),
          value: profilesSearch,
          onChange: (event) => { setProfilesSearch(event.currentTarget.value) },
        }),
        h('button', {
          type: 'button',
          className: 'qqbot-btn',
          'data-testid': 'qqbot-profiles-refresh',
          'aria-label': t('profilesRefresh'),
          disabled: profilesPhase === 'loading',
          onClick: () => { loadProfiles(profilesSearch) },
        }, t('refresh'))),
      h('div', { className: 'qqbot-toolbar-right' },
        h('span', { className: 'qqbot-card-sub' }, `${list.length}`))),
    profilesError !== null
      ? h('div', { className: 'qqbot-banner qqbot-banner-error', role: 'alert', 'data-testid': 'qqbot-profiles-error' }, profilesError)
      : null,
    profilesPhase === 'loading' && profiles === null
      ? h('div', { className: 'qqbot-empty', role: 'status' }, t('profilesLoading'))
      : null,
    profiles !== null && list.length === 0 && profileDraft === null
      ? h('div', { className: 'qqbot-empty' }, t('profilesEmpty'))
      : null,
    profiles !== null && (list.length > 0 || profileDraft !== null)
      ? h('div', { className: 'qqbot-profiles-layout' },
        h('div', { className: 'qqbot-profile-list' }, ...rows),
        editor)
      : null,
    profilesPath !== null ? h('p', { className: 'qqbot-hint qqbot-mono' }, profilesPath) : null)
}
