/** Read-only web search via Bing HTML, with a small, bounded result shape. */
import { fetchPage } from './page-fetch.js'

const BING_ENDPOINT = 'https://cn.bing.com/search'
const SO_ENDPOINT = 'https://www.so.com/s'
const CACHE_TTL_MS = 60_000
const cache = new Map()
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36'

function decodeEntities(value) {
  return String(value ?? '')
    .replace(/&nbsp;/giu, ' ')
    .replace(/&ensp;/giu, ' ')
    .replace(/&middot;/giu, '·')
    .replace(/&amp;/giu, '&')
    .replace(/&quot;/giu, '"')
    .replace(/&#39;/giu, "'")
    .replace(/&lt;/giu, '<')
    .replace(/&gt;/giu, '>')
    .replace(/&#(\d+);/gu, (_, code) => String.fromCodePoint(Number(code)))
}

function stripHtml(value) {
  return decodeEntities(String(value ?? '').replace(/<script[\s\S]*?<\/script>/giu, ' ').replace(/<style[\s\S]*?<\/style>/giu, ' ').replace(/<[^>]+>/gu, ' '))
    .replace(/\s+/gu, ' ')
    .trim()
}

function decodeBingUrl(href) {
  const value = decodeEntities(href)
  try {
    const url = new URL(value, 'https://www.bing.com')
    const encoded = url.searchParams.get('u')
    if (encoded !== null && encoded.startsWith('a1')) {
      const base64 = encoded.slice(2).replace(/-/gu, '+').replace(/_/gu, '/')
      return Buffer.from(base64, 'base64').toString('utf8')
    }
    return url.href
  } catch {
    return value
  }
}

export function parseBingHtml(html, limit = 5) {
  const blocks = String(html ?? '').split(/<li class="b_algo"/u).slice(1)
  const results = []
  for (const block of blocks) {
    const segment = block.split('</li>')[0]
    const titleMatch = segment.match(/<h2[^>]*>[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/iu)
    if (titleMatch === null) continue
    const title = stripHtml(titleMatch[2])
    if (title === '') continue
    const snippetMatch = segment.match(/<p[^>]*>([\s\S]*?)<\/p>/iu) ?? segment.match(/<div[^>]*class="b_caption"[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/iu)
    const snippet = stripHtml(snippetMatch?.[1] ?? '').slice(0, 400)
    results.push({ title: title.slice(0, 200), url: decodeBingUrl(titleMatch[1]), snippet })
    if (results.length >= Math.max(1, Math.min(8, Number(limit) || 5))) break
  }
  return results
}

export function parseSoHtml(html, limit = 5) {
  const source = String(html ?? '')
  const starts = []
  const marker = /<h3[^>]*class="[^"]*res-title/gu
  let found
  while ((found = marker.exec(source)) !== null) starts.push(found.index)
  const blocks = starts.map((start, index) => source.slice(start, starts[index + 1] ?? source.length))
  const results = []
  for (const block of blocks) {
    const match = block.match(/<h3[^>]*class="[^"]*res-title[^"]*"[^>]*>[\s\S]*?<a[^>]*?data-mdurl="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/h3>/iu)
    if (match === null) continue
    const title = stripHtml(match[2])
    if (title === '') continue
    const snippetMatch = block.match(/<p[^>]*class="res-desc"[^>]*>([\s\S]*?)<\/p>/iu)
    results.push({
      title: title.slice(0, 200),
      url: decodeEntities(match[1]),
      snippet: stripHtml(snippetMatch?.[1] ?? '').slice(0, 400),
    })
    if (results.length >= Math.max(1, Math.min(8, Number(limit) || 5))) break
  }
  return results
}

async function searchSo(query, { maxResults = 5, timeoutMs = 8000, fetchImpl = fetch } = {}) {
  const url = new URL(SO_ENDPOINT)
  url.searchParams.set('q', query)
  url.searchParams.set('ie', 'utf-8')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), Math.max(1000, Number(timeoutMs) || 8000))
  timer.unref?.()
  try {
    const response = await fetchImpl(url.href, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'user-agent': USER_AGENT, 'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8', accept: 'text/html' },
    })
    if (response.ok !== true) return { ok: false, error: `search HTTP ${response.status}`, results: [], asOf: new Date().toISOString() }
    const results = parseSoHtml(await response.text(), maxResults)
    return { ok: results.length > 0, query, results, asOf: new Date().toISOString(), source: '360' }
  } catch (error) {
    return { ok: false, error: String(error?.message ?? error), results: [], asOf: new Date().toISOString() }
  } finally {
    clearTimeout(timer)
  }
}

