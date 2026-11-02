/**
 * Runtime tab registry contract: registration, ordering, Host filtering and
 * the public window bridge external client plugins use.
 *
 * Run with: node --test test/client/
 */
import assert from 'node:assert/strict'
import test from 'node:test'

import {
  registerClientTabApi,
  registerTab,
  listTabs,
  resolveVisibleTabs,
} from '../../client/runtime/tab-registry.js'

const EMPTY_MAX = { use: () => () => null }

test('registration validates its input', () => {
  assert.throws(() => registerTab(null), /must be an object/)
  assert.throws(() => registerTab({ use: EMPTY_MAX.use }), /id must be a non-empty string/)
  assert.throws(() => registerTab({ id: '', use: EMPTY_MAX.use }), /id must be a non-empty string/)
  assert.throws(() => registerTab({ id: 'no-hook' }), /must provide a use/)
})

test('registry keeps a stable order even when registration order differs', () => {
  registerTab({ id: 'zzz-late', labelKey: 'tabZ', order: 9, use: EMPTY_MAX.use })
  registerTab({ id: 'aaa-first', labelKey: 'tabA', order: 1, use: EMPTY_MAX.use })
  registerTab({ id: 'mmm-middle', labelKey: 'tabM', order: 5, use: EMPTY_MAX.use })
  const ids = listTabs().map((tab) => tab.id)
  assert.deepEqual(ids, ['aaa-first', 'mmm-middle', 'zzz-late'])
  assert.deepEqual(listTabs().map((tab) => tab.labelKey), ['tabA', 'tabM', 'tabZ'])
})

test('registering the same id twice fails loudly', () => {
  registerTab({ id: 'dup', order: 2, use: EMPTY_MAX.use })
  assert.throws(() => registerTab({ id: 'dup', order: 3, use: EMPTY_MAX.use }), /already registered/)
})

test('without a Host list every tab is shown in declared order', () => {
  assert.deepEqual(resolveVisibleTabs(null).map((tab) => tab.id), listTabs().map((tab) => tab.id))
  assert.deepEqual(resolveVisibleTabs(undefined).map((tab) => tab.id), listTabs().map((tab) => tab.id))
})

test('a Host list decides the order and filters unknown ids', () => {
  const visible = resolveVisibleTabs([
    { id: 'mmm-middle', order: 5 },
    { id: 'unknown-tab', order: 2 },
    { id: 'aaa-first', order: 1 },
    { id: 'mmm-middle', order: 5 },
    { id: '' },
    null,
  ])
  assert.deepEqual(visible.map((tab) => tab.id), ['mmm-middle', 'aaa-first'])
})

test('the externally exposed API registers tabs on window', () => {
  const scope = {}
  const api = registerClientTabApi(scope)
  assert.equal(typeof api.registerTab, 'function')
  assert.equal(scope.__DSH_QQBOT__.registerTab, api.registerTab)
  scope.__DSH_QQBOT__.registerTab({
    id: 'external',
    labelKey: 'externalTab',
    order: 3,
    use: () => () => null,
  })
  assert.ok(listTabs().some((tab) => tab.id === 'external'))
})
