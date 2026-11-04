/**
 * dsh-qqbot — browser half. GENERATED FILE, do not edit.
 *
 * Built from client/ by scripts/build-client.mjs: one bundle registered with
 * DSH's module loader. A sidebar row plus a full-width control center for the
 * local QQ bot stack: status pills, the NapCat/Koishi cards, lifecycle and
 * setup actions, the plugin manager, the feature board and the log tail.
 *
 * The client never guesses ports or paths: everything comes from
 * `GET /qqbot/status`. Mutations are JSON POSTs, buttons disable while a
 * request is in flight, and failures surface in a banner at the top.
 */
window.__ModuleLoader__.load({
  id: 'dsh-qqbot',
  factory(require) {
    const __modules = {
    "client/components/Icon.js": (__require) => {
      const React = __require("react")

      const h = React.createElement

      function QqbotIcon(props) {
        const size = props && props.size ? props.size : 18
        return h('svg', { viewBox: '0 0 16 16', width: size, height: size, 'aria-hidden': true, fill: 'none' },
          h('path', { d: 'M8 1.6v2', stroke: 'currentColor', strokeWidth: 1.2, strokeLinecap: 'round' }),
          h('circle', { cx: 8, cy: 1.4, r: 0.9, fill: 'currentColor' }),
          h('rect', { x: 2, y: 3.4, width: 12, height: 9.2, rx: 3, stroke: 'currentColor', strokeWidth: 1.2 }),
          h('circle', { cx: 5.7, cy: 7.4, r: 0.9, fill: 'currentColor' }),
          h('circle', { cx: 10.3, cy: 7.4, r: 0.9, fill: 'currentColor' }),
          h('path', { d: 'M5.8 10.2h4.4', stroke: 'currentColor', strokeWidth: 1.2, strokeLinecap: 'round' }),
          h('path', { d: 'M4.2 12.6l-.8 1.6 2.3-.8', stroke: 'currentColor', strokeWidth: 1.1, strokeLinecap: 'round', strokeLinejoin: 'round' }))
      }

      return { QqbotIcon }
    },
    "client/components/Panel.js": (__require) => {
      const React = __require("react")
      const { useStore, deriveStatus } = __require("client/runtime/store.js")
      const { pickText } = __require("client/runtime/api.js")
      const { listTabs, resolveVisibleTabs } = __require("client/runtime/tab-registry.js")
      const { row, pill, actionButton } = __require("client/components/primitives.js")
      const { renderHero, renderTabs, renderBanner, renderPollWarn, renderFooter } = __require("client/components/Shell.js")

      const h = React.createElement

      /** Bind a tab's `(panel, ...args)` handlers onto the flat panel context. */
      function bindHandlers(panel, handlers) {
        for (const name of Object.keys(handlers)) {
          panel[name] = (...args) => handlers[name](panel, ...args)
        }
      }

      /**
       * The composition root: owns the shared state store, calls every registered
       * tab hook, then renders the Host-approved tabs inside the shared chrome.
       *
       * Hook order is the registry's stable order, never the Host tab list, so a
       * changed tab list can reorder the strip without reordering React hooks. The
       * Host only decides which registered tabs are visible and in what order.
       */
      function Panel(props) {
        const t = typeof (props && props.t) === 'function' ? props.t : (key) => String(key)
        const lang = t('__lang') === 'zh' ? 'zh' : 'en'

        const store = useStore(t)
        const status = deriveStatus(store.snapshot, t, store.loggedInRef)
        const panel = { h, t, lang, ...store, ...status }

        const registryTabs = listTabs()
        const hostTabs = store.snapshot !== null && Array.isArray(store.snapshot.clientTabs)
          ? store.snapshot.clientTabs
          : null
        const visibleTabs = resolveVisibleTabs(hostTabs)
        const hostById = new Map()
        if (Array.isArray(hostTabs)) {
          for (const hostTab of hostTabs) {
            if (hostTab !== null && typeof hostTab === 'object'
              && typeof hostTab.id === 'string' && !hostById.has(hostTab.id)) {
              hostById.set(hostTab.id, hostTab)
            }
          }
        }

        // Built-in tabs translate their labelKey; external tabs fall back to the
        // Host title for the same id when their key is not in the dictionary.
        const labelOf = (entry) => {
          const localized = t(entry.labelKey)
          if (localized !== entry.labelKey) return localized
          const hostTab = hostById.get(entry.id)
          const hostLabel = hostTab !== undefined && hostTab.title !== undefined ? pickText(hostTab.title, lang) : ''
          return hostLabel !== '' ? hostLabel : entry.labelKey
        }

        panel.row = (...args) => row(panel, ...args)
        panel.pill = (...args) => pill(panel, ...args)
        panel.actionButton = (...args) => actionButton(panel, ...args)
        for (const tab of registryTabs) bindHandlers(panel, tab.handlers)

        const renderers = new Map()
        for (const tab of registryTabs) {
          const render = tab.use(panel)
          renderers.set(tab.id, typeof render === 'function' ? render : () => null)
        }

        const tab = store.tab
        const visibleIds = new Set(visibleTabs.map((entry) => entry.id))
        const activeTabId = visibleIds.has(tab) ? tab : (visibleTabs.length > 0 ? visibleTabs[0].id : tab)
        const activeRenderer = renderers.get(activeTabId)
        panel.tabItems = visibleTabs.map((entry) => ({ id: entry.id, label: labelOf(entry) }))
        panel.activeTabId = activeTabId

        // Both tabs that show contact names keep the list fresh while visible.
        const { loadContacts } = panel
        React.useEffect(() => {
          if (tab !== 'messages' && tab !== 'access') return undefined
          loadContacts()
          const timer = setInterval(() => { loadContacts() }, 30000)
          return () => { clearInterval(timer) }
        }, [tab])

        const body = activeRenderer === undefined ? null : activeRenderer()

        return h('div', { className: 'qqbot-page', 'data-testid': 'qqbot-panel' },
          renderHero(panel),
          renderBanner(panel),
          renderPollWarn(panel),
          renderTabs(panel),
          h('div', {
            className: 'qqbot-body',
            role: 'tabpanel',
            id: `qqbot-tabpanel-${activeTabId}`,
            'aria-label': t('title'),
          }, body),
          renderFooter(panel))
      }

      return { Panel }
    },
    "client/components/Shell.js": (__require) => {
      /**
       * Static chrome of the panel: hero, pills, tab strip, banner and footer.
       * These render from the flat panel context and never own state.
       */
      const { formatTime } = __require("client/runtime/api.js")

      function renderHero(panel) {
        const {
          h, t, pill, platformLabel, platformBadgeText, napcatText, napcatTone, koishiText, koishiTone, botText,
          botTone, loadStatus
        } = panel
          return h('header', { className: 'qqbot-hero' },
          h('div', { className: 'qqbot-hero-main' },
            h('span', { className: 'qqbot-eyebrow' }, h('i', { className: 'qqbot-eyebrow-dot' }), t('eyebrow')),
            h('h1', { className: 'qqbot-title' }, t('title')),
            h('p', { className: 'qqbot-sub' }, t('subtitle'))),
          h('div', { className: 'qqbot-hero-side' },
            h('span', {
              className: 'qqbot-platform-badge',
              'data-testid': 'qqbot-platform-badge',
              title: platformLabel,
            }, platformBadgeText),
            h('div', { className: 'qqbot-pills' },
              pill('qqbot-pill-napcat', t('pillNapcat'), napcatText, napcatTone),
              pill('qqbot-pill-koishi', t('pillKoishi'), koishiText, koishiTone),
              pill('qqbot-pill-bot', t('pillBot'), botText, botTone)),
            h('div', { className: 'qqbot-btns' },
              h('button', {
                type: 'button',
                className: 'qqbot-btn',
                'data-testid': 'qqbot-status-refresh',
                'aria-label': t('refresh'),
                onClick: () => { loadStatus() },
              }, t('refresh')))))
      }

      function renderTabs(panel) {
        const { h, t, setTab, tabItems, activeTabId } = panel
        const items = Array.isArray(tabItems) ? tabItems : []
        return h('div', { className: 'qqbot-tabs', role: 'tablist', 'aria-label': t('title') },
          ...items.map((item) => h('button', {
            key: item.id,
            type: 'button',
            role: 'tab',
            className: `qqbot-tab${activeTabId === item.id ? ' active' : ''}`,
            'data-testid': `qqbot-tab-${item.id}`,
            'aria-label': item.label,
            'aria-selected': activeTabId === item.id ? 'true' : 'false',
            'aria-controls': `qqbot-tabpanel-${item.id}`,
            onClick: () => { setTab(item.id) },
            onKeyDown: (event) => {
              if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
                event.preventDefault()
                setTab(item.id)
              }
            },
          }, item.label)))
      }

      function renderBanner(panel) {
        const { h, banner } = panel
          return banner === null ? null : h('div', {
          className: `qqbot-banner qqbot-banner-${banner.kind}`,
          role: banner.kind === 'error' ? 'alert' : 'status',
          'data-testid': 'qqbot-banner',
        }, banner.text)
      }

      function renderPollWarn(panel) {
        const { h, t, loadError, hasSnapshot } = panel
        return loadError !== null && hasSnapshot
          ? h('div', { className: 'qqbot-warn' }, `${t('loadFail')}: ${loadError}`)
          : null
      }

      function renderFooter(panel) {
        const { h, t, hasSnapshot, snapshot, settings } = panel
          return hasSnapshot ? h('footer', { className: 'qqbot-foot' },
          typeof snapshot.updatedAt === 'string'
            ? h('span', null, `${t('updated')} ${formatTime(snapshot.updatedAt)}`)
            : null,
          h('span', null, `Node ${snapshot.platform && snapshot.platform.node ? snapshot.platform.node : '—'}`),
          h('span', null, `${t('lblPort')} · ${settings.koishiPort || '—'}`)) : null
      }

      return { renderHero, renderTabs, renderBanner, renderPollWarn, renderFooter }
    },
    "client/components/primitives.js": (__require) => {
      /**
       * Tiny element builders shared by every tab. They read `h`, the translator
       * and the busy map off the panel context so call sites stay terse.
       */
      function row(panel, label, value, tone, mono) {
        const { h } = panel
        return h('div', { key: label, className: 'qqbot-row-item' },
          h('span', { className: 'qqbot-row-label' }, label),
          h('span', { className: `qqbot-row-value${tone ? ` is-${tone}` : ''}${mono ? ' qqbot-mono' : ''}` }, value))
      }

      function pill(panel, testid, label, text, tone) {
        const { h } = panel
        return h('span', {
          className: `qqbot-pill qqbot-pill-${tone}`,
          'data-testid': testid,
          'aria-label': `${label}: ${text}`,
        },
          h('i', { className: 'qqbot-pill-dot' }),
          h('span', { className: 'qqbot-pill-label' }, label),
          h('span', { className: 'qqbot-pill-text' }, text))
      }

      function actionButton(panel, id, label, tone, handler, options) {
        const { h, t, busyOf } = panel
        const extra = options || {}
        const key = extra.busyKey || id
        const working = busyOf(key)
        return h('button', {
          key: `action-${id}`,
          type: 'button',
          className: `qqbot-btn${tone ? ` qqbot-btn-${tone}` : ''}`,
          'data-testid': `qqbot-action-${id}`,
          'aria-label': extra.ariaLabel || label,
          title: extra.title,
          'aria-busy': working ? 'true' : undefined,
          disabled: extra.disabled === true || working,
          onClick: handler,
        }, working ? t('working') : label)
      }

      return { row, pill, actionButton }
    },
    "client/index.js": (__require) => {
      /**
       * dsh-qqbot — browser half entry point.
       *
       * Registers the locale dictionaries, the panel stylesheet, the main control
       * center seat, the sidebar row and the external tab-registry bridge.
       *
       * The built-in tabs register themselves as a side effect of being imported
       * (`plugins/<name>/index.js` -> `runtime/tab-registry.js`), so this entry
       * point no longer owns a static tab list: the Host decides which tabs render.
       */
      const React = __require("react")
      const { Panel } = __require("client/components/Panel.js")
      const { QqbotIcon } = __require("client/components/Icon.js")
      const { NS, en, zh } = __require("client/runtime/locale.js")
      const { CSS } = __require("client/runtime/styles.js")
      const { registerClientTabApi } = __require("client/runtime/tab-registry.js")
      __require("client/plugins/overview/index.js")
      __require("client/plugins/ai/index.js")
      __require("client/plugins/messages/index.js")
      __require("client/plugins/access/index.js")
      __require("client/plugins/plugins/index.js")
      __require("client/plugins/features/index.js")
      __require("client/plugins/logs/index.js")
      __require("client/plugins/games/index.js")

      const h = React.createElement

      const NSID = 'qqbot'
      const PANEL_ID = 'qqbot'
      const SIDEBAR_ID = 'qqbot'

      const __default = {
        inject: ['slots', 'locale'],
        apply(ctx) {
          // Expose the tab bridge before the panel mounts, so external client
          // plugins can contribute tabs from their own apply().
          registerClientTabApi()
          ctx.effect(() => ctx.locale.register(NS, { en, zh }), 'dsh-qqbot: dictionaries')
          // One plugin-owned stylesheet: hover, focus and breakpoints are not
          // expressible inline; the tokens keep dark and light themes working.
          ctx.effect(() => {
            const style = document.createElement('style')
            style.dataset.plugin = 'qqbot'
            style.textContent = CSS
            document.head.appendChild(style)
            return () => { style.remove() }
          }, 'dsh-qqbot: stylesheet')
          const t = ctx.locale.bind(NSID)
          // The main seat passes no locale binding, so bind it here and hand the
          // translator down; a missing one used to crash the render.
          const ConnectedPanel = (props) => h(Panel, { ...props, t })
          ctx.effect(() => ctx.slots.inject('main', () => ctx.slots.register({
            name: 'main',
            key: PANEL_ID,
          }, ConnectedPanel)), 'dsh-qqbot: main panel')
          ctx.effect(() => ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
            name: 'sidebar.panellist',
            id: SIDEBAR_ID,
            order: 30,
            label: () => t('title'),
          }, QqbotIcon)), 'dsh-qqbot: sidebar row')
        },
      }

      return { default: __default }
    },
    "client/plugins/access/AccessTab.js": (__require) => {
      const React = __require("react")
      const { requestJson, messageOf, draftFromPolicy, parsePrefixes, formatTime } = __require("client/runtime/api.js")

      async function loadAccess(panel) {
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

      function saveAccess(panel) {
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

      function renderAccess(panel) {
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
      function useAccess(panel) {
        const { tab, accessPhase, loadAccess } = panel

        React.useEffect(() => {
          loadAccess()
        }, [])

        React.useEffect(() => {
          if (tab === 'access' && accessPhase === 'idle') loadAccess()
        }, [tab, accessPhase])
      }

      return { loadAccess, saveAccess, renderAccess, useAccess }
    },
    "client/plugins/access/index.js": (__require) => {
      const { registerTab } = __require("client/runtime/tab-registry.js")
      const { useAccess, loadAccess, saveAccess, renderAccess } = __require("client/plugins/access/AccessTab.js")

      registerTab({
        id: 'access',
        labelKey: 'tabAccess',
        order: 3,
        use(panel) {
          useAccess(panel)
          return () => renderAccess(panel)
        },
        handlers: {
          loadAccess,
          saveAccess,
        },
      })

      return {  }
    },
    "client/plugins/ai/AiTab.js": (__require) => {
      const React = __require("react")
      const { requestJson } = __require("client/runtime/api.js")

      const EMPTY = { character: {}, groups: {}, loops: [], memories: [], listener: null }
      const TRIGGER_LABEL = { mention: '@触发', reply: '回复触发', count: '消息数触发', time: '时间触发', keyword: '兴趣关键词' }
      const STATE_LABELS = ['BUFFER', 'ANALYZE', 'SPEAK', 'SEND', 'STATE_UPDATE']

      function obj(value) { return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {} }
      function arr(value) { return Array.isArray(value) ? value : [] }
      function text(value) { return typeof value === 'string' ? value : '' }
      function num(value) { const n = Number(value); return Number.isFinite(n) ? n : 0 }
      function time(value) {
        if (typeof value !== 'string' || value === '') return '—'
        const date = new Date(value)
        if (Number.isNaN(date.getTime())) return value
        return date.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })
      }
      function percent(value) { return Math.round(Math.max(0, Math.min(1, num(value))) * 100) }
      function memoryMeta(memory, selectedId) {
        const groupId = text(memory?.groupId)
        const group = groupId === '' ? '群未知' : String(groupId) === String(selectedId) ? '本群' : `群 ${groupId}`
        return `${time(memory?.at)} · ${text(memory?.kind) || 'event'} · ${group}`
      }

      function profilesBlock(h, selectedId, profiles) {
        return h('div', { className: 'qqbot-ai-profile-block', 'data-testid': 'qqbot-ai-profiles' },
          h('div', { className: 'qqbot-ai-profile-head' }, h('span', null, '成员画像'), h('span', null, selectedId === null ? '选择群查看' : selectedId)),
          selectedId === null
            ? h('p', { className: 'qqbot-ai-empty-line' }, '进入群详情后显示成员画像')
            : profiles.length === 0
              ? h('p', { className: 'qqbot-ai-empty-line' }, '这个群还没有成员画像')
              : profiles.map((profile) => h('div', { key: `${profile.groupId}:${profile.qq}`, className: 'qqbot-ai-profile' },
                h('div', { className: 'qqbot-ai-profile-name' }, h('strong', null, text(profile.nickname) || text(profile.qq)), h('span', null, text(profile.qq))),
                h('p', null, text(profile.summary) || text(profile.personality) || text(profile.recent) || '暂无概要'),
                arr(profile.interests).length > 0 ? h('div', { className: 'qqbot-ai-profile-tags' }, ...arr(profile.interests).slice(0, 4).map((tag) => h('span', { key: tag }, tag))) : null)))
      }

      function useAi(panel) {
        const [view, setView] = React.useState({ phase: 'loading', data: null, error: null, selected: null, overview: false, filter: 'all', expanded: null, settings: false })
        const selectedRef = React.useRef(null)
        const load = React.useCallback(async (manual = false, groupId = selectedRef.current) => {
          if (manual) setView((prev) => ({ ...prev, phase: prev.data === null ? 'loading' : 'refreshing', error: null }))
          try {
            const query = groupId === null ? '' : `?groupId=${encodeURIComponent(groupId)}`
            const payload = await requestJson(`/qqbot/group/dashboard${query}`)
            const data = obj(payload?.data)
            const ids = [...new Set([...Object.keys(obj(data.listener?.groups)), ...Object.keys(obj(data.groups))])]
            setView((prev) => {
              let selected = prev.overview ? null : prev.selected
              if (selected === null && prev.overview !== true) selected = ids[0] ?? null
              if (selected !== null && !ids.includes(selected)) selected = ids[0] ?? null
              return { ...prev, phase: 'ready', data: { ...EMPTY, ...data }, error: null, selected }
            })
          } catch (error) {
            setView((prev) => ({ ...prev, phase: 'error', error: String(error?.message ?? error) }))
          }
        }, [])
        React.useEffect(() => {
          if (panel.tab !== 'ai') return undefined
          void load()
          const timer = setInterval(() => { void load(false, selectedRef.current) }, 5000)
          return () => clearInterval(timer)
        }, [panel.tab, load])
        React.useEffect(() => {
          if (view.overview === true || view.selected === null) return
          selectedRef.current = view.selected
          void load(false, view.selected)
        }, [view.selected, view.overview, load])
        return () => renderAiTab(panel, {
          ...view,
          refresh: () => { void load(true, selectedRef.current) },
          selectGroup: (id) => {
            selectedRef.current = id ?? null
            setView((prev) => ({ ...prev, selected: id ?? null, overview: id === null }))
            void load(false, id ?? null)
          },
          setFilter: (filter) => setView((prev) => ({ ...prev, filter })),
          toggleLoop: (id) => setView((prev) => ({ ...prev, expanded: prev.expanded === id ? null : id })),
          openSettings: () => setView((prev) => ({ ...prev, settings: true })),
          closeSettings: () => setView((prev) => ({ ...prev, settings: false })),
        })
      }

      function statusPill(h, label, tone = 'idle') {
        return h('span', { className: `qqbot-ai-pill qqbot-ai-pill-${tone}` }, h('i', { className: 'qqbot-ai-dot' }), label)
      }

      function metric(h, label, value, hint, tone) {
        return h('div', { className: `qqbot-ai-metric qqbot-ai-metric-${tone || 'blue'}` },
          h('span', { className: 'qqbot-ai-metric-label' }, label),
          h('strong', { className: 'qqbot-ai-metric-value' }, value),
          h('span', { className: 'qqbot-ai-metric-hint' }, hint))
      }

      function emotionBar(h, label, value, tone) {
        return h('div', { className: 'qqbot-ai-emotion-row' },
          h('div', { className: 'qqbot-ai-emotion-head' }, h('span', null, label), h('span', null, `${percent(value)}%`)),
          h('div', { className: 'qqbot-ai-meter' }, h('i', { className: `qqbot-ai-meter-fill is-${tone}`, style: { width: `${percent(value)}%` } })))
      }

      const PHASE_INDEX = { buffer: 0, analyze: 1, compose: 2, send: 3, state_update: 4 }
      const PHASE_LABEL = { buffer: '缓冲区', analyze: '分析', compose: '生成发言', send: '发送', state_update: '更新状态' }

      function stateMachine(h, group) {
        const active = group !== null && group !== undefined && typeof group === 'object' && (group.active !== null && group.active !== undefined || group.running === true)
        const currentPhase = active ? text(group?.phase) : ''
        const lastPhase = !active ? text(group?.lastPhase) : ''
        const phase = active ? currentPhase : lastPhase
        const index = active ? (PHASE_INDEX[currentPhase] ?? 1) : (PHASE_INDEX[lastPhase] ?? 0)
        const caption = active
          ? `处理中 · ${PHASE_LABEL[currentPhase] ?? '准备'}`
          : lastPhase !== ''
            ? `上一轮完成 · ${PHASE_LABEL[lastPhase] ?? lastPhase}`
            : '空闲 · 等待触发'
        return h('div', { className: 'qqbot-ai-machine', 'data-testid': 'qqbot-ai-state-machine' },
          ...STATE_LABELS.map((label, i) => h('div', { key: label, className: `qqbot-ai-machine-node${i <= index ? ' is-reached' : ''}${active && i === index ? ' is-active' : ''}` },
            h('span', { className: 'qqbot-ai-machine-index' }, String(i + 1).padStart(2, '0')),
            h('span', null, label))),
          h('div', { className: 'qqbot-ai-machine-caption' }, caption))
      }

      function groupRow(h, id, group, selected, select) {
        const queue = obj(group.queue)
        const running = group.running === true
        const threshold = num(group.countThreshold)
        const unprocessed = num(group.unprocessed)
        const remaining = Math.max(0, threshold - unprocessed)
        return h('button', {
          key: id, type: 'button', className: `qqbot-ai-group-row${selected ? ' is-selected' : ''}`,
          'data-testid': 'qqbot-ai-group-row', 'data-group': id, onClick: () => select(id),
        },
        h('div', { className: 'qqbot-ai-group-main' },
          h('div', { className: 'qqbot-ai-group-title' },
            h('div', { className: 'qqbot-ai-group-name-wrap' },
              h('span', { className: 'qqbot-ai-group-name' }, text(group.name) || id),
              text(group.name) ? h('span', { className: 'qqbot-ai-group-id' }, id) : null),
            running ? statusPill(h, '处理中', 'run') : statusPill(h, '监听中', 'ok')),
          h('div', { className: 'qqbot-ai-group-meta' },
            h('span', null, `缓冲 ${num(group.bufferSize)}`),
            h('span', null, `未处理 ${unprocessed}`),
            h('span', { className: 'qqbot-ai-next-trigger' }, threshold > 0 ? `下次触发 ${threshold} 条 · 还差 ${remaining} 条` : '下次触发阈值未知'),
            h('span', null, queue.urgent ? `urgent · ${queue.urgent}` : queue.normal ? `normal · ${queue.normal}` : '队列空'))),
        h('span', { className: 'qqbot-ai-group-arrow' }, '›'))
      }

      function loopRow(h, loop, expanded, toggle) {
        const sent = loop.sendResult?.sent === true
        const failed = sent !== true && (typeof loop.sendResult?.error === 'string' || loop.sendResult?.reason === 'compose_failed' || loop.sendResult?.reason === 'loop_failed')
        const speak = loop.speak?.enabled === true
        const action = loop.sendResult?.replyType === 'action'
        return h('div', { key: loop.loopId, className: 'qqbot-ai-loop' },
          h('button', { type: 'button', className: 'qqbot-ai-loop-head', 'data-testid': 'qqbot-ai-loop-row', onClick: () => toggle(loop.loopId) },
            h('span', { className: `qqbot-ai-loop-icon ${sent ? 'is-sent' : 'is-idle'}` }, action ? '·' : sent ? '↗' : '·'),
            h('span', { className: 'qqbot-ai-loop-main' },
              h('strong', null, TRIGGER_LABEL[loop.trigger] || loop.trigger || 'loop'),
              h('span', null, `${time(loop.at)} · ${num(loop.materialCount)} 条素材`)),
            h('span', { className: `qqbot-ai-loop-state ${sent ? 'is-sent' : ''}` }, action ? '已戳一戳' : sent ? '已发言' : failed ? '发送失败' : speak ? '未发送' : '未发言'),
            h('span', { className: 'qqbot-ai-loop-arrow' }, expanded ? '−' : '+')),
          expanded ? h('div', { className: 'qqbot-ai-loop-detail' },
            h('div', { className: 'qqbot-ai-loop-reply' }, loop.reply || '本轮没有发送内容'),
            h('div', { className: 'qqbot-ai-loop-meta' },
              h('span', null, `触发 ${loop.trigger || '—'}`),
              h('span', null, `素材 ${num(loop.materialCount)}`),
              h('span', null, `耗时 ${num(loop.durationMs)} ms`),
              h('span', null, action ? '戳一戳' : sent ? `发送 ${num(loop.sendResult?.parts)} 条` : '未发送')),
            h('div', { className: 'qqbot-ai-loop-meta' }, h('span', null, loop.loopId || '—'))) : null)
      }

      function infoField(h, label, value, extra = '') {
        return h('div', { className: `qqbot-ai-info ${extra}` },
          h('span', { className: 'qqbot-ai-info-label' }, label),
          h('p', { className: 'qqbot-ai-info-value' }, text(value) || '—'))
      }

      function exampleBlock(h, example, index) {
        return h('div', { key: `example-${index}`, className: 'qqbot-ai-example' },
          h('div', { className: 'qqbot-ai-example-line' }, h('span', null, '用户'), h('p', null, text(example.user) || '—')),
          h('div', { className: 'qqbot-ai-example-line is-assistant' }, h('span', null, '角色'), h('p', null, text(example.assistant) || '—')))
      }

      function settingsCardHead(h, kicker, title, sub) {
        return h('div', { className: 'qqbot-ai-card-head' },
          h('div', null, h('span', { className: 'qqbot-ai-card-kicker' }, kicker), h('h2', null, title)),
          sub ? h('span', { className: 'qqbot-ai-card-sub' }, sub) : null)
      }

      function profileDetail(h, profile) {
        return h('div', { key: `${profile.groupId}:${profile.qq}`, className: 'qqbot-ai-profile qqbot-ai-profile-full' },
          h('div', { className: 'qqbot-ai-profile-name' }, h('strong', null, text(profile.nickname) || text(profile.qq)), h('span', null, text(profile.qq))),
          h('div', { className: 'qqbot-ai-profile-facts' },
            text(profile.personality) ? h('span', null, `性格 ${text(profile.personality)}`) : null,
            text(profile.style) ? h('span', null, `风格 ${text(profile.style)}`) : null,
            text(profile.relationship) ? h('span', null, `关系 ${text(profile.relationship)}`) : null),
          h('p', null, text(profile.summary) || text(profile.recent) || '暂无概要'),
          arr(profile.interests).length > 0
            ? h('div', { className: 'qqbot-ai-profile-tags' }, ...arr(profile.interests).slice(0, 6).map((tag) => h('span', { key: tag }, tag)))
            : null)
      }

      function groupDetail(h, id, group) {
        return h('div', { key: id, className: 'qqbot-ai-settings-group' },
          h('div', { className: 'qqbot-ai-settings-group-head' }, h('strong', null, text(group.name) || id), h('span', null, id)),
          h('p', null, text(group.topic) || '暂无最近话题'),
          h('div', { className: 'qqbot-ai-profile-tags' },
            h('span', null, `${arr(group.participants).length} 位参与者`),
            h('span', null, group.running ? '处理中' : '监听中'),
            group.lastPhase ? h('span', null, `上一阶段 ${PHASE_LABEL[group.lastPhase] || group.lastPhase}`) : null))
      }

      function renderAiSettings(panel, view) {
        const { h } = panel
        const data = obj(view.data)
        const character = obj(data.character)
        const core = obj(character.core)
        const emotion = obj(character.emotion)
        const persona = obj(data.persona)
        const groupsState = obj(data.groups)
        const listenerGroups = obj(data.listener?.groups)
        const groups = Object.keys({ ...listenerGroups, ...groupsState }).map((id) => [id, { ...obj(listenerGroups[id]), ...obj(groupsState[id]) }])
        const selectedId = view.selected ?? groups[0]?.[0] ?? null
        const profiles = arr(data.profiles).filter((profile) => selectedId === null || String(profile.groupId) === String(selectedId))
        const memories = arr(data.memories).slice(-100).reverse()
        const name = text(persona.name) || text(core.name) || '未命名角色'
        const role = text(persona.role) || text(core.identity)
        const tone = text(persona.tone) || text(core.voice)
        const personality = text(persona.personality)
        const rules = text(persona.rules)
        const keywords = arr(persona.keywords).length > 0 ? arr(persona.keywords) : arr(core.keywords)
        const examples = arr(persona.examples)
        const updatedAt = persona.updatedAt || character.updatedAt || data.updatedAt
        const selectedGroup = groups.find(([id]) => id === selectedId)
        const selectedName = selectedGroup === undefined ? (selectedId || '未选择群') : (text(selectedGroup[1].name) || selectedId)
        const personaCard = h('section', { className: 'qqbot-ai-card qqbot-ai-persona-panel', 'data-testid': 'qqbot-ai-persona' },
          settingsCardHead(h, 'PERSONA', '完整人格设定', 'persona.json'),
          h('div', { className: 'qqbot-ai-info-grid' },
            infoField(h, '名称', name),
            infoField(h, '语气', tone),
            infoField(h, '性格', personality, 'is-wide'),
            infoField(h, '身份', role, 'is-full')),
          h('div', { className: 'qqbot-ai-rule-block', 'data-testid': 'qqbot-ai-persona-rules' },
            h('span', null, '行为准则'),
            h('p', null, rules || '暂无行为准则')),
          keywords.length > 0 ? h('div', { className: 'qqbot-ai-settings-keywords' },
            h('div', { className: 'qqbot-ai-profile-head' }, h('span', null, '兴趣关键词'), h('span', null, '触发用 · 不进入提示词')),
            h('div', { className: 'qqbot-ai-keyword-tags' }, ...keywords.map((keyword) => h('span', { key: keyword }, keyword)))) : null,
          examples.length > 0 ? h('div', { className: 'qqbot-ai-examples', 'data-testid': 'qqbot-ai-persona-examples' },
            h('div', { className: 'qqbot-ai-profile-head' }, h('span', null, '对话示例'), h('span', null, '仅展示 · 不进入提示词')),
            ...examples.slice(0, 6).map((example, index) => exampleBlock(h, example, index))) : null)
        const emotionCard = h('section', { className: 'qqbot-ai-card' },
          settingsCardHead(h, 'EMOTION', '当前状态', '软约束'),
          h('div', { className: 'qqbot-ai-emotions' },
            emotionBar(h, '心情', (num(emotion.valence) + 1) / 2, 'rose'),
            emotionBar(h, '唤醒度', emotion.arousal, 'amber'),
            emotionBar(h, '精力', emotion.energy, 'blue'),
            emotionBar(h, '社交电量', emotion.socialBattery, 'violet'),
            emotionBar(h, '压力', emotion.stress, 'amber')),
          h('div', { className: 'qqbot-ai-emotion-numbers', 'data-testid': 'qqbot-ai-emotion-numbers' },
            ...['valence', 'arousal', 'energy', 'socialBattery', 'stress'].map((key) => h('span', { key }, `${key} ${num(emotion[key]).toFixed(2)}`))))
        const profilesCard = h('section', { className: 'qqbot-ai-card', 'data-testid': 'qqbot-ai-settings-profiles' },
          settingsCardHead(h, 'PROFILES', `用户画像 · ${selectedName}`, `${profiles.length} 人`),
          profiles.length === 0
            ? h('p', { className: 'qqbot-ai-empty-line' }, selectedId === null ? '进入群详情后显示画像' : '这个群还没有用户画像')
            : h('div', { className: 'qqbot-ai-settings-profiles' }, ...profiles.slice(0, 8).map((profile) => profileDetail(h, profile))))
        const memoryCard = h('section', { className: 'qqbot-ai-card' },
          settingsCardHead(h, 'MEMORY', '记忆库', `${memories.length} 条最近记忆`),
          h('div', { className: 'qqbot-ai-settings-memories', 'data-testid': 'qqbot-ai-settings-memories' },
            memories.length === 0 ? h('p', { className: 'qqbot-ai-empty-line' }, '还没有长期记忆') : memories.map((memory) => h('div', { key: memory.id || memory.summary, className: 'qqbot-ai-memory' },
              h('span', { className: `qqbot-ai-memory-dot is-${memory.importance || 'medium'}` }),
              h('div', null, h('p', null, text(memory.summary) || '—'), h('span', null, memoryMeta(memory, view.selected)))))))
        const groupsCard = h('section', { className: 'qqbot-ai-card' },
          settingsCardHead(h, 'GROUPS', '群聊状态', `${groups.length} 个群`),
          h('div', { className: 'qqbot-ai-settings-groups', 'data-testid': 'qqbot-ai-settings-groups' },
            groups.length === 0 ? h('p', { className: 'qqbot-ai-empty-line' }, '还没有群聊状态') : groups.map(([id, group]) => groupDetail(h, id, group))))
        return h('div', { className: 'qqbot-ai-dashboard qqbot-ai-settings', 'data-testid': 'qqbot-ai-settings' },
          h('header', { className: 'qqbot-ai-settings-hero' },
            h('button', { type: 'button', className: 'qqbot-ai-btn qqbot-ai-btn-back', 'data-testid': 'qqbot-ai-settings-back', onClick: view.closeSettings }, '← 返回运行台'),
            h('div', { className: 'qqbot-ai-settings-hero-copy' },
              h('span', { className: 'qqbot-ai-eyebrow' }, 'CHARACTER / SETTINGS'),
              h('h1', null, name),
              h('p', null, role || '还没有角色身份')),
            h('div', { className: 'qqbot-ai-settings-hero-meta' },
              statusPill(h, '状态投影', 'violet'),
              h('span', null, updatedAt ? `更新于 ${time(updatedAt)}` : '等待状态数据'))),
          h('div', { className: 'qqbot-ai-settings-grid' }, personaCard, h('aside', { className: 'qqbot-ai-settings-side' }, emotionCard, profilesCard)),
          h('div', { className: 'qqbot-ai-settings-bottom' }, memoryCard, groupsCard))
      }

      function renderAiTab(panel, view) {
        const { h } = panel
        const data = obj(view.data)
        const character = obj(data.character)
        const core = obj(character.core)
        const emotion = obj(character.emotion)
        const listenerGroups = obj(data.listener?.groups)
        const stateGroups = obj(data.groups)
        const groups = Object.keys({ ...listenerGroups, ...stateGroups }).map((id) => [id, { ...obj(listenerGroups[id]), ...obj(stateGroups[id]) }])
        const loopSource = arr(data.loops).length > 0 ? data.loops : arr(data.listener?.loops)
        const loops = arr(loopSource).filter((loop) => view.filter === 'all' || (view.filter === 'sent' ? loop.sendResult?.sent === true : loop.sendResult?.sent !== true))
        const selectedId = view.overview === true ? null : (view.selected ?? groups[0]?.[0] ?? null)
        const selectedProfiles = selectedId === null ? [] : arr(data.profiles).filter((profile) => String(profile.groupId) === String(selectedId)).slice(0, 4)
        const selectedEntry = selectedId === null ? null : groups.find(([id]) => id === selectedId)
        const selectedGroup = selectedEntry === undefined || selectedEntry === null ? null : selectedEntry[1]
        const queueCount = groups.reduce((sum, [, g]) => sum + (obj(g.queue).urgent ? 1 : 0) + (obj(g.queue).normal ? 1 : 0), 0)
        const activeCount = groups.filter(([, g]) => g.running === true).length
        const sentCount = arr(loopSource).filter((loop) => loop.sendResult?.sent === true).length
        const loading = view.phase === 'loading'
        if (loading) {
          return h('div', { className: 'qqbot-ai-dashboard', 'data-testid': 'qqbot-ai-dashboard' }, h('div', { className: 'qqbot-ai-skeleton' }, '正在连接群聊监听器…'))
        }
        if (view.phase === 'error') {
          return h('div', { className: 'qqbot-ai-dashboard', 'data-testid': 'qqbot-ai-dashboard' },
            h('section', { className: 'qqbot-ai-card qqbot-ai-error-card' },
              h('span', { className: 'qqbot-ai-eyebrow' }, 'LISTENER OFFLINE'),
              h('h2', null, '监听器暂时不可用'),
              h('p', { 'data-testid': 'qqbot-ai-error' }, view.error || '无法读取运行数据'),
              h('button', { type: 'button', className: 'qqbot-ai-btn qqbot-ai-btn-primary', 'data-testid': 'qqbot-ai-refresh', onClick: view.refresh }, '重新连接')))
        }
        if (view.settings === true) return renderAiSettings(panel, view)
        return h('div', { className: 'qqbot-ai-dashboard', 'data-testid': 'qqbot-ai-dashboard' },
          h('header', { className: 'qqbot-ai-hero' },
            h('div', null,
              h('span', { className: 'qqbot-ai-eyebrow' }, 'GROUP LISTENER / LIVE CONTROL'),
              h('h1', null, '群聊 AI 运行台'),
              h('p', null, '监听群消息，按队列触发分析、发言与状态更新。')),
            h('div', { className: 'qqbot-ai-hero-actions' },
              statusPill(h, activeCount > 0 ? `${activeCount} 个群处理中` : '监听中', activeCount > 0 ? 'run' : 'ok'),
              h('button', { type: 'button', className: 'qqbot-ai-btn qqbot-ai-btn-primary', 'data-testid': 'qqbot-ai-refresh', onClick: view.refresh, 'aria-busy': view.phase === 'refreshing' ? 'true' : undefined }, view.phase === 'refreshing' ? '刷新中…' : '刷新数据'))),
          h('div', { className: 'qqbot-ai-metrics', 'data-testid': 'qqbot-ai-metrics' },
            metric(h, '活跃群', groups.length, '最近有消息的群', 'blue'),
            metric(h, '待处理', queueCount, 'urgent + normal', queueCount > 0 ? 'amber' : 'slate'),
            metric(h, '已发言', sentCount, '最近 30 个 loop', 'green'),
            metric(h, '情绪电量', `${percent(emotion.socialBattery)}%`, '角色当前社交电量', 'violet')),
          h('div', { className: 'qqbot-ai-main-grid' },
            h('section', { className: 'qqbot-ai-card qqbot-ai-flow-card' },
              h('div', { className: 'qqbot-ai-card-head' },
                h('div', null, h('span', { className: 'qqbot-ai-card-kicker' }, 'PIPELINE'),
                  h('h2', null, '状态流转')),
                h('div', { className: 'qqbot-ai-card-actions' },
                  selectedId === null ? null : h('button', { type: 'button', className: 'qqbot-ai-btn qqbot-ai-btn-back', 'data-testid': 'qqbot-ai-back-overview', onClick: () => view.selectGroup(null) }, '← 返回总览'),
                  h('span', { className: 'qqbot-ai-card-sub' }, selectedId ?? '总览'))),
              stateMachine(h, selectedGroup),
              selectedGroup !== null ? h('div', { className: 'qqbot-ai-active-group' },
                h('div', { className: 'qqbot-ai-active-title' }, h('strong', null, text(selectedGroup.name) || selectedId), h('span', null, `${selectedId} · 缓冲 ${num(selectedGroup.bufferSize)}`)),
                h('div', { className: 'qqbot-ai-active-queue' },
                  h('span', null, `urgent ${obj(selectedGroup.queue).urgent ? '有请求' : '空'}`),
                  h('span', null, `normal ${obj(selectedGroup.queue).normal ? '有请求' : '空'}`),
                  h('span', null, selectedGroup.running ? 'worker 运行中' : 'worker 空闲')),
                h('div', { className: 'qqbot-ai-next-trigger qqbot-ai-next-trigger-detail' },
                  h('span', null, `下次计数触发：${num(selectedGroup.countThreshold) || '?'} 条`),
                  h('span', null, `当前已积累 ${num(selectedGroup.unprocessed)} 条 · 还差 ${Math.max(0, num(selectedGroup.countThreshold) - num(selectedGroup.unprocessed))} 条`))) : h('p', { className: 'qqbot-ai-empty-line' }, groups.length === 0 ? '还没有群聊监听数据。' : '总览模式：点击左侧群队列中的群查看监听状态。')),
            h('section', {
              className: 'qqbot-ai-card qqbot-ai-character qqbot-ai-character-clickable',
              'data-testid': 'qqbot-ai-character',
              role: 'button',
              tabIndex: 0,
              onClick: view.openSettings,
              onKeyDown: (event) => { if (event.key === 'Enter' || event.key === ' ') view.openSettings() },
            },
              h('div', { className: 'qqbot-ai-card-head' },
                h('div', null, h('span', { className: 'qqbot-ai-card-kicker' }, 'CHARACTER'),
                  h('h2', null, text(core.name) || '角色')),
                h('div', { className: 'qqbot-ai-card-actions' },
                  statusPill(h, '状态投影', 'violet'),
                  h('button', { type: 'button', className: 'qqbot-ai-card-link', 'data-testid': 'qqbot-ai-open-settings', onClick: (event) => { if (event && typeof event.stopPropagation === 'function') event.stopPropagation(); view.openSettings() } }, '进入设定 →'))),
              h('p', { className: 'qqbot-ai-identity' }, text(core.identity) || '尚未建立角色核心'),
              h('div', { className: 'qqbot-ai-emotions', 'data-testid': 'qqbot-ai-emotion' },
                emotionBar(h, '心情', (num(emotion.valence) + 1) / 2, 'rose'),
                emotionBar(h, '精力', emotion.energy, 'blue'),
                emotionBar(h, '社交电量', emotion.socialBattery, 'violet'),
                emotionBar(h, '压力', emotion.stress, 'amber')),
              h('p', { className: 'qqbot-ai-voice' }, `语气：${text(core.voice) || '—'}`),
              h('div', { className: 'qqbot-ai-keywords', 'data-testid': 'qqbot-ai-keywords' },
                h('div', { className: 'qqbot-ai-profile-head' }, h('span', null, '兴趣关键词'), h('span', null, `${arr(core.keywords).length} 个`)),
                arr(core.keywords).length === 0
                  ? h('p', { className: 'qqbot-ai-empty-line' }, '人设暂无关键词')
                  : h('div', { className: 'qqbot-ai-keyword-tags' }, ...arr(core.keywords).map((keyword) => h('span', { key: keyword }, keyword)))),
              profilesBlock(h, selectedId, selectedProfiles))),
          h('div', { className: 'qqbot-ai-lower-grid' },
            h('section', { className: 'qqbot-ai-card' },
              h('div', { className: 'qqbot-ai-card-head' },
                h('div', null, h('span', { className: 'qqbot-ai-card-kicker' }, 'GROUPS'), h('h2', null, '群队列')),
                h('span', { className: 'qqbot-ai-card-sub' }, `${groups.length} 个群`)),
              h('div', { className: 'qqbot-ai-groups', 'data-testid': 'qqbot-ai-groups' },
                groups.length === 0 ? h('p', { className: 'qqbot-ai-empty-line' }, '还没有监听到群消息') : groups.map(([id, group]) => groupRow(h, id, group, id === selectedId, view.selectGroup)))),
            h('section', { className: 'qqbot-ai-card' },
              h('div', { className: 'qqbot-ai-card-head' },
                h('div', null, h('span', { className: 'qqbot-ai-card-kicker' }, 'RECENT LOOPS'), h('h2', null, '最近闭环')),
                h('div', { className: 'qqbot-ai-tabs' },
                  ...['all', 'sent', 'silent'].map((filter) => h('button', { key: filter, type: 'button', className: `qqbot-ai-tab${view.filter === filter ? ' is-active' : ''}`, 'data-testid': `qqbot-ai-loop-filter-${filter}`, onClick: () => view.setFilter(filter) }, filter === 'all' ? '全部' : filter === 'sent' ? '已发言' : '未发言')))),
              h('div', { className: 'qqbot-ai-loops', 'data-testid': 'qqbot-ai-loops' },
                loops.length === 0 ? h('p', { className: 'qqbot-ai-empty-line' }, '还没有分析记录') : loops.slice(0, 12).map((loop) => loopRow(h, loop, view.expanded === loop.loopId, view.toggleLoop))))),
          h('section', { className: 'qqbot-ai-card qqbot-ai-memory-card' },
            h('div', { className: 'qqbot-ai-card-head' },
              h('div', null, h('span', { className: 'qqbot-ai-card-kicker' }, 'MEMORY'), h('h2', null, '最近记忆')),
              h('span', { className: 'qqbot-ai-card-sub' }, `${arr(data.memories).length} 条`)),
            h('div', { className: 'qqbot-ai-memories', 'data-testid': 'qqbot-ai-memories' },
              arr(data.memories).length === 0 ? h('p', { className: 'qqbot-ai-empty-line' }, '每次分析后这里会出现状态更新记录') : arr(data.memories).slice(-20).reverse().map((memory) => h('div', { key: memory.id || memory.summary, className: 'qqbot-ai-memory' },
                h('span', { className: `qqbot-ai-memory-dot is-${memory.importance || 'medium'}` }),
                h('div', null, h('p', null, text(memory.summary) || '—'), h('span', null, memoryMeta(memory, view.selected))))))),
          h('footer', { className: 'qqbot-ai-footer' },
            h('span', null, `监听器 ${data.listener?.updatedAt ? `更新于 ${time(data.listener.updatedAt)}` : '等待数据'}`),
            h('span', null, '群间并发 · 群内串行 · 每轮 state_update 一次')))
      }

      return { useAi, renderAiTab }
    },
    "client/plugins/ai/index.js": (__require) => {
      const { registerTab } = __require("client/runtime/tab-registry.js")
      const { useAi, renderAiTab } = __require("client/plugins/ai/AiTab.js")

      registerTab({
        id: 'ai',
        labelKey: 'tabAi',
        order: 1,
        use(panel) {
          return useAi(panel)
        },
        handlers: {},
      })

      return {  }
    },
    "client/plugins/features/FeaturesTab.js": (__require) => {
      const React = __require("react")
      const { requestJson, messageOf, pickText, compactValue } = __require("client/runtime/api.js")

      async function loadFeatures(panel) {
        const { setFeatures, setFeaturesPhase, setFeaturesError } = panel
        setFeaturesPhase('loading')
        try {
          const payload = await requestJson('/qqbot/features')
          setFeatures(Array.isArray(payload && payload.data) ? payload.data : [])
          setFeaturesError(null)
          setFeaturesPhase('ready')
        } catch (error) {
          setFeaturesError(messageOf(error))
          setFeaturesPhase('error')
        }
      }

      function runFeatureAction(panel, feature, action) {
        const { loadStatus, loadFeatures, runPost } = panel
        const key = `feature:${feature.id}:${action.id}`
        runPost(key, '/qqbot/features/run', { feature: feature.id, action: action.id, params: {} }, async () => {
          await loadStatus()
          await loadFeatures()
        })
      }

      function renderFeatures(panel) {
        const { t, lang, features, featuresPhase, featuresError, busyOf, lifecycleBusy, loadFeatures, runFeatureAction, h } = panel
        const items = Array.isArray(features) ? features : []
        const cards = items.map((feature) => {
          const title = pickText(feature.title, lang) || feature.id
          const description = pickText(feature.description, lang)
          const statusValue = feature.status !== null && typeof feature.status === 'object' && !Array.isArray(feature.status)
            ? feature.status
            : null
          const statusRows = statusValue === null ? [] : Object.keys(statusValue).map((name) => h('div', {
            key: name,
            className: 'qqbot-row-item',
          },
            h('span', { className: 'qqbot-row-label' }, name),
            h('span', { className: 'qqbot-row-value qqbot-mono' }, compactValue(statusValue[name]))))
          const actions = Array.isArray(feature.actions) ? feature.actions : []
          return h('article', {
            key: feature.id,
            className: 'qqbot-card',
            'data-testid': 'qqbot-feature-card',
            'data-feature': feature.id,
          },
            h('div', { className: 'qqbot-card-head' },
              h('div', { className: 'qqbot-feature-head' },
                h('h2', { className: 'qqbot-card-title' }, title),
                description !== '' ? h('p', { className: 'qqbot-hint' }, description) : null),
              h('span', { className: 'qqbot-badge' }, feature.id)),
            statusRows.length === 0 ? null : h('div', { className: 'qqbot-feature-status' }, ...statusRows),
            typeof feature.error === 'string' && feature.error !== ''
              ? h('p', { className: 'qqbot-error' }, feature.error)
              : null,
            actions.length === 0 ? null : h('div', { className: 'qqbot-actions-row' },
              ...actions.map((action) => {
                const label = pickText(action.title, lang) || action.id
                const tone = action.tone === 'primary' ? 'primary' : action.tone === 'danger' ? 'danger' : null
                const key = `feature:${feature.id}:${action.id}`
                const working = busyOf(key)
                return h('button', {
                  key: action.id,
                  type: 'button',
                  className: `qqbot-btn${tone ? ` qqbot-btn-${tone}` : ''}`,
                  'data-testid': `qqbot-action-${action.id}`,
                  'aria-label': label,
                  'aria-busy': working ? 'true' : undefined,
                  disabled: working || (feature.id === 'lifecycle' && lifecycleBusy === true),
                  onClick: () => { runFeatureAction(feature, action) },
                }, working ? t('working') : label)
              })))
        })

        return h('div', { className: 'qqbot-stack' },
          h('div', { className: 'qqbot-toolbar' },
            h('div', { className: 'qqbot-toolbar-left' },
              h('span', { className: 'qqbot-card-sub' }, t('featuresTitle'))),
            h('div', { className: 'qqbot-toolbar-right' },
              h('button', {
                type: 'button',
                className: 'qqbot-btn',
                'data-testid': 'qqbot-features-refresh',
                'aria-label': t('featuresRefresh'),
                disabled: featuresPhase === 'loading',
                onClick: () => { loadFeatures() },
              }, t('refresh')))),
          featuresError !== null
            ? h('div', { className: 'qqbot-banner qqbot-banner-error', role: 'alert' }, `${t('loadFeaturesFail')}: ${featuresError}`)
            : null,
          featuresPhase === 'loading' && features === null
            ? h('div', { className: 'qqbot-empty', role: 'status' }, t('loadingFeatures'))
            : null,
          features !== null && items.length === 0 ? h('div', { className: 'qqbot-empty' }, t('featuresEmpty')) : null,
          ...cards,
          h('p', { className: 'qqbot-note' }, t('featuresNote')))
      }

      /** Features hook: load the feature board the first time it is opened. */
      function useFeatures(panel) {
        const { tab, featuresPhase, loadFeatures } = panel

        React.useEffect(() => {
          if (tab === 'features' && featuresPhase === 'idle') loadFeatures()
        }, [tab, featuresPhase])
      }

      return { loadFeatures, runFeatureAction, renderFeatures, useFeatures }
    },
    "client/plugins/features/index.js": (__require) => {
      const { registerTab } = __require("client/runtime/tab-registry.js")
      const { useFeatures, loadFeatures, runFeatureAction, renderFeatures } = __require("client/plugins/features/FeaturesTab.js")

      registerTab({
        id: 'features',
        labelKey: 'tabFeatures',
        order: 5,
        use(panel) {
          useFeatures(panel)
          return () => renderFeatures(panel)
        },
        handlers: {
          loadFeatures,
          runFeatureAction,
        },
      })

      return {  }
    },
    "client/plugins/games/GamesTab.js": (__require) => {
      const React = __require("react")
      const { formatTime, messageOf, requestJson } = __require("client/runtime/api.js")

      const h = React.createElement

      function row(panel, label, value, mono) {
        return h('div', { className: 'qqbot-row-item', key: label },
          h('span', { className: 'qqbot-row-label' }, label),
          h('span', { className: `qqbot-row-value${mono ? ' qqbot-mono' : ''}` }, value))
      }

      function stat(panel, label, value) {
        return h('div', { className: 'qqbot-admin-stat', key: label },
          h('span', { className: 'qqbot-admin-stat-label' }, label),
          h('span', { className: 'qqbot-admin-stat-value' }, value))
      }

      function table(panel, columns, rows) {
        return h('div', { className: 'qqbot-table-wrap' },
          h('table', { className: 'qqbot-table' },
            h('thead', null, h('tr', null, ...columns.map((column) => h('th', { key: column.key }, column.label)))),
            h('tbody', null, ...rows)))
      }

      function useGames(panel) {
        const { t } = panel
        const [groups, setGroups] = React.useState(null)
        const [groupsPhase, setGroupsPhase] = React.useState('idle')
        const [groupsError, setGroupsError] = React.useState(null)
        const [selectedGroupId, setSelectedGroupId] = React.useState(null)
        const [group, setGroup] = React.useState(null)
        const [groupPhase, setGroupPhase] = React.useState('idle')
        const [groupError, setGroupError] = React.useState(null)
        const [selectedGameId, setSelectedGameId] = React.useState(null)
        const [game, setGame] = React.useState(null)
        const [gamePhase, setGamePhase] = React.useState('idle')
        const [gameError, setGameError] = React.useState(null)
        const [upDraft, setUpDraft] = React.useState(null)
        const [savingUp, setSavingUp] = React.useState(false)
        const [notice, setNotice] = React.useState(null)

        const loadGroups = async () => {
          setGroupsPhase('loading')
          try {
            const payload = await requestJson('/qqbot/game/admin/groups')
            setGroups(payload && payload.data ? payload.data : { groups: [], games: [] })
            setGroupsError(null)
            setGroupsPhase('ready')
          } catch (error) {
            setGroupsError(messageOf(error))
            setGroupsPhase('error')
          }
        }

        const loadGroup = async (groupId) => {
          setGroupPhase('loading')
          setGroupError(null)
          try {
            const payload = await requestJson(`/qqbot/game/admin/group?groupId=${encodeURIComponent(groupId)}`)
            setGroup(payload && payload.data ? payload.data : null)
            setGroupPhase('ready')
          } catch (error) {
            setGroupError(messageOf(error))
            setGroupPhase('error')
          }
        }

        const loadGame = async (groupId, gameId) => {
          setGamePhase('loading')
          setGameError(null)
          try {
            const payload = await requestJson(`/qqbot/game/admin/game?groupId=${encodeURIComponent(groupId)}&gameId=${encodeURIComponent(gameId)}`)
            const data = payload && payload.data ? payload.data : null
            setGame(data)
            setUpDraft(data ? { rodId: data.up.rodId, baitId: data.up.baitId } : null)
            setGamePhase('ready')
          } catch (error) {
            setGameError(messageOf(error))
            setGamePhase('error')
          }
        }

        React.useEffect(() => { void loadGroups() }, [])
        React.useEffect(() => {
          if (selectedGroupId === null) return
          void loadGroup(selectedGroupId)
        }, [selectedGroupId])
        React.useEffect(() => {
          if (selectedGroupId === null || selectedGameId === null) return
          void loadGame(selectedGroupId, selectedGameId)
        }, [selectedGroupId, selectedGameId])

        const openGroup = (groupId) => {
          setSelectedGroupId(groupId)
          setSelectedGameId(null)
          setGroup(null)
          setGame(null)
          setNotice(null)
        }
        const openGame = (gameId) => {
          setSelectedGameId(gameId)
          setGame(null)
          setUpDraft(null)
          setNotice(null)
        }
        const backGroups = () => {
          setSelectedGroupId(null)
          setSelectedGameId(null)
          setGroup(null)
          setGame(null)
          setNotice(null)
        }
        const backGroup = () => {
          setSelectedGameId(null)
          setGame(null)
          setUpDraft(null)
          setNotice(null)
        }
        const saveUp = async () => {
          if (selectedGroupId === null || selectedGameId === null || upDraft === null || savingUp) return
          setSavingUp(true)
          setNotice(null)
          try {
            const payload = await requestJson('/qqbot/game/admin/up', {
              method: 'POST',
              body: {
                groupId: selectedGroupId,
                gameId: selectedGameId,
                rodId: upDraft.rodId,
                baitId: upDraft.baitId,
              },
            })
            if (payload && payload.data) {
              setGame(payload.data)
              setUpDraft({ rodId: payload.data.up.rodId, baitId: payload.data.up.baitId })
            }
            setNotice({ kind: 'ok', text: t('gamesUpSaved') })
          } catch (error) {
            setNotice({ kind: 'error', text: `${t('gamesUpFailed')}: ${messageOf(error)}` })
          } finally {
            setSavingUp(false)
          }
        }

        return {
          t, groups, groupsPhase, groupsError, selectedGroupId, group, groupPhase, groupError,
          selectedGameId, game, gamePhase, gameError, upDraft, setUpDraft, savingUp, notice,
          loadGroups, loadGroup, loadGame, openGroup, openGame, backGroups, backGroup, saveUp,
        }
      }

      function renderGroups(panel, state) {
        const { t } = state
        const data = state.groups
        const items = data && Array.isArray(data.groups) ? data.groups : []
        return h('div', { className: 'qqbot-stack' },
          h('div', { className: 'qqbot-toolbar' },
            h('div', { className: 'qqbot-toolbar-left' },
              h('h2', { className: 'qqbot-card-title', 'data-testid': 'qqbot-games-title' }, t('gamesTitle')),
              h('span', { className: 'qqbot-card-sub' }, t('gamesSubtitle'))),
            h('div', { className: 'qqbot-toolbar-right' },
              h('button', {
                type: 'button', className: 'qqbot-btn', 'data-testid': 'qqbot-games-refresh',
                disabled: state.groupsPhase === 'loading', onClick: () => { void state.loadGroups() },
              }, t('gamesRefresh')))),
          state.groupsPhase === 'loading' && data === null ? h('div', { className: 'qqbot-empty' }, t('gamesLoading')) : null,
          state.groupsError !== null ? h('div', { className: 'qqbot-banner qqbot-banner-error' }, `${t('gamesLoadFail')}: ${state.groupsError}`) : null,
          data !== null && items.length === 0 ? h('div', { className: 'qqbot-empty' }, t('gamesEmpty')) : null,
          h('div', { className: 'qqbot-grid' }, ...items.map((entry) => h('button', {
            type: 'button',
            key: entry.groupId,
            className: 'qqbot-card qqbot-game-card',
            'data-testid': `qqbot-game-group-${entry.groupId}`,
            onClick: () => { state.openGroup(entry.groupId) },
          },
            h('div', { className: 'qqbot-card-head' },
              h('div', null,
                h('h2', { className: 'qqbot-card-title' }, `${t('gamesGroup')} ${entry.groupId}`),
                h('p', { className: 'qqbot-card-sub' }, `${t('gamesLastUpdated')} ${formatTime(entry.updatedAt) || '—'}`)),
              h('span', { className: 'qqbot-badge' }, t('gamesOpen'))),
            h('div', { className: 'qqbot-admin-stats' },
              stat(panel, t('gamesUserCount'), entry.userCount),
              stat(panel, t('gamesTotalCoins'), entry.totalCoins),
              stat(panel, t('gamesTotalFishingCoins'), entry.totalFishingCoins)),
            h('div', { className: 'qqbot-actions-row' }, ...(entry.games || []).map((game) => h('span', {
              key: game.id,
              className: 'qqbot-badge',
            }, `${game.name && (game.name.zh || game.name.en) ? (game.name.zh || game.name.en) : game.id} · ${game.playerCount}`)))))))
      }

      function renderGroup(panel, state) {
        const { t } = state
        const data = state.group
        return h('div', { className: 'qqbot-stack' },
          h('div', { className: 'qqbot-toolbar' },
            h('div', { className: 'qqbot-toolbar-left' },
              h('button', {
                type: 'button', className: 'qqbot-btn', 'data-testid': 'qqbot-games-back',
                onClick: () => { state.backGroups() },
              }, t('gamesBackGroups')),
              h('h2', { className: 'qqbot-card-title' }, `${t('gamesGroup')} ${state.selectedGroupId}`)),
            h('div', { className: 'qqbot-toolbar-right' },
              h('button', {
                type: 'button', className: 'qqbot-btn', onClick: () => { void state.loadGroup(state.selectedGroupId) },
              }, t('gamesRefresh')))),
          state.groupPhase === 'loading' && data === null ? h('div', { className: 'qqbot-empty' }, t('gamesLoading')) : null,
          state.groupError !== null ? h('div', { className: 'qqbot-banner qqbot-banner-error' }, `${t('gamesLoadFail')}: ${state.groupError}`) : null,
          data === null ? null : h('div', { className: 'qqbot-stack' },
            h('div', { className: 'qqbot-admin-stats qqbot-admin-stats-wide' },
              stat(panel, t('gamesGroupId'), data.groupId),
              stat(panel, t('gamesUserCount'), data.users.length),
              stat(panel, t('gamesLastUpdated'), formatTime(data.updatedAt) || '—')),
            h('h3', { className: 'qqbot-card-title' }, t('gamesGames')),
            h('div', { className: 'qqbot-grid' }, ...(data.games || []).map((game) => h('button', {
              type: 'button',
              key: game.id,
              className: 'qqbot-card qqbot-game-card',
              'data-testid': `qqbot-game-open-${game.id}`,
              onClick: () => { state.openGame(game.id) },
            },
              h('div', { className: 'qqbot-card-head' },
                h('div', null,
                  h('h2', { className: 'qqbot-card-title' }, game.name && (game.name.zh || game.name.en) || game.id),
                  h('p', { className: 'qqbot-card-sub' }, game.description && (game.description.zh || game.description.en) || '')),
                h('span', { className: 'qqbot-badge' }, `${t('gamesPlayerCount')} ${game.playerCount}`)),
              h('span', { className: 'qqbot-btn' }, t('gamesOpen'))))),
            h('h3', { className: 'qqbot-card-title' }, t('gamesUsers')),
            data.users.length === 0 ? h('div', { className: 'qqbot-empty' }, t('gamesNoUsers')) : table(panel,
              [
                { key: 'qq', label: t('gamesQQ') },
                { key: 'nickname', label: t('gamesNickname') },
                { key: 'coins', label: t('gamesAccountCoins') },
                { key: 'fishingCoins', label: t('gamesFishingCoins') },
                { key: 'fishCount', label: t('gamesFishCount') },
                { key: 'registeredAt', label: t('gamesRegisteredAt') },
              ],
              data.users.map((user) => h('tr', { key: user.qq },
                h('td', { className: 'qqbot-mono' }, user.qq),
                h('td', null, user.nickname),
                h('td', null, user.coins),
                h('td', null, user.fishingCoins),
                h('td', null, user.fishCount),
                h('td', { className: 'qqbot-card-sub' }, formatTime(user.registeredAt) || '—'))))) )
      }

      function renderGame(panel, state) {
        const { t, game, upDraft } = state
        if (state.gamePhase === 'loading' && game === null) return h('div', { className: 'qqbot-empty' }, t('gamesLoading'))
        if (state.gameError !== null) return h('div', { className: 'qqbot-empty' }, h('p', { className: 'qqbot-error' }, `${t('gamesLoadFail')}: ${state.gameError}`))
        if (game === null) return h('div', { className: 'qqbot-empty' }, t('gamesLoading'))
        const up = game.up
        const rodOptions = up.options && Array.isArray(up.options.rods) ? up.options.rods : []
        const baitOptions = up.options && Array.isArray(up.options.baits) ? up.options.baits : []
        const update = (key, value) => {
          state.setUpDraft((previous) => (previous === null ? previous : { ...previous, [key]: value }))
        }
        return h('div', { className: 'qqbot-stack' },
          h('div', { className: 'qqbot-toolbar' },
            h('div', { className: 'qqbot-toolbar-left' },
              h('button', { type: 'button', className: 'qqbot-btn', 'data-testid': 'qqbot-games-back', onClick: () => { state.backGroup() } }, t('gamesBackGroup')),
              h('h2', { className: 'qqbot-card-title' }, `${game.game.name && (game.game.name.zh || game.game.name.en) || game.game.id} · ${game.groupId}`)),
            h('div', { className: 'qqbot-toolbar-right' },
              h('button', { type: 'button', className: 'qqbot-btn', onClick: () => { void state.loadGame(state.selectedGroupId, state.selectedGameId) } }, t('gamesRefresh')))),
          state.notice !== null ? h('div', { className: `qqbot-banner qqbot-banner-${state.notice.kind}` }, state.notice.text) : null,
          h('div', { className: 'qqbot-admin-stats qqbot-admin-stats-wide' },
            stat(panel, t('gamesUserCount'), game.summary.userCount),
            stat(panel, t('gamesActiveCasts'), game.summary.activeCasts),
            stat(panel, t('gamesTotalFishingCoins'), game.summary.totalFishingCoins),
            stat(panel, t('gamesTotalFish'), game.summary.totalFish),
            stat(panel, t('gamesTotalFishValue'), game.summary.totalFishValue)),
          h('div', { className: 'qqbot-card' },
            h('div', { className: 'qqbot-card-head' },
              h('h2', { className: 'qqbot-card-title' }, t('gamesCurrentUp')),
              h('span', { className: 'qqbot-badge' }, `${up.rod} / ${up.bait}`)),
            h('div', { className: 'qqbot-admin-up' },
              h('label', { className: 'qqbot-field' },
                h('span', { className: 'qqbot-field-label' }, t('gamesUpRod')),
                h('select', {
                  className: 'qqbot-select', 'data-testid': 'qqbot-games-up-rod',
                  value: upDraft ? upDraft.rodId : up.rodId,
                  disabled: state.savingUp,
                  onChange: (event) => { update('rodId', event.currentTarget.value) },
                }, ...rodOptions.map((item) => h('option', { key: item.id, value: item.id }, item.name)))),
              h('label', { className: 'qqbot-field' },
                h('span', { className: 'qqbot-field-label' }, t('gamesUpBait')),
                h('select', {
                  className: 'qqbot-select', 'data-testid': 'qqbot-games-up-bait',
                  value: upDraft ? upDraft.baitId : up.baitId,
                  disabled: state.savingUp,
                  onChange: (event) => { update('baitId', event.currentTarget.value) },
                }, ...baitOptions.map((item) => h('option', { key: item.id, value: item.id }, item.name)))),
              h('button', {
                type: 'button', className: 'qqbot-btn qqbot-btn-primary', 'data-testid': 'qqbot-games-up-save',
                disabled: state.savingUp || upDraft === null, onClick: () => { void state.saveUp() },
              }, state.savingUp ? t('gamesSaving') : t('gamesSaveUp')))),
          h('h3', { className: 'qqbot-card-title' }, t('gamesPlayers')),
          game.users.length === 0 ? h('div', { className: 'qqbot-empty' }, t('gamesNoUsers')) : table(panel,
            [
              { key: 'qq', label: t('gamesPlayer') },
              { key: 'fishingCoins', label: t('gamesFishingCoins') },
              { key: 'rods', label: t('gamesRods') },
              { key: 'baits', label: t('gamesBaits') },
              { key: 'tickets', label: t('gamesTickets') },
              { key: 'fish', label: t('gamesFishCount') },
              { key: 'pity', label: t('gamesPity') },
              { key: 'cast', label: t('gamesCast') },
            ],
            game.users.map((user) => {
              const equipped = user.rods.find((rod) => rod.id === user.equippedRod)
              const selected = user.baits.find((bait) => bait.id === user.selectedBait)
              const rods = user.rods.length === 0 ? '—' : `${user.rods.length} ${t('gamesRodsOwned')}${equipped ? ` · ${equipped.name}` : ''}`
              const baits = user.baits.length === 0 ? '—' : `${user.baits.length} ${t('gamesBaitsOwned')}${selected ? ` · ${selected.name}` : ''}`
              const pity = `竿 ${user.gacha.rodPity} · Lv3 ${user.gacha.lv3RodPity} · 饵 ${user.gacha.legendaryBaitPity} · 传奇 ${user.gacha.legendaryRodPity}`
              const cast = user.cast === null ? t('gamesCastIdle') : `${t('gamesCastActive')} · ${formatTime(user.cast.readyAt) || ''}`
              return h('tr', { key: user.qq },
                h('td', null,
                  h('div', { className: 'qqbot-plugin-name' }, user.nickname),
                  h('span', { className: 'qqbot-card-sub qqbot-mono' }, user.qq)),
                h('td', null, user.fishingCoins),
                h('td', null, rods),
                h('td', null, baits),
                h('td', null, `单 ${user.singleTickets} / 十 ${user.tenTickets}`),
                h('td', null, `${user.fishCount} · ${user.fishValue}`),
                h('td', { className: 'qqbot-card-sub' }, pity),
                h('td', null, cast))
            })))
      }

      function useGamesTab(panel) {
        const state = useGames(panel)
        return () => {
          if (state.selectedGameId !== null) return renderGame(panel, state)
          if (state.selectedGroupId !== null) return renderGroup(panel, state)
          return renderGroups(panel, state)
        }
      }

      return { useGamesTab }
    },
    "client/plugins/games/index.js": (__require) => {
      const { registerTab } = __require("client/runtime/tab-registry.js")
      const { useGamesTab } = __require("client/plugins/games/GamesTab.js")

      registerTab({
        id: 'games',
        labelKey: 'tabGames',
        order: 7,
        use(panel) {
          return useGamesTab(panel)
        },
        handlers: {},
      })

      return {  }
    },
    "client/plugins/logs/LogsTab.js": (__require) => {
      const React = __require("react")
      const { requestJson, messageOf, LOG_LINES } = __require("client/runtime/api.js")

      async function loadLogs(panel, source) {
        const { setLogLines, setLogsNote, setLogsPhase, setLogsError } = panel
        setLogsPhase('loading')
        try {
          const payload = await requestJson(`/qqbot/logs?source=${encodeURIComponent(source)}&lines=${LOG_LINES}`)
          setLogLines(Array.isArray(payload && payload.lines) ? payload.lines : [])
          setLogsNote(payload && typeof payload.note === 'string' ? payload.note : null)
          setLogsError(null)
          setLogsPhase('ready')
        } catch (error) {
          setLogsError(messageOf(error))
          setLogsPhase('error')
        }
      }

      function renderLogs(panel) {
        const { t, logLines, logsNote, logsPhase, logsError, logSource, setLogSource, loadLogs, h } = panel
        const sourceButton = (id, label) => h('button', {
          key: id,
          type: 'button',
          className: `qqbot-seg-btn${logSource === id ? ' active' : ''}`,
          'data-testid': `qqbot-logs-source-${id}`,
          'aria-pressed': logSource === id ? 'true' : 'false',
          'aria-label': `${t('logsTitle')}: ${label}`,
          onClick: () => {
            if (logSource === id) return
            setLogSource(id)
            loadLogs(id)
          },
        }, label)

        const body = logsPhase === 'loading' && logLines.length === 0
          ? t('logsLoading')
          : logLines.length === 0 ? t('logsEmpty') : logLines.join('\n')

        return h('div', { className: 'qqbot-stack' },
          h('div', { className: 'qqbot-toolbar' },
            h('div', { className: 'qqbot-toolbar-left' },
              h('div', { className: 'qqbot-seg', role: 'group', 'aria-label': t('logsTitle') },
                sourceButton('koishi', t('logsKoishi')),
                sourceButton('napcat', t('logsNapcat')))),
            h('div', { className: 'qqbot-toolbar-right' },
              h('span', { className: 'qqbot-card-sub' }, String(logLines.length)),
              h('button', {
                type: 'button',
                className: 'qqbot-btn',
                'data-testid': 'qqbot-logs-refresh',
                'aria-label': t('logsRefresh'),
                disabled: logsPhase === 'loading',
                onClick: () => { loadLogs(logSource) },
              }, t('refresh')))),
          logsError !== null
            ? h('div', { className: 'qqbot-banner qqbot-banner-error', role: 'alert' }, `${t('loadLogsFail')}: ${logsError}`)
            : null,
          logsNote !== null ? h('p', { className: 'qqbot-hint' }, logsNote) : null,
          h('pre', { className: 'qqbot-pre', 'data-testid': 'qqbot-logs', 'aria-label': t('logsTitle') }, body))
      }

      /** Logs hook: load the tail the first time the tab is opened. */
      function useLogs(panel) {
        const { tab, logsPhase, logSource, loadLogs } = panel

        React.useEffect(() => {
          if (tab === 'logs' && logsPhase === 'idle') loadLogs(logSource)
        }, [tab, logsPhase])
      }

      return { loadLogs, renderLogs, useLogs }
    },
    "client/plugins/logs/index.js": (__require) => {
      const { registerTab } = __require("client/runtime/tab-registry.js")
      const { useLogs, loadLogs, renderLogs } = __require("client/plugins/logs/LogsTab.js")

      registerTab({
        id: 'logs',
        labelKey: 'tabLogs',
        order: 6,
        use(panel) {
          useLogs(panel)
          return () => renderLogs(panel)
        },
        handlers: {
          loadLogs,
        },
      })

      return {  }
    },
    "client/plugins/messages/MessagesTab.js": (__require) => {
      const React = __require("react")
      const { requestJson, messageOf, formatTime } = __require("client/runtime/api.js")

      async function loadMessages(panel) {
        const { setMessages, setMessagesPhase, setMessagesError, setMessagesUpdatedAt, messagesPollRef } = panel
        if (messagesPollRef.current) return
        messagesPollRef.current = true
        try {
          const payload = await requestJson('/qqbot/messages?limit=50')
          const container = payload && payload.data !== undefined ? payload.data : payload
          const list = container !== null && typeof container === 'object' && Array.isArray(container.messages)
            ? container.messages
            : []
          setMessages(list)
          setMessagesUpdatedAt(container && typeof container.updatedAt === 'string' ? container.updatedAt : null)
          setMessagesError(null)
          setMessagesPhase('ready')
        } catch (error) {
          setMessagesError(messageOf(error))
          setMessagesPhase('error')
        } finally {
          messagesPollRef.current = false
        }
      }

      function renderMessages(panel) {
        const {
          t, contacts, messages, messagesPhase, messagesError, messagesFilter, setMessagesFilter,
          messagesUpdatedAt, loadMessages, h
        } = panel
        const contactGroups = contacts !== null && Array.isArray(contacts.groups) ? contacts.groups : []
        const contactFriends = contacts !== null && Array.isArray(contacts.friends) ? contacts.friends : []
        const groupNames = new Map(contactGroups.map((group) => [String(group.id), group.name]))
        const friendNames = new Map(contactFriends.map((friend) => [String(friend.id), friend.name]))
        const items = Array.isArray(messages) ? messages : []
        const shown = items.filter((message) => {
          if (messagesFilter === 'all') return true
          const scene = message.scene === 'private' ? 'private' : 'group'
          return scene === messagesFilter
        })
        const sourceOf = (message) => {
          const scene = message.scene === 'private' ? 'private' : 'group'
          if (scene === 'group') {
            const id = String(message.groupId !== undefined && message.groupId !== null ? message.groupId : (message.targetId ?? ''))
            return groupNames.get(id) || id || t('messagesUnknownSource')
          }
          // Private messages may carry the bot as targetId, so try the sender id
          // first and fall back to the target before showing a raw number.
          const candidates = [message.userId, message.targetId]
            .filter((value) => value !== undefined && value !== null && String(value) !== '')
            .map((value) => String(value))
          for (const id of candidates) {
            const name = friendNames.get(id)
            if (name !== undefined) return name
          }
          return candidates.length > 0 ? candidates[0] : t('messagesUnknownSource')
        }
        const senderOf = (message) => {
          if (typeof message.userName === 'string' && message.userName !== '') return message.userName
          if (message.userId !== undefined && message.userId !== null) return String(message.userId)
          return t('messagesUnknownSource')
        }
        const filterOptions = [
          h('option', { key: 'all', value: 'all' }, t('messagesFilterAll')),
          h('option', { key: 'group', value: 'group' }, t('messagesFilterGroup')),
          h('option', { key: 'private', value: 'private' }, t('messagesFilterPrivate')),
        ]
        const toolbar = h('div', { className: 'qqbot-toolbar' },
          h('div', { className: 'qqbot-toolbar-left' },
            h('h2', { className: 'qqbot-card-title' }, t('messagesTitle')),
            h('span', { className: 'qqbot-card-sub' }, messagesUpdatedAt !== null
              ? `${t('updated')} ${formatTime(messagesUpdatedAt)}`
              : '')),
          h('div', { className: 'qqbot-toolbar-right' },
            h('select', {
              id: 'qqbot-messages-filter',
              className: 'qqbot-select',
              'data-testid': 'qqbot-messages-filter',
              'aria-label': t('messagesFilterAll'),
              value: messagesFilter,
              onChange: (event) => { setMessagesFilter(event.currentTarget.value) },
            }, ...filterOptions),
            h('button', {
              type: 'button',
              className: 'qqbot-btn',
              'data-testid': 'qqbot-messages-refresh',
              'aria-label': t('messagesRefresh'),
              disabled: messagesPhase === 'loading',
              onClick: () => { loadMessages() },
            }, t('refresh'))))
        const list = h('div', { className: 'qqbot-message-list', 'data-testid': 'qqbot-messages-list' },
          ...shown.map((message, index) => {
            const direction = message.direction === 'out' ? 'out' : 'in'
            return h('div', {
              key: message.id !== undefined && message.id !== null ? String(message.id) : `message-${index}`,
              className: 'qqbot-message-row',
              'data-testid': 'qqbot-message-row',
              'data-direction': direction,
              'data-scene': message.scene === 'private' ? 'private' : 'group',
            },
              h('div', { className: 'qqbot-message-meta' },
                h('span', {
                  className: `qqbot-message-direction qqbot-message-${direction}`,
                  'data-testid': 'qqbot-message-direction',
                }, direction === 'in' ? t('messagesDirectionIn') : t('messagesDirectionOut')),
                h('span', { className: 'qqbot-message-time' }, formatTime(message.time) || '—'),
                h('span', { className: 'qqbot-message-source' }, sourceOf(message)),
                h('span', { className: 'qqbot-message-sender' }, senderOf(message))),
              h('div', { className: 'qqbot-message-content' },
                typeof message.content === 'string' ? message.content : ''))
          }))
        const empty = messages !== null && shown.length === 0
          ? h('div', { className: 'qqbot-empty' }, t('messagesEmpty'))
          : null
        return h('div', { className: 'qqbot-stack' },
          toolbar,
          messagesError !== null
            ? h('div', { className: 'qqbot-banner qqbot-banner-error', role: 'alert' }, `${t('messagesLoadFail')}: ${messagesError}`)
            : null,
          messagesPhase === 'loading' && messages === null
            ? h('div', { className: 'qqbot-empty', role: 'status' }, t('messagesLoading'))
            : null,
          messages !== null ? h('div', { className: 'qqbot-card' }, list) : null,
          empty)
      }

      /** Messages hooks: lazy-load on first open and poll every 2s while visible. */
      function useMessages(panel) {
        const { tab, messagesPhase, loadMessages, tabRef } = panel

        React.useEffect(() => {
          if (tab === 'messages' && messagesPhase === 'idle') loadMessages()
        }, [tab, messagesPhase])

        React.useEffect(() => {
          let disposed = false
          const tick = () => {
            if (disposed) return
            if (tabRef.current === 'messages') loadMessages()
          }
          const timer = setInterval(tick, 2000)
          return () => {
            disposed = true
            clearInterval(timer)
          }
        }, [])
      }

      return { loadMessages, renderMessages, useMessages }
    },
    "client/plugins/messages/index.js": (__require) => {
      const { registerTab } = __require("client/runtime/tab-registry.js")
      const { useMessages, loadMessages, renderMessages } = __require("client/plugins/messages/MessagesTab.js")

      registerTab({
        id: 'messages',
        labelKey: 'tabMessages',
        order: 2,
        use(panel) {
          useMessages(panel)
          return () => renderMessages(panel)
        },
        handlers: {
          loadMessages,
        },
      })

      return {  }
    },
    "client/plugins/overview/LoginCard.js": (__require) => {


      function renderLoginCard(panel) {
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

      return { renderLoginCard }
    },
    "client/plugins/overview/OverviewActions.js": (__require) => {
      const { requestJson, messageOf } = __require("client/runtime/api.js")

      /**
       * Read the NapCat QR-login state. On the transition to signed-in the
       * panel refreshes the status snapshot and the contact lists, so the
       * overview/login card and the message names update together.
       */
      async function loadLogin(panel) {
        const { setLoginInfo, setLoginError, loginPollRef, loadStatus, loadContacts } = panel
        if (loginPollRef.current.busy) return
        loginPollRef.current.busy = true
        try {
          const payload = await requestJson('/qqbot/napcat/login')
          const data = payload && payload.data
          if (data === null || typeof data !== 'object') throw new Error('unexpected payload')
          setLoginInfo(data)
          setLoginError(null)
          const wasLoggedIn = loginPollRef.current.loggedIn === true
          const nowLoggedIn = data.loggedIn === true
          loginPollRef.current.loggedIn = nowLoggedIn
          if (nowLoggedIn && !wasLoggedIn) {
            loadStatus()
            loadContacts()
          }
        } catch (error) {
          setLoginError(messageOf(error))
        } finally {
          loginPollRef.current.busy = false
        }
      }

      /**
       * Runtime setup snapshot. While the Host reports `installing` the panel
       * keeps polling until the install task finishes, then shows the log tail
       * and the ready state.
       */
      async function loadSetup(panel) {
        const { setSetupInfo, setSetupPhase, setSetupError, setSetupLogs, setSetupPolling, setupActionRef } = panel
        try {
          const payload = await requestJson('/qqbot/setup')
          const data = payload && payload.data
          if (data === null || typeof data !== 'object') throw new Error('unexpected payload')
          setSetupInfo(data)
          setSetupLogs(Array.isArray(data.logs) ? data.logs : [])
          setSetupError(null)
          setSetupPhase('ready')
          if (data.installing === true) {
            setSetupPolling(true)
          } else if (setupActionRef.current !== true) {
            setSetupPolling(false)
          }
        } catch (error) {
          setSetupError(messageOf(error))
          setSetupPhase('error')
          setSetupPolling(false)
        }
      }

      function refreshLoginQr(panel) {
        const { t, setQrTicket, setQrBroken, loadLogin, runPost } = panel
        setQrBroken(false)
        runPost('login-refresh', '/qqbot/napcat/qr/refresh', {}, async () => {
          await loadLogin()
          setQrTicket((previous) => previous + 1)
        }, t('loginRefreshed'))
      }

      /**
       * Install/repair the Koishi runtime. The POST can run for tens of
       * seconds, so polling starts immediately and stops when it settles (or
       * when a poll reports `installing:false` and no action is in flight).
       */
      function installKoishiEnv(panel) {
        const {
          t, setSetupSteps, setSetupResultMsg, setSetupPolling, setSetupExpanded, setupActionRef, busyOf,
          loadStatus, loadSetup, runPost
        } = panel
        if (busyOf('setup-install')) return
        setupActionRef.current = true
        setSetupPolling(true)
        setSetupSteps(null)
        setSetupResultMsg(null)
        setSetupExpanded(true)
        runPost('setup-install', '/qqbot/setup/koishi', {}, async () => {
          await loadSetup()
          await loadStatus()
        }, t('setupInstallDone')).then((result) => {
          if (result !== null && result.ok !== false) setSetupExpanded(false)
        }).finally(() => {
          setupActionRef.current = false
          setSetupPolling(false)
          loadSetup()
        })
      }

      function runSetupFull(panel) {
        const {
          t, setSetupSteps, setSetupResultMsg, setSetupPolling, setSetupExpanded, setupActionRef, busyOf,
          loadStatus, loadContacts, loadSetup, runPost
        } = panel
        if (busyOf('setup-full')) return
        setupActionRef.current = true
        setSetupPolling(true)
        setSetupSteps(null)
        setSetupResultMsg(null)
        setSetupExpanded(true)
        runPost('setup-full', '/qqbot/setup/full', {}, async () => {
          await loadSetup()
          await loadStatus()
          await loadContacts()
        }, t('setupFullDone'), { acceptNotOk: true }).then((result) => {
          if (result !== null && typeof result === 'object') {
            setSetupSteps(Array.isArray(result.steps) ? result.steps : [])
            setSetupResultMsg(typeof result.message === 'string' ? result.message : null)
          }
        }).finally(() => {
          setupActionRef.current = false
          setSetupPolling(false)
          loadSetup()
        })
      }

      function installSetupNapcat(panel) {
        const { t, loadStatus, loadSetup, runPost } = panel
        runPost('setup-napcat', '/qqbot/napcat/install', {}, async () => {
          await loadSetup()
          await loadStatus()
        }, t('setupNapcatDone'))
      }

      function startAll(panel) {
        const { loadStatus, runPost } = panel
        return runPost('all-start', '/qqbot/all/start', {}, loadStatus)
      }

      function stopAll(panel) {
        const { loadStatus, runPost } = panel
        return runPost('all-stop', '/qqbot/all/stop', {}, loadStatus)
      }

      function installNapcat(panel) {
        const { loadStatus, runPost } = panel
        return runPost('napcat-install', '/qqbot/napcat/install', {}, loadStatus)
      }

      function configureNapcat(panel) {
        const { loadStatus, runPost } = panel
        return runPost('napcat-configure', '/qqbot/napcat/configure', {}, loadStatus)
      }

      function startNapcat(panel) {
        const { loadStatus, runPost } = panel
        return runPost('napcat-start', '/qqbot/napcat/start', {}, loadStatus)
      }

      function stopNapcat(panel) {
        const { loadStatus, runPost } = panel
        return runPost('napcat-stop', '/qqbot/napcat/stop', {}, loadStatus)
      }

      function startKoishi(panel) {
        const { loadStatus, runPost } = panel
        return runPost('koishi-start', '/qqbot/koishi/start', {}, loadStatus)
      }

      function stopKoishi(panel) {
        const { loadStatus, runPost } = panel
        return runPost('koishi-stop', '/qqbot/koishi/stop', {}, loadStatus)
      }

      function restartKoishi(panel) {
        const { loadStatus, runPost } = panel
        return runPost('koishi-restart', '/qqbot/koishi/restart', {}, loadStatus)
      }

      function installDeps(panel) {
        const { loadStatus, runPost } = panel
        return runPost('koishi-install-deps', '/qqbot/koishi/install-deps', {}, loadStatus)
      }

      return { loadLogin, loadSetup, refreshLoginQr, installKoishiEnv, runSetupFull, installSetupNapcat, startAll, stopAll, installNapcat, configureNapcat, startNapcat, stopNapcat, startKoishi, stopKoishi, restartKoishi, installDeps }
    },
    "client/plugins/overview/OverviewTab.js": (__require) => {
      const React = __require("react")
      const { compactValue, POLL_MS } = __require("client/runtime/api.js")
      const { renderLoginCard } = __require("client/plugins/overview/LoginCard.js")
      const { renderSetupCard } = __require("client/plugins/overview/SetupCard.js")

      function renderOverview(panel) {
        const {
          t, loading, loadError, loadStatus, startAll, stopAll, installNapcat, configureNapcat, startNapcat,
          stopNapcat, startKoishi, stopKoishi, installDeps, hasSnapshot, napcat, koishi, qq,
          settings, napcatSupported, platformInstallHint, napcatAccounts, wsClients, napcatInstalled,
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
        const napcatRows = [
          row(t('lblInstall'), napcatInstalled ? `${t('stInstalled')}${napcat.version ? ` · v${napcat.version}` : ''}` : t('stMissing'), napcatInstalled ? 'ok' : 'bad'),
          row(t('lblProcess'), napcatRunning ? `${t('stRunning')}${napcat.pid ? ` · PID ${napcat.pid}` : ''}` : t('stStopped'), napcatRunning ? 'ok' : 'warn'),
          row(t('lblLogin'), napcatLoggedIn
            ? `${t('stLoggedIn')}${napcat.qq ? ` · ${napcat.qq}` : ''}${napcat.nickname ? ` (${napcat.nickname})` : ''}`
            : t('stLoggedOut'), napcatLoggedIn ? 'ok' : 'warn'),
          row(t('lblWebui'), `${webui.port || settings.napcatPort || '—'} · ${webui.reachable === true ? t('stReachable') : t('stUnreachable')}`, webui.reachable === true ? 'ok' : 'warn'),
          row(t('lblConfig'), napcat.configApplied === true ? t('stApplied') : t('stNotApplied'), napcat.configApplied === true ? 'ok' : 'warn'),
          row(t('lblAccounts'), String(napcatAccounts.length)),
          row(t('lblWs'), wsClients.length === 0 ? t('noWs') : wsClients.join(' · '), wsClients.length === 0 ? 'warn' : 'ok', true),
        ]
        if (typeof napcat.error === 'string' && napcat.error !== '') napcatRows.push(row(t('lblError'), napcat.error, 'bad'))

        const koishiRows = [
          row(t('lblProject'), koishi.projectDir || settings.projectDir || '—', null, true),
          row(t('lblDeps'), koishi.depsInstalled === true ? t('stInstalled') : t('stMissing'), koishi.depsInstalled === true ? 'ok' : 'warn'),
          row(t('lblProcess'), koishiRunning
            ? `${t('stRunning')}${koishi.managed === true ? ` · ${t('managed')}` : ''}${koishi.pid ? ` · PID ${koishi.pid}` : ''}`
            : t('stStopped'), koishiRunning ? 'ok' : 'warn'),
          row(t('lblPort'), String(koishi.port || settings.koishiPort || '—'), null, true),
          row(t('lblOnline'), botOnline
            ? `${t('stOnline')}${koishi.selfId ? ` · ${koishi.selfId}` : ''}${koishi.platform ? ` · ${koishi.platform}` : ''}`
            : t('stOffline'), botOnline ? 'ok' : 'warn'),
        ]
        if (koishi.stats !== null && typeof koishi.stats === 'object') {
          koishiRows.push(row(t('lblStats'), compactValue(koishi.stats), null, true))
        }
        if (typeof koishi.error === 'string' && koishi.error !== '') koishiRows.push(row(t('lblError'), koishi.error, 'bad'))

        const napcatCard = h('section', { className: 'qqbot-card' },
          h('div', { className: 'qqbot-card-head' },
            h('h2', { className: 'qqbot-card-title' }, t('napcatTitle')),
            h('span', { className: 'qqbot-card-sub' }, `QQ · ${qq.installed === true ? t('stInstalled') : t('stMissing')}`)),
          h('div', { className: 'qqbot-rows' }, ...napcatRows),
          h('div', { className: 'qqbot-actions-row' },
            actionButton('napcat-start', t('napcatStart'), null, startNapcat, { disabled: napcatRunning || lifecycleBusy }),
            actionButton('napcat-stop', t('napcatStop'), 'danger', stopNapcat, { disabled: !napcatRunning || lifecycleBusy })))

        const koishiCard = h('section', { className: 'qqbot-card' },
          h('div', { className: 'qqbot-card-head' },
            h('h2', { className: 'qqbot-card-title' }, t('koishiTitle')),
            h('span', { className: 'qqbot-card-sub' }, `${t('lblPort')} · ${koishi.port || settings.koishiPort || '—'}`)),
          h('div', { className: 'qqbot-rows' }, ...koishiRows),
          h('div', { className: 'qqbot-actions-row' },
            actionButton('koishi-start', t('koishiStart'), null, startKoishi, { disabled: koishiRunning || lifecycleBusy }),
            actionButton('koishi-stop', t('koishiStop'), 'danger', stopKoishi, { disabled: !koishiRunning || lifecycleBusy })))

        return h('div', { className: 'qqbot-stack' },
          h('div', { className: 'qqbot-grid' }, napcatCard, koishiCard),
          renderLoginCard(panel),
          renderSetupCard(panel),
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
       * Overview hooks: status polling, the QR-login state machine and the runtime
       * setup poller. The card renderers below are pure functions of the panel.
       */
      function useOverview(panel) {
        const {
          hasSnapshot, napcatLoggedIn, setupPolling, tabRef, loggedInRef, loadStatus, loadSetup, loadLogin
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

        // First paint also reads the setup state once.
        React.useEffect(() => {
          loadSetup()
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

        // Setup polling: keep reading /qqbot/setup while an install is running.
        React.useEffect(() => {
          if (!setupPolling) return undefined
          let disposed = false
          const tick = () => { if (!disposed) loadSetup() }
          tick()
          const timer = setInterval(tick, 2000)
          return () => {
            disposed = true
            clearInterval(timer)
          }
        }, [setupPolling])
      }

      return { renderOverview, useOverview }
    },
    "client/plugins/overview/SetupCard.js": (__require) => {
      const { formatTime, SETUP_STEP_KEYS } = __require("client/runtime/api.js")

      function renderSetupCard(panel) {
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

      return { renderSetupCard }
    },
    "client/plugins/overview/index.js": (__require) => {
      const { registerTab } = __require("client/runtime/tab-registry.js")
      const { useOverview, renderOverview } = __require("client/plugins/overview/OverviewTab.js")
      const { loadLogin, loadSetup, refreshLoginQr, installKoishiEnv, runSetupFull, installSetupNapcat, startAll, stopAll, installNapcat, configureNapcat, startNapcat, stopNapcat, startKoishi, stopKoishi, restartKoishi, installDeps } = __require("client/plugins/overview/OverviewActions.js")

      registerTab({
        id: 'overview',
        labelKey: 'tabOverview',
        order: 0,
        use(panel) {
          useOverview(panel)
          return () => renderOverview(panel)
        },
        handlers: {
          loadLogin, loadSetup, refreshLoginQr,
          installKoishiEnv, runSetupFull, installSetupNapcat,
          startAll, stopAll, installNapcat, configureNapcat,
          startNapcat, stopNapcat, startKoishi, stopKoishi, restartKoishi, installDeps,
        },
      })

      return {  }
    },
    "client/plugins/plugins/PluginsTab.js": (__require) => {
      const React = __require("react")
      const { requestJson, messageOf, pluginKey, pluginLabel } = __require("client/runtime/api.js")

      async function loadPlugins(panel) {
        const { setPlugins, setPluginsPhase, setPluginsError } = panel
        setPluginsPhase('loading')
        try {
          const payload = await requestJson('/qqbot/koishi/plugins')
          setPlugins(Array.isArray(payload && payload.data) ? payload.data : [])
          setPluginsError(null)
          setPluginsPhase('ready')
        } catch (error) {
          setPluginsError(messageOf(error))
          setPluginsPhase('error')
        }
      }

      function installPlugin(panel) {
        const { installSpec, setInstallSpec, restartAfter, runPost, refreshAfterPluginChange } = panel
        const spec = installSpec.trim()
        if (spec === '') return
        runPost('plugin-install', '/qqbot/koishi/plugins/install', { spec, restart: restartAfter }, async () => {
          setInstallSpec('')
          await refreshAfterPluginChange()
        })
      }

      async function refreshAfterPluginChange(panel) {
        const { loadStatus, loadPlugins } = panel
        await loadPlugins()
        await loadStatus()
      }

      function renderPlugins(panel) {
        const {
          t, plugins, pluginsPhase, pluginsError, installSpec, setInstallSpec, restartAfter, setRestartAfter,
          pendingUninstall, setPendingUninstall, busyOf, loadPlugins, runPost, refreshAfterPluginChange,
          installDeps, installPlugin, actionButton, h
        } = panel
        const items = Array.isArray(plugins) ? plugins : []
        let table = null
        if (items.length > 0) {
          table = h('div', { className: 'qqbot-card', style: { padding: '4px 8px' } },
            h('table', { className: 'qqbot-table' },
              h('thead', null, h('tr', null,
                h('th', null, t('plName')),
                h('th', null, t('plVersion')),
                h('th', null, t('plGroup')),
                h('th', null, t('plEnabled')),
                h('th', null, t('plActions')))),
              h('tbody', null, ...items.map((plugin) => {
                const key = pluginKey(plugin)
                const name = pluginLabel(plugin) || key
                const enabled = plugin.enabled === true
                const toggleKey = `plugin-toggle:${key}`
                const uninstallKey = `plugin-uninstall:${key}`
                const confirming = pendingUninstall === key
                const showPackage = typeof plugin.packageName === 'string' && plugin.packageName !== '' && plugin.packageName !== name
                return h('tr', { key: key, 'data-testid': 'qqbot-plugin-row', 'data-key': key },
                  h('td', null,
                    h('span', { className: 'qqbot-plugin-name' }, name),
                    plugin.local === true ? h('span', { className: 'qqbot-badge' }, t('plLocal')) : null,
                    showPackage ? h('span', { className: 'qqbot-mono qqbot-plugin-package' }, plugin.packageName) : null),
                  h('td', { className: 'qqbot-mono' },
                    typeof plugin.version === 'string' && plugin.version !== '' ? plugin.version : '—'),
                  h('td', { className: 'qqbot-mono' },
                    typeof plugin.group === 'string' && plugin.group !== '' ? plugin.group : '—'),
                  h('td', null, h('button', {
                    type: 'button',
                    className: 'qqbot-switch',
                    role: 'switch',
                    'aria-checked': enabled ? 'true' : 'false',
                    'aria-label': `${name}: ${enabled ? t('plDisable') : t('plEnable')}`,
                    'data-testid': 'qqbot-plugin-toggle',
                    disabled: busyOf(toggleKey),
                    onClick: () => {
                      runPost(toggleKey, '/qqbot/koishi/plugins/toggle', { key, enabled: !enabled, restart: restartAfter }, refreshAfterPluginChange)
                    },
                  }, h('i', { className: 'qqbot-switch-dot' }), enabled ? t('plEnabled') : t('plDisable'))),
                  h('td', null, h('button', {
                    type: 'button',
                    className: `qqbot-btn${confirming ? ' qqbot-btn-danger' : ''}`,
                    'data-testid': 'qqbot-plugin-uninstall',
                    'aria-label': `${name}: ${t('plUninstall')}`,
                    disabled: plugin.removable === false || busyOf(uninstallKey),
                    onClick: () => {
                      if (!confirming) {
                        setPendingUninstall(key)
                        return
                      }
                      setPendingUninstall(null)
                      runPost(uninstallKey, '/qqbot/koishi/plugins/uninstall', { key, restart: restartAfter }, refreshAfterPluginChange)
                    },
                  }, confirming ? t('plConfirm') : t('plUninstall'))))
              }))))
        }

        return h('div', { className: 'qqbot-stack' },
          h('div', { className: 'qqbot-toolbar' },
            h('div', { className: 'qqbot-toolbar-left' },
              h('input', {
                className: 'qqbot-input',
                type: 'text',
                value: installSpec,
                placeholder: t('plInstallPlaceholder'),
                'aria-label': t('plInstallPlaceholder'),
                onChange: (event) => { setInstallSpec(event.currentTarget.value) },
              }),
              h('button', {
                type: 'button',
                className: 'qqbot-btn qqbot-btn-primary',
                'data-testid': 'qqbot-plugin-install',
                'aria-label': t('plInstall'),
                disabled: installSpec.trim() === '' || busyOf('plugin-install'),
                onClick: installPlugin,
              }, busyOf('plugin-install') ? t('plInstalling') : t('plInstall')),
              actionButton('koishi-install-deps', t('installDeps'), null, installDeps)),
            h('div', { className: 'qqbot-toolbar-right' },
              h('label', { className: 'qqbot-check' },
                h('input', {
                  type: 'checkbox',
                  checked: restartAfter,
                  onChange: (event) => { setRestartAfter(event.currentTarget.checked) },
                }),
                t('plRestartAfter')),
              h('button', {
                type: 'button',
                className: 'qqbot-btn',
                'data-testid': 'qqbot-plugins-refresh',
                'aria-label': t('refreshPlugins'),
                disabled: pluginsPhase === 'loading',
                onClick: () => { loadPlugins() },
              }, t('refresh')))),
          h('p', { className: 'qqbot-hint' }, t('plRestartHint')),
          pluginsError !== null
            ? h('div', { className: 'qqbot-banner qqbot-banner-error', role: 'alert' }, `${t('loadPluginsFail')}: ${pluginsError}`)
            : null,
          pluginsPhase === 'loading' && plugins === null
            ? h('div', { className: 'qqbot-empty', role: 'status' }, t('loadingPlugins'))
            : null,
          plugins !== null && items.length === 0 ? h('div', { className: 'qqbot-empty' }, t('pluginsEmpty')) : null,
          table)
      }

      /** Plugins hook: load the koishi.yml plugin list the first time it is opened. */
      function usePlugins(panel) {
        const { tab, pluginsPhase, loadPlugins } = panel

        React.useEffect(() => {
          if (tab === 'plugins' && pluginsPhase === 'idle') loadPlugins()
        }, [tab, pluginsPhase])
      }

      return { loadPlugins, installPlugin, refreshAfterPluginChange, renderPlugins, usePlugins }
    },
    "client/plugins/plugins/index.js": (__require) => {
      const { registerTab } = __require("client/runtime/tab-registry.js")
      const { usePlugins, loadPlugins, installPlugin, refreshAfterPluginChange, renderPlugins } = __require("client/plugins/plugins/PluginsTab.js")

      registerTab({
        id: 'plugins',
        labelKey: 'tabPlugins',
        order: 4,
        use(panel) {
          usePlugins(panel)
          return () => renderPlugins(panel)
        },
        handlers: {
          loadPlugins,
          installPlugin,
          refreshAfterPluginChange,
        },
      })

      return {  }
    },
    "client/runtime/api.js": (__require) => {
      /**
       * Pure HTTP helpers, formatters and payload-shaping functions shared by the
       * client plugins. No React, no state: everything here is testable in isolation.
       */

      /** Status polling interval; the Host route is cheap and read-only. */
      const POLL_MS = 4000

      /** Log tail size requested from GET /qqbot/logs. */
      const LOG_LINES = 200

      /** Scope modes accepted by the Host access policy. */
      const ACCESS_MODES = ['all', 'whitelist', 'blacklist']

      /** Fixed smoke-style prompt used by the panel's AI self-test. */
      const AI_TEST_PROMPT = '请只回复：AI 面板测试成功'

      /** The persona card supports at most 8 few-shot examples. */
      const MAX_PERSONA_EXAMPLES = 8

      /** Locale keys for the `/qqbot/setup/full` step ids. */
      const SETUP_STEP_KEYS = {
        'koishi-project': 'setupStepProject',
        'koishi-deps': 'setupStepDeps',
        'napcat-install': 'setupStepNapcatInstall',
        'koishi-start': 'setupStepKoishiStart',
        'napcat-configure': 'setupStepConfigure',
        'napcat-start': 'setupStepNapcatStart',
      }

      function messageOf(error) {
        return String(error && error.message !== undefined ? error.message : error)
      }

      /**
       * JSON fetch wrapper. Every Host route answers `{ ok, ... }`; a transport
       * failure, a non-2xx status or `ok:false` all throw with a user-facing text.
       * `acceptNotOk` opts out of the `ok:false` throw: /qqbot/contacts reports an
       * unavailable bot that way while the panel must stay editable.
       */
      async function requestJson(path, options) {
        const config = options || {}
        const init = {
          method: config.method || 'GET',
          cache: 'no-store',
          headers: { accept: 'application/json' },
        }
        if (config.body !== undefined) {
          init.headers['content-type'] = 'application/json'
          init.body = JSON.stringify(config.body)
        }
        const response = await fetch(path, init)
        let payload = null
        try {
          payload = await response.json()
        } catch {
          payload = null
        }
        if (!response.ok) throw new Error(payload && payload.error ? payload.error : `HTTP ${response.status}`)
        if (payload !== null && payload.ok === false && config.acceptNotOk !== true) {
          throw new Error(payload.error ? payload.error : 'request failed')
        }
        return payload
      }

      function pickText(value, lang) {
        if (typeof value === 'string') return value
        if (value === null || typeof value !== 'object') return ''
        const preferred = value[lang]
        if (typeof preferred === 'string' && preferred !== '') return preferred
        const fallback = value[lang === 'zh' ? 'en' : 'zh']
        return typeof fallback === 'string' ? fallback : ''
      }

      function compactValue(value) {
        if (value === null || value === undefined) return '—'
        if (typeof value === 'string') return value === '' ? '—' : value
        if (typeof value === 'number' || typeof value === 'boolean') return String(value)
        if (Array.isArray(value)) return `${value.length}`
        try {
          const text = JSON.stringify(value)
          if (typeof text !== 'string') return '—'
          return text.length > 96 ? `${text.slice(0, 93)}…` : text
        } catch {
          return '—'
        }
      }

      function pluginKey(plugin) {
        if (plugin === null || typeof plugin !== 'object') return ''
        if (typeof plugin.key === 'string' && plugin.key !== '') return plugin.key
        if (typeof plugin.name === 'string') return plugin.name
        if (typeof plugin.packageName === 'string') return plugin.packageName
        return ''
      }

      function pluginLabel(plugin) {
        if (plugin !== null && typeof plugin === 'object' && typeof plugin.name === 'string' && plugin.name !== '') return plugin.name
        return pluginKey(plugin)
      }

      function formatTime(value) {
        if (typeof value !== 'string' || value === '') return ''
        const date = new Date(value)
        if (Number.isNaN(date.getTime())) return value
        return date.toLocaleTimeString()
      }

      function aiSettingsDraftFrom(settings) {
        const source = settings !== null && typeof settings === 'object' ? settings : {}
        const probability = Number(source.replyProbability)
        const followUp = Number(source.followUpMinutes)
        const history = Number(source.historyLimit)
        const batchWindow = Number(source.batchWindowMs)
        const batchMaxWait = Number(source.batchMaxWaitMs)
        return {
          enabled: source.enabled !== false,
          replyProbabilityPercent: Number.isFinite(probability) ? Math.round(probability * 10000) / 100 : 15,
          followUpMinutes: Number.isFinite(followUp) ? followUp : 3,
          historyLimit: Number.isFinite(history) ? history : 100,
          batchWindowMs: Number.isFinite(batchWindow) ? batchWindow : 2500,
          batchMaxWaitMs: Number.isFinite(batchMaxWait) ? batchMaxWait : 10000,
        }
      }

      function aiSettingsBodyFrom(draft) {
        const percent = Number(draft.replyProbabilityPercent)
        const probability = Number.isFinite(percent) ? Math.min(1, Math.max(0, percent / 100)) : 0.15
        const followUp = Number(draft.followUpMinutes)
        const history = Number(draft.historyLimit)
        const batchWindow = Number(draft.batchWindowMs)
        const batchMaxWait = Number(draft.batchMaxWaitMs)
        return {
          enabled: draft.enabled === true,
          replyProbability: Math.round(probability * 1000) / 1000,
          followUpMinutes: Number.isFinite(followUp) ? followUp : 3,
          historyLimit: Number.isFinite(history) ? history : 100,
          batchWindowMs: Number.isFinite(batchWindow) ? Math.min(10000, Math.max(0, batchWindow)) : 2500,
          batchMaxWaitMs: Number.isFinite(batchMaxWait) ? Math.min(30000, Math.max(0, batchMaxWait)) : 10000,
        }
      }

      function profileDraftFrom(profile) {
        const source = profile !== null && typeof profile === 'object' ? profile : {}
        const text = (value) => (typeof value === 'string' ? value : '')
        return {
          key: text(source.key),
          groupId: text(source.groupId),
          qq: text(source.qq),
          nickname: text(source.nickname),
          summary: text(source.summary),
          personality: text(source.personality),
          style: text(source.style),
          relationship: text(source.relationship),
          interests: Array.isArray(source.interests) ? source.interests.map((item) => String(item)).join(', ') : '',
          recent: text(source.recent),
          interactions: Number(source.interactions) || 0,
        }
      }

      function parseInterests(text) {
        if (typeof text !== 'string' || text.trim() === '') return []
        const seen = new Set()
        for (const part of text.split(/[,，、;；]+/u)) {
          const value = part.trim()
          if (value !== '') seen.add(value)
        }
        return [...seen]
      }

      function profileBodyFrom(draft) {
        return {
          key: draft.key,
          groupId: draft.groupId,
          qq: draft.qq,
          nickname: draft.nickname,
          summary: draft.summary,
          personality: draft.personality,
          style: draft.style,
          relationship: draft.relationship,
          interests: parseInterests(draft.interests),
          recent: draft.recent,
        }
      }

      function draftFromPersona(persona) {
        const source = persona !== null && typeof persona === 'object' ? persona : {}
        const text = (value) => (typeof value === 'string' ? value : '')
        const examples = Array.isArray(source.examples)
          ? source.examples
            .filter((item) => item !== null && typeof item === 'object')
            .slice(0, MAX_PERSONA_EXAMPLES)
            .map((item) => ({ user: text(item.user), assistant: text(item.assistant) }))
          : []
        return {
          name: text(source.name),
          role: text(source.role),
          tone: text(source.tone),
          personality: text(source.personality),
          rules: text(source.rules),
          examples,
        }
      }

      function personaBody(draft) {
        return {
          name: draft.name,
          role: draft.role,
          tone: draft.tone,
          personality: draft.personality,
          rules: draft.rules,
          examples: draft.examples.map((example) => ({ user: example.user, assistant: example.assistant })),
        }
      }

      function normalizeMode(value) {
        return ACCESS_MODES.includes(value) ? value : 'all'
      }

      function scopeIds(scope) {
        return Array.isArray(scope.ids) ? scope.ids.map((id) => String(id)) : []
      }

      function parsePrefixes(text) {
        if (typeof text !== 'string' || text.trim() === '') return []
        const seen = new Set()
        for (const part of text.split(/[\s,，、;；]+/u)) {
          const prefix = part.trim()
          if (prefix !== '') seen.add(prefix)
        }
        return [...seen]
      }

      /**
       * Turn an AccessPolicy payload into the editable draft. Every scope keeps
       * its full mode and id list; selection happens through the contact lists.
       */
      function draftFromPolicy(policy) {
        const source = policy !== null && typeof policy === 'object' ? policy : {}
        const inbound = source.inbound !== null && typeof source.inbound === 'object' ? source.inbound : {}
        const outbound = source.outbound !== null && typeof source.outbound === 'object' ? source.outbound : {}
        const quiet = inbound.quiet !== null && typeof inbound.quiet === 'object' ? inbound.quiet : {}
        const inboundGroups = inbound.groups !== null && typeof inbound.groups === 'object' ? inbound.groups : {}
        const inboundPrivate = inbound.private !== null && typeof inbound.private === 'object' ? inbound.private : {}
        const outboundGroups = outbound.groups !== null && typeof outbound.groups === 'object' ? outbound.groups : {}
        const outboundPrivate = outbound.private !== null && typeof outbound.private === 'object' ? outbound.private : {}
        return {
          inboundGroupsMode: normalizeMode(inboundGroups.mode),
          inboundGroupIds: scopeIds(inboundGroups),
          inboundPrivateMode: normalizeMode(inboundPrivate.mode),
          inboundPrivateIds: scopeIds(inboundPrivate),
          outboundGroupsMode: normalizeMode(outboundGroups.mode),
          outboundGroupIds: scopeIds(outboundGroups),
          outboundPrivateMode: normalizeMode(outboundPrivate.mode),
          outboundPrivateIds: scopeIds(outboundPrivate),
          quietEnabled: quiet.enabled === true,
          prefixes: Array.isArray(quiet.prefixes) ? quiet.prefixes.map((prefix) => String(prefix)).join(' ') : '',
        }
      }

      return { POLL_MS, LOG_LINES, ACCESS_MODES, AI_TEST_PROMPT, MAX_PERSONA_EXAMPLES, SETUP_STEP_KEYS, messageOf, requestJson, pickText, compactValue, pluginKey, pluginLabel, formatTime, aiSettingsDraftFrom, aiSettingsBodyFrom, profileDraftFrom, parseInterests, profileBodyFrom, draftFromPersona, personaBody, normalizeMode, scopeIds, parsePrefixes, draftFromPolicy }
    },
    "client/runtime/locale.js": (__require) => {
      /**
       * Locale namespace and dictionaries. `en` is the fallback DSH locale; `zh`
       * mirrors every key so switching language never falls back mid-panel.
       */
      const { en } = __require("client/runtime/locale/en.js")
      const { zh } = __require("client/runtime/locale/zh.js")

      const NS = 'qqbot'
      const dictionaries = { en, zh }

      return { NS, dictionaries, en, zh }
    },
    "client/runtime/locale/en.js": (__require) => {
      /** en dictionary for the qqbot namespace. */
      const en = {
        __lang: 'en',
        title: 'QQ bot',
        eyebrow: 'Control center',
        subtitle: 'NapCat and Koishi in one panel: install, configure, start and stop, manage plugins, read logs.',
        refresh: 'Refresh',
        loading: 'Reading status…',
        loadFail: 'Could not load the status',
        retry: 'Retry',
        updated: 'Updated',
        tabOverview: 'Overview',
        tabMessages: 'Messages',
        tabAccess: 'Access',
        tabPlugins: 'Plugins',
        tabFeatures: 'Features',
        tabLogs: 'Logs',
        pillNapcat: 'NapCat',
        pillKoishi: 'Koishi',
        pillBot: 'Bot',
        stInstalled: 'Installed',
        stMissing: 'Not installed',
        stRunning: 'Running',
        stStopped: 'Stopped',
        stLoggedIn: 'Signed in',
        stLoggedOut: 'Not signed in',
        stOnline: 'Online',
        stOffline: 'Offline',
        stMissingProject: 'Project missing',
        stApplied: 'Applied',
        stNotApplied: 'Not applied',
        stReachable: 'reachable',
        stUnreachable: 'unreachable',
        actionsTitle: 'Operations',
        startAll: 'Start everything',
        stopAll: 'Stop everything',
        installNapcat: 'Install NapCat',
        configureNapcat: 'Apply OneBot config',
        installDeps: 'Install Koishi deps',
        napcatStart: 'Start NapCat',
        napcatStop: 'Stop NapCat',
        koishiStart: 'Start Koishi',
        koishiStop: 'Stop Koishi',
        koishiRestart: 'Restart Koishi',
        napcatTitle: 'NapCat',
        koishiTitle: 'Koishi',
        lblInstall: 'Installation',
        lblVersion: 'Version',
        lblProcess: 'Process',
        lblLogin: 'Login',
        lblWebui: 'WebUI',
        lblConfig: 'OneBot config',
        lblAccounts: 'Accounts',
        lblWs: 'Reverse WS',
        lblProject: 'Project',
        lblDeps: 'Dependencies',
        lblPort: 'Port',
        lblOnline: 'Bot',
        lblStats: 'Stats',
        lblError: 'Error',
        managed: 'managed by this plugin',
        noWs: 'none configured',
        platformUnknown: 'Unknown platform',
        installNapcatHintGeneric: 'Install NapCat from the bundled offline payload, then apply the OneBot config.',
        installNapcatHintMac: 'Installs NapCat from the bundled offline payload: allow the macOS administrator prompt, then apply the OneBot config.',
        installNapcatHintUnsupported: 'This macOS-only build does not support NapCat on this platform.',
        setupNapcatUnsupported: 'Not supported on this platform',
        loginUnsupported: 'NapCat login is unavailable on this platform.',
        aiTitle: 'AI chat',
        aiConnected: 'AI connected to DSH',
        aiUnavailable: 'DSH LLM is not connected',
        aiSourceConfig: 'from config',
        aiSourceHarness: 'DSH default',
        aiSourceFallback: 'fallback',
        aiHint: '@ the bot or reply to its message to force a reply; otherwise it replies by probability and keeps replying to that person for 3 minutes. Recent 100 group messages are background only.',
        aiTest: 'Test AI',
        aiTestFailed: 'AI test failed',
        aiReply: 'Reply',
        personaTitle: 'AI persona card',
        personaSubtitle: 'Used as the first segment of the AI system prompt.',
        personaName: 'Name',
        personaRole: 'Role',
        personaTone: 'Tone',
        personaPersonality: 'Personality',
        personaRules: 'Rules',
        personaExamples: 'Few-shot examples',
        personaExampleUser: 'User says',
        personaExampleAssistant: 'Assistant replies',
        personaAddExample: 'Add example',
        personaRemoveExample: 'Remove',
        personaMaxExamples: 'Up to 8 examples.',
        personaNoExamples: 'No examples yet.',
        personaSave: 'Save persona',
        personaSaved: 'Persona saved.',
        personaSaving: 'Saving…',
        personaReset: 'Restore defaults',
        personaResetDone: 'Persona restored to defaults.',
        personaSaveFail: 'Could not save the persona',
        personaLoadFail: 'Could not load the persona',
        personaLoading: 'Loading persona…',
        personaPreview: 'Prompt preview',
        personaPreviewShow: 'Show',
        personaPreviewHide: 'Hide',
        personaPresetsTitle: 'Preset library',
        personaPresetsHint: 'Save the current card as a named preset, or load one back into the editor.',
        personaPresetName: 'Preset name',
        personaPresetSave: 'Save preset',
        personaPresetLoad: 'Load',
        personaPresetDelete: 'Delete',
        personaPresetsEmpty: 'No presets yet.',
        personaPresetsLoading: 'Loading presets…',
        personaPresetSaved: 'Preset saved.',
        personaPresetLoaded: 'Preset loaded into the editor.',
        personaPresetDeleted: 'Preset deleted.',
        personaPresetsError: 'Could not update the preset library',
        tabAi: 'AI',
        aiSettingsTitle: 'Reply settings',
        aiSettingsSubtitle: 'Runtime behavior of the group AI chat.',
        aiSettingsEnabled: 'Enable AI replies',
        aiSettingsProbability: 'Reply probability (%)',
        aiSettingsProbabilityHint: 'Percent of eligible messages the bot replies to.',
        aiSettingsFollowUp: 'Follow-up window (minutes)',
        aiSettingsHistory: 'Context messages',
        aiSettingsBatchWindow: 'Batch window (ms)',
        aiSettingsBatchMax: 'Max batch wait (ms)',
        aiSettingsBatchHint: '0 disables message batching.',
        fullPromptTitle: 'Full prompt preview',
        fullPromptRefresh: 'Refresh prompt',
        fullPromptLoading: 'Loading the last prompt…',
        fullPromptEmpty: 'No AI request has been sent yet. Trigger one and check again.',
        fullPromptError: 'Could not load the last prompt',
        fullPromptShow: 'Expand',
        fullPromptHide: 'Collapse',
        fullPromptTime: 'Time',
        fullPromptGroup: 'Group',
        fullPromptUser: 'User',
        fullPromptMentions: 'Mentions',
        fullPromptMentionSelf: '@self',
        fullPromptMentionAll: '@all',
        fullPromptReplyToBot: 'Reply to bot',
        fullPromptImages: 'Images',
        fullPromptSystem: 'System prompt',
        fullPromptMessages: 'Messages',
        fullPromptNoMessages: 'No messages.',
        fullPromptYes: 'yes',
        fullPromptNo: 'no',
        aiSettingsSave: 'Save settings',
        aiSettingsSaved: 'AI settings saved.',
        aiSettingsReset: 'Restore defaults',
        aiSettingsResetDone: 'Defaults loaded; press save to apply.',
        aiSettingsLoadFail: 'Could not load AI settings',
        aiSettingsError: 'Could not save AI settings',
        aiSettingsLoading: 'Loading AI settings…',
        profilesTitle: 'Member profiles',
        profilesSubtitle: 'What the AI remembers about people in the group.',
        profilesSearch: 'Search nickname or QQ',
        profilesRefresh: 'Refresh profiles',
        profilesEmpty: 'No profiles yet.',
        profilesLoading: 'Loading profiles…',
        profilesLoadFail: 'Could not load profiles',
        profilesSelect: 'Select a profile to edit.',
        profilesNickname: 'Nickname',
        profilesQq: 'QQ',
        profilesGroup: 'Group',
        profilesSummary: 'Summary',
        profilesPersonality: 'Personality',
        profilesStyle: 'Speaking style',
        profilesRelationship: 'Relationship',
        profilesInterests: 'Interests (comma separated)',
        profilesRecent: 'Recent interactions',
        profilesInteractions: 'interactions',
        profilesSave: 'Save profile',
        profilesSaved: 'Profile saved.',
        profilesDelete: 'Delete profile',
        profilesDeleted: 'Profile deleted.',
        profilesSaveFail: 'Could not save the profile',
        profilesDeleteFail: 'Could not delete the profile',
        pluginsTitle: 'Koishi plugins',
        pluginsEmpty: 'No plugin was found in koishi.yml.',
        plName: 'Name',
        plVersion: 'Version',
        plGroup: 'Group',
        plEnabled: 'Enabled',
        plActions: 'Actions',
        plLocal: 'local',
        plEnable: 'Enable',
        plDisable: 'Disable',
        plUninstall: 'Uninstall',
        plConfirm: 'Confirm',
        plInstall: 'Install',
        plInstalling: 'Installing…',
        plInstallPlaceholder: 'npm spec, e.g. koishi-plugin-puppeteer',
        plRestartHint: 'Edits are written to koishi.yml; restart Koishi to apply them.',
        plRestartAfter: 'Restart Koishi after changes',
        refreshPlugins: 'Refresh plugins',
        loadingPlugins: 'Loading plugins…',
        loadPluginsFail: 'Could not load plugins',
        featuresTitle: 'Capabilities',
        featuresEmpty: 'No feature is registered.',
        featuresNote: `Other DSH plugins can extend this panel with inject: ['qqbot'] and ctx.qqbot.registerFeature().`,
        featuresRefresh: 'Refresh features',
        loadingFeatures: 'Loading features…',
        loadFeaturesFail: 'Could not load features',
        logsTitle: 'Logs',
        logsKoishi: 'Koishi',
        logsNapcat: 'NapCat',
        logsEmpty: 'No log lines yet.',
        logsLoading: 'Loading logs…',
        logsRefresh: 'Refresh logs',
        loadLogsFail: 'Could not load logs',
        accessTitle: 'Access policy',
        accessInboundTitle: 'Inbound',
        accessInboundDesc: 'Which groups and private chats the bot processes.',
        accessOutboundTitle: 'Outbound',
        accessOutboundDesc: 'Which groups and private chats the bot may send to.',
        accessGroupPolicy: 'Group policy',
        accessPrivatePolicy: 'Private policy',
        accessMode: 'Mode',
        accessModeAll: 'All',
        accessModeWhitelist: 'Whitelist',
        accessModeBlacklist: 'Blacklist',
        accessModeHintAll: 'Everything is allowed; the list is disabled.',
        accessModeHintWhitelist: 'Only checked contacts are allowed.',
        accessModeHintBlacklist: 'Checked contacts are excluded.',
        accessSelectAll: 'Select all',
        accessClear: 'Clear',
        accessSearchGroups: 'Search group name or ID',
        accessSearchFriends: 'Search friend name or QQ',
        accessSelected: 'selected',
        accessEmptyGroups: 'No groups available.',
        accessEmptyFriends: 'No friends available.',
        accessNoMatch: 'No match.',
        accessNotInList: 'Not in list',
        accessRemove: 'Remove',
        accessContactsLoading: 'Reading the contact list…',
        accessContactsFail: 'Could not read the contact list',
        accessRefreshContacts: 'Refresh list',
        accessRefreshing: 'Refreshing…',
        accessPeople: 'members',
        accessQuietTitle: 'Quiet mode',
        accessQuiet: 'In groups, only respond to command prefixes or @mentions',
        accessQuietHint: 'When on, other group messages are ignored.',
        accessPrefixes: 'Command prefixes',
        accessPrefixesPlaceholder: 'Space or comma separated, e.g. / !',
        accessPrefixesHint: 'Empty means the default "/".',
        accessSave: 'Save policy',
        accessSaved: 'Access policy saved.',
        accessLoading: 'Loading access policy…',
        accessLoadFail: 'Could not load the access policy',
        accessNote: 'Inbound and outbound lists are independent: an inbound whitelist avoids handling unrelated group messages, while an outbound whitelist stops sending to unauthorized groups.',
        loginTitle: 'Sign in with QR',
        loginHint: 'Scan the code with the mobile QQ app to sign the bot account in.',
        loginPhaseWaiting: 'Waiting for QR scan',
        loginPhaseScanned: 'Scanned, waiting for confirmation',
        loginPhaseInitializing: 'Initializing…',
        loginPhaseReconnecting: 'Connecting…',
        loginPhaseUnknown: 'Waiting to sign in',
        loginNotRunning: 'NapCat is not serving a login QR code yet. Start NapCat first.',
        loginQrLoading: 'Fetching the QR code…',
        loginQrFail: 'Could not load the QR code',
        loginRetry: 'Retry',
        loginRefresh: 'Refresh QR code',
        loginRefreshed: 'QR code refreshed.',
        loginStart: 'Start NapCat',
        loginRunning: 'NapCat is running',
        loginLoggedInAs: 'Signed in',
        messagesTitle: 'Messages',
        messagesRefresh: 'Refresh messages',
        messagesLoading: 'Loading messages…',
        messagesLoadFail: 'Could not load messages',
        messagesEmpty: 'No messages yet.',
        messagesFilterAll: 'All',
        messagesFilterGroup: 'Groups',
        messagesFilterPrivate: 'Private',
        messagesDirectionIn: 'Received',
        messagesDirectionOut: 'Sent',
        messagesUnknownSource: 'Unknown',
        setupTitle: 'Runtime setup',
        setupSubtitle: 'Create the Koishi project and install its dependencies without a terminal.',
        setupProject: 'Koishi project',
        setupCreated: 'Created',
        setupMissing: 'Not created',
        setupDeps: 'Dependencies',
        setupBundle: 'Offline deps',
        setupBundleAvailable: 'Bundled',
        setupBundleMissing: 'Not bundled',
        setupInstalled: 'Installed',
        setupNotInstalled: 'Not installed',
        setupInstalling: 'Installing…',
        setupTemplate: 'Template',
        setupAvailable: 'Available',
        setupMissingTemplate: 'Missing',
        setupNapcat: 'NapCat',
        setupOneBot: 'OneBot config',
        setupConfigured: 'Written',
        setupPending: 'Pending',
        setupInstall: 'Install Koishi runtime',
        setupReinstall: 'Reinstall runtime',
        setupFull: 'One-click install and configure',
        setupNapcatInstall: 'Install NapCat',
        setupReady: 'Runtime is ready',
        setupExpand: 'Show details',
        setupCollapse: 'Collapse',
        setupInstallingHint: 'Installing dependencies… this can take a minute. Logs refresh every 2 seconds.',
        setupLogs: 'Install logs',
        setupLogsEmpty: 'Waiting for output…',
        setupInstallDone: 'Koishi runtime installed.',
        setupFullDone: 'Setup finished.',
        setupNapcatDone: 'NapCat installer opened.',
        setupLoadFail: 'Could not load the setup state',
        setupUnknown: 'Unknown',
        setupNode: 'Node',
        setupPackage: 'Package',
        setupDepsCount: 'dependencies',
        setupLastInstall: 'Last install',
        setupInstallOk: 'ok',
        setupInstallFail: 'failed',
        setupStepProject: 'Create Koishi project',
        setupStepDeps: 'Install dependencies',
        setupStepNapcatInstall: 'Install NapCat',
        setupStepKoishiStart: 'Start Koishi',
        setupStepConfigure: 'Write OneBot config',
        setupStepNapcatStart: 'Start NapCat',
        setupStepOther: 'Step',
        actionDone: 'Done.',
        actionFailed: 'Action failed',
        working: 'Working…',
        tabGames: 'Mini Games',
        gamesTitle: 'Mini Game Console',
        gamesSubtitle: 'Browse groups, registered players, game state and the current UP.',
        gamesRefresh: 'Refresh',
        gamesLoading: 'Reading mini-game data…',
        gamesLoadFail: 'Could not load mini-game data',
        gamesEmpty: 'No group player data yet.',
        gamesGroups: 'Groups',
        gamesGroup: 'Group',
        gamesUsers: 'Registered users',
        gamesGames: 'Mini games',
        gamesOpen: 'Open',
        gamesBack: 'Back',
        gamesBackGroups: 'Back to groups',
        gamesBackGroup: 'Back to group',
        gamesNoUsers: 'No registered users in this group.',
        gamesNoGames: 'No mini games available.',
        gamesUserCount: 'Users',
        gamesTotalCoins: 'Total gold',
        gamesTotalFishingCoins: 'Total fishing coins',
        gamesLastUpdated: 'Updated',
        gamesQQ: 'QQ',
        gamesGroupId: 'Group ID',
        gamesNickname: 'Nickname',
        gamesAccountCoins: 'Gold',
        gamesFishingCoins: 'Fishing coins',
        gamesFishCount: 'Fish',
        gamesRegisteredAt: 'Registered',
        gamesGame: 'Game',
        gamesPlayerCount: 'Players',
        gamesCurrentUp: 'Current UP',
        gamesUpRod: 'Legendary rod',
        gamesUpBait: 'Legendary bait',
        gamesSaveUp: 'Save UP',
        gamesUpSaved: 'UP updated.',
        gamesUpFailed: 'Could not update UP',
        gamesPlayers: 'Player game state',
        gamesPlayer: 'Player',
        gamesRods: 'Rods',
        gamesBaits: 'Baits',
        gamesTickets: 'Tickets',
        gamesCast: 'State',
        gamesCastIdle: 'Idle',
        gamesCastActive: 'Fishing',
        gamesPity: 'Pity',
        gamesSummary: 'Game summary',
        gamesActiveCasts: 'Fishing now',
        gamesTotalFish: 'Fish stored',
        gamesTotalFishValue: 'Fish value',
        gamesEquipped: 'Equipped',
        gamesSelected: 'Selected',
        gamesSingle: 'Single',
        gamesTen: 'Ten',
        gamesNoUp: 'No UP',
        gamesSave: 'Save',
        gamesSaving: 'Saving…',
        gamesSelectedCount: 'Selected',
        gamesCount: 'Count',
        gamesCastReady: 'Ready at',
        gamesRodsOwned: 'rods',
        gamesBaitsOwned: 'baits',

      }

      return { en }
    },
    "client/runtime/locale/zh.js": (__require) => {
      /** zh dictionary for the qqbot namespace. */
      const zh = {
        __lang: 'zh',
        title: 'QQ 机器人',
        eyebrow: '控制中心',
        subtitle: 'NapCat 与 Koishi 一站式控制：安装、配置、启停、插件管理与日志。',
        refresh: '刷新',
        loading: '正在读取状态…',
        loadFail: '状态读取失败',
        retry: '重试',
        updated: '更新于',
        tabOverview: '概览',
        tabMessages: '消息',
        tabAccess: '权限',
        tabPlugins: '插件',
        tabFeatures: '功能',
        tabLogs: '日志',
        pillNapcat: 'NapCat',
        pillKoishi: 'Koishi',
        pillBot: '机器人',
        stInstalled: '已安装',
        stMissing: '未安装',
        stRunning: '运行中',
        stStopped: '未运行',
        stLoggedIn: '已登录',
        stLoggedOut: '未登录',
        stOnline: '在线',
        stOffline: '离线',
        stMissingProject: '项目不存在',
        stApplied: '已应用',
        stNotApplied: '未应用',
        stReachable: '可达',
        stUnreachable: '不可达',
        actionsTitle: '操作',
        startAll: '一键启动全部',
        stopAll: '全部停止',
        installNapcat: '安装 NapCat',
        configureNapcat: '写入 OneBot 配置',
        installDeps: '安装 Koishi 依赖',
        napcatStart: '启动 NapCat',
        napcatStop: '停止 NapCat',
        koishiStart: '启动 Koishi',
        koishiStop: '停止 Koishi',
        koishiRestart: '重启 Koishi',
        napcatTitle: 'NapCat',
        koishiTitle: 'Koishi',
        lblInstall: '安装',
        lblVersion: '版本',
        lblProcess: '进程',
        lblLogin: '登录',
        lblWebui: 'WebUI',
        lblConfig: 'OneBot 配置',
        lblAccounts: '账号',
        lblWs: '反向 WS',
        lblProject: '项目',
        lblDeps: '依赖',
        lblPort: '端口',
        lblOnline: '机器人',
        lblStats: '统计',
        lblError: '错误',
        managed: '由本插件启动',
        noWs: '未配置',
        platformUnknown: '未知平台',
        installNapcatHintGeneric: '会从内置离线包安装 NapCat，请按提示完成授权，然后写入 OneBot 配置。',
        installNapcatHintMac: '会从内置离线包安装 NapCat：请在 macOS 管理员授权提示中允许，然后写入 OneBot 配置。',
        installNapcatHintUnsupported: '这个 macOS-only 构建不支持当前平台的 NapCat。',
        setupNapcatUnsupported: '当前平台不支持',
        loginUnsupported: '当前平台无法使用 NapCat 扫码登录。',
        aiTitle: 'AI 聊天',
        aiConnected: 'AI 已接入 DSH',
        aiUnavailable: '未接入 DSH LLM',
        aiSourceConfig: '来自配置',
        aiSourceHarness: 'DSH 默认',
        aiSourceFallback: '回退',
        aiHint: '被 @机器人 或回复机器人会必定接话；其他消息按设定概率回复，并对同一人保持 3 分钟跟进。最近 100 条群消息仅作背景。',
        aiTest: '测试 AI',
        aiTestFailed: 'AI 测试失败',
        aiReply: '回复',
        personaTitle: 'AI 人设卡',
        personaSubtitle: '作为 AI 回复的系统提示词第一段。',
        personaName: '名称',
        personaRole: '角色',
        personaTone: '语气',
        personaPersonality: '性格',
        personaRules: '行为准则',
        personaExamples: '对话示例',
        personaExampleUser: '用户',
        personaExampleAssistant: '助手',
        personaAddExample: '添加示例',
        personaRemoveExample: '删除',
        personaMaxExamples: '最多 8 条示例。',
        personaNoExamples: '还没有示例。',
        personaSave: '保存人设',
        personaSaved: '人设已保存。',
        personaSaving: '保存中…',
        personaReset: '恢复默认',
        personaResetDone: '人设已恢复默认。',
        personaSaveFail: '人设保存失败',
        personaLoadFail: '人设读取失败',
        personaLoading: '正在读取人设…',
        personaPreview: '提示词预览',
        personaPreviewShow: '展开',
        personaPreviewHide: '收起',
        personaPresetsTitle: '预设卡库',
        personaPresetsHint: '把当前人设保存为命名预设，或把已有预设加载回编辑器。',
        personaPresetName: '预设名称',
        personaPresetSave: '保存预设',
        personaPresetLoad: '加载',
        personaPresetDelete: '删除',
        personaPresetsEmpty: '暂无预设卡。',
        personaPresetsLoading: '正在读取预设卡…',
        personaPresetSaved: '预设卡已保存。',
        personaPresetLoaded: '预设卡已加载到编辑器。',
        personaPresetDeleted: '预设卡已删除。',
        personaPresetsError: '预设卡库更新失败',
        tabAi: 'AI',
        aiSettingsTitle: '回复设置',
        aiSettingsSubtitle: '群里 AI 聊天的运行参数。',
        aiSettingsEnabled: '启用 AI 回复',
        aiSettingsProbability: '回复概率（%）',
        aiSettingsProbabilityHint: '符合条件的消息中机器人回复的百分比。',
        aiSettingsFollowUp: '跟进窗口（分钟）',
        aiSettingsHistory: '上下文条数',
        aiSettingsBatchWindow: '合并等待 (ms)',
        aiSettingsBatchMax: '合并最长等待 (ms)',
        aiSettingsBatchHint: '0 表示关闭合并。',
        fullPromptTitle: '完整提示词',
        fullPromptRefresh: '刷新提示词',
        fullPromptLoading: '正在读取最近一次提示词…',
        fullPromptEmpty: '还没有发送过 AI 请求，先触发一次 AI 后再查看。',
        fullPromptError: '提示词读取失败',
        fullPromptShow: '展开',
        fullPromptHide: '收起',
        fullPromptTime: '时间',
        fullPromptGroup: '群',
        fullPromptUser: '用户',
        fullPromptMentions: '提及',
        fullPromptMentionSelf: '@自己',
        fullPromptMentionAll: '@全体',
        fullPromptReplyToBot: '回复机器人',
        fullPromptImages: '图片',
        fullPromptSystem: '系统提示词',
        fullPromptMessages: '消息',
        fullPromptNoMessages: '暂无消息。',
        fullPromptYes: '是',
        fullPromptNo: '否',
        aiSettingsSave: '保存设置',
        aiSettingsSaved: 'AI 设置已保存。',
        aiSettingsReset: '恢复默认',
        aiSettingsResetDone: '已填入默认值，请点保存应用。',
        aiSettingsLoadFail: 'AI 设置读取失败',
        aiSettingsError: 'AI 设置保存失败',
        aiSettingsLoading: '正在读取 AI 设置…',
        profilesTitle: '人物画像',
        profilesSubtitle: 'AI 记住的群成员信息。',
        profilesSearch: '搜索昵称或 QQ',
        profilesRefresh: '刷新画像',
        profilesEmpty: '暂无画像。',
        profilesLoading: '正在读取画像…',
        profilesLoadFail: '画像读取失败',
        profilesSelect: '选择一个画像进行编辑。',
        profilesNickname: '昵称',
        profilesQq: 'QQ',
        profilesGroup: '群号',
        profilesSummary: '概要',
        profilesPersonality: '性格',
        profilesStyle: '说话风格',
        profilesRelationship: '与机器人关系',
        profilesInterests: '兴趣（逗号分隔）',
        profilesRecent: '近期互动',
        profilesInteractions: '次互动',
        profilesSave: '保存画像',
        profilesSaved: '画像已保存。',
        profilesDelete: '删除画像',
        profilesDeleted: '画像已删除。',
        profilesSaveFail: '画像保存失败',
        profilesDeleteFail: '画像删除失败',
        pluginsTitle: 'Koishi 插件',
        pluginsEmpty: 'koishi.yml 里没有检测到插件。',
        plName: '名称',
        plVersion: '版本',
        plGroup: '分组',
        plEnabled: '已启用',
        plActions: '操作',
        plLocal: '本地',
        plEnable: '启用',
        plDisable: '禁用',
        plUninstall: '卸载',
        plConfirm: '确认',
        plInstall: '安装',
        plInstalling: '安装中…',
        plInstallPlaceholder: 'npm 包名，例如 koishi-plugin-puppeteer',
        plRestartHint: '修改写入 koishi.yml，重启 Koishi 后生效。',
        plRestartAfter: '操作后重启 Koishi',
        refreshPlugins: '刷新插件',
        loadingPlugins: '正在读取插件…',
        loadPluginsFail: '插件读取失败',
        featuresTitle: '功能',
        featuresEmpty: '暂无注册的功能。',
        featuresNote: `其他 DSH 插件可通过 inject: ['qqbot'] 与 ctx.qqbot.registerFeature() 扩展。`,
        featuresRefresh: '刷新功能',
        loadingFeatures: '正在读取功能…',
        loadFeaturesFail: '功能读取失败',
        logsTitle: '日志',
        logsKoishi: 'Koishi',
        logsNapcat: 'NapCat',
        logsEmpty: '暂无日志。',
        logsLoading: '正在读取日志…',
        logsRefresh: '刷新日志',
        loadLogsFail: '日志读取失败',
        accessTitle: '权限策略',
        accessInboundTitle: '接收',
        accessInboundDesc: '机器人处理哪些群与私聊的消息。',
        accessOutboundTitle: '发送',
        accessOutboundDesc: '机器人允许向哪些群与私聊发消息。',
        accessGroupPolicy: '群聊策略',
        accessPrivatePolicy: '私聊策略',
        accessMode: '模式',
        accessModeAll: '全部',
        accessModeWhitelist: '白名单',
        accessModeBlacklist: '黑名单',
        accessModeHintAll: '全部放行，列表已禁用。',
        accessModeHintWhitelist: '仅勾选的联系人放行。',
        accessModeHintBlacklist: '勾选的联系人将被排除。',
        accessSelectAll: '全选',
        accessClear: '清空',
        accessSearchGroups: '搜索群名或群号',
        accessSearchFriends: '搜索好友名或 QQ 号',
        accessSelected: '已选',
        accessEmptyGroups: '没有可用的群。',
        accessEmptyFriends: '没有可用的好友。',
        accessNoMatch: '没有匹配项。',
        accessNotInList: '未在列表中',
        accessRemove: '移除',
        accessContactsLoading: '正在读取联系人…',
        accessContactsFail: '联系人列表读取失败',
        accessRefreshContacts: '刷新列表',
        accessRefreshing: '刷新中…',
        accessPeople: '人',
        accessQuietTitle: '静默模式',
        accessQuiet: '群里只响应指令前缀或 @机器人',
        accessQuietHint: '开启后群里其他消息将被忽略。',
        accessPrefixes: '指令前缀',
        accessPrefixesPlaceholder: '空格或逗号分隔，例如 / !',
        accessPrefixesHint: '留空时默认使用 "/"。',
        accessSave: '保存策略',
        accessSaved: '权限策略已保存。',
        accessLoading: '正在读取权限策略…',
        accessLoadFail: '权限策略读取失败',
        accessNote: '接收与发送名单相互独立：接收白名单可避免机器人处理无关群消息，发送白名单阻止向未授权群发送消息。',
        loginTitle: '扫码登录',
        loginHint: '用手机 QQ 扫码登录机器人账号。',
        loginPhaseWaiting: '等待扫码',
        loginPhaseScanned: '已扫码，等待确认',
        loginPhaseInitializing: '初始化中…',
        loginPhaseReconnecting: '连接中…',
        loginPhaseUnknown: '等待登录',
        loginNotRunning: 'NapCat 还没有提供登录二维码，请先启动 NapCat。',
        loginQrLoading: '正在获取二维码…',
        loginQrFail: '二维码加载失败',
        loginRetry: '重试',
        loginRefresh: '刷新二维码',
        loginRefreshed: '二维码已刷新。',
        loginStart: '启动 NapCat',
        loginRunning: 'NapCat 运行中',
        loginLoggedInAs: '已登录',
        messagesTitle: '消息',
        messagesRefresh: '刷新消息',
        messagesLoading: '正在读取消息…',
        messagesLoadFail: '消息读取失败',
        messagesEmpty: '还没有收到消息。',
        messagesFilterAll: '全部',
        messagesFilterGroup: '群聊',
        messagesFilterPrivate: '私聊',
        messagesDirectionIn: '接收',
        messagesDirectionOut: '发送',
        messagesUnknownSource: '未知',
        setupTitle: '环境安装',
        setupSubtitle: '无需终端：自动创建 Koishi 项目并安装依赖。',
        setupProject: 'Koishi 项目',
        setupCreated: '已创建',
        setupMissing: '未创建',
        setupDeps: '依赖',
        setupBundle: '离线依赖',
        setupBundleAvailable: '已内置',
        setupBundleMissing: '未内置',
        setupInstalled: '已安装',
        setupNotInstalled: '未安装',
        setupInstalling: '安装中…',
        setupTemplate: '模板',
        setupAvailable: '可用',
        setupMissingTemplate: '缺失',
        setupNapcat: 'NapCat',
        setupOneBot: 'OneBot 配置',
        setupConfigured: '已写入',
        setupPending: '待写入',
        setupInstall: '安装 Koishi 环境',
        setupReinstall: '重新安装环境',
        setupFull: '一键安装并配置',
        setupNapcatInstall: '安装 NapCat',
        setupReady: '运行环境已就绪',
        setupExpand: '展开详情',
        setupCollapse: '收起',
        setupInstallingHint: '正在安装依赖…可能需要一分钟，日志每 2 秒刷新。',
        setupLogs: '安装日志',
        setupLogsEmpty: '等待输出…',
        setupInstallDone: 'Koishi 环境安装完成。',
        setupFullDone: '一键安装完成。',
        setupNapcatDone: 'NapCat 安装器已打开。',
        setupLoadFail: '环境状态读取失败',
        setupUnknown: '未知',
        setupNode: 'Node',
        setupPackage: '包',
        setupDepsCount: '个依赖',
        setupLastInstall: '上次安装',
        setupInstallOk: '成功',
        setupInstallFail: '失败',
        setupStepProject: '创建 Koishi 项目',
        setupStepDeps: '安装依赖',
        setupStepNapcatInstall: '安装 NapCat',
        setupStepKoishiStart: '启动 Koishi',
        setupStepConfigure: '写入 OneBot 配置',
        setupStepNapcatStart: '启动 NapCat',
        setupStepOther: '步骤',
        actionDone: '操作完成。',
        actionFailed: '操作失败',
        working: '处理中…',
        tabGames: '小游戏',
        gamesTitle: '小游戏管理台',
        gamesSubtitle: '按群查看注册玩家、游戏状态和当期 UP。',
        gamesRefresh: '刷新',
        gamesLoading: '正在读取小游戏数据…',
        gamesLoadFail: '小游戏数据读取失败',
        gamesEmpty: '还没有任何群的玩家数据。',
        gamesGroups: '群列表',
        gamesGroup: '群',
        gamesUsers: '注册用户',
        gamesGames: '小游戏',
        gamesOpen: '进入',
        gamesBack: '返回',
        gamesBackGroups: '返回群列表',
        gamesBackGroup: '返回群详情',
        gamesNoUsers: '本群还没有注册用户。',
        gamesNoGames: '暂无可用小游戏。',
        gamesUserCount: '注册用户',
        gamesTotalCoins: '总金币',
        gamesTotalFishingCoins: '总钓鱼币',
        gamesLastUpdated: '更新于',
        gamesQQ: 'QQ号',
        gamesGroupId: '群号',
        gamesNickname: '昵称',
        gamesAccountCoins: '金币',
        gamesFishingCoins: '钓鱼币',
        gamesFishCount: '鱼仓',
        gamesRegisteredAt: '注册时间',
        gamesGame: '游戏',
        gamesPlayerCount: '玩家数',
        gamesCurrentUp: '当期 UP',
        gamesUpRod: '传奇鱼竿',
        gamesUpBait: '传奇鱼饵',
        gamesSaveUp: '保存 UP',
        gamesUpSaved: 'UP 已更新。',
        gamesUpFailed: 'UP 更新失败',
        gamesPlayers: '玩家游戏信息',
        gamesPlayer: '玩家',
        gamesRods: '鱼竿',
        gamesBaits: '鱼饵',
        gamesTickets: '抽卡券',
        gamesCast: '状态',
        gamesCastIdle: '空闲',
        gamesCastActive: '钓鱼中',
        gamesPity: '保底',
        gamesSummary: '游戏概况',
        gamesActiveCasts: '钓鱼中',
        gamesTotalFish: '鱼仓总数',
        gamesTotalFishValue: '鱼仓总价值',
        gamesEquipped: '装备中',
        gamesSelected: '已选',
        gamesSingle: '单抽',
        gamesTen: '十连',
        gamesNoUp: '暂无 UP',
        gamesSave: '保存',
        gamesSaving: '保存中…',
        gamesSelectedCount: '已选',
        gamesCount: '数量',
        gamesCastReady: '预计收竿',
        gamesRodsOwned: '把鱼竿',
        gamesBaitsOwned: '种鱼饵',

      }

      return { zh }
    },
    "client/runtime/store.js": (__require) => {
      const React = __require("react")
      const { messageOf, requestJson } = __require("client/runtime/api.js")

      /**
       * Turn the Host status snapshot into the flat display model every renderer
       * consumes. Pure: no state, no side effects except remembering the last
       * signed-in flag for the pollers.
       */
      function deriveStatus(snapshot, t, loggedInRef) {
        const hasSnapshot = snapshot !== null
        const napcat = (snapshot && snapshot.napcat) || {}
        const koishi = (snapshot && snapshot.koishi) || {}
        const bot = (snapshot && snapshot.bot) || {}
        const qq = (snapshot && snapshot.qq) || {}
        const settings = (snapshot && snapshot.settings) || {}
        // Host platform metadata (id/label/support flags). Older Hosts only send
        // `isMac`, so fall back to that before declaring the platform unknown.
        const platformInfo = snapshot && snapshot.platform !== null && typeof snapshot.platform === 'object'
          ? snapshot.platform
          : null
        const rawPlatformId = platformInfo && typeof platformInfo.id === 'string' ? platformInfo.id : ''
        const platformId = ['macos', 'other'].includes(rawPlatformId)
          ? rawPlatformId
          : platformInfo !== null && platformInfo.isMac === true ? 'macos' : 'other'
        const platformLabel = platformInfo !== null && typeof platformInfo.label === 'string' && platformInfo.label !== ''
          ? platformInfo.label
          : platformInfo === null
            ? t('platformUnknown')
            : platformId === 'macos' ? 'macOS' : t('platformUnknown')
        const platformArch = platformInfo !== null && typeof platformInfo.arch === 'string' ? platformInfo.arch : ''
        const platformBadgeText = platformInfo === null
          ? t('platformUnknown')
          : `${platformLabel}${platformArch !== '' ? ` · ${platformArch}` : ''}`
        const napcatSupported = platformInfo === null
          ? true
          : platformInfo.napcatSupported === undefined
            ? platformId === 'macos'
            : platformInfo.napcatSupported === true
        const platformInstallHint = platformInfo === null
          ? t('installNapcatHintGeneric')
          : napcatSupported
            ? t('installNapcatHintMac')
            : t('installNapcatHintUnsupported')
        const napcatAccounts = Array.isArray(napcat.accounts) ? napcat.accounts : []
        const wsClients = []
        for (const account of napcatAccounts) {
          const clients = account && Array.isArray(account.wsClients) ? account.wsClients : []
          for (const client of clients) {
            wsClients.push(`${client.name || 'ws'} → ${client.url || '—'}${client.enable === false ? ` (${t('stStopped')})` : ''}`)
          }
        }

        const napcatInstalled = napcat.installed === true
        const napcatRunning = napcat.running === true
        const napcatLoggedIn = napcat.loggedIn === true
        const koishiExists = koishi.exists !== false
        const koishiRunning = koishi.running === true
        const botOnline = bot.online === true

        const napcatText = !hasSnapshot ? '—' : !napcatInstalled ? t('stMissing') : napcatRunning ? t('stRunning') : t('stStopped')
        const napcatTone = !hasSnapshot ? 'warn' : !napcatInstalled ? 'bad' : napcatRunning && napcatLoggedIn ? 'ok' : 'warn'
        const koishiText = !hasSnapshot ? '—' : !koishiExists ? t('stMissingProject') : koishiRunning ? t('stRunning') : t('stStopped')
        const koishiTone = !hasSnapshot ? 'warn' : !koishiExists ? 'bad' : koishiRunning ? 'ok' : 'warn'
        const botText = !hasSnapshot ? '—' : botOnline ? t('stOnline') : t('stOffline')
        const botTone = !hasSnapshot ? 'warn' : botOnline ? 'ok' : 'warn'
        loggedInRef.current = napcatLoggedIn
        return {
          hasSnapshot, napcat, koishi, bot, qq, settings,
          platformInfo, rawPlatformId, platformId, platformLabel, platformArch, platformBadgeText,
          napcatSupported, platformInstallHint, napcatAccounts, wsClients,
          napcatInstalled, napcatRunning, napcatLoggedIn,
          koishiExists, koishiRunning, botOnline,
          napcatText, napcatTone, koishiText, koishiTone, botText, botTone,
        }
      }

      /**
       * The panel's shared state store. Every useState/useRef of the panel lives
       * here so plugins stay stateless renderers over one source of truth; the
       * status snapshot and contact list are polled from one place.
       */
      function useStore(t) {
        const [tab, setTab] = React.useState('overview')
        const [snapshot, setSnapshot] = React.useState(null)
        const [loading, setLoading] = React.useState(true)
        const [loadError, setLoadError] = React.useState(null)
        const [banner, setBanner] = React.useState(null)
        const [plugins, setPlugins] = React.useState(null)
        const [pluginsPhase, setPluginsPhase] = React.useState('idle')
        const [pluginsError, setPluginsError] = React.useState(null)
        const [features, setFeatures] = React.useState(null)
        const [featuresPhase, setFeaturesPhase] = React.useState('idle')
        const [featuresError, setFeaturesError] = React.useState(null)
        const [logLines, setLogLines] = React.useState([])
        const [logsNote, setLogsNote] = React.useState(null)
        const [logsPhase, setLogsPhase] = React.useState('idle')
        const [logsError, setLogsError] = React.useState(null)
        const [logSource, setLogSource] = React.useState('koishi')
        const [installSpec, setInstallSpec] = React.useState('')
        const [restartAfter, setRestartAfter] = React.useState(false)
        const [busy, setBusy] = React.useState({})
        const [pendingUninstall, setPendingUninstall] = React.useState(null)
        const [accessPhase, setAccessPhase] = React.useState('idle')
        const [accessError, setAccessError] = React.useState(null)
        const [accessWarning, setAccessWarning] = React.useState(null)
        const [accessDraft, setAccessDraft] = React.useState(null)
        const [contacts, setContacts] = React.useState(null)
        const [contactsPhase, setContactsPhase] = React.useState('idle')
        const [contactsError, setContactsError] = React.useState(null)
        const [accessQuery, setAccessQuery] = React.useState({
          inboundGroups: '',
          inboundPrivate: '',
          outboundGroups: '',
          outboundPrivate: '',
        })
        const [loginInfo, setLoginInfo] = React.useState(null)
        const [loginError, setLoginError] = React.useState(null)
        const [qrTicket, setQrTicket] = React.useState(0)
        const [qrBroken, setQrBroken] = React.useState(false)
        const [messages, setMessages] = React.useState(null)
        const [messagesPhase, setMessagesPhase] = React.useState('idle')
        const [messagesError, setMessagesError] = React.useState(null)
        const [messagesFilter, setMessagesFilter] = React.useState('all')
        const [messagesUpdatedAt, setMessagesUpdatedAt] = React.useState(null)
        const [setupInfo, setSetupInfo] = React.useState(null)
        const [setupPhase, setSetupPhase] = React.useState('idle')
        const [setupError, setSetupError] = React.useState(null)
        const [setupLogs, setSetupLogs] = React.useState([])
        const [setupSteps, setSetupSteps] = React.useState(null)
        const [setupResultMsg, setSetupResultMsg] = React.useState(null)
        const [setupPolling, setSetupPolling] = React.useState(false)
        const [setupExpanded, setSetupExpanded] = React.useState(true)
        const [aiReply, setAiReply] = React.useState(null)
        const [aiError, setAiError] = React.useState(null)
        const [personaDraft, setPersonaDraft] = React.useState(null)
        const [personaPreview, setPersonaPreview] = React.useState('')
        const [personaPath, setPersonaPath] = React.useState(null)
        const [personaPhase, setPersonaPhase] = React.useState('idle')
        const [personaError, setPersonaError] = React.useState(null)
        const [personaPreviewOpen, setPersonaPreviewOpen] = React.useState(true)
        const [aiSettingsDraft, setAiSettingsDraft] = React.useState(null)
        const [aiSettingsDefaults, setAiSettingsDefaults] = React.useState(null)
        const [aiSettingsPath, setAiSettingsPath] = React.useState(null)
        const [aiSettingsPhase, setAiSettingsPhase] = React.useState('idle')
        const [aiSettingsError, setAiSettingsError] = React.useState(null)
        const [profiles, setProfiles] = React.useState(null)
        const [profilesPhase, setProfilesPhase] = React.useState('idle')
        const [profilesError, setProfilesError] = React.useState(null)
        const [profilesSearch, setProfilesSearch] = React.useState('')
        const [profilesPath, setProfilesPath] = React.useState(null)
        const [selectedProfileKey, setSelectedProfileKey] = React.useState(null)
        const [profileDraft, setProfileDraft] = React.useState(null)
        const [personaPresets, setPersonaPresets] = React.useState(null)
        const [personaPresetsPhase, setPersonaPresetsPhase] = React.useState('idle')
        const [personaPresetsError, setPersonaPresetsError] = React.useState(null)
        const [personaPresetsPath, setPersonaPresetsPath] = React.useState(null)
        const [personaPresetName, setPersonaPresetName] = React.useState('')
        const [lastPromptState, setLastPromptState] = React.useState({ phase: 'idle', prompt: null, error: null })
        const [fullPromptOpen, setFullPromptOpen] = React.useState(true)

        // Refs keep the 2s pollers from capturing stale state and from overlapping.
        const tabRef = React.useRef(tab)
        const loggedInRef = React.useRef(false)
        const loginPollRef = React.useRef({ busy: false, loggedIn: false })
        const contactsBusyRef = React.useRef(false)
        const messagesPollRef = React.useRef(false)
        const busyRef = React.useRef({})
        const setupActionRef = React.useRef(false)
        tabRef.current = tab

        const busyOf = (key) => busy[key] === true
        const isLifecycleKey = (key) => key.startsWith('feature:lifecycle:') || /^(all|koishi|napcat)-(start|stop|restart)$/u.test(key)
        const lifecycleBusy = Object.keys(busy).some(isLifecycleKey)

        const loadStatus = async () => {
          try {
            const payload = await requestJson('/qqbot/status')
            const data = payload && payload.data
            if (data === null || typeof data !== 'object') throw new Error('unexpected payload')
            setSnapshot(data)
            setLoadError(null)
          } catch (error) {
            setLoadError(messageOf(error))
          } finally {
            setLoading(false)
          }
        }

        const loadContacts = async () => {
          if (contactsBusyRef.current) return
          contactsBusyRef.current = true
          setContactsPhase('loading')
          try {
            const payload = await requestJson('/qqbot/contacts', { acceptNotOk: true })
            const list = payload !== null && typeof payload === 'object' ? payload : {}
            setContacts({
              groups: Array.isArray(list.groups) ? list.groups : [],
              friends: Array.isArray(list.friends) ? list.friends : [],
              selfId: typeof list.selfId === 'string' ? list.selfId : null,
              fetchedAt: typeof list.fetchedAt === 'string' ? list.fetchedAt : null,
            })
            if (list.ok === true) {
              setContactsError(null)
            } else {
              setContactsError(typeof list.error === 'string' && list.error !== '' ? list.error : t('accessContactsFail'))
            }
            setContactsPhase('ready')
          } catch (error) {
            setContacts({ groups: [], friends: [], selfId: null, fetchedAt: null })
            setContactsError(messageOf(error))
            setContactsPhase('ready')
          } finally {
            contactsBusyRef.current = false
          }
        }

        const runPost = async (key, path, body, after, successText, extraOptions) => {
          if (busyRef.current[key] === true) return null
          if (isLifecycleKey(key) && Object.keys(busyRef.current).some(isLifecycleKey)) return null
          busyRef.current[key] = true
          setBusy((previous) => ({ ...previous, [key]: true }))
          setBanner(null)
          let result = null
          try {
            result = await requestJson(path, { method: 'POST', body: body || {}, ...(extraOptions || {}) })
            if (result !== null && result.ok === false) {
              setBanner({ kind: 'error', text: `${t('actionFailed')}: ${result.message || result.error || ''}` })
            } else {
              setBanner({ kind: 'ok', text: successText || t('actionDone') })
            }
            if (typeof after === 'function') await after()
          } catch (error) {
            setBanner({ kind: 'error', text: `${t('actionFailed')}: ${messageOf(error)}` })
          } finally {
            delete busyRef.current[key]
            setBusy((previous) => {
              const next = { ...previous }
              delete next[key]
              return next
            })
          }
          return result
        }

        return {
          tab, setTab, snapshot, setSnapshot, loading, setLoading,
          loadError, setLoadError, banner, setBanner, plugins, setPlugins,
          pluginsPhase, setPluginsPhase, pluginsError, setPluginsError, features, setFeatures,
          featuresPhase, setFeaturesPhase, featuresError, setFeaturesError, logLines, setLogLines,
          logsNote, setLogsNote, logsPhase, setLogsPhase, logsError, setLogsError,
          logSource, setLogSource, installSpec, setInstallSpec, restartAfter, setRestartAfter,
          busy, setBusy, pendingUninstall, setPendingUninstall, accessPhase, setAccessPhase,
          accessError, setAccessError, accessWarning, setAccessWarning, accessDraft, setAccessDraft,
          contacts, setContacts, contactsPhase, setContactsPhase, contactsError, setContactsError,
          accessQuery, setAccessQuery, loginInfo, setLoginInfo, loginError, setLoginError,
          qrTicket, setQrTicket, qrBroken, setQrBroken, messages, setMessages,
          messagesPhase, setMessagesPhase, messagesError, setMessagesError, messagesFilter, setMessagesFilter,
          messagesUpdatedAt, setMessagesUpdatedAt, setupInfo, setSetupInfo, setupPhase, setSetupPhase,
          setupError, setSetupError, setupLogs, setSetupLogs, setupSteps, setSetupSteps,
          setupResultMsg, setSetupResultMsg, setupPolling, setSetupPolling, setupExpanded, setSetupExpanded,
          aiReply, setAiReply, aiError, setAiError, personaDraft, setPersonaDraft,
          personaPreview, setPersonaPreview, personaPath, setPersonaPath, personaPhase, setPersonaPhase,
          personaError, setPersonaError, personaPreviewOpen, setPersonaPreviewOpen, aiSettingsDraft, setAiSettingsDraft,
          aiSettingsDefaults, setAiSettingsDefaults, aiSettingsPath, setAiSettingsPath, aiSettingsPhase, setAiSettingsPhase,
          aiSettingsError, setAiSettingsError, profiles, setProfiles, profilesPhase, setProfilesPhase,
          profilesError, setProfilesError, profilesSearch, setProfilesSearch, profilesPath, setProfilesPath,
          selectedProfileKey, setSelectedProfileKey, profileDraft, setProfileDraft, personaPresets, setPersonaPresets,
          personaPresetsPhase, setPersonaPresetsPhase, personaPresetsError, setPersonaPresetsError, personaPresetsPath, setPersonaPresetsPath,
          personaPresetName, setPersonaPresetName, lastPromptState, setLastPromptState, fullPromptOpen, setFullPromptOpen,
          tabRef, loggedInRef, loginPollRef, contactsBusyRef, messagesPollRef, setupActionRef,
          busyOf,
          lifecycleBusy,
          loadStatus,
          loadContacts,
          runPost,
        }
      }

      return { deriveStatus, useStore }
    },
    "client/runtime/styles.js": (__require) => {
      /**
       * Panel stylesheet: design tokens, layout, hover/focus states.
       * Kept as one module so the bundle still ships exactly one <style> element.
       */
      const CSS = `
      .qqbot-page { box-sizing: border-box; width: 100%; height: 100%; overflow-y: auto; overflow-x: hidden;
        max-width: 1120px; margin: 0 auto; padding: 24px 28px 64px; display: flex; flex-direction: column; gap: 16px;
        background: radial-gradient(80% 40% at 100% 0%, color-mix(in srgb, var(--dsw-alias-brand-primary) 7%, transparent), transparent 70%),
                    var(--dsw-alias-bg-base); }
      .qqbot-page *, .qqbot-page *::before, .qqbot-page *::after { box-sizing: border-box; }
      /* Keep sections at their natural height: a flex child with overflow hidden collapses. */
      .qqbot-page > * { flex: 0 0 auto; min-height: 0; }
      .qqbot-page button:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 2px; }

      .qqbot-hero { border: 0.5px solid color-mix(in srgb, var(--dsw-alias-brand-primary) 20%, var(--dsw-alias-border-l1));
        border-radius: 20px; padding: 22px 26px; display: flex; align-items: flex-start; justify-content: space-between; gap: 18px;
        background: radial-gradient(120% 160% at 100% 0%, color-mix(in srgb, var(--dsw-alias-brand-primary) 20%, transparent), transparent 60%),
                    var(--dsw-alias-bg-layer-1); }
      .qqbot-hero-main { min-width: 0; }
      .qqbot-hero-side { display: flex; flex-direction: column; align-items: flex-end; gap: 10px; flex: none; }
      .qqbot-platform-badge { display: inline-flex; align-items: center; gap: 5px; align-self: flex-end;
        font-size: 10.5px; line-height: 1.4; padding: 3px 10px; border-radius: 999px;
        border: 0.5px solid color-mix(in srgb, var(--dsw-alias-brand-primary) 35%, var(--dsw-alias-border-l1));
        color: var(--dsw-alias-label-secondary);
        background: color-mix(in srgb, var(--dsw-alias-brand-primary) 8%, var(--dsw-alias-bg-layer-1));
        font-variant-numeric: tabular-nums; }
      .qqbot-eyebrow { display: inline-flex; align-items: center; gap: 7px; font-size: 10.5px; letter-spacing: 0.12em;
        text-transform: uppercase; color: var(--dsw-alias-brand-primary); font-weight: 500; }
      .qqbot-eyebrow-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--dsw-alias-brand-primary);
        box-shadow: 0 0 0 4px color-mix(in srgb, var(--dsw-alias-brand-primary) 22%, transparent); }
      .qqbot-title { margin: 8px 0 0; font-size: 25px; line-height: 1.16; font-weight: 500; letter-spacing: -0.015em;
        color: var(--dsw-alias-label-primary); }
      .qqbot-sub { margin: 8px 0 0; font-size: 12.5px; line-height: 1.55; color: var(--dsw-alias-label-secondary); max-width: 64ch; }

      .qqbot-pills { display: flex; flex-wrap: wrap; gap: 7px; justify-content: flex-end; }
      .qqbot-pill { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; padding: 4px 10px;
        border-radius: 999px; border: 0.5px solid var(--dsw-alias-border-l1); color: var(--dsw-alias-label-secondary);
        white-space: nowrap; }
      .qqbot-pill-dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
      .qqbot-pill-label { opacity: .8; }
      .qqbot-pill-ok { color: var(--dsw-alias-state-success-primary);
        border-color: color-mix(in srgb, var(--dsw-alias-state-success-primary) 40%, var(--dsw-alias-border-l1)); }
      .qqbot-pill-warn { color: var(--dsw-alias-state-warn-primary);
        border-color: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 40%, var(--dsw-alias-border-l1)); }
      .qqbot-pill-bad { color: var(--dsw-alias-state-error-primary);
        border-color: color-mix(in srgb, var(--dsw-alias-state-error-primary) 40%, var(--dsw-alias-border-l1)); }

      .qqbot-btn { appearance: none; border: 0.5px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1);
        color: var(--dsw-alias-label-primary); font: inherit; font-size: 12px; padding: 7px 13px; border-radius: 10px;
        cursor: pointer; white-space: nowrap; transition: transform .15s ease, border-color .15s ease, background .15s ease; }
      .qqbot-btn:hover:not(:disabled) { transform: translateY(-1px); border-color: var(--dsw-alias-brand-primary); }
      .qqbot-btn:disabled { opacity: .55; cursor: default; }
      .qqbot-btn-primary { border-color: transparent; background: var(--dsw-alias-brand-primary);
        color: var(--dsw-alias-label-primary-inverted, #fff); font-weight: 500; }
      .qqbot-btn-danger { border-color: color-mix(in srgb, var(--dsw-alias-state-error-primary) 45%, var(--dsw-alias-border-l1));
        color: var(--dsw-alias-state-error-primary);
        background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 10%, var(--dsw-alias-bg-layer-1)); }
      .qqbot-btns { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }

      .qqbot-banner { border-radius: 12px; padding: 9px 14px; font-size: 12px; line-height: 1.5;
        border: 0.5px solid var(--dsw-alias-border-l1); }
      .qqbot-banner-error { color: var(--dsw-alias-state-error-primary);
        border-color: color-mix(in srgb, var(--dsw-alias-state-error-primary) 40%, var(--dsw-alias-border-l1));
        background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 9%, var(--dsw-alias-bg-layer-1)); }
      .qqbot-banner-ok { color: var(--dsw-alias-state-success-primary);
        border-color: color-mix(in srgb, var(--dsw-alias-state-success-primary) 40%, var(--dsw-alias-border-l1));
        background: color-mix(in srgb, var(--dsw-alias-state-success-primary) 9%, var(--dsw-alias-bg-layer-1)); }
      .qqbot-warn { margin: 0; font-size: 11.5px; color: var(--dsw-alias-state-warn-primary); }
      .qqbot-error { margin: 0; font-size: 11.5px; color: var(--dsw-alias-state-error-primary); line-height: 1.5; }
      .qqbot-hint { margin: 0; font-size: 11.5px; line-height: 1.55; color: var(--dsw-alias-label-tertiary); }
      .qqbot-empty { border: 0.5px dashed var(--dsw-alias-border-l1); border-radius: 14px; padding: 22px;
        text-align: center; font-size: 12.5px; color: var(--dsw-alias-label-secondary);
        background: var(--dsw-alias-bg-layer-1); display: flex; flex-direction: column; align-items: center; gap: 10px; }

      .qqbot-tabs { display: inline-flex; gap: 2px; padding: 3px; border-radius: 12px; align-self: flex-start;
        border: 0.5px solid var(--dsw-alias-border-l1);
        background: color-mix(in srgb, var(--dsw-alias-bg-layer-1) 80%, transparent); }
      .qqbot-tab { appearance: none; border: none; background: transparent; color: var(--dsw-alias-label-secondary);
        font: inherit; font-size: 12px; padding: 6px 14px; border-radius: 9px; cursor: pointer; transition: all .15s ease; }
      .qqbot-tab:hover { color: var(--dsw-alias-label-primary); }
      .qqbot-tab.active { background: var(--dsw-alias-brand-primary); color: var(--dsw-alias-label-primary-inverted, #fff);
        font-weight: 500; }

      .qqbot-body { display: flex; flex-direction: column; gap: 14px; min-height: 0; }
      .qqbot-stack { display: flex; flex-direction: column; gap: 14px; }
      .qqbot-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
      .qqbot-card { border: 0.5px solid var(--dsw-alias-border-l1); border-radius: 16px; background: var(--dsw-alias-bg-layer-1);
        padding: 16px 18px; display: flex; flex-direction: column; gap: 12px; min-width: 0; }
      .qqbot-card-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
      .qqbot-card-title { margin: 0; font-size: 13.5px; font-weight: 500; color: var(--dsw-alias-label-primary); }
      .qqbot-card-sub { font-size: 11px; color: var(--dsw-alias-label-tertiary); }
      .qqbot-feature-head { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
      .qqbot-rows { display: flex; flex-direction: column; gap: 7px; }
      .qqbot-row-item { display: flex; align-items: baseline; justify-content: space-between; gap: 14px; font-size: 11.5px; }
      .qqbot-row-label { color: var(--dsw-alias-label-tertiary); flex: none; }
      .qqbot-row-value { color: var(--dsw-alias-label-primary); text-align: right; min-width: 0; overflow-wrap: anywhere; }
      .qqbot-row-value.is-ok { color: var(--dsw-alias-state-success-primary); }
      .qqbot-row-value.is-warn { color: var(--dsw-alias-state-warn-primary); }
      .qqbot-row-value.is-bad { color: var(--dsw-alias-state-error-primary); }
      .qqbot-actions-row { display: flex; flex-wrap: wrap; gap: 7px; align-items: center; }
      .qqbot-mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 11px;
        word-break: break-all; }

      .qqbot-toolbar { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; justify-content: space-between; }
      .qqbot-toolbar-left, .qqbot-toolbar-right { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
      .qqbot-seg { display: inline-flex; gap: 2px; padding: 2px; border-radius: 10px;
        border: 0.5px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1); }
      .qqbot-seg-btn { appearance: none; border: none; background: transparent; color: var(--dsw-alias-label-secondary);
        font: inherit; font-size: 11.5px; padding: 5px 11px; border-radius: 8px; cursor: pointer; }
      .qqbot-seg-btn.active { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); font-weight: 500; }
      .qqbot-check { display: inline-flex; align-items: center; gap: 6px; font-size: 11.5px;
        color: var(--dsw-alias-label-secondary); cursor: pointer; }
      .qqbot-check input { accent-color: var(--dsw-alias-brand-primary); }

      .qqbot-input { flex: 1 1 260px; min-width: 200px; font: inherit; font-size: 12px;
        color: var(--dsw-alias-label-primary); background: var(--dsw-alias-bg-layer-2);
        border: 0.5px solid var(--dsw-alias-border-l1); border-radius: 9px; padding: 7px 10px; }
      .qqbot-input:focus { outline: none; border-color: var(--dsw-alias-brand-primary); }

      .qqbot-table { width: 100%; border-collapse: collapse; font-size: 12px; }
      .qqbot-table th { text-align: left; font-weight: 500; font-size: 11px; color: var(--dsw-alias-label-tertiary);
        padding: 6px 10px; border-bottom: 0.5px solid var(--dsw-alias-border-l1); }
      .qqbot-table td { padding: 8px 10px; border-bottom: 0.5px solid var(--dsw-alias-border-l1);
        color: var(--dsw-alias-label-secondary); vertical-align: middle; }
      .qqbot-table tr:last-child td { border-bottom: none; }
      .qqbot-table tbody tr:hover { background: color-mix(in srgb, var(--dsw-alias-brand-primary) 5%, transparent); }
      .qqbot-plugin-name { color: var(--dsw-alias-label-primary); font-weight: 500; margin-right: 6px; }
      .qqbot-plugin-package { display: block; color: var(--dsw-alias-label-tertiary); margin-top: 2px; }
      .qqbot-badge { font-size: 10px; padding: 1px 6px; border-radius: 999px;
        border: 0.5px solid var(--dsw-alias-border-l1); color: var(--dsw-alias-label-tertiary); white-space: nowrap; }
      .qqbot-switch { appearance: none; display: inline-flex; align-items: center; gap: 6px; font: inherit; font-size: 11px;
        padding: 3px 9px; border-radius: 999px; border: 0.5px solid var(--dsw-alias-border-l1);
        background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-secondary); cursor: pointer; white-space: nowrap; }
      .qqbot-switch[aria-checked="true"] { color: var(--dsw-alias-state-success-primary);
        border-color: color-mix(in srgb, var(--dsw-alias-state-success-primary) 40%, var(--dsw-alias-border-l1));
        background: color-mix(in srgb, var(--dsw-alias-state-success-primary) 10%, var(--dsw-alias-bg-layer-2)); }
      .qqbot-switch:disabled { opacity: .55; cursor: default; }
      .qqbot-switch-dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
      .qqbot-feature-status { display: flex; flex-direction: column; gap: 5px;
        border-top: 0.5px dashed var(--dsw-alias-border-l1); padding-top: 9px; }
      .qqbot-note { margin: 0; font-size: 11.5px; color: var(--dsw-alias-label-tertiary); line-height: 1.6;
        padding: 12px 14px; border-radius: 12px; border: 0.5px dashed var(--dsw-alias-border-l1);
        background: color-mix(in srgb, var(--dsw-alias-bg-layer-1) 70%, transparent); }

      .qqbot-pre { margin: 0; padding: 14px 16px; border-radius: 12px;
        border: 0.5px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-2);
        color: var(--dsw-alias-label-primary);
        font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        font-size: 11.5px; line-height: 1.6; white-space: pre-wrap; word-break: break-word;
        max-height: 480px; overflow: auto; }
      .qqbot-foot { display: flex; flex-wrap: wrap; gap: 14px; font-size: 11px; color: var(--dsw-alias-label-tertiary); }

      .qqbot-form { display: flex; flex-direction: column; gap: 12px; }
      .qqbot-field { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
      .qqbot-field-label { font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase;
        color: var(--dsw-alias-label-tertiary); }
      .qqbot-field .qqbot-input, .qqbot-field .qqbot-select, .qqbot-field .qqbot-area {
        width: 100%; flex: 0 0 auto; box-sizing: border-box; }
      .qqbot-select { font: inherit; font-size: 12px; color: var(--dsw-alias-label-primary);
        background: var(--dsw-alias-bg-layer-2); border: 0.5px solid var(--dsw-alias-border-l1);
        border-radius: 9px; padding: 7px 9px; }
      .qqbot-select:focus, .qqbot-area:focus { outline: none; border-color: var(--dsw-alias-brand-primary); }
      .qqbot-area { font: inherit; font-size: 12px; line-height: 1.55; color: var(--dsw-alias-label-primary);
        background: var(--dsw-alias-bg-layer-2); border: 0.5px solid var(--dsw-alias-border-l1);
        border-radius: 9px; padding: 8px 10px; min-height: 76px; resize: vertical; }
      .qqbot-chips { display: flex; flex-wrap: wrap; gap: 5px; }
      .qqbot-chip { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 11px;
        padding: 2px 8px; border-radius: 999px; border: 0.5px solid var(--dsw-alias-border-l1);
        color: var(--dsw-alias-label-secondary); background: var(--dsw-alias-bg-layer-2); }
      .qqbot-check-block { align-items: flex-start; }

      .qqbot-access-section { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
      .qqbot-access-section-head { display: flex; flex-wrap: wrap; gap: 10px; align-items: flex-end;
        justify-content: space-between; }
      .qqbot-access-section-head .qqbot-field { flex: 0 1 220px; }
      .qqbot-access-tools { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
      .qqbot-access-tools .qqbot-input { flex: 1 1 220px; min-width: 160px; }
      .qqbot-contact-list { display: flex; flex-direction: column; gap: 2px;
        border: 0.5px solid var(--dsw-alias-border-l1); border-radius: 12px; padding: 5px;
        background: var(--dsw-alias-bg-base); max-height: 260px; overflow: auto; }
      .qqbot-contact-row { display: flex; align-items: center; gap: 8px; padding: 5px 8px;
        border-radius: 8px; font-size: 11.5px; color: var(--dsw-alias-label-secondary); cursor: pointer; }
      .qqbot-contact-row:hover { background: color-mix(in srgb, var(--dsw-alias-brand-primary) 6%, transparent); }
      .qqbot-contact-row input[type="checkbox"] { accent-color: var(--dsw-alias-brand-primary); flex: none; }
      .qqbot-contact-row input[type="checkbox"]:disabled { opacity: .45; }
      .qqbot-contact-row:has(input:disabled) { cursor: default; opacity: .7; }
      .qqbot-contact-name { color: var(--dsw-alias-label-primary); min-width: 0; overflow: hidden;
        text-overflow: ellipsis; white-space: nowrap; }
      .qqbot-contact-id { color: var(--dsw-alias-label-tertiary); flex: none; }
      .qqbot-contact-meta { color: var(--dsw-alias-label-tertiary); flex: none; font-size: 10.5px; }
      .qqbot-contact-extra { background: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 6%, transparent);
        cursor: default; }
      .qqbot-contact-extra .qqbot-contact-id { margin-right: auto; }
      .qqbot-contact-empty { padding: 14px; text-align: center; font-size: 11.5px;
        color: var(--dsw-alias-label-tertiary); }
      .qqbot-badge-warn { color: var(--dsw-alias-state-warn-primary);
        border-color: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 40%, var(--dsw-alias-border-l1)); }

      .qqbot-login-card { align-items: stretch; }
      .qqbot-login-qr-wrap { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 4px 0; }
      /* A QR code needs a light quiet zone to stay scannable in dark mode. */
      .qqbot-login-qr { display: block; width: 240px; height: 240px; border-radius: 12px; padding: 8px;
        background: #fff; border: 0.5px solid var(--dsw-alias-border-l1); object-fit: contain; }
      .qqbot-login-qr-missing { display: flex; flex-direction: column; align-items: center; gap: 8px;
        width: 240px; padding: 18px; border: 0.5px dashed var(--dsw-alias-border-l1); border-radius: 12px; }
      .qqbot-login-empty { width: 240px; max-width: 100%; align-self: center; }

      .qqbot-message-list { display: flex; flex-direction: column; gap: 6px; max-height: 540px; overflow-y: auto; }
      .qqbot-message-row { display: flex; flex-direction: column; gap: 4px; padding: 8px 10px;
        border: 0.5px solid var(--dsw-alias-border-l1); border-radius: 10px;
        background: var(--dsw-alias-bg-base); min-width: 0; }
      .qqbot-message-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 8px;
        font-size: 10.5px; color: var(--dsw-alias-label-tertiary); }
      .qqbot-message-direction { display: inline-flex; align-items: center; padding: 1px 7px;
        border-radius: 999px; font-size: 10px; border: 0.5px solid transparent; }
      .qqbot-message-in { color: var(--dsw-alias-state-success-primary);
        background: color-mix(in srgb, var(--dsw-alias-state-success-primary) 12%, transparent); }
      .qqbot-message-out { color: var(--dsw-alias-brand-primary);
        background: color-mix(in srgb, var(--dsw-alias-brand-primary) 12%, transparent); }
      .qqbot-message-time { font-variant-numeric: tabular-nums; }
      .qqbot-message-source { color: var(--dsw-alias-label-secondary); font-weight: 500; }
      .qqbot-message-sender { color: var(--dsw-alias-label-secondary); }
      .qqbot-message-content { font-size: 12px; line-height: 1.6; color: var(--dsw-alias-label-primary);
        white-space: pre-wrap; overflow-wrap: anywhere; }

      .qqbot-setup-summary { display: flex; flex-wrap: wrap; gap: 6px 16px; font-size: 11.5px; line-height: 1.5; }
      .qqbot-setup-item { display: inline-flex; align-items: baseline; gap: 5px; min-width: 0; }
      .qqbot-setup-label { color: var(--dsw-alias-label-tertiary); flex: none; }
      .qqbot-setup-value { color: var(--dsw-alias-label-primary); overflow-wrap: anywhere; }
      .qqbot-setup-logs { max-height: 220px; font-size: 11px; }
      .qqbot-setup-steps { display: flex; flex-direction: column; gap: 4px; }
      .qqbot-setup-step { display: flex; align-items: baseline; gap: 8px; font-size: 11.5px; line-height: 1.5; }
      .qqbot-setup-step-icon { flex: none; width: 14px; text-align: center; font-weight: 500; }
      .qqbot-setup-step.is-ok .qqbot-setup-step-icon { color: var(--dsw-alias-state-success-primary); }
      .qqbot-setup-step.is-bad .qqbot-setup-step-icon { color: var(--dsw-alias-state-error-primary); }
      .qqbot-setup-step.is-skip .qqbot-setup-step-icon { color: var(--dsw-alias-label-tertiary); }
      .qqbot-setup-step-name { flex: none; color: var(--dsw-alias-label-primary); }
      .qqbot-setup-step-message { color: var(--dsw-alias-label-tertiary); min-width: 0; overflow-wrap: anywhere; }

      .qqbot-ai-status { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
      .qqbot-ai-state { font-size: 12px; font-weight: 500; }
      .qqbot-ai-state.is-ok { color: var(--dsw-alias-state-success-primary); }
      .qqbot-ai-state.is-bad { color: var(--dsw-alias-state-warn-primary); }
      .qqbot-ai-reply-wrap { display: flex; flex-direction: column; gap: 6px; }
      .qqbot-ai-reply { max-height: 220px; }

      .qqbot-persona-examples { display: flex; flex-direction: column; gap: 8px; }
      .qqbot-persona-example { display: flex; flex-direction: column; gap: 8px; padding: 10px 12px;
        border: 0.5px solid var(--dsw-alias-border-l1); border-radius: 12px;
        background: color-mix(in srgb, var(--dsw-alias-bg-layer-1) 70%, transparent); }
      .qqbot-persona-example-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
      .qqbot-persona-example-head .qqbot-btn { font-size: 11px; padding: 3px 9px; }
      .qqbot-persona-area { min-height: 60px; }
      .qqbot-persona-preview-wrap { display: flex; flex-direction: column; gap: 6px; }
      .qqbot-persona-preview-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
      .qqbot-persona-preview { max-height: 240px; }

      .qqbot-ai-settings-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
      .qqbot-profiles-layout { display: grid; grid-template-columns: minmax(0, 300px) minmax(0, 1fr); gap: 14px; align-items: start; }
      .qqbot-profile-list { display: flex; flex-direction: column; gap: 6px; max-height: 420px; overflow-y: auto; }
      .qqbot-profile-item { appearance: none; font: inherit; text-align: left; display: flex; flex-direction: column; gap: 3px;
        padding: 8px 10px; border-radius: 10px; border: 0.5px solid var(--dsw-alias-border-l1);
        background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); cursor: pointer; min-width: 0; }
      .qqbot-profile-item:hover { border-color: color-mix(in srgb, var(--dsw-alias-brand-primary) 45%, var(--dsw-alias-border-l1)); }
      .qqbot-profile-item[data-active="true"] { border-color: var(--dsw-alias-brand-primary);
        background: color-mix(in srgb, var(--dsw-alias-brand-primary) 8%, var(--dsw-alias-bg-base)); }
      .qqbot-profile-item-top { display: flex; align-items: baseline; gap: 8px; justify-content: space-between; min-width: 0; }
      .qqbot-profile-name { font-size: 12.5px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .qqbot-profile-meta { display: flex; flex-wrap: wrap; gap: 8px; font-size: 10.5px; color: var(--dsw-alias-label-tertiary); }
      .qqbot-profile-summary { font-size: 11px; color: var(--dsw-alias-label-tertiary); overflow: hidden;
        text-overflow: ellipsis; white-space: nowrap; }
      .qqbot-profile-editor { display: flex; flex-direction: column; gap: 10px; min-width: 0; }

      .qqbot-persona-presets { display: flex; flex-direction: column; gap: 8px; border-top: 0.5px dashed var(--dsw-alias-border-l1);
        padding-top: 10px; margin-top: 2px; }
      .qqbot-persona-presets-bar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
      .qqbot-persona-presets-bar .qqbot-input { flex: 1 1 220px; }
      .qqbot-persona-preset-list { display: flex; flex-direction: column; gap: 6px; }
      .qqbot-persona-preset-row { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between;
        gap: 10px; padding: 7px 10px; border: 0.5px solid var(--dsw-alias-border-l1); border-radius: 10px;
        background: var(--dsw-alias-bg-base); }
      .qqbot-persona-preset-main { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
      .qqbot-persona-preset-name { font-size: 12px; font-weight: 500; color: var(--dsw-alias-label-primary);
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .qqbot-persona-preset-role { font-size: 10.5px; color: var(--dsw-alias-label-tertiary);
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .qqbot-persona-preset-row .qqbot-btns { flex: none; }

      .qqbot-full-prompt-meta { display: flex; flex-wrap: wrap; gap: 6px 14px; font-size: 11.5px;
        color: var(--dsw-alias-label-secondary); }
      .qqbot-full-prompt-meta span { color: var(--dsw-alias-label-secondary); }
      .qqbot-full-prompt-system { max-height: 360px; min-height: 60px; }
      .qqbot-full-prompt-messages { display: flex; flex-direction: column; gap: 6px; }
      .qqbot-full-prompt-message { border: 0.5px solid var(--dsw-alias-border-l1); border-radius: 10px;
        padding: 8px 10px; background: var(--dsw-alias-bg-base); }
      .qqbot-full-prompt-message-head { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
      .qqbot-full-prompt-message-text { font-size: 12px; line-height: 1.6; white-space: pre-wrap;
        overflow-wrap: anywhere; color: var(--dsw-alias-label-primary); }

      @media (max-width: 860px) {
        .qqbot-ai-settings-grid { grid-template-columns: minmax(0, 1fr); }
        .qqbot-profiles-layout { grid-template-columns: minmax(0, 1fr); }
        .qqbot-grid { grid-template-columns: minmax(0, 1fr); }
        .qqbot-hero { flex-direction: column; }
        .qqbot-hero-side { align-items: flex-start; }
        .qqbot-pills { justify-content: flex-start; }
      }
      @media (max-width: 620px) {
        .qqbot-page { padding: 16px 14px 44px; }
        .qqbot-title { font-size: 21px; }
      }

      /* ── Group AI dashboard ───────────────────────────────────────────── */
      .qqbot-ai-dashboard { display: flex; flex-direction: column; gap: 14px; }
      .qqbot-ai-hero { display: flex; justify-content: space-between; align-items: flex-start; gap: 18px; padding: 4px 2px 2px; }
      .qqbot-ai-eyebrow, .qqbot-ai-card-kicker { color: var(--dsw-alias-brand-primary); font-size: 10px; font-weight: 700; letter-spacing: .14em; }
      .qqbot-ai-hero h1 { margin: 5px 0 4px; font-size: 27px; line-height: 1.15; letter-spacing: -.03em; color: var(--dsw-alias-label-primary); }
      .qqbot-ai-hero p { margin: 0; color: var(--dsw-alias-label-secondary); font-size: 12.5px; }
      .qqbot-ai-hero-actions { display: flex; align-items: center; gap: 9px; flex-wrap: wrap; justify-content: flex-end; }
      .qqbot-ai-btn { border: .5px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); border-radius: 9px; padding: 7px 11px; font-size: 11.5px; cursor: pointer; }
      .qqbot-ai-btn:hover { border-color: var(--dsw-alias-brand-primary); color: var(--dsw-alias-brand-primary); }
      .qqbot-ai-btn-primary { background: var(--dsw-alias-brand-primary); color: #fff; border-color: transparent; }
      .qqbot-ai-btn-primary:hover { color: #fff; opacity: .9; }
      .qqbot-ai-pill { display: inline-flex; align-items: center; gap: 5px; border: .5px solid var(--dsw-alias-border-l1); border-radius: 999px; padding: 4px 8px; font-size: 10.5px; color: var(--dsw-alias-label-secondary); white-space: nowrap; }
      .qqbot-ai-pill-ok { color: var(--dsw-alias-state-success-primary); border-color: color-mix(in srgb, var(--dsw-alias-state-success-primary) 40%, var(--dsw-alias-border-l1)); }
      .qqbot-ai-pill-run { color: var(--dsw-alias-brand-primary); border-color: color-mix(in srgb, var(--dsw-alias-brand-primary) 40%, var(--dsw-alias-border-l1)); }
      .qqbot-ai-pill-violet { color: #7c3aed; border-color: #c4b5fd; }
      .qqbot-ai-dot { width: 5px; height: 5px; border-radius: 999px; background: currentColor; }
      .qqbot-ai-metrics { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
      .qqbot-ai-metric { display: flex; flex-direction: column; gap: 3px; padding: 13px 14px; border: .5px solid var(--dsw-alias-border-l1); border-radius: 14px; background: var(--dsw-alias-bg-layer-1); position: relative; overflow: hidden; }
      .qqbot-ai-metric::after { content: ''; position: absolute; right: -18px; bottom: -22px; width: 62px; height: 62px; border-radius: 50%; background: color-mix(in srgb, var(--dsw-alias-brand-primary) 8%, transparent); }
      .qqbot-ai-metric-label { color: var(--dsw-alias-label-tertiary); font-size: 10.5px; }
      .qqbot-ai-metric-value { color: var(--dsw-alias-label-primary); font-size: 25px; line-height: 1.1; letter-spacing: -.04em; }
      .qqbot-ai-metric-hint { color: var(--dsw-alias-label-tertiary); font-size: 10px; }
      .qqbot-ai-card { border: .5px solid var(--dsw-alias-border-l1); border-radius: 16px; background: var(--dsw-alias-bg-layer-1); padding: 15px 16px; box-shadow: 0 8px 24px rgba(15,23,42,.035); }
      .qqbot-ai-card-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; margin-bottom: 11px; }
      .qqbot-ai-card-head h2 { margin: 3px 0 0; font-size: 14px; color: var(--dsw-alias-label-primary); }
      .qqbot-ai-card-sub { color: var(--dsw-alias-label-tertiary); font-size: 10.5px; }
      .qqbot-ai-main-grid { display: grid; grid-template-columns: minmax(0, 1.55fr) minmax(260px, .85fr); gap: 14px; }
      .qqbot-ai-lower-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 14px; }
      .qqbot-ai-machine { display: flex; align-items: flex-start; gap: 5px; flex-wrap: wrap; padding: 9px 0 5px; }
      .qqbot-ai-machine-node { display: flex; flex-direction: column; align-items: center; gap: 5px; min-width: 92px; padding: 8px 7px; border-radius: 10px; border: .5px dashed var(--dsw-alias-border-l1); color: var(--dsw-alias-label-tertiary); font-size: 9.5px; letter-spacing: .04em; }
      .qqbot-ai-machine-node.is-reached { border-style: solid; border-color: color-mix(in srgb, var(--dsw-alias-brand-primary) 45%, var(--dsw-alias-border-l1)); color: var(--dsw-alias-brand-primary); background: color-mix(in srgb, var(--dsw-alias-brand-primary) 6%, transparent); }
      .qqbot-ai-machine-node.is-active { box-shadow: 0 0 0 2px color-mix(in srgb, var(--dsw-alias-brand-primary) 15%, transparent); }
      .qqbot-ai-machine-index { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 9px; opacity: .65; }
      .qqbot-ai-machine-caption { color: var(--dsw-alias-label-tertiary); font-size: 10px; margin-left: auto; align-self: center; }
      .qqbot-ai-active-group { display: flex; flex-direction: column; gap: 7px; margin-top: 8px; padding: 10px 11px; border-radius: 10px; background: var(--dsw-alias-bg-base); border: .5px solid var(--dsw-alias-border-l1); }
      .qqbot-ai-active-title { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
      .qqbot-ai-active-title strong { font-size: 12px; color: var(--dsw-alias-label-primary); }
      .qqbot-ai-active-title span { font-size: 10px; color: var(--dsw-alias-label-tertiary); }
      .qqbot-ai-active-queue { display: flex; gap: 10px; flex-wrap: wrap; color: var(--dsw-alias-label-tertiary); font-size: 9.5px; }
      .qqbot-ai-identity { margin: 0 0 12px; color: var(--dsw-alias-label-secondary); font-size: 11.5px; line-height: 1.6; }
      .qqbot-ai-voice { margin: 9px 0 0; color: var(--dsw-alias-label-tertiary); font-size: 10px; }
      .qqbot-ai-emotions { display: flex; flex-direction: column; gap: 7px; }
      .qqbot-ai-emotion-row { display: flex; flex-direction: column; gap: 3px; }
      .qqbot-ai-emotion-head { display: flex; justify-content: space-between; font-size: 10px; color: var(--dsw-alias-label-secondary); }
      .qqbot-ai-meter { height: 5px; border-radius: 999px; overflow: hidden; background: color-mix(in srgb, var(--dsw-alias-label-tertiary) 16%, transparent); }
      .qqbot-ai-meter-fill { display: block; height: 100%; border-radius: inherit; background: var(--dsw-alias-brand-primary); }
      .qqbot-ai-meter-fill.is-rose { background: #f43f5e; }.qqbot-ai-meter-fill.is-amber { background: #f59e0b; }.qqbot-ai-meter-fill.is-violet { background: #8b5cf6; }
      .qqbot-ai-groups { display: flex; flex-direction: column; gap: 6px; }
      .qqbot-ai-group-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; width: 100%; text-align: left; padding: 9px 10px; border-radius: 10px; border: .5px solid transparent; background: transparent; color: inherit; cursor: pointer; }
      .qqbot-ai-group-row:hover, .qqbot-ai-group-row.is-selected { border-color: var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-base); }
      .qqbot-ai-group-main { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
      .qqbot-ai-group-title { display: flex; align-items: center; gap: 7px; }
      .qqbot-ai-group-id { color: var(--dsw-alias-label-primary); font-size: 11.5px; font-weight: 600; }
      .qqbot-ai-group-meta { display: flex; gap: 9px; flex-wrap: wrap; color: var(--dsw-alias-label-tertiary); font-size: 9.5px; }
      .qqbot-ai-group-arrow, .qqbot-ai-loop-arrow { color: var(--dsw-alias-label-tertiary); font-size: 18px; line-height: 1; }
      .qqbot-ai-tabs { display: inline-flex; gap: 3px; padding: 2px; border-radius: 7px; background: var(--dsw-alias-bg-base); }
      .qqbot-ai-tab { border: 0; background: transparent; border-radius: 5px; padding: 4px 7px; font-size: 9.5px; color: var(--dsw-alias-label-tertiary); cursor: pointer; }
      .qqbot-ai-tab.is-active { background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); box-shadow: 0 1px 3px rgba(15,23,42,.08); }
      .qqbot-ai-loops { display: flex; flex-direction: column; gap: 6px; }
      .qqbot-ai-loop { border: .5px solid var(--dsw-alias-border-l1); border-radius: 10px; overflow: hidden; }
      .qqbot-ai-loop-head { display: flex; align-items: center; gap: 8px; width: 100%; text-align: left; border: 0; background: transparent; padding: 8px 9px; color: inherit; cursor: pointer; }
      .qqbot-ai-loop-head:hover { background: var(--dsw-alias-bg-base); }
      .qqbot-ai-loop-icon { display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px; border-radius: 6px; background: color-mix(in srgb, var(--dsw-alias-brand-primary) 10%, transparent); color: var(--dsw-alias-brand-primary); font-size: 11px; flex: none; }
      .qqbot-ai-loop-icon.is-idle { color: var(--dsw-alias-label-tertiary); background: color-mix(in srgb, var(--dsw-alias-label-tertiary) 9%, transparent); }
      .qqbot-ai-loop-main { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
      .qqbot-ai-loop-main strong { color: var(--dsw-alias-label-primary); font-size: 10.5px; }
      .qqbot-ai-loop-main span { color: var(--dsw-alias-label-tertiary); font-size: 9px; }
      .qqbot-ai-loop-state { font-size: 9px; color: var(--dsw-alias-label-tertiary); white-space: nowrap; }
      .qqbot-ai-loop-state.is-sent { color: var(--dsw-alias-state-success-primary); }
      .qqbot-ai-loop-detail { padding: 0 10px 10px 38px; display: flex; flex-direction: column; gap: 6px; }
      .qqbot-ai-loop-reply { font-size: 11px; color: var(--dsw-alias-label-secondary); line-height: 1.5; white-space: pre-wrap; }
      .qqbot-ai-loop-meta { display: flex; gap: 9px; flex-wrap: wrap; color: var(--dsw-alias-label-tertiary); font-size: 9px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
      .qqbot-ai-memories { display: flex; flex-direction: column; gap: 7px; }
      .qqbot-ai-memory { display: flex; gap: 8px; align-items: flex-start; }
      .qqbot-ai-memory-dot { width: 6px; height: 6px; border-radius: 999px; background: var(--dsw-alias-brand-primary); margin-top: 6px; flex: none; }
      .qqbot-ai-memory-dot.is-high { background: #f59e0b; }.qqbot-ai-memory-dot.is-low { background: var(--dsw-alias-label-tertiary); }
      .qqbot-ai-memory p { margin: 0; color: var(--dsw-alias-label-secondary); font-size: 10.5px; line-height: 1.5; }
      .qqbot-ai-memory span { color: var(--dsw-alias-label-tertiary); font-size: 9px; }
      .qqbot-ai-empty-line { color: var(--dsw-alias-label-tertiary); font-size: 11px; margin: 4px 0; }
      .qqbot-ai-footer { display: flex; justify-content: space-between; gap: 10px; flex-wrap: wrap; color: var(--dsw-alias-label-tertiary); font-size: 9.5px; padding: 0 2px; }
      .qqbot-ai-skeleton, .qqbot-ai-error-card { min-height: 150px; display: flex; align-items: center; justify-content: center; color: var(--dsw-alias-label-tertiary); font-size: 12px; }
      .qqbot-ai-error-card { flex-direction: column; gap: 8px; }
      .qqbot-ai-error-card h2 { margin: 0; color: var(--dsw-alias-label-primary); font-size: 16px; }
      @media (max-width: 900px) { .qqbot-ai-metrics { grid-template-columns: repeat(2, 1fr); } .qqbot-ai-main-grid, .qqbot-ai-lower-grid { grid-template-columns: 1fr; } }
      @media (max-width: 640px) { .qqbot-ai-hero { flex-direction: column; } .qqbot-ai-hero-actions { justify-content: flex-start; } .qqbot-ai-metrics { grid-template-columns: 1fr 1fr; } .qqbot-ai-machine-node { min-width: 76px; } }
      .qqbot-ai-card-actions { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; justify-content: flex-end; }
      .qqbot-ai-btn-back { padding: 4px 8px; font-size: 10px; }
      .qqbot-ai-group-name-wrap { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
      .qqbot-ai-group-name { color: var(--dsw-alias-label-primary); font-size: 12px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .qqbot-ai-group-id { color: var(--dsw-alias-label-tertiary); font-size: 9px; font-weight: 400; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
      .qqbot-ai-profile-block { margin-top: 12px; border-top: .5px solid var(--dsw-alias-border-l1); padding-top: 10px; display: flex; flex-direction: column; gap: 7px; }
      .qqbot-ai-profile-head { display: flex; justify-content: space-between; gap: 8px; color: var(--dsw-alias-label-tertiary); font-size: 9.5px; }
      .qqbot-ai-profile { display: flex; flex-direction: column; gap: 3px; padding: 7px 8px; border-radius: 8px; background: var(--dsw-alias-bg-base); }
      .qqbot-ai-profile-name { display: flex; justify-content: space-between; gap: 8px; align-items: baseline; }
      .qqbot-ai-profile-name strong { color: var(--dsw-alias-label-primary); font-size: 10.5px; } .qqbot-ai-profile-name span { color: var(--dsw-alias-label-tertiary); font-size: 8.5px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
      .qqbot-ai-profile p { margin: 0; color: var(--dsw-alias-label-secondary); font-size: 9.5px; line-height: 1.45; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
      .qqbot-ai-profile-tags { display: flex; gap: 4px; flex-wrap: wrap; } .qqbot-ai-profile-tags span { padding: 1px 5px; border-radius: 4px; background: color-mix(in srgb, var(--dsw-alias-brand-primary) 8%, transparent); color: var(--dsw-alias-brand-primary); font-size: 8.5px; }
      .qqbot-ai-next-trigger { color: var(--dsw-alias-brand-primary); font-weight: 600; }
      .qqbot-ai-next-trigger-detail { display: flex; gap: 10px; flex-wrap: wrap; padding: 6px 8px; border-radius: 8px; background: color-mix(in srgb, var(--dsw-alias-brand-primary) 6%, transparent); font-size: 9.5px; }
      .qqbot-ai-keywords { margin-top: 12px; border-top: .5px solid var(--dsw-alias-border-l1); padding-top: 10px; display: flex; flex-direction: column; gap: 7px; }
      .qqbot-ai-keyword-tags { display: flex; gap: 5px; flex-wrap: wrap; }
      .qqbot-ai-keyword-tags span { padding: 3px 7px; border-radius: 6px; background: color-mix(in srgb, var(--dsw-alias-brand-primary) 8%, transparent); color: var(--dsw-alias-brand-primary); font-size: 9px; }

      .qqbot-ai-character-clickable { cursor: pointer; transition: border-color .16s ease, box-shadow .16s ease, transform .16s ease; }
      .qqbot-ai-character-clickable:hover { border-color: color-mix(in srgb, var(--dsw-alias-brand-primary) 38%, var(--dsw-alias-border-l1)); box-shadow: 0 12px 30px rgba(15,23,42,.08); transform: translateY(-1px); }
      .qqbot-ai-character-clickable:focus-visible { outline: 2px solid color-mix(in srgb, var(--dsw-alias-brand-primary) 55%, transparent); outline-offset: 2px; }
      .qqbot-ai-card-link { border: 0; background: transparent; color: var(--dsw-alias-brand-primary); font-size: 10px; font-weight: 600; cursor: pointer; padding: 3px 0; white-space: nowrap; }
      .qqbot-ai-card-link:hover { text-decoration: underline; }
      .qqbot-ai-settings { gap: 16px; }
      .qqbot-ai-settings-hero { display: flex; align-items: center; gap: 15px; padding: 6px 2px 2px; flex-wrap: wrap; }
      .qqbot-ai-settings-hero-copy { display: flex; flex-direction: column; gap: 4px; min-width: 0; flex: 1; }
      .qqbot-ai-settings-hero-copy h1 { margin: 0; font-size: 28px; line-height: 1.1; letter-spacing: -.035em; color: var(--dsw-alias-label-primary); }
      .qqbot-ai-settings-hero-copy p { margin: 0; color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 1.5; max-width: 820px; }
      .qqbot-ai-settings-hero-meta { display: flex; align-items: center; gap: 9px; color: var(--dsw-alias-label-tertiary); font-size: 10px; flex-wrap: wrap; }
      .qqbot-ai-settings-grid { display: grid; grid-template-columns: minmax(0, 1.5fr) minmax(280px, .8fr); gap: 14px; align-items: start; }
      .qqbot-ai-settings-side { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
      .qqbot-ai-settings-bottom { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 14px; }
      .qqbot-ai-info-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 9px; }
      .qqbot-ai-info { display: flex; flex-direction: column; gap: 3px; padding: 9px 10px; border-radius: 9px; background: var(--dsw-alias-bg-base); border: .5px solid var(--dsw-alias-border-l1); min-width: 0; }
      .qqbot-ai-info.is-wide, .qqbot-ai-info.is-full { grid-column: 1 / -1; }
      .qqbot-ai-info-label { color: var(--dsw-alias-label-tertiary); font-size: 9px; letter-spacing: .03em; }
      .qqbot-ai-info-value { margin: 0; color: var(--dsw-alias-label-primary); font-size: 11.5px; line-height: 1.55; word-break: break-word; }
      .qqbot-ai-rule-block { display: flex; flex-direction: column; gap: 5px; margin-top: 10px; padding: 10px 11px; border-radius: 10px; background: color-mix(in srgb, var(--dsw-alias-brand-primary) 5%, transparent); border: .5px solid color-mix(in srgb, var(--dsw-alias-brand-primary) 18%, var(--dsw-alias-border-l1)); }
      .qqbot-ai-rule-block > span { color: var(--dsw-alias-brand-primary); font-size: 9px; font-weight: 700; letter-spacing: .05em; }
      .qqbot-ai-rule-block p { margin: 0; color: var(--dsw-alias-label-secondary); font-size: 10.5px; line-height: 1.65; }
      .qqbot-ai-settings-keywords { margin-top: 11px; padding-top: 10px; border-top: .5px solid var(--dsw-alias-border-l1); display: flex; flex-direction: column; gap: 7px; }
      .qqbot-ai-examples { margin-top: 11px; padding-top: 10px; border-top: .5px solid var(--dsw-alias-border-l1); display: flex; flex-direction: column; gap: 7px; }
      .qqbot-ai-example { display: flex; flex-direction: column; gap: 4px; padding: 8px 9px; border-radius: 8px; background: var(--dsw-alias-bg-base); }
      .qqbot-ai-example-line { display: flex; gap: 7px; align-items: flex-start; }
      .qqbot-ai-example-line > span { color: var(--dsw-alias-label-tertiary); font-size: 8.5px; width: 22px; flex: none; padding-top: 2px; }
      .qqbot-ai-example-line p { margin: 0; color: var(--dsw-alias-label-secondary); font-size: 10px; line-height: 1.5; }
      .qqbot-ai-example-line.is-assistant p { color: var(--dsw-alias-label-primary); }
      .qqbot-ai-emotion-numbers { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 9px; }
      .qqbot-ai-emotion-numbers span { padding: 2px 5px; border-radius: 4px; background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-tertiary); font-size: 8px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
      .qqbot-ai-settings-profiles { display: flex; flex-direction: column; gap: 7px; }
      .qqbot-ai-profile-full { padding: 9px 10px; gap: 5px; }
      .qqbot-ai-profile-full p { -webkit-line-clamp: 4; font-size: 10px; }
      .qqbot-ai-profile-facts { display: flex; gap: 5px; flex-wrap: wrap; }
      .qqbot-ai-profile-facts span { color: var(--dsw-alias-label-tertiary); font-size: 8.5px; }
      .qqbot-ai-settings-memories { display: flex; flex-direction: column; gap: 8px; max-height: 420px; overflow-y: auto; padding-right: 4px; }
      .qqbot-ai-settings-groups { display: flex; flex-direction: column; gap: 7px; }
      .qqbot-ai-settings-group { padding: 9px 10px; border-radius: 9px; background: var(--dsw-alias-bg-base); border: .5px solid var(--dsw-alias-border-l1); display: flex; flex-direction: column; gap: 4px; }
      .qqbot-ai-settings-group-head { display: flex; justify-content: space-between; gap: 8px; align-items: baseline; }
      .qqbot-ai-settings-group-head strong { color: var(--dsw-alias-label-primary); font-size: 10.5px; }
      .qqbot-ai-settings-group-head span { color: var(--dsw-alias-label-tertiary); font-size: 8px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
      .qqbot-ai-settings-group p { margin: 0; color: var(--dsw-alias-label-secondary); font-size: 9.5px; line-height: 1.45; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
      @media (max-width: 900px) { .qqbot-ai-settings-grid, .qqbot-ai-settings-bottom { grid-template-columns: 1fr; } }
      @media (max-width: 640px) { .qqbot-ai-settings-hero { align-items: flex-start; flex-direction: column; } .qqbot-ai-info-grid { grid-template-columns: 1fr; } .qqbot-ai-info.is-wide, .qqbot-ai-info.is-full { grid-column: auto; } }
      .qqbot-game-card { appearance: none; text-align: left; cursor: pointer; color: inherit; font: inherit; }
      .qqbot-game-card:hover { border-color: color-mix(in srgb, var(--dsw-alias-brand-primary) 45%, var(--dsw-alias-border-l1)); }
      .qqbot-admin-stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
      .qqbot-admin-stats-wide { grid-template-columns: repeat(5, minmax(0, 1fr)); }
      .qqbot-admin-stat { display: flex; flex-direction: column; gap: 3px; padding: 9px 11px; border-radius: 11px;
        background: var(--dsw-alias-bg-layer-2); border: 0.5px solid var(--dsw-alias-border-l1); min-width: 0; }
      .qqbot-admin-stat-label { font-size: 10px; color: var(--dsw-alias-label-tertiary); }
      .qqbot-admin-stat-value { font-size: 15px; font-weight: 500; color: var(--dsw-alias-label-primary); overflow-wrap: anywhere; }
      .qqbot-admin-up { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto; gap: 10px; align-items: end; }
      .qqbot-table-wrap { overflow-x: auto; border: 0.5px solid var(--dsw-alias-border-l1); border-radius: 12px; }
      .qqbot-table-wrap .qqbot-table { min-width: 820px; }
      @media (max-width: 900px) {
        .qqbot-admin-stats-wide { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .qqbot-admin-up { grid-template-columns: minmax(0, 1fr); }
      }

      `

      return { CSS }
    },
    "client/runtime/tab-registry.js": (__require) => {
      /**
       * Runtime tab registry for the control-center panel.
       *
       * A tab is a contribution point: the Host decides which tabs exist and in
       * which order (`clientTabs` on `/qqbot/status`), while the client registers
       * the matching render/hook pair here. Built-in tabs register themselves as a
       * side effect of importing `plugins/<name>/index.js`; external client plugins
       * can register at runtime through `window.__DSH_QQBOT__.registerTab()`.
       *
       * Registration is expected to be complete before the panel mounts (every DSH
       * client bundle is evaluated and applied before the UI renders). The registry
       * exposes no events on purpose: hooks have to be called in a stable order.
       */

      /** @type {Map<string, {id: string, labelKey: string, order: number, use: Function, handlers: object}>} */
      const registry = new Map()

      /** Global bridge used by external client plugins. */
      const EXTERNAL_SCOPE_KEY = '__DSH_QQBOT__'

      const orderOf = (value) => {
        const number = Number(value)
        return Number.isFinite(number) ? number : 0
      }

      /**
       * Register one tab.
       *
       * @param {{ id: string, labelKey?: string, order?: number, use: (panel: object) => (() => any), handlers?: object }} tab
       * @returns object the stored tab entry
       */
      function registerTab(tab) {
        if (tab === null || typeof tab !== 'object') {
          throw new Error('client tab must be an object')
        }
        const { id, labelKey, order, use, handlers } = tab
        if (typeof id !== 'string' || id === '') {
          throw new Error('client tab id must be a non-empty string')
        }
        if (typeof use !== 'function') {
          throw new Error(`client tab ${id} must provide a use(panel) function`)
        }
        if (registry.has(id)) {
          throw new Error(`client tab already registered: ${id}`)
        }
        const entry = {
          id,
          labelKey: typeof labelKey === 'string' && labelKey !== '' ? labelKey : id,
          order: orderOf(order),
          use,
          handlers: handlers !== null && typeof handlers === 'object' ? handlers : {},
        }
        registry.set(id, entry)
        return entry
      }

      /** All registered tabs, ordered the same way the Host orders them. */
      function listTabs() {
        return [...registry.values()].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
      }

      /**
       * Resolve the tabs the panel may show.
       *
       * With a Host tab list the Host wins: its order is kept, unknown ids are
       * ignored and duplicate ids are collapsed. Without a Host list (older Host or
       * before the first snapshot) every registered tab is shown, ordered by its
       * declared `order`.
       *
       * @param {Array<{ id: string, title?: object, order?: number }> | null | undefined} hostTabs
       */
      function resolveVisibleTabs(hostTabs) {
        const registered = listTabs()
        if (!Array.isArray(hostTabs)) return registered
        const byId = new Map(registered.map((tab) => [tab.id, tab]))
        const seen = new Set()
        const visible = []
        for (const hostTab of hostTabs) {
          const id = hostTab !== null && typeof hostTab === 'object' ? hostTab.id : null
          if (typeof id !== 'string' || id === '' || seen.has(id)) continue
          seen.add(id)
          const entry = byId.get(id)
          if (entry !== undefined) visible.push(entry)
        }
        return visible
      }

      /**
       * Expose the public registration API. Called at module load and again from
       * the client entry's `apply`; idempotent and safe in non-browser test hosts.
       *
       * @param {object} [scope] defaults to `window` when present
       */
      function registerClientTabApi(scope) {
        const target = scope !== undefined ? scope : (typeof window === 'undefined' ? null : window)
        if (target === null || target === undefined) return null
        const api = { registerTab, listTabs }
        target[EXTERNAL_SCOPE_KEY] = api
        return api
      }

      // Make the bridge available as early as possible: external client bundles may
      // be evaluated after this module but before the panel mounts.
      registerClientTabApi()

      return { EXTERNAL_SCOPE_KEY, registerTab, listTabs, resolveVisibleTabs, registerClientTabApi }
    },
    }
    const __cache = Object.create(null)
    function __require(id) {
      if (id === 'react') return require('react')
      const cached = __cache[id]
      if (cached !== undefined) return cached
      const factory = __modules[id]
      if (factory === undefined) throw new Error(`dsh-qqbot bundle: unknown module ${id}`)
      const exports = factory(__require)
      __cache[id] = exports
      return exports
    }
    const entry = __require("client/index.js")
    return entry.default
  },
})
