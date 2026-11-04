import React from 'react'
import { requestJson } from '../../runtime/api.js'

const h = React.createElement

function num(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}
function fmt(value) {
  return Math.round(num(value)).toLocaleString('zh-CN')
}
function rate(value) {
  return `${(num(value) * 100).toFixed(1)}%`
}
function time(value) {
  if (typeof value !== 'string' || value === '') return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    hour12: false,
  })
}
function metric(h, label, value, hint, tone = '') {
  return h(
    'div',
    { className: `qqbot-token-metric${tone ? ` is-${tone}` : ''}` },
    h('span', { className: 'qqbot-token-metric-label' }, label),
    h('strong', { className: 'qqbot-token-metric-value' }, value),
    hint ? h('span', { className: 'qqbot-token-metric-hint' }, hint) : null,
  )
}

export function useTokensTab(panel) {
  const { t } = panel
  const [view, setView] = React.useState({
    phase: 'loading',
    data: null,
    error: null,
    confirm: false,
    clearing: false,
    notice: null,
  })
  const load = React.useCallback(async (manual = false) => {
    if (manual)
      setView((prev) => ({
        ...prev,
        phase: prev.data === null ? 'loading' : 'refreshing',
        error: null,
      }))
    try {
      const payload = await requestJson('/qqbot/token-stats')
      setView((prev) => ({
        ...prev,
        phase: 'ready',
        data: payload?.data ?? null,
        error: null,
      }))
    } catch (error) {
      setView((prev) => ({
        ...prev,
        phase: 'error',
        error: String(error?.message ?? error),
      }))
    }
  }, [])
  React.useEffect(() => {
    void load()
    const timer = setInterval(() => {
      void load(false)
    }, 10000)
    return () => clearInterval(timer)
  }, [load])
  const clear = async () => {
    if (view.clearing) return
    if (view.confirm !== true) {
      setView((prev) => ({ ...prev, confirm: true, notice: null }))
      return
    }
    setView((prev) => ({ ...prev, clearing: true }))
    try {
      const payload = await requestJson('/qqbot/token-stats/clear', {
        method: 'POST',
        body: {},
      })
      setView((prev) => ({
        ...prev,
        data: payload?.data ?? prev.data,
        confirm: false,
        clearing: false,
        notice: t('tokensCleared'),
      }))
    } catch (error) {
      setView((prev) => ({
        ...prev,
        clearing: false,
        confirm: false,
        notice: `${t('tokensClearFailed')}: ${String(error?.message ?? error)}`,
      }))
    }
  }
  return () =>
    renderTokens(panel, view, {
      refresh: () => {
        void load(true)
      },
      clear,
      cancel: () => setView((prev) => ({ ...prev, confirm: false })),
    })
}

