import assert from 'node:assert/strict'
import { test } from 'node:test'
import { evaluateExpression } from '../../host/services/group-loop/calculator.js'
import { getMarketQuote, parseTencentQuotes, tencentCode } from '../../host/services/group-loop/market-quote.js'
import { parseReadUrlCall, renderReadUrl } from '../../host/services/group-loop/read-url.js'
import { parseToolCall, parseToolCalls, renderObservation, toolQuery } from '../../host/services/group-loop/tool-call.js'

test('calculator evaluates arithmetic without eval', () => {
  assert.deepEqual(evaluateExpression('(5000*0.18)+12'), { ok: true, expression: '(5000*0.18)+12', value: 912 })
  assert.equal(evaluateExpression('2+3*4').value, 14)
  assert.equal(evaluateExpression('-2^2').ok, false)
  assert.equal(evaluateExpression('1/0').ok, false)
  assert.equal(evaluateExpression('alert(1)').ok, false)
})

test('market quote maps common symbols and parses Tencent rows', () => {
  assert.equal(tencentCode('上证指数'), 'sh000001')
  assert.equal(tencentCode('600519'), 'sh600519')
  assert.equal(tencentCode('000001'), 'sz000001')
  assert.equal(tencentCode('IF'), 'nf_IF0')
  assert.equal(tencentCode('IF2512'), 'nf_IF2512')
  assert.equal(tencentCode('黄金'), 'hf_GC')
  assert.equal(tencentCode('USDCNY'), 'fx_susdcny')
  const quotes = parseTencentQuotes('v_sh000001="1~上证指数~000001~3380.12~3365.00~3370.00~12345~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~20261104150000~15.12~0.45~3390.00~3350.00";')
  assert.equal(quotes[0].name, '上证指数')
  assert.equal(quotes[0].price, 3380.12)
  assert.equal(quotes[0].changePercent, 0.45)
})

test('market quote uses an injected fetch and caches by code', async () => {
  let calls = 0
  const fetchImpl = async () => {
    calls += 1
    return { ok: true, arrayBuffer: async () => Buffer.from('v_sh000001="1~上证指数~000001~3380.12~3365.00~3370.00~12345~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~20261104150000~15.12~0.45~3390.00~3350.00";', 'utf8') }
  }
  const first = await getMarketQuote('上证指数', { fetchImpl, timeoutMs: 1000 })
  const second = await getMarketQuote('上证指数', { fetchImpl, timeoutMs: 1000 })
  assert.equal(first.ok, true)
  assert.equal(second.ok, true)
  assert.equal(calls, 1)
  assert.equal(second.cached, true)
})

test('tool call parser handles all six tools and rejects unknown tools', () => {
  for (const tool of ['web_search', 'weather', 'group_search', 'read_url', 'market_quote', 'calculator']) {
    const call = parseToolCall(JSON.stringify({ type: 'tool_call', tool, args: { query: 'x', location: '上海', url: 'https://example.com', symbol: 'sh000001', expression: '1+1' } }))
    assert.equal(call.tool, tool)
    assert.ok(toolQuery(call) !== '')
  }
  assert.equal(parseToolCall('{"type":"tool_call","tool":"unknown","args":{}}'), null)
  const embedded = parseToolCalls('<toolcall>{"name":"calculator","arguments":{"expression":"(5000*0.18)+12"}}</toolcall><toolcall>{"name":"market_quote","arguments":{"symbol":"sh000001"}}</toolcall>')
  assert.deepEqual(embedded.map((call) => call.tool), ['calculator', 'market_quote'])
  assert.deepEqual(embedded[0].args, { expression: '(5000*0.18)+12' })
  assert.equal(parseReadUrlCall('{"type":"tool_call","tool":"read_url","args":{"url":"https://example.com"}}').url, 'https://example.com')
  assert.match(renderReadUrl({ ok: false, error: 'bad' }), /读取失败/u)
})

test('group search renders no-result and matched observations', () => {
  assert.match(renderObservation('group_search', { ok: true, messages: [] }), /没有匹配/u)
  const text = renderObservation('group_search', { ok: true, messages: [{ time: '2026/11/4 17:00:00', nickname: '小明', qq: '20000', id: 'm1', text: '爆仓了' }] })
  assert.match(text, /爆仓了/u)
  assert.match(text, /m1/u)
})