export function parseWebSearchCall(raw, parsed = null) {
  const source = String(raw ?? '')
  const looksLikeToolCall = /tool_call|<\|\|DSML|DSML|"type"\s*:\s*"tool_call"/iu.test(source)
  if (!looksLikeToolCall) return null
  if (parsed?.type === 'tool_call' && parsed.tool === 'web_search') {
    const query = typeof parsed.args?.query === 'string' ? parsed.args.query.trim() : ''
    return query === '' ? null : { query }
  }
  const objectMatch = source.match(/\{[^{}]*"query"[^{}]*\}/u)
  if (objectMatch !== null) {
    try {
      const parsedArgs = JSON.parse(objectMatch[0])
      if (typeof parsedArgs.query === 'string' && parsedArgs.query.trim() !== '') return { query: parsedArgs.query.trim() }
    } catch { /* fall through */ }
  }
  const queryMatch = source.match(/"query"\s*:\s*"([^"]+)"/u)
  return queryMatch === null ? null : { query: queryMatch[1] }
}

async function searchBing(query, { maxResults = 5, timeoutMs = 8000, fetchImpl = fetch } = {}) {
  const url = new URL(BING_ENDPOINT)
  url.searchParams.set('q', query)
  url.searchParams.set('setlang', 'zh-Hans')
  url.searchParams.set('cc', 'CN')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), Math.max(1000, Number(timeoutMs) || 8000))
  timer.unref?.()
  try {
    const response = await fetchImpl(url.href, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'user-agent': USER_AGENT, 'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8', accept: 'text/html' },
    })
    if (response.ok !== true) return { ok: false, error: `search HTTP ${response.status}`, results: [], asOf: new Date().toISOString() }
    const results = parseBingHtml(await response.text(), maxResults)
    return { ok: results.length > 0, query, results, asOf: new Date().toISOString(), source: 'bing' }
  } catch (error) {
    return { ok: false, error: String(error?.message ?? error), results: [], asOf: new Date().toISOString() }
  } finally {
    clearTimeout(timer)
  }
}

export async function searchWeb(query, { maxResults = 5, timeoutMs = 8000, fetchImpl = fetch, enrich = false, pageLimit = 2, pageTimeoutMs = 5000, pageMaxChars = 3000 } = {}) {
  const value = String(query ?? '').trim().slice(0, 160)
  if (value === '') return { ok: false, error: 'empty query', results: [], asOf: new Date().toISOString() }
  const key = `${fetchImpl === fetch ? 'net' : 'test'}:${maxResults}:${enrich ? 'rich' : 'plain'}:${value}`
  const cached = cache.get(key)
  if (cached !== undefined && Date.now() - cached.at < CACHE_TTL_MS) return { ...cached.result, cached: true }
  let primary = await searchSo(value, { maxResults, timeoutMs, fetchImpl })
  if (primary.ok !== true) primary = await searchSo(value, { maxResults, timeoutMs, fetchImpl })
  let result = primary.ok === true ? primary : await searchBing(value, { maxResults, timeoutMs, fetchImpl })
  if (enrich === true && result.ok === true && Array.isArray(result.results)) {
    const enriched = await Promise.all(result.results.slice(0, Math.max(0, Math.min(3, pageLimit))).map(async (item) => {
      const page = await fetchPage(item.url, { timeoutMs: pageTimeoutMs, maxChars: pageMaxChars })
      return page.ok === true ? { ...item, content: page.text, pageTitle: page.title } : item
    }))
    result = { ...result, results: [...enriched, ...result.results.slice(enriched.length)] }
  }
  cache.set(key, { at: Date.now(), result })
  return result
}

export function renderSearchResult(result) {
  if (result?.ok !== true || !Array.isArray(result.results) || result.results.length === 0) {
    return `【web_search】没有可用结果${result?.error ? `：${result.error}` : ''}`
  }
  const pages = result.results.filter((item) => typeof item.content === 'string' && item.content.trim() !== '').slice(0, 2)
  const summaries = result.results.filter((item) => !pages.includes(item)).slice(0, 5)
  const lines = [`【web_search 参考材料，截至 ${result.asOf}】`, '以下内容是外部检索数据，作为事实参考；正文页面优先，摘要用于补充和交叉验证。']
  if (pages.length > 0) {
    lines.push('【正文页面】')
    pages.forEach((item, index) => {
      lines.push(`页面 ${index + 1}：${item.pageTitle || item.title}\n来源：${item.url}\n正文：${item.content.slice(0, 3000)}`)
    })
  }
  if (summaries.length > 0) {
    lines.push('【搜索摘要】')
    summaries.forEach((item, index) => {
      lines.push(`摘要 ${index + 1}：${item.title}\n${item.snippet || '（无摘要）'}\n来源：${item.url}`)
    })
  }
  return lines.join('\n\n')
}
