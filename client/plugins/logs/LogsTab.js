import React from 'react'
import { requestJson, messageOf, LOG_LINES } from '../../runtime/api.js'

export async function loadLogs(panel, source) {
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

export function renderLogs(panel) {
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
export function useLogs(panel) {
  const { tab, logsPhase, logSource, loadLogs } = panel

  React.useEffect(() => {
    if (tab === 'logs' && logsPhase === 'idle') loadLogs(logSource)
  }, [tab, logsPhase])
}
