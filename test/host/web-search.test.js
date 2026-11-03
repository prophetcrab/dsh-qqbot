/** Unit tests for the read-only web_search tool. */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseBingHtml, renderSearchResult, searchWeb } from '../../host/services/group-loop/web-search.js'

const fixture = `
<ul>
  <li class="b_algo"><h2><a href="https://www.bing.com/ck/a?u=a1aHR0cHM6Ly9leGFtcGxlLmNvbS9h">标题一</a></h2><p>摘要&ensp;一</p></li>
  <li class="b_algo"><h2><a href="https://example.com/two">标题二</a></h2><p>摘要二</p></li>
</ul>`

test('parseBingHtml extracts titles, snippets and decoded URLs', () => {
  const results = parseBingHtml(fixture, 2)
  assert.equal(results.length, 2)
  assert.equal(results[0].title, '标题一')
  assert.equal(results[0].url, 'https://example.com/a')
  assert.match(results[0].snippet, /摘要 一/u)
  assert.equal(results[1].url, 'https://example.com/two')
})

test('searchWeb sends the query to the fixed endpoint and returns bounded results', async () => {
  let requested = ''
  const result = await searchWeb('期货 保证金', {
    maxResults: 1,
    fetchImpl: async (url) => {
      requested = String(url)
      return new Response(fixture, { status: 200 })
    },
  })
  assert.equal(result.ok, true)
  assert.equal(result.results.length, 1)
  assert.match(requested, /q=%E6%9C%9F%E8%B4%A7/u)
  assert.match(renderSearchResult(result), /web_search/u)
})

test('parseWebSearchCall accepts tool_call and DSML-style model output',  async () => {
  const { parseWebSearchCall } = await import('../../host/services/group-loop/web-search.js')
  assert.deepEqual(parseWebSearchCall('<tool_call>{"query":"期货保证金"}</tool_call>'), { query: '期货保证金' })
  const dsml = '<｜｜DSML｜｜ calls><｜｜DSML｜｜ invoke name="tool_call"><｜｜DSML｜｜ parameter name="args" string="false">{"query": "2026 期货 保证金"}</｜｜DSML｜｜ parameter>'
  assert.deepEqual(parseWebSearchCall(dsml), { query: '2026 期货 保证金' })
  assert.equal(parseWebSearchCall('普通聊天，没有工具'), null)
})

test('parseSoHtml extracts 360 result titles, snippets and real URLs', async () => {
  const { parseSoHtml } = await import('../../host/services/group-loop/web-search.js')
  const html = '<h3 class="res-title"><a data-mdurl="https://example.com/a">标题一</a></h3><p class="res-desc">摘要一</p><h3 class="res-title"><a data-mdurl="https://example.com/b">标题二</a></h3><p class="res-desc">摘要二</p>'
  const results = parseSoHtml(html, 2)
  assert.equal(results.length, 2)
  assert.equal(results[0].title, '标题一')
  assert.equal(results[0].url, 'https://example.com/a')
  assert.equal(results[1].snippet, '摘要二')
})

test('renderSearchResult separates two full pages from multiple summaries', async () => {
  const { renderSearchResult } = await import('../../host/services/group-loop/web-search.js')
  const input = {
    ok: true,
    asOf: '2026-11-03T10:00:00+08:00',
    results: [
      { title: '页面一', url: 'https://example.com/1', snippet: '摘要一', content: '正文一' },
      { title: '页面二', url: 'https://example.com/2', snippet: '摘要二', content: '正文二' },
      { title: '结果三', url: 'https://example.com/3', snippet: '摘要三' },
      { title: '结果四', url: 'https://example.com/4', snippet: '摘要四' },
    ],
  }
  const text = renderSearchResult(input)
  assert.match(text, /【正文页面】/u)
  assert.match(text, /页面 1：页面一/u)
  assert.match(text, /页面 2：页面二/u)
  assert.match(text, /【搜索摘要】/u)
  assert.match(text, /摘要 1：结果三/u)
  assert.match(text, /摘要 2：结果四/u)
})
