/** Unit tests for bounded search-result page extraction and URL safety. */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { extractReadableText } from '../../host/services/group-loop/page-fetch.js'
import { resolvePublicHttpUrl } from '../../host/services/group-loop/url-safety.js'

test('extractReadableText strips chrome, scripts and navigation', () => {
  const html = '<html><head><title>测试标题</title><script>evil()</script></head><body><header>导航</header><article><h1>正文标题</h1><p>第一段正文。</p><p>第二段&ensp;正文。</p></article><footer>页脚</footer></body></html>'
  const page = extractReadableText(html, 1000)
  assert.equal(page.title, '测试标题')
  assert.match(page.text, /第一段正文/u)
  assert.doesNotMatch(page.text, /evil|导航|页脚/u)
})

test('page URL safety rejects loopback and local hostnames', async () => {
  await assert.rejects(() => resolvePublicHttpUrl('http://127.0.0.1/secret'), /private-address/u)
  await assert.rejects(() => resolvePublicHttpUrl('http://localhost/secret'), /local-host/u)
  await assert.rejects(() => resolvePublicHttpUrl('file:///etc/passwd'), /unsupported-protocol/u)
})
