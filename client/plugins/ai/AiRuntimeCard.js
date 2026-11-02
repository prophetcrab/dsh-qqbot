/**
 * AI runtime diagnostics card.
 *
 * Reads `GET /qqbot/ai/runtime`, which returns the Koishi runtime's latest
 * gate decision (`state.lastInbound` / `state.lastReply`), per-group recents
 * (`state.groups`), the learned keyword lexicon (`keywords.sets`) and the
 * data file paths. Every branch is defensive: a missing payload, an older
 * Host or a partially written JSON file still renders an empty state instead
 * of crashing the AI tab.
 */
import { formatTime } from '../../runtime/api.js'

// --------------------------------------------------------------- normalizers --

const asObject = (value) => (value !== null && typeof value === 'object' && !Array.isArray(value) ? value : null)
const asText = (value) => (typeof value === 'string' ? value : '')
const asNumber = (value) => {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}
const asList = (value) => (Array.isArray(value) ? value : [])
const asReasons = (value) => asList(value).filter((item) => typeof item === 'string' && item !== '')
const clamp01 = (value) => Math.min(1, Math.max(0, value))

/** Map a normalized attention score to the tier currently used by the runtime. */
export function decisionFromScore(score) {
  if (score >= 0.5) return 'high'
  if (score >= 0.3) return 'medium'
  return 'low'
}

function decisionOf(source, attention, reasons) {
  const explicit = asText(source.attentionDecision) || asText(source.decision) || asText(source.reason)
  if (explicit === 'forced' || explicit === 'high' || explicit === 'medium' || explicit === 'low') return explicit
  if (reasons.includes('forced')) return 'forced'
  return decisionFromScore(attention)
}

/** One `state.lastInbound` record (also reused for per-group recent rows). */
export function normalizeInbound(raw) {
  const source = asObject(raw)
  if (source === null) return null
  const sender = asText(source.sender) || asText(source.userName) || asText(source.userId)
  const text = asText(source.text) || asText(source.content)
  const attention = clamp01(asNumber(source.attention) ?? 0)
  const attentionReasons = asReasons(source.attentionReasons ?? source.reasons)
  return {
    at: asText(source.at),
    groupId: asText(source.groupId),
    userId: asText(source.userId),
    sender,
    text,
    threadId: asText(source.threadId),
    keywordScore: clamp01(asNumber(source.keywordScore) ?? 0),
    interestLabels: asList(source.interestLabels).filter((item) => typeof item === 'string' && item !== ''),
    hotTopics: asList(source.hotTopics).filter((item) => typeof item === 'string' && item !== ''),
    attention,
    attentionDecision: decisionOf(source, attention, attentionReasons),
    budgetExhausted: attentionReasons.includes('budget-exhausted'),
    attentionReasons,
    shouldReply: source.shouldReply === true,
    reason: asText(source.reason),
    mention: source.mention === true,
    replyToBot: source.replyToBot === true,
    images: asNumber(source.images) ?? 0,
  }
}

/** One `state.lastReply` record. */
function normalizeReply(raw) {
  const source = asObject(raw)
  if (source === null) return null
  return {
    at: asText(source.at),
    ok: source.ok === true,
    skipped: source.skipped === true,
    busy: source.busy === true,
    error: asText(source.error),
    reason: asText(source.reason),
    text: asText(source.text) || asText(source.reply),
  }
}

/** `state.groups` may be a keyed object (current runtime) or an array. */
function normalizeGroups(raw) {
  const groups = []
  const push = (groupId, item) => {
    const source = asObject(item)
    if (source === null) return
    const recent = asList(source.recent)
      .map((entry) => normalizeInbound(entry))
      .filter((entry) => entry !== null)
      .slice(-10)
    const latest = normalizeInbound(source)
    const id = asText(source.groupId) || asText(groupId)
    groups.push({ groupId: id, latest, recent })
  }
  if (Array.isArray(raw)) {
    raw.forEach((item, index) => push(`#${index}`, item))
  } else {
    const map = asObject(raw) ?? {}
    for (const key of Object.keys(map)) push(key, map[key])
  }
  return groups.sort((a, b) => {
    const left = a.latest !== null ? a.latest.at : ''
    const right = b.latest !== null ? b.latest.at : ''
    return String(right).localeCompare(String(left))
  })
}

