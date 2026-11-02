import React from 'react'
import { requestJson, messageOf, pickText, compactValue } from '../../runtime/api.js'

export async function loadFeatures(panel) {
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

export function runFeatureAction(panel, feature, action) {
  const { loadStatus, loadFeatures, runPost } = panel
  const key = `feature:${feature.id}:${action.id}`
  runPost(key, '/qqbot/features/run', { feature: feature.id, action: action.id, params: {} }, async () => {
    await loadStatus()
    await loadFeatures()
  })
}

export function renderFeatures(panel) {
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
export function useFeatures(panel) {
  const { tab, featuresPhase, loadFeatures } = panel

  React.useEffect(() => {
    if (tab === 'features' && featuresPhase === 'idle') loadFeatures()
  }, [tab, featuresPhase])
}
