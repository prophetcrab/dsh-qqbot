import React from 'react'
import { requestJson, messageOf, pluginKey, pluginLabel } from '../../runtime/api.js'

export async function loadPlugins(panel) {
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

export function installPlugin(panel) {
  const { installSpec, setInstallSpec, restartAfter, runPost, refreshAfterPluginChange } = panel
  const spec = installSpec.trim()
  if (spec === '') return
  runPost('plugin-install', '/qqbot/koishi/plugins/install', { spec, restart: restartAfter }, async () => {
    setInstallSpec('')
    await refreshAfterPluginChange()
  })
}

export async function refreshAfterPluginChange(panel) {
  const { loadStatus, loadPlugins } = panel
  await loadPlugins()
  await loadStatus()
}

export function renderPlugins(panel) {
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
export function usePlugins(panel) {
  const { tab, pluginsPhase, loadPlugins } = panel

  React.useEffect(() => {
    if (tab === 'plugins' && pluginsPhase === 'idle') loadPlugins()
  }, [tab, pluginsPhase])
}