/** `keywords.sets` grouped by `key.scope` / `key.owner`. */
function normalizeKeywords(raw) {
  const source = asObject(raw) ?? {}
  const sets = Array.isArray(source.sets) ? source.sets : Array.isArray(raw) ? raw : []
  const byScope = new Map()
  for (const setRaw of sets) {
    const set = asObject(setRaw)
    if (set === null) continue
    const key = asObject(set.key) ?? {}
    const scope = asText(key.scope) || asText(set.scope) || 'global'
    const owner = asText(key.owner) || asText(set.owner)
    const terms = asList(set.terms)
      .map((termRaw) => {
        const term = asObject(termRaw)
        const text = term === null ? '' : asText(term.text) || asText(term.term)
        if (text === '') return null
        const status = term.status === 'pinned' || term.status === 'suppressed' ? term.status : 'active'
        return {
          text,
          weight: clamp01(asNumber(term.weight) ?? 0),
          confidence: clamp01(asNumber(term.confidence) ?? 0),
          status,
          expiresAt: asNumber(term.expiresAt),
        }
      })
      .filter((term) => term !== null)
    if (terms.length === 0) continue
    const id = `${scope}:${owner}`
    const existing = byScope.get(id)
    if (existing === undefined) byScope.set(id, { scope, owner, terms })
    else existing.terms.push(...terms)
  }
  return {
    version: asNumber(source.version),
    scopes: [...byScope.values()].sort((a, b) => a.scope.localeCompare(b.scope) || a.owner.localeCompare(b.owner)),
  }
}

/** Curated semantic interests written by the AI host. */
function normalizeInterests(raw) {
  const source = asObject(raw) ?? {}
  const list = Array.isArray(source.interests) ? source.interests : Array.isArray(raw) ? raw : []
  return list
    .map((item) => {
      const entry = asObject(item)
      if (entry === null) return null
      const label = asText(entry.label)
      if (label === '') return null
      return {
        groupId: asText(entry.groupId),
        label,
        aliases: asList(entry.aliases).filter((alias) => typeof alias === 'string' && alias !== ''),
        summary: asText(entry.summary),
        weight: clamp01(asNumber(entry.weight) ?? 0),
        confidence: clamp01(asNumber(entry.confidence) ?? 0),
        expiresAt: asNumber(entry.expiresAt) ?? 0,
        source: asText(entry.source),
        pinned: entry.pinned === true || asText(entry.source) === 'persona',
      }
    })
    .filter((entry) => entry !== null)
    .sort((left, right) => right.weight * right.confidence - left.weight * left.confidence)
}

/**
 * Normalize the Host payload into the exact shape the card renders.
 * Exported for unit tests; never throws.
 */
export function deriveRuntimeView(payload) {
  const data = asObject(payload)
  const state = asObject(data && data.state) ?? {}
  const paths = asObject(data && data.paths) ?? {}
  return {
    available: data !== null,
    state: {
      lastInbound: normalizeInbound(state.lastInbound),
      lastReply: normalizeReply(state.lastReply),
      groups: normalizeGroups(state.groups),
      updatedAt: asText(state.updatedAt),
    },
    keywords: normalizeKeywords(data && data.keywords),
    interests: normalizeInterests(data && data.interests),
    paths: {
      aiChat: asText(paths.aiChat),
      lexicon: asText(paths.lexicon),
    },
  }
}

// ------------------------------------------------------------------ renderer --

const percent = (score) => Math.round(clamp01(score) * 100)
const scoreText = (score) => (Math.round(score * 1000) / 1000).toFixed(3)

