/**
 * AI runtime diagnostics card: payload normalization, render contract and the
 * loading / empty / error states. The renderer is exercised with a tiny `h`
 * stand-in and the real en dictionary, no React or browser required.
 *
 * Run with: node --test test/client/
 */
import assert from 'node:assert/strict'
import test from 'node:test'

import { deriveRuntimeView, renderAiRuntimeCard } from '../../client/plugins/ai/AiRuntimeCard.js'
import { en } from '../../client/runtime/locale/en.js'

// --------------------------------------------------------------- render utils --
function h(type, props, ...children) {
  const merged = { ...(props ?? {}) }
  const flat = children.length === 0 ? undefined : children.length === 1 ? children[0] : children
  if (flat !== undefined) merged.children = flat
  return { $$el: { type, props: merged } }
}

function walk(node, out = []) {
  if (node === null || node === undefined || node === false || node === true) return out
  if (Array.isArray(node)) { for (const item of node) walk(item, out); return out }
  if (typeof node === 'string' || typeof node === 'number') { out.push({ text: String(node) }); return out }
  if (!node.$$el) return out
  const { type, props } = node.$$el
  if (typeof type === 'function') { walk(type(props), out); return out }
  const entry = { type, props, children: [] }
  out.push(entry)
  const kids = props.children === undefined ? [] : Array.isArray(props.children) ? props.children : [props.children]
  for (const kid of kids) walk(kid, entry.children)
  return out
}

const flatTree = (element) => walk(element)
const findAll = (tree, predicate, acc = []) => {
  for (const node of tree) {
    if (node.type !== undefined && predicate(node)) acc.push(node)
    if (node.children) findAll(node.children, predicate, acc)
  }
  return acc
}
const byTestId = (tree, id) => findAll(tree, (node) => node.props && node.props['data-testid'] === id)
const textOf = (node) => {
  const parts = []
  const visit = (current) => {
    if (current.text !== undefined) parts.push(current.text)
    if (current.children) current.children.forEach(visit)
  }
  visit(node)
  return parts.join(' ').replace(/\s+/g, ' ').trim()
}

const t = (key) => (en[key] !== undefined ? en[key] : key)

function renderCard(state) {
  const panel = {
    h,
    t,
    row: (label, value, tone, mono) => h('div', { className: 'qqbot-row-item' },
      h('span', { className: 'qqbot-row-label' }, label),
      h('span', { className: `qqbot-row-value${mono ? ' qqbot-mono' : ''}` }, value)),
    busyOf: () => false,
    loadAiRuntime: () => {},
    aiRuntime: state.aiRuntime ?? null,
    aiRuntimePhase: state.aiRuntimePhase ?? 'ready',
    aiRuntimeError: state.aiRuntimeError ?? null,
  }
  return flatTree(renderAiRuntimeCard(panel))
}

// ----------------------------------------------------------------- fixtures --
const INBOUND = {
  at: '2026-11-02T13:00:00.000Z',
  groupId: '1026855069',
  userId: '676512192',
  sender: '天青色瞪眼鱼',
  text: '今天真热',
  threadId: 'thread:12',
  keywordScore: 0.96,
  attention: 0.438,
  attentionReasons: ['keyword', 'thread'],
  shouldReply: true,
}

const FULL_PAYLOAD = {
  state: {
    lastInbound: INBOUND,
    lastReply: { at: '2026-11-02T13:00:02.000Z', ok: true, text: '那就开空调呀' },
    groups: {
      '1026855069': {
        ...INBOUND,
        recent: [
          { ...INBOUND, at: '2026-11-02T13:00:00.000Z', text: '今天真热' },
          { ...INBOUND, at: '2026-11-02T12:59:00.000Z', text: '有人吗' },
        ],
      },
      '805836168': {
        ...INBOUND,
        groupId: '805836168',
        at: '2026-11-02T12:00:00.000Z',
        text: '晚上开黑',
        recent: [{ ...INBOUND, groupId: '805836168', text: '晚上开黑' }],
      },
    },
    updatedAt: '2026-11-02T13:00:02.000Z',
  },
  keywords: {
    version: 1,
    sets: [
      {
        key: { scope: 'group', owner: '1026855069' },
        terms: [
          { text: '龙图', weight: 0.96, confidence: 0.8, status: 'pinned', expiresAt: null },
          { text: '开黑', weight: 0.42, confidence: 0.6, status: 'active', expiresAt: 1767225600000 },
        ],
      },
      {
        key: { scope: 'global', owner: '' },
        terms: [{ text: '今天真热', weight: 0.7, confidence: 0.5, status: 'suppressed', expiresAt: null }],
      },
    ],
  },
  interests: {
    version: 1,
    interests: [{
      groupId: '1026855069', label: '龙图', aliases: ['龙图表情包'], summary: '群友喜欢龙图',
      weight: 0.8, confidence: 0.9, expiresAt: Date.now() + 86400000, source: 'llm',
    }],
  },
  paths: {
    aiChat: '~/project/qq-bot/data/state/ai-chat-state.json',
    lexicon: '~/project/qq-bot/data/state/runtime-lexicon.json',
  },
}

// -------------------------------------------------------------------- tests --
test('deriveRuntimeView tolerates missing or malformed payloads', () => {
  for (const payload of [null, undefined, 'nope', 42, [], {}]) {
    const view = deriveRuntimeView(payload)
    assert.equal(view.state.lastInbound, null)
    assert.equal(view.state.lastReply, null)
    assert.deepEqual(view.state.groups, [])
    assert.deepEqual(view.keywords.scopes, [])
    assert.equal(view.paths.aiChat, '')
  }
  const unknownShapes = deriveRuntimeView({
    state: { lastInbound: 'boom', groups: ['a', null, { groupId: 'g', recent: 'nope' }] },
    keywords: { sets: 'nope' },
    paths: null,
  })
  assert.equal(unknownShapes.state.lastInbound, null)
  assert.deepEqual(unknownShapes.state.groups.map((group) => group.groupId), ['g'])
  assert.deepEqual(unknownShapes.state.groups[0].recent, [])
  assert.deepEqual(unknownShapes.keywords.scopes, [])
})