function renderTokens(panel, view, actions) {
  const { h, t } = panel
  const data = view.data ?? {}
  const totals = data.totals ?? {}
  const today = data.today ?? {}
  const groups = Array.isArray(data.groups) ? data.groups : []
  const recent = Array.isArray(data.recent) ? data.recent : []
  return h(
    'div',
    {
      className: 'qqbot-ai-dashboard qqbot-token-page',
      'data-testid': 'qqbot-token-page',
    },
    h(
      'header',
      { className: 'qqbot-token-hero' },
      h(
        'div',
        null,
        h('span', { className: 'qqbot-token-eyebrow' }, 'TOKEN / USAGE'),
        h('h1', null, t('tokensTitle')),
        h('p', null, t('tokensSubtitle')),
      ),
      h(
        'div',
        { className: 'qqbot-token-actions' },
        h(
          'button',
          {
            type: 'button',
            className: 'qqbot-ai-btn',
            'data-testid': 'qqbot-token-refresh',
            onClick: actions.refresh,
          },
          t('tokensRefresh'),
        ),
        view.confirm === true
          ? h(
              'div',
              { className: 'qqbot-token-confirm' },
              h('span', null, t('tokensClearConfirm')),
              h(
                'button',
                {
                  type: 'button',
                  className: 'qqbot-ai-btn qqbot-ai-btn-danger',
                  'data-testid': 'qqbot-token-clear-confirm',
                  onClick: actions.clear,
                  disabled: view.clearing,
                },
                view.clearing ? t('tokensClearing') : t('tokensClearYes'),
              ),
              h(
                'button',
                {
                  type: 'button',
                  className: 'qqbot-ai-btn',
                  onClick: actions.cancel,
                  disabled: view.clearing,
                },
                t('tokensCancel'),
              ),
            )
          : h(
              'button',
              {
                type: 'button',
                className: 'qqbot-ai-btn',
                'data-testid': 'qqbot-token-clear',
                onClick: actions.clear,
              },
              t('tokensClear'),
            ),
      ),
    ),
    view.phase === 'error'
      ? h(
          'section',
          {
            className: 'qqbot-ai-card qqbot-token-error',
            'data-testid': 'qqbot-token-error',
          },
          h('h2', null, t('tokensLoadFail')),
          h('p', null, view.error),
        )
      : null,
    view.notice
      ? h('div', { className: 'qqbot-token-notice' }, view.notice)
      : null,
    h(
      'div',
      { className: 'qqbot-token-metrics' },
      metric(
        h,
        t('tokensTotal'),
        fmt(totals.total),
        t('tokensAllCalls'),
        'accent',
      ),
      metric(h, t('tokensToday'), fmt(today.total), t('tokensTodayCalls')),
      metric(
        h,
        t('tokensCalls'),
        fmt(totals.calls),
        `${t('tokensMissingCalls')} ${fmt(totals.missing)}`,
      ),
      metric(
        h,
        t('tokensCacheRate'),
        rate(totals.cacheHitRate),
        `${t('tokensCacheRead')} ${fmt(totals.cacheRead)}`,
        'violet',
      ),
    ),
    h(
      'div',
      { className: 'qqbot-token-metrics qqbot-token-metrics-secondary' },
      metric(h, t('tokensInput'), fmt(totals.input), t('tokensInputHint')),
      metric(h, t('tokensOutput'), fmt(totals.output), t('tokensOutputHint')),
      metric(
        h,
        t('tokensCacheWrite'),
        fmt(totals.cacheWrite),
        t('tokensCacheWriteHint'),
      ),
      metric(
        h,
        t('tokensAvgCall'),
        fmt(totals.avgTotal),
        t('tokensAvgCallHint'),
      ),
    ),
    h(
      'div',
      { className: 'qqbot-token-grid' },
      h(
        'section',
        { className: 'qqbot-ai-card' },
        h(
          'div',
          { className: 'qqbot-ai-card-head' },
          h(
            'div',
            null,
            h('span', { className: 'qqbot-ai-card-kicker' }, 'GROUPS'),
            h('h2', null, t('tokensByGroup')),
          ),
          h(
            'span',
            { className: 'qqbot-ai-card-sub' },
            `${groups.length} ${t('tokensGroupsUnit')}`,
          ),
        ),
        groups.length === 0
          ? h('p', { className: 'qqbot-ai-empty-line' }, t('tokensNoGroups'))
          : h(
              'div',
              {
                className: 'qqbot-token-groups',
                'data-testid': 'qqbot-token-groups',
              },
              ...groups.map((group) =>
                h(
                  'div',
                  { key: group.groupId, className: 'qqbot-token-group' },
                  h(
                    'div',
                    { className: 'qqbot-token-group-head' },
                    h('strong', null, group.groupId),
                    h(
                      'span',
                      null,
                      `${fmt(group.calls)} ${t('tokensCallsUnit')}`,
                    ),
                  ),
                  h(
                    'div',
                    { className: 'qqbot-token-group-numbers' },
                    h('span', null, `${t('tokensTotal')} ${fmt(group.total)}`),
                    h(
                      'span',
                      null,
                      `${t('tokensCacheRate')} ${rate(group.cacheHitRate)}`,
                    ),
                  ),
                  h(
                    'div',
                    { className: 'qqbot-token-bar' },
                    h('i', {
                      style: {
                        width: `${Math.min(100, Math.max(0, (num(group.total) / Math.max(1, num(totals.total))) * 100))}%`,
                      },
                    }),
                  ),
                ),
              ),
            ),
        h(
          'section',
          { className: 'qqbot-ai-card' },
          h(
            'div',
            { className: 'qqbot-ai-card-head' },
            h(
              'div',
              null,
              h('span', { className: 'qqbot-ai-card-kicker' }, 'RECENT'),
              h('h2', null, t('tokensRecent')),
            ),
            h(
              'span',
              { className: 'qqbot-ai-card-sub' },
              `${t('tokensRecentHint')} ${data.recentLimit ?? 100}`,
            ),
          ),
          recent.length === 0
            ? h('p', { className: 'qqbot-ai-empty-line' }, t('tokensNoRecent'))
            : h(
                'div',
                {
                  className: 'qqbot-token-recent',
                  'data-testid': 'qqbot-token-recent',
                },
                ...recent.map((entry, index) =>
                  h(
                    'div',
                    {
                      key: `${entry.at}:${entry.loopId}:${index}`,
                      className: 'qqbot-token-recent-row',
                    },
                    h(
                      'div',
                      { className: 'qqbot-token-recent-main' },
                      h(
                        'strong',
                        null,
                        `${t('tokensRecentGroup')} ${entry.groupId || '—'}`,
                      ),
                      h('span', null, time(entry.at)),
                    ),
                    h(
                      'div',
                      { className: 'qqbot-token-recent-numbers' },
                      h('span', null, `${fmt(entry.total)} tok`),
                      h(
                        'span',
                        null,
                        `${rate(entry.input > 0 ? entry.cacheRead / entry.input : 0)} cache`,
                      ),
                    ),
                  ),
                ),
              ),
        ),
        h(
          'footer',
          { className: 'qqbot-ai-footer' },
          h(
            'span',
            null,
            data.updatedAt
              ? `${t('tokensUpdated')} ${time(data.updatedAt)}`
              : t('tokensWaiting'),
          ),
          h(
            'span',
            null,
            t('tokensModel'),
            ' ',
            data.recent?.[0]?.model ?? '—',
          ),
        ),
      ),
    ),
  )
}
