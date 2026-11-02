import React from 'react'
import { requestJson, messageOf, draftFromPolicy, parsePrefixes, formatTime } from '../../runtime/api.js'

export async function loadAccess(panel) {
  const { setAccessPhase, setAccessError, setAccessWarning, setAccessDraft } = panel
  setAccessPhase('loading')
  try {
    const payload = await requestJson('/qqbot/access')
    const policy = payload && payload.data
    if (policy === null || typeof policy !== 'object') throw new Error('unexpected payload')
    setAccessDraft(draftFromPolicy(policy))
    setAccessWarning(payload && typeof payload.warning === 'string' ? payload.warning : null)
    setAccessError(null)
    setAccessPhase('ready')
  } catch (error) {
    setAccessError(messageOf(error))
    setAccessPhase('error')
  }
}

export function saveAccess(panel) {
  const { t, accessDraft, loadAccess, runPost } = panel
  if (accessDraft === null) return
  const draft = accessDraft
  // POST the complete policy: the Host normalizes and stamps it, then we
  // re-read so the form shows exactly what was stored.
  const policy = {
    version: 1,
    updatedAt: new Date().toISOString(),
    inbound: {
      groups: { mode: draft.inboundGroupsMode, ids: draft.inboundGroupIds },
      private: { mode: draft.inboundPrivateMode, ids: draft.inboundPrivateIds },
      quiet: { enabled: draft.quietEnabled === true, prefixes: parsePrefixes(draft.prefixes) },
    },
    outbound: {
      groups: { mode: draft.outboundGroupsMode, ids: draft.outboundGroupIds },
      private: { mode: draft.outboundPrivateMode, ids: draft.outboundPrivateIds },
    },
  }
  runPost('access-save', '/qqbot/access', policy, loadAccess, t('accessSaved'))
}

