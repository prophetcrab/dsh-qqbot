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
      const { row, pill, actionButton } = __require("client/components/primitives.js")
      const { renderHero, renderTabs, renderBanner, renderPollWarn, renderFooter } = __require("client/components/Shell.js")

      const h = React.createElement

      /** Bind a plugin's `(panel, ...args)` handlers onto the flat panel context. */
      function bindHandlers(panel, handlers) {
        for (const name of Object.keys(handlers)) {
          panel[name] = (...args) => handlers[name](panel, ...args)
        }
      }

      /**
       * The composition root: owns the shared state store, calls every registered
       * plugin hook in a fixed order, then renders the active plugin's view inside
       * the shared chrome.
       */
      function Panel(props) {
        const t = typeof (props && props.t) === 'function' ? props.t : (key) => String(key)
        const lang = t('__lang') === 'zh' ? 'zh' : 'en'
        const plugins = props.plugins || []

        const store = useStore(t)
        const status = deriveStatus(store.snapshot, t, store.loggedInRef)
        const panel = { h, t, lang, ...store, ...status }
        panel.tabPlugins = plugins
        panel.row = (...args) => row(panel, ...args)
        panel.pill = (...args) => pill(panel, ...args)
        panel.actionButton = (...args) => actionButton(panel, ...args)
        for (const plugin of plugins) bindHandlers(panel, plugin.handlers || {})

        const renderers = plugins.map((plugin) => plugin.use(panel))

        // Both tabs that show contact names keep the list fresh while visible.
        const { tab, loadContacts } = panel
        React.useEffect(() => {
          if (tab !== 'messages' && tab !== 'access') return undefined
          loadContacts()
          const timer = setInterval(() => { loadContacts() }, 30000)
          return () => { clearInterval(timer) }
        }, [tab])

        const index = Math.max(0, plugins.findIndex((plugin) => plugin.id === tab))
        const body = renderers[index]()

        return h('div', { className: 'qqbot-page', 'data-testid': 'qqbot-panel' },
          renderHero(panel),
          renderBanner(panel),
          renderPollWarn(panel),
          renderTabs(panel),
          h('div', {
            className: 'qqbot-body',
            role: 'tabpanel',
            id: `qqbot-tabpanel-${tab}`,
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
        const { h, t, tab, setTab, tabPlugins } = panel
        const tabItems = tabPlugins.map((plugin) => ({ id: plugin.id, label: t(plugin.labelKey) }))
        return h('div', { className: 'qqbot-tabs', role: 'tablist', 'aria-label': t('title') },
          ...tabItems.map((item) => h('button', {
            key: item.id,
            type: 'button',
            role: 'tab',
            className: `qqbot-tab${tab === item.id ? ' active' : ''}`,
            'data-testid': `qqbot-tab-${item.id}`,
            'aria-label': item.label,
            'aria-selected': tab === item.id ? 'true' : 'false',
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
       * center seat and the sidebar row. Everything else is a plugin: each tab
       * lives under `plugins/<name>/` and contributes its own hooks and view.
       */
      const React = __require("react")
      const { Panel } = __require("client/components/Panel.js")
      const { QqbotIcon } = __require("client/components/Icon.js")
      const { NS, en, zh } = __require("client/runtime/locale.js")
      const { CSS } = __require("client/runtime/styles.js")
      const overview = __require("client/plugins/overview/index.js")
      const ai = __require("client/plugins/ai/index.js")
      const messages = __require("client/plugins/messages/index.js")
      const access = __require("client/plugins/access/index.js")
      const plugins = __require("client/plugins/plugins/index.js")
      const features = __require("client/plugins/features/index.js")
      const logs = __require("client/plugins/logs/index.js")

      const h = React.createElement

      const NSID = 'qqbot'
      const PANEL_ID = 'qqbot'
      const SIDEBAR_ID = 'qqbot'

      /** Tab plugin order; the first one is the default view. */
      const PLUGINS = [overview, ai, messages, access, plugins, features, logs]

      const __default = {
        inject: ['slots', 'locale'],
        apply(ctx) {
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
          const ConnectedPanel = (props) => h(Panel, { ...props, t, plugins: PLUGINS })
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
      const { useAccess, loadAccess, saveAccess, renderAccess } = __require("client/plugins/access/AccessTab.js")

      const id = 'access'
      const labelKey = 'tabAccess'
      const handlers = { loadAccess, saveAccess }

      function use(panel) {
        useAccess(panel)
        return () => renderAccess(panel)
      }

      return { id, labelKey, handlers, use }
    },
    "client/plugins/ai/AiActions.js": (__require) => {
      const { requestJson, messageOf, aiSettingsDraftFrom, aiSettingsBodyFrom, draftFromPersona, personaBody, profileDraftFrom, profileBodyFrom, AI_TEST_PROMPT } = __require("client/runtime/api.js")

      async function loadPersona(panel) {
        const { setPersonaDraft, setPersonaPreview, setPersonaPath, setPersonaPhase, setPersonaError } = panel
        setPersonaPhase('loading')
        try {
          const payload = await requestJson('/qqbot/persona')
          const data = payload && payload.data
          if (data === null || typeof data !== 'object' || data.persona === null || typeof data.persona !== 'object') {
            throw new Error('unexpected payload')
          }
          setPersonaDraft(draftFromPersona(data.persona))
          setPersonaPreview(typeof data.promptPreview === 'string' ? data.promptPreview : '')
          setPersonaPath(typeof data.path === 'string' ? data.path : null)
          setPersonaError(null)
          setPersonaPhase('ready')
        } catch (error) {
          setPersonaError(messageOf(error))
          setPersonaPhase('error')
        }
      }

      async function loadAiSettings(panel) {
        const {
          setAiSettingsDraft, setAiSettingsDefaults, setAiSettingsPath, setAiSettingsPhase, setAiSettingsError
        } = panel
        setAiSettingsPhase('loading')
        try {
          const payload = await requestJson('/qqbot/ai/settings')
          const data = payload && payload.data
          if (data === null || typeof data !== 'object' || data.settings === null || typeof data.settings !== 'object') {
            throw new Error('unexpected payload')
          }
          setAiSettingsDraft(aiSettingsDraftFrom(data.settings))
          setAiSettingsDefaults(data.defaults !== null && typeof data.defaults === 'object' ? data.defaults : null)
          setAiSettingsPath(typeof data.path === 'string' ? data.path : null)
          setAiSettingsError(null)
          setAiSettingsPhase('ready')
        } catch (error) {
          setAiSettingsError(messageOf(error))
          setAiSettingsPhase('error')
        }
      }

      async function loadProfiles(panel, search) {
        const { setProfiles, setProfilesPhase, setProfilesError, profilesSearch, setProfilesPath } = panel
        const query = typeof search === 'string' ? search : profilesSearch
        setProfilesPhase('loading')
        try {
          const payload = await requestJson(`/qqbot/profiles?search=${encodeURIComponent(query)}`)
          const data = payload && payload.data
          if (data === null || typeof data !== 'object' || !Array.isArray(data.profiles)) throw new Error('unexpected payload')
          setProfiles(data.profiles)
          setProfilesPath(typeof data.path === 'string' ? data.path : null)
          setProfilesError(null)
          setProfilesPhase('ready')
        } catch (error) {
          setProfilesError(messageOf(error))
          setProfilesPhase('error')
        }
      }

      async function loadPersonaPresets(panel) {
        const { setPersonaPresets, setPersonaPresetsPhase, setPersonaPresetsError, setPersonaPresetsPath } = panel
        setPersonaPresetsPhase('loading')
        try {
          const payload = await requestJson('/qqbot/persona/presets')
          const data = payload && payload.data
          if (data === null || typeof data !== 'object' || !Array.isArray(data.presets)) throw new Error('unexpected payload')
          setPersonaPresets(data.presets)
          setPersonaPresetsPath(typeof data.path === 'string' ? data.path : null)
          setPersonaPresetsError(null)
          setPersonaPresetsPhase('ready')
        } catch (error) {
          setPersonaPresetsError(messageOf(error))
          setPersonaPresetsPhase('error')
        }
      }

      async function loadLastPrompt(panel) {
        const { setLastPromptState } = panel
        setLastPromptState((previous) => ({ ...previous, phase: 'loading', error: null }))
        try {
          const payload = await requestJson('/qqbot/ai/last-prompt')
          const data = payload && payload.data
          setLastPromptState({
            phase: 'ready',
            prompt: data !== null && typeof data === 'object' && data.prompt !== undefined ? data.prompt : null,
            error: null,
          })
        } catch (error) {
          setLastPromptState((previous) => ({ ...previous, phase: 'error', error: messageOf(error) }))
        }
      }

      /**
       * Ask the Host's local AI bridge for a fixed self-test reply. The route
       * answers 200 with `ok:false` on failure, so it opts out of the global
       * throw and renders the error inside the card.
       */
      async function testAi(panel) {
        const { t, setBusy, setAiReply, setAiError, busyOf } = panel
        if (busyOf('ai-test')) return
        setBusy((previous) => ({ ...previous, 'ai-test': true }))
        setAiReply(null)
        setAiError(null)
        try {
          const result = await requestJson('/qqbot/ai/chat', {
            method: 'POST',
            body: { messages: [{ role: 'user', text: AI_TEST_PROMPT }] },
            acceptNotOk: true,
          })
          if (result !== null && result.ok === true && typeof result.reply === 'string') {
            setAiReply(result.reply)
          } else {
            const reason = result !== null && typeof result.error === 'string' && result.error !== ''
              ? result.error
              : result !== null && typeof result.code === 'string' ? result.code : t('aiTestFailed')
            setAiError(reason)
          }
        } catch (error) {
          setAiError(messageOf(error))
        } finally {
          setBusy((previous) => {
            const next = { ...previous }
            delete next['ai-test']
            return next
          })
        }
      }

      function applyPersonaPayload(panel, result) {
        const { setPersonaDraft, setPersonaPreview, setPersonaPath, setPersonaPhase, setPersonaError } = panel
        const data = result && result.data
        if (data === null || typeof data !== 'object' || data.persona === null || typeof data.persona !== 'object') return false
        setPersonaDraft(draftFromPersona(data.persona))
        setPersonaPreview(typeof data.promptPreview === 'string' ? data.promptPreview : '')
        setPersonaPath(typeof data.path === 'string' ? data.path : null)
        setPersonaError(null)
        setPersonaPhase('ready')
        return true
      }

      async function savePersona(panel) {
        const { t, setBanner, setBusy, personaDraft, setPersonaError, busyOf, applyPersonaPayload } = panel
        if (personaDraft === null || busyOf('persona-save')) return
        setBusy((previous) => ({ ...previous, 'persona-save': true }))
        setPersonaError(null)
        try {
          const result = await requestJson('/qqbot/persona/save', {
            method: 'POST',
            body: { persona: personaBody(personaDraft) },
            acceptNotOk: true,
          })
          if (result !== null && result.ok === true && applyPersonaPayload(result)) {
            setBanner({ kind: 'ok', text: t('personaSaved') })
          } else {
            setPersonaError(result !== null && typeof result.error === 'string' && result.error !== ''
              ? result.error
              : t('personaSaveFail'))
          }
        } catch (error) {
          setPersonaError(messageOf(error))
        } finally {
          setBusy((previous) => {
            const next = { ...previous }
            delete next['persona-save']
            return next
          })
        }
      }

      async function resetPersona(panel) {
        const { t, setBanner, setBusy, setPersonaError, busyOf, applyPersonaPayload } = panel
        if (busyOf('persona-reset')) return
        setBusy((previous) => ({ ...previous, 'persona-reset': true }))
        setPersonaError(null)
        try {
          const result = await requestJson('/qqbot/persona/save', {
            method: 'POST',
            body: { reset: true },
            acceptNotOk: true,
          })
          if (result !== null && result.ok === true && applyPersonaPayload(result)) {
            setBanner({ kind: 'ok', text: t('personaResetDone') })
          } else {
            setPersonaError(result !== null && typeof result.error === 'string' && result.error !== ''
              ? result.error
              : t('personaSaveFail'))
          }
        } catch (error) {
          setPersonaError(messageOf(error))
        } finally {
          setBusy((previous) => {
            const next = { ...previous }
            delete next['persona-reset']
            return next
          })
        }
      }

      function applyAiSettingsPayload(panel, result) {
        const {
          setAiSettingsDraft, setAiSettingsDefaults, setAiSettingsPath, setAiSettingsPhase, setAiSettingsError
        } = panel
        const data = result && result.data
        if (data === null || typeof data !== 'object' || data.settings === null || typeof data.settings !== 'object') return false
        setAiSettingsDraft(aiSettingsDraftFrom(data.settings))
        if (data.defaults !== null && typeof data.defaults === 'object') setAiSettingsDefaults(data.defaults)
        if (typeof data.path === 'string') setAiSettingsPath(data.path)
        setAiSettingsError(null)
        setAiSettingsPhase('ready')
        return true
      }

      async function saveAiSettings(panel) {
        const { t, setBanner, setBusy, aiSettingsDraft, setAiSettingsError, busyOf, applyAiSettingsPayload } = panel
        if (aiSettingsDraft === null || busyOf('ai-settings-save')) return
        setBusy((previous) => ({ ...previous, 'ai-settings-save': true }))
        setAiSettingsError(null)
        try {
          const result = await requestJson('/qqbot/ai/settings', {
            method: 'POST',
            body: aiSettingsBodyFrom(aiSettingsDraft),
            acceptNotOk: true,
          })
          if (result !== null && result.ok === true && applyAiSettingsPayload(result)) {
            setBanner({ kind: 'ok', text: t('aiSettingsSaved') })
          } else {
            setAiSettingsError(result !== null && typeof result.error === 'string' && result.error !== ''
              ? result.error
              : t('aiSettingsError'))
          }
        } catch (error) {
          setAiSettingsError(messageOf(error))
        } finally {
          setBusy((previous) => {
            const next = { ...previous }
            delete next['ai-settings-save']
            return next
          })
        }
      }

      function resetAiSettingsDraft(panel) {
        const { t, setBanner, setAiSettingsDraft, aiSettingsDefaults } = panel
        if (aiSettingsDefaults === null) return
        setAiSettingsDraft(aiSettingsDraftFrom(aiSettingsDefaults))
        setBanner({ kind: 'ok', text: t('aiSettingsResetDone') })
      }

      function selectProfile(panel, profile) {
        const { setSelectedProfileKey, setProfileDraft } = panel
        const draft = profileDraftFrom(profile)
        setSelectedProfileKey(draft.key)
        setProfileDraft(draft)
      }

      async function saveProfile(panel) {
        const {
          t, setBanner, setBusy, setProfilesError, profilesSearch, setSelectedProfileKey, profileDraft,
          setProfileDraft, busyOf, loadProfiles
        } = panel
        if (profileDraft === null || busyOf('profile-save')) return
        setBusy((previous) => ({ ...previous, 'profile-save': true }))
        try {
          const result = await requestJson('/qqbot/profiles/save', {
            method: 'POST',
            body: { profile: profileBodyFrom(profileDraft) },
            acceptNotOk: true,
          })
          const data = result && result.data
          if (result !== null && result.ok === true && data !== null && typeof data === 'object' && data.profile !== null && typeof data.profile === 'object') {
            const saved = profileDraftFrom(data.profile)
            setSelectedProfileKey(saved.key)
            setProfileDraft(saved)
            setBanner({ kind: 'ok', text: t('profilesSaved') })
            await loadProfiles(profilesSearch)
          } else {
            setProfilesError(result !== null && typeof result.error === 'string' && result.error !== ''
              ? result.error
              : t('profilesSaveFail'))
          }
        } catch (error) {
          setProfilesError(messageOf(error))
        } finally {
          setBusy((previous) => {
            const next = { ...previous }
            delete next['profile-save']
            return next
          })
        }
      }

      async function deleteProfile(panel) {
        const {
          t, setBanner, setBusy, setProfilesError, profilesSearch, setSelectedProfileKey, profileDraft,
          setProfileDraft, busyOf, loadProfiles
        } = panel
        if (profileDraft === null || busyOf('profile-delete')) return
        const key = profileDraft.key
        setBusy((previous) => ({ ...previous, 'profile-delete': true }))
        try {
          const result = await requestJson('/qqbot/profiles/delete', {
            method: 'POST',
            body: { key },
            acceptNotOk: true,
          })
          if (result !== null && result.ok === true) {
            setProfileDraft(null)
            setSelectedProfileKey(null)
            setBanner({ kind: 'ok', text: t('profilesDeleted') })
            await loadProfiles(profilesSearch)
          } else {
            setProfilesError(result !== null && typeof result.error === 'string' && result.error !== ''
              ? result.error
              : t('profilesDeleteFail'))
          }
        } catch (error) {
          setProfilesError(messageOf(error))
        } finally {
          setBusy((previous) => {
            const next = { ...previous }
            delete next['profile-delete']
            return next
          })
        }
      }

      async function savePersonaPreset(panel) {
        const {
          t, setBanner, setBusy, personaDraft, setPersonaPresets, setPersonaPresetsPhase, setPersonaPresetsError,
          setPersonaPresetsPath, personaPresetName, setPersonaPresetName, busyOf
        } = panel
        if (personaDraft === null || busyOf('persona-preset-save')) return
        const name = personaPresetName.trim() !== '' ? personaPresetName.trim() : personaDraft.name
        setBusy((previous) => ({ ...previous, 'persona-preset-save': true }))
        setPersonaPresetsError(null)
        try {
          const result = await requestJson('/qqbot/persona/presets/save', {
            method: 'POST',
            body: { name, persona: personaBody(personaDraft) },
            acceptNotOk: true,
          })
          const data = result && result.data
          if (result !== null && result.ok === true && data !== null && typeof data === 'object' && Array.isArray(data.presets)) {
            setPersonaPresets(data.presets)
            if (typeof data.path === 'string') setPersonaPresetsPath(data.path)
            setPersonaPresetName('')
            setPersonaPresetsError(null)
            setPersonaPresetsPhase('ready')
            setBanner({ kind: 'ok', text: t('personaPresetSaved') })
          } else {
            setPersonaPresetsError(result !== null && typeof result.error === 'string' && result.error !== ''
              ? result.error
              : t('personaPresetsError'))
          }
        } catch (error) {
          setPersonaPresetsError(messageOf(error))
        } finally {
          setBusy((previous) => {
            const next = { ...previous }
            delete next['persona-preset-save']
            return next
          })
        }
      }

      async function loadPersonaPreset(panel, preset) {
        const {
          t, setBanner, setBusy, setPersonaDraft, setPersonaPreview, setPersonaPath, setPersonaPhase,
          setPersonaError, setPersonaPresets, setPersonaPresetsError, busyOf
        } = panel
        if (busyOf('persona-preset-load')) return
        setBusy((previous) => ({ ...previous, 'persona-preset-load': true }))
        setPersonaPresetsError(null)
        try {
          const result = await requestJson('/qqbot/persona/presets/load', {
            method: 'POST',
            body: { id: preset.id },
            acceptNotOk: true,
          })
          const data = result && result.data
          if (result !== null && result.ok === true && data !== null && typeof data === 'object'
            && data.persona !== null && typeof data.persona === 'object') {
            setPersonaDraft(draftFromPersona(data.persona))
            setPersonaPreview(typeof data.promptPreview === 'string' ? data.promptPreview : '')
            if (typeof data.path === 'string') setPersonaPath(data.path)
            if (Array.isArray(data.presets)) setPersonaPresets(data.presets)
            setPersonaError(null)
            setPersonaPhase('ready')
            setBanner({ kind: 'ok', text: t('personaPresetLoaded') })
          } else {
            setPersonaPresetsError(result !== null && typeof result.error === 'string' && result.error !== ''
              ? result.error
              : t('personaPresetsError'))
          }
        } catch (error) {
          setPersonaPresetsError(messageOf(error))
        } finally {
          setBusy((previous) => {
            const next = { ...previous }
            delete next['persona-preset-load']
            return next
          })
        }
      }

      async function deletePersonaPreset(panel, preset) {
        const {
          t, setBanner, setBusy, setPersonaPresets, setPersonaPresetsPhase, setPersonaPresetsError, busyOf
        } = panel
        if (busyOf('persona-preset-delete')) return
        setBusy((previous) => ({ ...previous, 'persona-preset-delete': true }))
        setPersonaPresetsError(null)
        try {
          const result = await requestJson('/qqbot/persona/presets/delete', {
            method: 'POST',
            body: { id: preset.id },
            acceptNotOk: true,
          })
          const data = result && result.data
          if (result !== null && result.ok === true && data !== null && typeof data === 'object' && Array.isArray(data.presets)) {
            setPersonaPresets(data.presets)
            setPersonaPresetsError(null)
            setPersonaPresetsPhase('ready')
            setBanner({ kind: 'ok', text: t('personaPresetDeleted') })
          } else {
            setPersonaPresetsError(result !== null && typeof result.error === 'string' && result.error !== ''
              ? result.error
              : t('personaPresetsError'))
          }
        } catch (error) {
          setPersonaPresetsError(messageOf(error))
        } finally {
          setBusy((previous) => {
            const next = { ...previous }
            delete next['persona-preset-delete']
            return next
          })
        }
      }

      return { loadPersona, loadAiSettings, loadProfiles, loadPersonaPresets, loadLastPrompt, testAi, applyPersonaPayload, savePersona, resetPersona, applyAiSettingsPayload, saveAiSettings, resetAiSettingsDraft, selectProfile, saveProfile, deleteProfile, savePersonaPreset, loadPersonaPreset, deletePersonaPreset }
    },
    "client/plugins/ai/AiCard.js": (__require) => {


      function renderAiCard(panel) {
        const { t, snapshot, aiReply, aiError, busyOf, testAi, h } = panel
        const ai = (snapshot && snapshot.ai) || {}
        const available = ai.available === true
        const provider = typeof ai.provider === 'string' ? ai.provider : ''
        const model = typeof ai.model === 'string' ? ai.model : ''
        const sourceLabel = ai.source === 'config'
          ? t('aiSourceConfig')
          : ai.source === 'harness-default' ? t('aiSourceHarness') : ai.source === 'fallback' ? t('aiSourceFallback') : ''
        const statusText = available
          ? `${t('aiConnected')} · ${provider || '—'}/${model || '—'}${sourceLabel !== '' ? ` · ${sourceLabel}` : ''}`
          : t('aiUnavailable')
        const working = busyOf('ai-test')
        return h('section', { className: 'qqbot-card qqbot-ai-card', 'data-testid': 'qqbot-ai-card' },
          h('div', { className: 'qqbot-card-head' },
            h('h2', { className: 'qqbot-card-title' }, t('aiTitle')),
            h('span', { className: available ? 'qqbot-ai-state is-ok' : 'qqbot-ai-state is-bad' }, available ? '✓' : '✕')),
          h('div', { className: 'qqbot-ai-status', 'data-testid': 'qqbot-ai-status' },
            h('span', { className: `qqbot-pill qqbot-pill-${available ? 'ok' : 'warn'}` },
              h('i', { className: 'qqbot-pill-dot' }),
              h('span', { className: 'qqbot-pill-text' }, statusText))),
          h('p', { className: 'qqbot-hint' }, t('aiHint')),
          h('div', { className: 'qqbot-btns' },
            h('button', {
              type: 'button',
              className: 'qqbot-btn',
              'data-testid': 'qqbot-ai-test',
              'aria-label': t('aiTest'),
              'aria-busy': working ? 'true' : undefined,
              disabled: !available || working,
              onClick: () => { testAi() },
            }, working ? t('working') : t('aiTest'))),
          aiReply !== null
            ? h('div', { className: 'qqbot-ai-reply-wrap' },
              h('span', { className: 'qqbot-field-label' }, t('aiReply')),
              h('pre', { className: 'qqbot-pre qqbot-ai-reply', 'data-testid': 'qqbot-ai-reply' }, aiReply))
            : null,
          aiError !== null ? h('p', { className: 'qqbot-error', 'data-testid': 'qqbot-ai-error' }, aiError) : null)
      }

      return { renderAiCard }
    },
    "client/plugins/ai/AiSettingsCard.js": (__require) => {


      function renderAiSettingsCard(panel) {
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

      return { renderAiSettingsCard }
    },
    "client/plugins/ai/AiTab.js": (__require) => {
      const React = __require("react")
      const { renderAiCard } = __require("client/plugins/ai/AiCard.js")
      const { renderAiSettingsCard } = __require("client/plugins/ai/AiSettingsCard.js")
      const { renderFullPromptCard } = __require("client/plugins/ai/PromptCard.js")
      const { renderPersonaCard } = __require("client/plugins/ai/PersonaCard.js")
      const { renderProfilesCard } = __require("client/plugins/ai/ProfilesCard.js")

      function renderAiTab(panel) {
        const { h } = panel
        return h('div', { className: 'qqbot-stack' },
          renderAiCard(panel),
          renderAiSettingsCard(panel),
          renderFullPromptCard(panel),
          renderPersonaCard(panel),
          renderProfilesCard(panel))
      }

      /**
       * AI tab hooks: lazy-load the settings/presets/profiles/prompt cards the
       * first time the tab is opened, and read the persona card on mount.
       */
      function useAi(panel) {
        const {
          tab, aiSettingsPhase, profilesPhase, personaPresetsPhase, lastPromptState, profilesSearch,
          loadAiSettings, loadProfiles, loadPersonaPresets, loadLastPrompt, loadPersona
        } = panel

        React.useEffect(() => {
          if (tab === 'ai' && aiSettingsPhase === 'idle') loadAiSettings()
          if (tab === 'ai' && profilesPhase === 'idle') loadProfiles(profilesSearch)
          if (tab === 'ai' && personaPresetsPhase === 'idle') loadPersonaPresets()
          if (tab === 'ai' && lastPromptState.phase === 'idle') loadLastPrompt()
        }, [tab, aiSettingsPhase, profilesPhase, personaPresetsPhase, lastPromptState.phase])

        React.useEffect(() => {
          loadPersona()
        }, [])
      }

      return { renderAiTab, useAi }
    },
    "client/plugins/ai/PersonaCard.js": (__require) => {
      const { MAX_PERSONA_EXAMPLES } = __require("client/runtime/api.js")

      function renderPersonaCard(panel) {
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
            field('qqbot-persona-rules', 'qqbot-persona-rules', t('personaRules'), draft.rules, (value) => { updateDraft({ rules: value }) }, true)),
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

      return { renderPersonaCard }
    },
    "client/plugins/ai/ProfilesCard.js": (__require) => {


      function renderProfilesCard(panel) {
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

      return { renderProfilesCard }
    },
    "client/plugins/ai/PromptCard.js": (__require) => {
      const { formatTime } = __require("client/runtime/api.js")

      function renderFullPromptCard(panel) {
        const { t, lastPromptState, fullPromptOpen, setFullPromptOpen, loadLastPrompt, h } = panel
        const state = lastPromptState
        const prompt = state.prompt
        const loading = state.phase === 'loading'
        const messages = prompt !== null && prompt !== undefined && Array.isArray(prompt.messages) ? prompt.messages : []
        const mentionParts = []
        if (prompt !== null && prompt !== undefined) {
          if (prompt.mentionSelf === true) mentionParts.push(t('fullPromptMentionSelf'))
          if (Array.isArray(prompt.mentionOthers) && prompt.mentionOthers.length > 0) {
            mentionParts.push(`@${prompt.mentionOthers.map((item) => String(item)).join(' @')}`)
          }
          if (prompt.mentionAll === true) mentionParts.push(t('fullPromptMentionAll'))
        }
        const meta = prompt === null || prompt === undefined ? null : h('div', {
          className: 'qqbot-full-prompt-meta',
          'data-testid': 'qqbot-full-prompt-meta',
        },
          h('span', null, `${t('fullPromptTime')} ${formatTime(prompt.at) || '—'}`),
          h('span', null, `${prompt.provider || '—'}/${prompt.model || '—'}`),
          h('span', null, `${t('fullPromptGroup')} ${prompt.groupId || '—'}`),
          h('span', null, `${t('fullPromptUser')} ${prompt.userName || prompt.userId || '—'}`),
          h('span', null, `${t('fullPromptMentions')} ${mentionParts.length > 0 ? mentionParts.join(' · ') : '—'}`),
          h('span', null, `${t('fullPromptReplyToBot')} ${prompt.replyToBot === true ? t('fullPromptYes') : t('fullPromptNo')}`),
          h('span', null, `${t('fullPromptImages')} ${Number(prompt.imageCount) || 0}`),
          prompt.maxTokens !== undefined && prompt.maxTokens !== null ? h('span', null, `maxTokens ${prompt.maxTokens}`) : null,
          prompt.temperature !== undefined && prompt.temperature !== null ? h('span', null, `temperature ${prompt.temperature}`) : null)
        const body = prompt === null || prompt === undefined
          ? null
          : (fullPromptOpen
            ? h('div', { className: 'qqbot-stack' },
              h('span', { className: 'qqbot-field-label' }, t('fullPromptSystem')),
              h('pre', {
                className: 'qqbot-pre qqbot-full-prompt-system',
                'data-testid': 'qqbot-full-prompt-system',
              }, typeof prompt.system === 'string' ? prompt.system : ''),
              h('span', { className: 'qqbot-field-label' }, t('fullPromptMessages')),
              h('div', { className: 'qqbot-full-prompt-messages', 'data-testid': 'qqbot-full-prompt-messages' },
                messages.length === 0
                  ? h('p', { className: 'qqbot-hint' }, t('fullPromptNoMessages'))
                  : null,
                ...messages.map((message, index) => h('div', {
                  key: `full-prompt-message-${index}`,
                  className: 'qqbot-full-prompt-message',
                  'data-testid': 'qqbot-full-prompt-message',
                },
                  h('div', { className: 'qqbot-full-prompt-message-head' },
                    h('span', { className: 'qqbot-badge' }, message.role || 'user'),
                    Number(message.imageCount) > 0
                      ? h('span', { className: 'qqbot-card-sub' }, `${t('fullPromptImages')} ${message.imageCount}`)
                      : null),
                  h('div', { className: 'qqbot-full-prompt-message-text' },
                    typeof message.text === 'string' ? message.text : '')))))
            : null)
        return h('section', { className: 'qqbot-card qqbot-full-prompt-card', 'data-testid': 'qqbot-full-prompt-card' },
          h('div', { className: 'qqbot-card-head' },
            h('h2', { className: 'qqbot-card-title' }, t('fullPromptTitle')),
            h('div', { className: 'qqbot-btns' },
              h('button', {
                type: 'button',
                className: 'qqbot-btn',
                'data-testid': 'qqbot-full-prompt-refresh',
                'aria-label': t('fullPromptRefresh'),
                disabled: loading,
                onClick: () => { loadLastPrompt() },
              }, loading ? t('working') : t('refresh')),
              prompt !== null && prompt !== undefined
                ? h('button', {
                  type: 'button',
                  className: 'qqbot-btn',
                  'data-testid': 'qqbot-full-prompt-toggle',
                  'aria-label': fullPromptOpen ? t('fullPromptHide') : t('fullPromptShow'),
                  onClick: () => { setFullPromptOpen((previous) => !previous) },
                }, fullPromptOpen ? t('fullPromptHide') : t('fullPromptShow'))
                : null)),
          state.error !== null
            ? h('p', { className: 'qqbot-error', 'data-testid': 'qqbot-full-prompt-error' }, `${t('fullPromptError')}: ${state.error}`)
            : null,
          state.phase === 'loading' && prompt === null && state.error === null
            ? h('p', { className: 'qqbot-hint' }, t('fullPromptLoading'))
            : null,
          prompt === null && state.error === null && state.phase !== 'loading' && state.phase !== 'idle'
            ? h('div', { className: 'qqbot-empty' }, t('fullPromptEmpty'))
            : null,
          meta,
          body)
      }

      return { renderFullPromptCard }
    },
    "client/plugins/ai/index.js": (__require) => {
      const { useAi, renderAiTab } = __require("client/plugins/ai/AiTab.js")
      const { loadPersona, loadAiSettings, loadProfiles, loadPersonaPresets, loadLastPrompt, testAi, applyPersonaPayload, savePersona, resetPersona, applyAiSettingsPayload, saveAiSettings, resetAiSettingsDraft, selectProfile, saveProfile, deleteProfile, savePersonaPreset, loadPersonaPreset, deletePersonaPreset } = __require("client/plugins/ai/AiActions.js")

      const id = 'ai'
      const labelKey = 'tabAi'
      const handlers = {
        loadPersona, loadAiSettings, loadProfiles, loadPersonaPresets, loadLastPrompt,
        testAi, applyPersonaPayload, savePersona, resetPersona,
        applyAiSettingsPayload, saveAiSettings, resetAiSettingsDraft,
        selectProfile, saveProfile, deleteProfile,
        savePersonaPreset, loadPersonaPreset, deletePersonaPreset,
      }

      function use(panel) {
        useAi(panel)
        return () => renderAiTab(panel)
      }

      return { id, labelKey, handlers, use }
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
        const { t, lang, features, featuresPhase, featuresError, busyOf, loadFeatures, runFeatureAction, h } = panel
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
                  disabled: working,
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
      const { useFeatures, loadFeatures, runFeatureAction, renderFeatures } = __require("client/plugins/features/FeaturesTab.js")

      const id = 'features'
      const labelKey = 'tabFeatures'
      const handlers = { loadFeatures, runFeatureAction }

      function use(panel) {
        useFeatures(panel)
        return () => renderFeatures(panel)
      }

      return { id, labelKey, handlers, use }
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
      const { useLogs, loadLogs, renderLogs } = __require("client/plugins/logs/LogsTab.js")

      const id = 'logs'
      const labelKey = 'tabLogs'
      const handlers = { loadLogs }

      function use(panel) {
        useLogs(panel)
        return () => renderLogs(panel)
      }

      return { id, labelKey, handlers, use }
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
      const { useMessages, loadMessages, renderMessages } = __require("client/plugins/messages/MessagesTab.js")

      const id = 'messages'
      const labelKey = 'tabMessages'
      const handlers = { loadMessages }

      function use(panel) {
        useMessages(panel)
        return () => renderMessages(panel)
      }

      return { id, labelKey, handlers, use }
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
          stopNapcat, startKoishi, stopKoishi, restartKoishi, installDeps, hasSnapshot, napcat, koishi, qq,
          settings, napcatSupported, platformInstallHint, napcatAccounts, wsClients, napcatInstalled,
          napcatRunning, napcatLoggedIn, koishiRunning, botOnline, row, actionButton, h
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
            actionButton('napcat-start', t('napcatStart'), null, startNapcat, { disabled: napcatRunning }),
            actionButton('napcat-stop', t('napcatStop'), 'danger', stopNapcat, { disabled: !napcatRunning })))

        const koishiCard = h('section', { className: 'qqbot-card' },
          h('div', { className: 'qqbot-card-head' },
            h('h2', { className: 'qqbot-card-title' }, t('koishiTitle')),
            h('span', { className: 'qqbot-card-sub' }, `${t('lblPort')} · ${koishi.port || settings.koishiPort || '—'}`)),
          h('div', { className: 'qqbot-rows' }, ...koishiRows),
          h('div', { className: 'qqbot-actions-row' },
            actionButton('koishi-start', t('koishiStart'), null, startKoishi, { disabled: koishiRunning }),
            actionButton('koishi-stop', t('koishiStop'), 'danger', stopKoishi, { disabled: !koishiRunning }),
            actionButton('koishi-restart', t('koishiRestart'), null, restartKoishi)))

        return h('div', { className: 'qqbot-stack' },
          h('div', { className: 'qqbot-grid' }, napcatCard, koishiCard),
          renderLoginCard(panel),
          renderSetupCard(panel),
          h('section', { className: 'qqbot-card' },
            h('div', { className: 'qqbot-card-head' },
              h('h2', { className: 'qqbot-card-title' }, t('actionsTitle'))),
            h('div', { className: 'qqbot-btns' },
              actionButton('all-start', t('startAll'), 'primary', startAll),
              actionButton('all-stop', t('stopAll'), 'danger', stopAll),
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
      const { useOverview, renderOverview } = __require("client/plugins/overview/OverviewTab.js")
      const { loadLogin, loadSetup, refreshLoginQr, installKoishiEnv, runSetupFull, installSetupNapcat, startAll, stopAll, installNapcat, configureNapcat, startNapcat, stopNapcat, startKoishi, stopKoishi, restartKoishi, installDeps } = __require("client/plugins/overview/OverviewActions.js")

      const id = 'overview'
      const labelKey = 'tabOverview'
      const handlers = {
        loadLogin, loadSetup, refreshLoginQr,
        installKoishiEnv, runSetupFull, installSetupNapcat,
        startAll, stopAll, installNapcat, configureNapcat,
        startNapcat, stopNapcat, startKoishi, stopKoishi, restartKoishi, installDeps,
      }

      function use(panel) {
        useOverview(panel)
        return () => renderOverview(panel)
      }

      return { id, labelKey, handlers, use }
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
          restartKoishi, installDeps, installPlugin, actionButton, h
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
              actionButton('koishi-restart', t('koishiRestart'), null, restartKoishi),
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
      const { usePlugins, loadPlugins, installPlugin, refreshAfterPluginChange, renderPlugins } = __require("client/plugins/plugins/PluginsTab.js")

      const id = 'plugins'
      const labelKey = 'tabPlugins'
      const handlers = { loadPlugins, installPlugin, refreshAfterPluginChange }

      function use(panel) {
        usePlugins(panel)
        return () => renderPlugins(panel)
      }

      return { id, labelKey, handlers, use }
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
        const setupActionRef = React.useRef(false)
        tabRef.current = tab

        const busyOf = (key) => busy[key] === true

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
          if (busyOf(key)) return null
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
      `

      return { CSS }
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
