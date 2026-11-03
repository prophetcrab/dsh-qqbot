/** Fetch and extract readable text from a search result page, with bounds. */
import { resolvePublicHttpUrl } from './url-safety.js'

const MAX_REDIRECTS = 3
const ACCEPTED_TYPES = new Set(['text/html', 'application/xhtml+xml', 'text/plain'])

function decodeEntities(value) {
  return String(value ?? '')
    .replace(/&nbsp;|&ensp;/giu, ' ')
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

export function extractReadableText(html, maxChars = 3000) {
  const source = String(html ?? '')
  const titleMatch = source.match(/<title[^>]*>([\s\S]*?)<\/title>/iu)
  const cleaned = source
    .replace(/<script[\s\S]*?<\/script>/giu, ' ')
    .replace(/<style[\s\S]*?<\/style>/giu, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/giu, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/giu, ' ')
    .replace(/<header[\s\S]*?<\/header>/giu, ' ')
    .replace(/<footer[\s\S]*?<\/footer>/giu, ' ')
    .replace(/<nav[\s\S]*?<\/nav>/giu, ' ')
    .replace(/<aside[\s\S]*?<\/aside>/giu, ' ')
    .replace(/<form[\s\S]*?<\/form>/giu, ' ')
  const article = cleaned.match(/<article[\s\S]*?<\/article>/iu)?.[0] ?? cleaned.match(/<main[\s\S]*?<\/main>/iu)?.[0] ?? cleaned
  const text = stripHtml(article).slice(0, Math.max(200, Math.min(12000, Number(maxChars) || 3000)))
  return { title: stripHtml(titleMatch?.[1] ?? '').slice(0, 200), text }
}

async function readLimited(response, maxBytes) {
  if (response.body === null || response.body === undefined) return Buffer.from(await response.arrayBuffer()).subarray(0, maxBytes).toString('utf8')
  const reader = response.body.getReader()
  const chunks = []
  let total = 0
  try {
    while (total < maxBytes) {
      const { done, value } = await reader.read()
      if (done) break
      const chunk = Buffer.from(value)
      const room = maxBytes - total
      chunks.push(chunk.subarray(0, room))
      total += Math.min(chunk.length, room)
    }
  } finally {
    reader.cancel().catch(() => {})
  }
  return Buffer.concat(chunks).toString('utf8')
}

export async function fetchPage(raw, { timeoutMs = 6000, maxBytes = 512 * 1024, maxChars = 3000, fetchImpl = fetch, lookupHost = undefined } = {}) {
  let current
  try {
    current = await resolvePublicHttpUrl(raw, lookupHost)
  } catch (error) {
    return { ok: false, error: String(error?.message ?? error) }
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), Math.max(1000, Number(timeoutMs) || 6000))
  timer.unref?.()
  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      const response = await fetchImpl(current.href, {
        signal: controller.signal,
        redirect: 'manual',
        headers: { 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124 Safari/537.36', 'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8', accept: 'text/html,application/xhtml+xml,text/plain' },
      })
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location')
        if (location === null || location === '') return { ok: false, error: 'redirect-without-location' }
        current = await resolvePublicHttpUrl(new URL(location, current).href, lookupHost)
        continue
      }
      if (response.ok !== true) return { ok: false, error: `page HTTP ${response.status}` }
      const type = String(response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
      if (!ACCEPTED_TYPES.has(type)) return { ok: false, error: `unsupported content-type ${type || 'unknown'}` }
      const html = await readLimited(response, Math.max(64 * 1024, Math.min(2 * 1024 * 1024, Number(maxBytes) || 512 * 1024)))
      const extracted = extractReadableText(html, maxChars)
      if (extracted.text === '') return { ok: false, error: 'empty page text' }
      return { ok: true, url: current.href, title: extracted.title, text: extracted.text, chars: extracted.text.length }
    }
    return { ok: false, error: 'too many redirects' }
  } catch (error) {
    return { ok: false, error: String(error?.message ?? error) }
  } finally {
    clearTimeout(timer)
  }
}