export function renderAccess(panel) {
  const {
    t, accessPhase, accessError, accessWarning, accessDraft, setAccessDraft, contacts, contactsPhase,
    contactsError, accessQuery, setAccessQuery, busyOf, loadAccess, loadContacts, saveAccess, h
  } = panel
  if (accessDraft === null) {
    if (accessPhase === 'loading' || accessPhase === 'idle') {
      return h('div', { className: 'qqbot-empty', role: 'status' }, t('accessLoading'))
    }
    return h('div', { className: 'qqbot-empty', role: 'alert' },
      h('p', { className: 'qqbot-error' }, `${t('accessLoadFail')}: ${accessError || ''}`),
      h('button', {
        type: 'button',
        className: 'qqbot-btn',
        'aria-label': t('retry'),
        onClick: () => { loadAccess() },
      }, t('retry')))
  }

  const draft = accessDraft
  const contactGroups = contacts !== null && Array.isArray(contacts.groups) ? contacts.groups : []
  const contactFriends = contacts !== null && Array.isArray(contacts.friends) ? contacts.friends : []
  const updateDraft = (patch) => {
    setAccessDraft((previous) => (previous === null ? previous : { ...previous, ...patch }))
  }
  const updateQuery = (key, value) => {
    setAccessQuery((previous) => ({ ...previous, [key]: value }))
  }
  const toggleId = (field, id) => {
    setAccessDraft((previous) => {
      if (previous === null) return previous
      const list = previous[field]
      return { ...previous, [field]: list.includes(id) ? list.filter((item) => item !== id) : [...list, id] }
    })
  }
  const selectAllIds = (config) => {
    setAccessDraft((previous) => {
      if (previous === null) return previous
      const all = (config.kind === 'group' ? contactGroups : contactFriends).map((item) => String(item.id))
      const ids = [...previous[config.idsField]]
      for (const id of all) if (!ids.includes(id)) ids.push(id)
      return { ...previous, [config.idsField]: ids }
    })
  }
  const clearIds = (config) => updateDraft({ [config.idsField]: [] })
  const modeOptions = [
    h('option', { key: 'all', value: 'all' }, t('accessModeAll')),
    h('option', { key: 'whitelist', value: 'whitelist' }, t('accessModeWhitelist')),
    h('option', { key: 'blacklist', value: 'blacklist' }, t('accessModeBlacklist')),
  ]
  const modeHint = (mode) => mode === 'all'
    ? t('accessModeHintAll')
    : mode === 'blacklist' ? t('accessModeHintBlacklist') : t('accessModeHintWhitelist')

  const segment = (config) => {
    const mode = draft[config.modeField]
    const ids = draft[config.idsField]
    const query = (accessQuery[config.searchKey] || '').trim().toLowerCase()
    const contactItems = config.kind === 'group' ? contactGroups : contactFriends
    const matching = query === ''
      ? contactItems
      : contactItems.filter((item) => String(item.name || '').toLowerCase().includes(query) || String(item.id).includes(query))
    const known = new Set(contactItems.map((item) => String(item.id)))
    const extras = ids.filter((id) => !known.has(id)).filter((id) => query === '' || id.includes(query))
    const disabled = mode === 'all'
    const showEmpty = matching.length === 0 && extras.length === 0
    const emptyText = contactItems.length === 0 && query === ''
      ? t(config.kind === 'group' ? 'accessEmptyGroups' : 'accessEmptyFriends')
      : t('accessNoMatch')
    return h('div', { className: 'qqbot-access-section', key: config.searchKey },
      h('div', { className: 'qqbot-access-section-head' },
        h('div', { className: 'qqbot-field', 'data-testid': config.legacyTestId || undefined },
          h('label', { className: 'qqbot-field-label', htmlFor: config.modeTestId },
            t(config.kind === 'group' ? 'accessGroupPolicy' : 'accessPrivatePolicy')),
          h('select', {
            id: config.modeTestId,
            className: 'qqbot-select',
            'data-testid': config.modeTestId,
            value: mode,
            onChange: (event) => { updateDraft({ [config.modeField]: event.currentTarget.value }) },
          }, ...modeOptions)),
        h('div', { className: 'qqbot-btns' },
          h('button', {
            type: 'button',
            className: 'qqbot-btn',
            'data-testid': config.allTestId,
            'aria-label': t('accessSelectAll'),
            disabled,
            onClick: () => { selectAllIds(config) },
          }, t('accessSelectAll')),
          h('button', {
            type: 'button',
            className: 'qqbot-btn',
            'data-testid': config.clearTestId,
            'aria-label': t('accessClear'),
            disabled,
            onClick: () => { clearIds(config) },
          }, t('accessClear')))),
      h('div', { className: 'qqbot-access-tools' },
        h('input', {
          className: 'qqbot-input',
          type: 'text',
          value: accessQuery[config.searchKey],
          placeholder: t(config.kind === 'group' ? 'accessSearchGroups' : 'accessSearchFriends'),
          'aria-label': t(config.kind === 'group' ? 'accessSearchGroups' : 'accessSearchFriends'),
          'data-testid': config.searchTestId,
          onChange: (event) => { updateQuery(config.searchKey, event.currentTarget.value) },
        }),
        h('span', { className: 'qqbot-card-sub' }, `${ids.length} ${t('accessSelected')}`)),
      h('p', { className: 'qqbot-hint' }, modeHint(mode)),
      h('div', { className: 'qqbot-contact-list', 'data-testid': config.listTestId },
        ...matching.map((item) => h('label', {
          key: `${config.kind}-${item.id}`,
          className: 'qqbot-contact-row',
          'data-testid': `${config.rowPrefix}-${item.id}`,
          'data-scope': config.scope,
        },
          h('input', {
            type: 'checkbox',
            checked: ids.includes(String(item.id)),
            disabled,
            onChange: () => { toggleId(config.idsField, String(item.id)) },
          }),
          h('span', { className: 'qqbot-contact-name' }, item.name || String(item.id)),
          h('span', { className: 'qqbot-contact-id qqbot-mono' }, `(${item.id})`),
          config.kind === 'group' && item.memberCount
            ? h('span', { className: 'qqbot-contact-meta' }, `· ${item.memberCount} ${t('accessPeople')}`)
            : null)),
        ...extras.map((id) => h('div', {
          key: `extra-${id}`,
          className: 'qqbot-contact-row qqbot-contact-extra',
          'data-testid': `qqbot-access-extra-${config.scope}-${id}`,
          'data-scope': config.scope,
        },
          h('span', { className: 'qqbot-badge qqbot-badge-warn' }, t('accessNotInList')),
          h('span', { className: 'qqbot-contact-id qqbot-mono' }, `(${id})`),
          h('button', {
            type: 'button',
            className: 'qqbot-btn',
            'data-testid': `qqbot-access-remove-${config.scope}-${id}`,
            'aria-label': `${t('accessRemove')} ${id}`,
            onClick: () => { toggleId(config.idsField, id) },
          }, t('accessRemove')))),
        showEmpty ? h('div', { className: 'qqbot-contact-empty' }, emptyText) : null))
  }

  const inboundGroups = {
    scope: 'inbound', kind: 'group', searchKey: 'inboundGroups',
    modeField: 'inboundGroupsMode', idsField: 'inboundGroupIds',
    modeTestId: 'qqbot-access-inbound-mode',
    listTestId: 'qqbot-access-inbound-groups',
    allTestId: 'qqbot-access-inbound-groups-all',
    clearTestId: 'qqbot-access-inbound-groups-clear',
    searchTestId: 'qqbot-access-inbound-groups-search',
    rowPrefix: 'qqbot-access-group',
  }
  const inboundPrivate = {
    scope: 'inbound', kind: 'friend', searchKey: 'inboundPrivate',
    modeField: 'inboundPrivateMode', idsField: 'inboundPrivateIds',
    modeTestId: 'qqbot-access-inbound-private-mode',
    legacyTestId: 'qqbot-access-private-inbound',
    listTestId: 'qqbot-access-inbound-private',
    allTestId: 'qqbot-access-inbound-private-all',
    clearTestId: 'qqbot-access-inbound-private-clear',
    searchTestId: 'qqbot-access-inbound-private-search',
    rowPrefix: 'qqbot-access-friend',
  }
  const outboundGroups = {
    scope: 'outbound', kind: 'group', searchKey: 'outboundGroups',
    modeField: 'outboundGroupsMode', idsField: 'outboundGroupIds',
    modeTestId: 'qqbot-access-outbound-mode',
    listTestId: 'qqbot-access-outbound-groups',
    allTestId: 'qqbot-access-outbound-groups-all',
    clearTestId: 'qqbot-access-outbound-groups-clear',
    searchTestId: 'qqbot-access-outbound-groups-search',
    rowPrefix: 'qqbot-access-group',
  }
  const outboundPrivate = {
    scope: 'outbound', kind: 'friend', searchKey: 'outboundPrivate',
    modeField: 'outboundPrivateMode', idsField: 'outboundPrivateIds',
    modeTestId: 'qqbot-access-outbound-private-mode',
    legacyTestId: 'qqbot-access-private-outbound',
    listTestId: 'qqbot-access-outbound-private',
    allTestId: 'qqbot-access-outbound-private-all',
    clearTestId: 'qqbot-access-outbound-private-clear',
    searchTestId: 'qqbot-access-outbound-private-search',
    rowPrefix: 'qqbot-access-friend',
  }

  const accessCard = (title, description, groupConfig, privateConfig) => h('section', { className: 'qqbot-card' },
    h('div', { className: 'qqbot-card-head' },
      h('h2', { className: 'qqbot-card-title' }, title),
      h('span', { className: 'qqbot-card-sub' }, description)),
    h('div', { className: 'qqbot-form' },
      segment(groupConfig),
      segment(privateConfig)))

  const prefixChips = parsePrefixes(draft.prefixes)
  const quietCard = h('section', { className: 'qqbot-card' },
    h('div', { className: 'qqbot-card-head' },
      h('h2', { className: 'qqbot-card-title' }, t('accessQuietTitle'))),
    h('div', { className: 'qqbot-form' },
      h('label', { className: 'qqbot-check qqbot-check-block' },
        h('input', {
          type: 'checkbox',
          'data-testid': 'qqbot-access-quiet',
          checked: draft.quietEnabled,
          onChange: (event) => { updateDraft({ quietEnabled: event.currentTarget.checked }) },
        }),
        t('accessQuiet')),
      h('p', { className: 'qqbot-hint' }, t('accessQuietHint')),
      h('div', { className: 'qqbot-field' },
        h('label', { className: 'qqbot-field-label', htmlFor: 'qqbot-access-prefixes' }, t('accessPrefixes')),
        h('input', {
          id: 'qqbot-access-prefixes',
          className: 'qqbot-input',
          type: 'text',
          'data-testid': 'qqbot-access-prefixes',
          value: draft.prefixes,
          placeholder: t('accessPrefixesPlaceholder'),
          onChange: (event) => { updateDraft({ prefixes: event.currentTarget.value }) },
        }),
        prefixChips.length === 0
          ? h('p', { className: 'qqbot-hint' }, t('accessPrefixesHint'))
          : h('div', { className: 'qqbot-chips' }, ...prefixChips.map((prefix) => h('span', { key: prefix, className: 'qqbot-chip' }, prefix))))))

  const contactsLabel = contacts === null
    ? t('accessContactsLoading')
    : `${t('updated')} ${contacts.fetchedAt ? formatTime(contacts.fetchedAt) : '—'}${contacts.selfId ? ` · ${contacts.selfId}` : ''}`
  const toolbar = h('div', { className: 'qqbot-toolbar' },
    h('div', { className: 'qqbot-toolbar-left' },
      h('h2', { className: 'qqbot-card-title' }, t('accessTitle')),
      h('span', { className: 'qqbot-card-sub' }, contactsLabel)),
    h('div', { className: 'qqbot-toolbar-right' },
      h('button', {
        type: 'button',
        className: 'qqbot-btn',
        'data-testid': 'qqbot-access-refresh-contacts',
        'aria-label': t('accessRefreshContacts'),
        disabled: contactsPhase === 'loading',
        onClick: () => { loadContacts() },
      }, contactsPhase === 'loading' ? t('accessRefreshing') : t('accessRefreshContacts')),
      h('button', {
        type: 'button',
        className: 'qqbot-btn',
        'data-testid': 'qqbot-access-refresh',
        'aria-label': t('refresh'),
        disabled: accessPhase === 'loading',
        onClick: () => { loadAccess() },
      }, t('refresh')),
      h('button', {
        type: 'button',
        className: 'qqbot-btn qqbot-btn-primary',
        'data-testid': 'qqbot-access-save',
        'aria-label': t('accessSave'),
        'aria-busy': busyOf('access-save') ? 'true' : undefined,
        disabled: busyOf('access-save') || accessPhase === 'loading',
        onClick: saveAccess,
      }, busyOf('access-save') ? t('working') : t('accessSave'))))

  return h('div', { className: 'qqbot-stack' },
    toolbar,
    contactsError !== null
      ? h('div', {
        className: 'qqbot-banner qqbot-banner-error',
        role: 'alert',
        'data-testid': 'qqbot-access-contacts-error',
      }, contactsError)
      : null,
    contactsPhase === 'loading' && contacts === null
      ? h('div', { className: 'qqbot-empty', role: 'status' }, t('accessContactsLoading'))
      : null,
    accessError !== null
      ? h('div', { className: 'qqbot-banner qqbot-banner-error', role: 'alert' }, `${t('accessLoadFail')}: ${accessError}`)
      : null,
    accessWarning !== null ? h('p', { className: 'qqbot-warn' }, accessWarning) : null,
    h('div', { className: 'qqbot-grid' },
      accessCard(t('accessInboundTitle'), t('accessInboundDesc'), inboundGroups, inboundPrivate),
      accessCard(t('accessOutboundTitle'), t('accessOutboundDesc'), outboundGroups, outboundPrivate)),
    quietCard,
    h('p', { className: 'qqbot-note' }, t('accessNote')))
}

/** Access hooks: prefetch the policy on mount and lazily (re)load per tab. */
export function useAccess(panel) {
  const { tab, accessPhase, loadAccess } = panel

  React.useEffect(() => {
    loadAccess()
  }, [])

  React.useEffect(() => {
    if (tab === 'access' && accessPhase === 'idle') loadAccess()
  }, [tab, accessPhase])
}