/** Inline meter: one labelled 0..1 score with its numeric value. */
function meter(h, label, score) {
  return h('div', { className: 'qqbot-meter-row' },
    h('span', { className: 'qqbot-row-label' }, label),
    h('div', { className: 'qqbot-meter', 'aria-hidden': true },
      h('i', { className: 'qqbot-meter-fill', style: { width: `${percent(score)}%` } })),
    h('span', { className: 'qqbot-meter-value qqbot-mono' }, scoreText(score)))
}

function chips(h, values, className = 'qqbot-chip') {
  return h('div', { className: 'qqbot-chips' },
    ...values.map((value) => h('span', { key: value, className }, value)))
}

function statusPill(h, text, tone) {
  return h('span', { className: `qqbot-pill qqbot-pill-${tone}` },
    h('i', { className: 'qqbot-pill-dot' }),
    h('span', { className: 'qqbot-pill-text' }, text))
}

function attentionTone(inbound) {
  if (inbound.budgetExhausted) return 'warn'
  if (inbound.attentionDecision === 'forced' || inbound.attentionDecision === 'high') return 'ok'
  if (inbound.attentionDecision === 'medium') return 'info'
  return 'muted'
}

function attentionLabel(t, inbound) {
  if (inbound.budgetExhausted) return t('aiRuntimeAttentionBudget')
  if (inbound.attentionDecision === 'forced') return t('aiRuntimeAttentionForced')
  if (inbound.attentionDecision === 'high') return t('aiRuntimeAttentionHigh')
  if (inbound.attentionDecision === 'medium') return t('aiRuntimeAttentionMedium')
  return t('aiRuntimeAttentionLow')
}

/** Compact final attention badge used by the latest row and every recent line. */
function attentionBadge(h, t, inbound, testid) {
  const valuePercent = percent(inbound.attention)
  return h('span', {
    className: `qqbot-attention-badge is-${attentionTone(inbound)}`,
    'data-testid': testid,
    'data-decision': inbound.attentionDecision,
    title: t('aiRuntimeAttentionHint'),
  },
  h('strong', { className: 'qqbot-attention-value' }, `${valuePercent}%`),
  h('span', { className: 'qqbot-attention-label' }, attentionLabel(t, inbound)))
}

export function renderAiRuntimeCard(panel) {
  const {
    t, h, aiRuntime, aiRuntimePhase, aiRuntimeError, busyOf, loadAiRuntime, row,
  } = panel
  const view = deriveRuntimeView(aiRuntime)
  const loading = aiRuntimePhase === 'loading' && aiRuntime === null
  const failed = aiRuntimePhase === 'error'
  const hasData = view.state.lastInbound !== null
    || view.state.groups.length > 0
    || view.interests.length > 0

  const refreshButton = h('button', {
    type: 'button',
    className: 'qqbot-btn',
    'data-testid': 'qqbot-ai-runtime-refresh',
    'aria-label': t('aiRuntimeRefresh'),
    'aria-busy': aiRuntimePhase === 'loading' ? 'true' : undefined,
    disabled: aiRuntimePhase === 'loading',
    onClick: () => { loadAiRuntime() },
  }, aiRuntimePhase === 'loading' ? t('working') : t('refresh'))

  const head = h('div', { className: 'qqbot-card-head' },
    h('div', null,
      h('h2', { className: 'qqbot-card-title' }, t('aiRuntimeTitle')),
      h('span', { className: 'qqbot-card-sub' }, t('aiRuntimeSubtitle'))),
    h('div', { className: 'qqbot-btns' },
      view.state.updatedAt !== ''
        ? h('span', {
          className: 'qqbot-card-sub qqbot-mono',
          'data-testid': 'qqbot-ai-runtime-updated',
        }, `${t('aiRuntimeUpdated')} ${formatTime(view.state.updatedAt) || view.state.updatedAt}`)
        : null,
      refreshButton))

  const body = []

  if (failed) {
    body.push(h('div', {
      className: 'qqbot-card qqbot-runtime-state qqbot-banner qqbot-banner-error',
      role: 'alert',
      'data-testid': 'qqbot-ai-runtime-error',
    },
      h('span', null, `${t('aiRuntimeLoadFail')}${aiRuntimeError !== null ? `: ${aiRuntimeError}` : ''}`),
      h('button', {
        type: 'button',
        className: 'qqbot-btn',
        'aria-label': t('retry'),
        onClick: () => { loadAiRuntime() },
      }, t('retry'))))
  }
  if (loading) {
    body.push(h('div', {
      className: 'qqbot-card qqbot-runtime-state qqbot-empty',
      role: 'status',
      'data-testid': 'qqbot-ai-runtime-loading',
    }, t('aiRuntimeLoading')))
  } else if (!view.available || !hasData) {
    body.push(h('div', { className: 'qqbot-card qqbot-runtime-state qqbot-empty', 'data-testid': 'qqbot-ai-runtime-empty' },
      t('aiRuntimeEmpty')))
  } else {
    if (view.state.lastInbound !== null) {
      body.push(h('div', { className: 'qqbot-runtime-grid' },
        renderInboundBlock({ t, h, row, inbound: view.state.lastInbound }),
        renderReplyBlock({ t, h, reply: view.state.lastReply })))
    }
    body.push(renderGroupsBlock({ t, h, groups: view.state.groups }))
    body.push(renderInterestsBlock({ t, h, interests: view.interests }))
    if (view.paths.aiChat !== '') {
      body.push(renderPathsBlock({ t, h, paths: view.paths }))
    }
  }

  return h('div', {
    className: 'qqbot-ai-runtime-page',
    'data-testid': 'qqbot-ai-runtime-card',
  },
  h('div', { className: 'qqbot-ai-runtime-head' }, head),
  ...body)
}