test('deriveRuntimeView normalizes inbound, reply, groups and keywords', () => {
  const view = deriveRuntimeView(FULL_PAYLOAD)
  assert.equal(view.available, true)
  const inbound = view.state.lastInbound
  assert.equal(inbound.groupId, '1026855069')
  assert.equal(inbound.sender, '天青色瞪眼鱼')
  assert.equal(inbound.text, '今天真热')
  assert.equal(inbound.threadId, 'thread:12')
  assert.equal(inbound.keywordScore, 0.96)
  assert.equal(inbound.attention, 0.438)
  assert.deepEqual(inbound.attentionReasons, ['keyword', 'thread'])
  assert.equal(inbound.shouldReply, true)
  assert.equal(view.state.lastReply.ok, true)
  assert.equal(view.state.lastReply.text, '那就开空调呀')
  // groups sorted by their latest timestamp, newest first.
  assert.deepEqual(view.state.groups.map((group) => group.groupId), ['1026855069', '805836168'])
  assert.equal(view.state.groups[0].recent.length, 2)
  // keyword scopes grouped by `${scope}:${owner}` and sorted by scope.
  assert.deepEqual(view.keywords.scopes.map((scope) => scope.scope), ['global', 'group'])
  assert.equal(view.keywords.scopes[1].owner, '1026855069')
  assert.deepEqual(view.keywords.scopes[1].terms.map((term) => term.text), ['龙图', '开黑'])
  assert.equal(view.keywords.scopes[1].terms[0].status, 'pinned')
  assert.equal(view.keywords.version, 1)
  assert.equal(view.paths.lexicon, '~/project/qq-bot/data/state/runtime-lexicon.json')
  assert.equal(view.interests.length, 1)
  assert.equal(view.interests[0].label, '龙图')
})

test('deriveRuntimeView caps group recents at the latest 10', () => {
  const recent = Array.from({ length: 15 }, (unused, index) => ({ ...INBOUND, at: `2026-11-02T13:00:${String(index).padStart(2, '0')}.000Z`, text: `m${index}` }))
  const view = deriveRuntimeView({ state: { groups: { g1: { ...INBOUND, recent } } } })
  assert.equal(view.state.groups[0].recent.length, 10)
  assert.equal(view.state.groups[0].recent[0].text, 'm5')
})

test('the card renders the loading, empty and error states', () => {
  const loading = byTestId(renderCard({ aiRuntimePhase: 'loading' }), 'qqbot-ai-runtime-loading')
  assert.equal(loading.length, 1)

  const empty = renderCard({ aiRuntime: { state: {}, keywords: {}, paths: {} } })
  assert.equal(byTestId(empty, 'qqbot-ai-runtime-empty').length, 1)
  assert.equal(byTestId(empty, 'qqbot-ai-runtime-last-inbound').length, 0)

  const error = renderCard({ aiRuntimePhase: 'error', aiRuntimeError: 'boom' })
  const errorNode = byTestId(error, 'qqbot-ai-runtime-error')
  assert.equal(errorNode.length, 1)
  assert.ok(textOf(errorNode[0]).includes('boom'))
  assert.equal(byTestId(error, 'qqbot-ai-runtime-refresh').length, 1)
})

test('the card renders latest message metrics, groups and attention badges', () => {
  const tree = renderCard({ aiRuntime: FULL_PAYLOAD, aiRuntimePhase: 'ready' })
  assert.equal(byTestId(tree, 'qqbot-ai-runtime-card').length, 1)
  assert.equal(byTestId(tree, 'qqbot-ai-runtime-refresh').length, 1)

  const inbound = textOf(byTestId(tree, 'qqbot-ai-runtime-last-inbound')[0])
  for (const needle of ['天青色瞪眼鱼', '1026855069', 'thread:12', '今天真热', '0.960', '44%', 'keyword', 'thread', 'Reply']) {
    assert.ok(inbound.includes(needle), `latest inbound is missing ${needle}`)
  }
  assert.equal(byTestId(tree, 'qqbot-ai-runtime-attention-final').length, 1)
  assert.ok(textOf(byTestId(tree, 'qqbot-ai-runtime-attention-final')[0]).includes('44%'))
  assert.ok(textOf(byTestId(tree, 'qqbot-ai-runtime-should-reply')[0]).includes('Reply'))
  assert.ok(textOf(byTestId(tree, 'qqbot-ai-runtime-last-reply')[0]).includes('Replied'))

  assert.equal(byTestId(tree, 'qqbot-ai-runtime-group').length, 2)
  assert.equal(byTestId(tree, 'qqbot-ai-runtime-group-recent').length, 3)
  assert.deepEqual(byTestId(tree, 'qqbot-ai-runtime-group').map((node) => node.props['data-group']), ['1026855069', '805836168'])

  const paths = textOf(byTestId(tree, 'qqbot-ai-runtime-paths')[0])
  assert.ok(paths.includes('ai-chat-state.json'))
  assert.equal(byTestId(tree, 'qqbot-ai-runtime-updated').length, 1)
  assert.equal(byTestId(tree, 'qqbot-ai-runtime-interest').length, 1)
  assert.ok(textOf(byTestId(tree, 'qqbot-ai-runtime-interests')[0]).includes('龙图'))
  assert.ok(textOf(byTestId(tree, 'qqbot-ai-runtime-interests')[0]).includes('群友喜欢龙图'))
})
