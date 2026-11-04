/** Read a public URL as readable text for the ReAct read_url tool. */
import { fetchPage } from './page-fetch.js'

const MAX_URL = 2000

export function parseReadUrlCall(raw, parsed = null) {
  if (parsed?.type === 'tool_call' && parsed.tool === 'read_url') {
    const url = String(parsed.args?.url ?? '').trim().slice(0, MAX_URL)
    return url === '' ? null : { url }
  }
  const source = String(raw ?? '')
  if (!/tool_call|<\|\|DSML|DSML/iu.test(source)) return null
  const match = source.match(/\{[^{}]*"url"\s*:\s*"([^"]+)"[^{}]*\}/u)
  return match === null ? null : { url: match[1].slice(0, MAX_URL) }
}

export async function readUrl(url, { timeoutMs = 6000, maxChars = 4000, fetchImpl = fetch } = {}) {
  const target = String(url ?? '').trim()
  if (target === '') return { ok: false, error: 'url 为空' }
  let parsed
  try { parsed = new URL(target) } catch { return { ok: false, error: 'url 格式错误' } }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return { ok: false, error: '只支持 http/https' }
  const result = await fetchPage(parsed.href, { timeoutMs, maxChars, fetchImpl })
  if (result.ok !== true) return { ok: false, error: result.error ?? '读取失败', url: parsed.href }
  return { ok: true, url: result.url, title: result.title, text: result.text, chars: result.chars }
}

export function renderReadUrl(result) {
  if (result?.ok !== true) return `【read_url】读取失败：${result?.error ?? '未知错误'}`
  return `【read_url】\n标题：${result.title || '未知'}\nURL：${result.url}\n正文：\n${String(result.text ?? '').slice(0, 5000)}`
}