function renderInboundBlock({ t, h, row, inbound }) {
  const reasonChips = inbound.attentionReasons.length > 0
    ? h('div', { className: 'qqbot-runtime-reasons' },
      h('span', { className: 'qqbot-row-label' }, t('aiRuntimeReasons')),
      chips(h, inbound.attentionReasons, 'qqbot-chip qqbot-chip-reason'))
    : null
  return h('section', {
    className: 'qqbot-card qqbot-runtime-card',
    'data-testid': 'qqbot-ai-runtime-last-inbound',
  },
    h('div', { className: 'qqbot-runtime-block-head' },
      h('span', { className: 'qqbot-field-label' }, t('aiRuntimeLastInbound')),
      h('span', { 'data-testid': 'qqbot-ai-runtime-should-reply' },
        statusPill(h, inbound.shouldReply ? t('aiRuntimeShouldReply') : t('aiRuntimeNoReply'),
          inbound.shouldReply ? 'ok' : 'warn'))),
    h('div', { className: 'qqbot-rows' },
      row(t('aiRuntimeGroup'), inbound.groupId || '—', null, true),
      row(t('aiRuntimeSender'), inbound.sender || '—', null),
      row(t('aiRuntimeThread'), inbound.threadId || '—', null, true)),
    h('div', { className: 'qqbot-runtime-text' }, inbound.text !== '' ? inbound.text : '—'),
    h('div', { className: 'qqbot-attention-final', 'data-testid': 'qqbot-ai-runtime-attention-final' },
      h('div', { className: 'qqbot-attention-final-main' },
        h('span', { className: 'qqbot-field-label' }, t('aiRuntimeFinalAttention')),
        h('strong', { className: 'qqbot-attention-final-score' }, `${percent(inbound.attention)}%`),
        attentionBadge(h, t, inbound, 'qqbot-ai-runtime-attention-final-badge')),
      h('div', { className: 'qqbot-attention-meter', 'aria-hidden': true },
        h('i', { className: 'qqbot-attention-meter-fill', style: { width: `${percent(inbound.attention)}%` } })),
      h('span', { className: 'qqbot-hint' }, t('aiRuntimeAttentionScale'))),
    h('div', { className: 'qqbot-runtime-metrics' },
      meter(h, t('aiRuntimeKeywordScore'), inbound.keywordScore)),
    inbound.interestLabels.length > 0
      ? h('div', { className: 'qqbot-runtime-reasons', 'data-testid': 'qqbot-ai-runtime-interest-hits' },
        h('span', { className: 'qqbot-row-label' }, t('aiRuntimeInterestHits')),
        chips(h, inbound.interestLabels, 'qqbot-chip qqbot-chip-interest'))
      : null,
    inbound.hotTopics.length > 0
      ? h('div', { className: 'qqbot-runtime-reasons', 'data-testid': 'qqbot-ai-runtime-hot-topics' },
        h('span', { className: 'qqbot-row-label' }, t('aiRuntimeHotTopics')),
        chips(h, inbound.hotTopics, 'qqbot-chip qqbot-chip-hot'))
      : null,
    reasonChips,
    inbound.reason !== ''
      ? h('p', { className: 'qqbot-hint' }, `${t('aiRuntimeReasons')}: ${inbound.reason}`)
      : null)
}

