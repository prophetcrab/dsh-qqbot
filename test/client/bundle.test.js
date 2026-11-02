/**
 * Smoke-level contract for the built client bundle: it registers with the DSH
 * module loader, exposes the required inject list, installs one stylesheet and
 * registers both slots. Run with: node --test test/client/
 */
import assert from 'node:assert/strict'
import test from 'node:test'

const headChildren = []
let definition = null

globalThis.document = {
  createElement: () => ({ dataset: {}, textContent: '', remove() {} }),
  head: { appendChild: (element) => { headChildren.push(element) } },
}
globalThis.window = {
  __ModuleLoader__: { load: (value) => { definition = value } },
  localStorage: { getItem: () => null, setItem: () => {} },
}

await import('../../client.js')

const React = { createElement: (type, props) => ({ $$el: { type, props: props || {} } }) }
const fakeRequire = (id) => {
  if (id === 'react') return React
  throw new Error(`unexpected require(${JSON.stringify(id)})`)
}

test('registers the dsh-qqbot module definition', () => {
  assert.ok(definition, 'window.__ModuleLoader__.load was not called')
  assert.equal(definition.id, 'dsh-qqbot')
  assert.equal(typeof definition.factory, 'function')
})

test('factory returns the slot/locale plugin contract', () => {
  const api = definition.factory(fakeRequire)
  assert.deepEqual(api.inject, ['slots', 'locale'])
  assert.equal(typeof api.apply, 'function')
})

test('apply registers dictionaries, stylesheet, main panel and sidebar row', () => {
  const registrations = []
  const dictionaries = {}
  const ctx = {
    effect(fn) {
      const cleanup = fn()
      return typeof cleanup === 'function' ? cleanup : () => {}
    },
    locale: {
      register(namespace, value) { dictionaries[namespace] = value },
      bind(namespace) {
        return (key) => {
          const table = (dictionaries[namespace] || {}).zh || {}
          return table[key] !== undefined ? table[key] : String(key)
        }
      },
    },
    slots: {
      inject(seat, callback) { callback() },
      register(seat, component) { registrations.push({ seat, component }) },
    },
  }
  const api = definition.factory(fakeRequire)
  api.apply(ctx)

  const main = registrations.find((entry) => entry.seat.name === 'main')
  const sidebar = registrations.find((entry) => entry.seat.name === 'sidebar.panellist')
  assert.ok(main, 'main slot was not registered')
  assert.equal(main.seat.key, 'qqbot')
  assert.equal(typeof main.component, 'function')
  assert.ok(sidebar, 'sidebar row was not registered')
  assert.equal(sidebar.seat.id, 'qqbot')
  assert.equal(sidebar.seat.order, 30)
  assert.equal(typeof sidebar.seat.label(), 'string')

  assert.equal(headChildren.length, 1, 'expected exactly one injected stylesheet')
  const css = String(headChildren[0].textContent)
  assert.ok(css.includes('.qqbot-page'))
  assert.ok(css.includes('--dsw-alias-bg-layer-2'))

  const locales = dictionaries.qqbot || {}
  assert.equal(locales.en.title, 'QQ bot')
  assert.equal(locales.zh.title, 'QQ 机器人')
})