function renderReplyBlock({ t, h, reply }) {
  const detail = reply === null
    ? h('p', { className: 'qqbot-hint' }, t('aiRuntimeNoReplyYet'))
    : h('div', { className: 'qqbot-runtime-reply' },
      statusPill(h,
        reply.busy ? t('aiRuntimeReplyBusy')
          : reply.skipped ? t('aiRuntimeReplySkipped')
            : reply.ok ? t('aiRuntimeReplyOk') : t('aiRuntimeReplyError'),
        reply.ok ? 'ok' : 'warn'),
      reply.at !== ''
        ? h('span', { className: 'qqbot-card-sub' }, formatTime(reply.at) || reply.at)
        : null,
      reply.text !== '' ? h('div', { className: 'qqbot-runtime-text' }, reply.text) : null,
      reply.reason !== '' ? h('p', { className: 'qqbot-hint' }, reply.reason) : null,
      reply.error !== '' ? h('p', { className: 'qqbot-error' }, reply.error) : null)
  return h('section', {
    className: 'qqbot-card qqbot-runtime-card',
    'data-testid': 'qqbot-ai-runtime-last-reply',
  },
    h('div', { className: 'qqbot-runtime-block-head' },
      h('span', { className: 'qqbot-field-label' }, t('aiRuntimeLastReply'))),
    detail)
}

function renderGroupRow({ t, h, group }) {
  const latest = group.latest
  const headRow = h('div', { className: 'qqbot-runtime-group-head' },
    h('span', { className: 'qqbot-badge' }, group.groupId || '—'),
    latest !== null
      ? h('span', { className: 'qqbot-card-sub' },
        `${latest.sender || '—'} · ${formatTime(latest.at) || '—'}`)
      : null,
    latest !== null
      ? statusPill(h, latest.shouldReply ? t('aiRuntimeShouldReply') : t('aiRuntimeNoReply'),
        latest.shouldReply ? 'ok' : 'warn')
      : null)
  const recentList = group.recent.length === 0
    ? h('p', { className: 'qqbot-hint' }, t('aiRuntimeNoRecent'))
    : h('div', { className: 'qqbot-runtime-recent-list' },
      ...group.recent.slice(-10).map((entry, index) => h('div', {
        key: `${group.groupId}-recent-${index}`,
        className: 'qqbot-runtime-recent',
        'data-testid': 'qqbot-ai-runtime-group-recent',
      },
        h('span', { className: 'qqbot-mono qqbot-runtime-recent-time' }, formatTime(entry.at) || '—'),
        h('span', { className: 'qqbot-runtime-recent-sender' }, entry.sender || '—'),
        h('span', { className: 'qqbot-runtime-recent-text' }, entry.text || '—'),
        attentionBadge(h, t, entry, 'qqbot-ai-runtime-group-recent-attention'))))
  return h('div', {
    key: group.groupId,
    className: 'qqbot-runtime-group',
    'data-testid': 'qqbot-ai-runtime-group',
    'data-group': group.groupId,
  }, headRow, recentList)
}

function renderGroupsBlock({ t, h, groups }) {
  return h('section', { className: 'qqbot-card qqbot-runtime-card qqbot-runtime-section' },
    h('div', { className: 'qqbot-runtime-block-head' },
      h('span', { className: 'qqbot-field-label' }, t('aiRuntimeRecentGroups')),
      h('span', { className: 'qqbot-card-sub' }, `${groups.length}`)),
    groups.length === 0
      ? h('p', { className: 'qqbot-hint', 'data-testid': 'qqbot-ai-runtime-groups-empty' },
        t('aiRuntimeNoGroups'))
      : h('div', {
        className: 'qqbot-runtime-groups',
        'data-testid': 'qqbot-ai-runtime-groups',
      }, ...groups.slice(0, 10).map((group) => renderGroupRow({ t, h, group }))))
}

function remainingText(t, expiresAt) {
  if (!Number.isFinite(expiresAt) || expiresAt <= 0) return t('aiRuntimeInterestNoExpiry')
  const remaining = expiresAt - Date.now()
  if (remaining <= 0) return t('aiRuntimeInterestExpired')
  if (remaining >= 24 * 60 * 60 * 1000) return `${Math.ceil(remaining / (24 * 60 * 60 * 1000))} ${t('aiRuntimeDays')}`
  if (remaining >= 60 * 60 * 1000) return `${Math.ceil(remaining / (60 * 60 * 1000))} ${t('aiRuntimeHours')}`
  return `${Math.max(1, Math.ceil(remaining / 60000))} ${t('aiRuntimeMinutes')}`
}

function renderInterestsBlock({ t, h, interests }) {
  const rows = interests.map((interest, index) => h('div', {
    key: `${interest.groupId}:${interest.label}:${index}`,
    className: 'qqbot-interest-row',
    'data-testid': 'qqbot-ai-runtime-interest',
  },
  h('div', { className: 'qqbot-interest-main' },
    h('div', { className: 'qqbot-interest-head' },
      h('strong', { className: 'qqbot-interest-label' }, interest.label),
      interest.pinned ? h('span', { className: 'qqbot-badge qqbot-interest-longterm', 'data-testid': 'qqbot-ai-runtime-interest-longterm' }, t('aiRuntimeInterestLongTerm')) : null,
      interest.groupId !== '' ? h('span', { className: 'qqbot-badge' }, interest.groupId) : null),
    interest.summary !== '' ? h('span', { className: 'qqbot-interest-summary' }, interest.summary) : null),
  h('div', { className: 'qqbot-interest-meta' },
    h('span', { className: 'qqbot-chip qqbot-chip-ghost' }, `${Math.round(interest.weight * 100)}%`),
    h('span', { className: 'qqbot-interest-ttl' }, remainingText(t, interest.expiresAt)))))
  return h('section', {
    className: 'qqbot-card qqbot-runtime-card qqbot-runtime-interests',
    'data-testid': 'qqbot-ai-runtime-interests',
  },
  h('div', { className: 'qqbot-runtime-block-head' },
    h('div', null,
      h('span', { className: 'qqbot-field-label' }, t('aiRuntimeInterests')),
      h('span', { className: 'qqbot-hint' }, t('aiRuntimeInterestsHint'))),
    h('span', { className: 'qqbot-card-sub' }, `${interests.length}`)),
  interests.length === 0
    ? h('p', { className: 'qqbot-hint', 'data-testid': 'qqbot-ai-runtime-interests-empty' }, t('aiRuntimeNoInterests'))
    : h('div', { className: 'qqbot-interest-list' }, ...rows))
}

function renderPathsBlock({ t, h, paths }) {
  const pathRow = (label, value) => h('div', { className: 'qqbot-row-item' },
    h('span', { className: 'qqbot-row-label' }, label),
    h('span', { className: 'qqbot-row-value qqbot-mono' }, value))
  return h('section', { className: 'qqbot-card qqbot-runtime-card qqbot-runtime-paths', 'data-testid': 'qqbot-ai-runtime-paths' },
    pathRow(t('aiRuntimePathChat'), paths.aiChat))
}
