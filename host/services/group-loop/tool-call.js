/** Shared ReAct tool-call parsing and rendering helpers. */
import { renderCalculation } from './calculator.js'
import { renderFinanceCalendar } from './finance-calendar.js'
import { renderMarketQuote } from './market-quote.js'
import { renderWebFetch } from './web-fetch.js'
import { renderWeatherResult } from './weather.js'
import { renderSearchResult } from './web-search.js'

export const TOOL_NAMES = new Set(['web_search', 'weather', 'group_search', 'web_fetch', 'market_quote', 'calculator', 'finance_calendar'])

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function normalizeCall(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null
  const functionValue = object(value.function)
  const tool = String(value.tool ?? value.name ?? functionValue.name ?? '').trim()
  if (!TOOL_NAMES.has(tool)) return null
  let args = value.args ?? value.arguments ?? functionValue.arguments ?? {}
  if (typeof args === 'string') {
    try { args = JSON.parse(args) } catch { args = {} }
  }
  return { tool, args: object(args) }
}

function parseEmbedded(source) {
  const text = String(source ?? '')
  const calls = []
  for (const match of text.matchAll(/<(?:toolcall|tool_call)>([\s\S]*?)<\/(?:toolcall|tool_call)>/giu)) {
    try {
      const call = normalizeCall(JSON.parse(match[1]))
      if (call !== null) calls.push(call)
    } catch { /* ignore malformed embedded call */ }
  }
  if (calls.length > 0) return calls
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return []
  try {
    const value = JSON.parse(text.slice(start, end + 1))
    if (Array.isArray(value?.tool_calls)) return value.tool_calls.map(normalizeCall).filter(Boolean)
    if (value?.type === 'tool_call') {
      const call = normalizeCall(value)
      return call === null ? [] : [call]
    }
    const call = normalizeCall(value)
    return call === null ? [] : [call]
  } catch {
    return []
  }
}

export function parseToolCalls(raw, parsed = null) {
  if (parsed?.type === 'tool_call') {
    const call = normalizeCall(parsed)
    if (call !== null) return [call]
  }
  if (Array.isArray(parsed?.tool_calls)) return parsed.tool_calls.map(normalizeCall).filter(Boolean)
  return parseEmbedded(raw)
}

export function parseToolCall(raw, parsed = null) {
  return parseToolCalls(raw, parsed)[0] ?? null
}

export function toolSignature(call) {
  return `${call.tool}:${JSON.stringify(call.args ?? {})}`
}

export function toolQuery(call) {
  const args = call.args ?? {}
  return String(args.query ?? args.location ?? args.url ?? args.symbol ?? args.expression ?? args.date ?? '').slice(0, 200)
}

export function renderObservation(tool, result) {
  switch (tool) {
    case 'web_search': return renderSearchResult(result)
    case 'weather': return renderWeatherResult(result)
    case 'web_fetch': return renderWebFetch(result)
    case 'market_quote': return renderMarketQuote(result)
    case 'calculator': return renderCalculation(result)
    case 'finance_calendar': return renderFinanceCalendar(result)
    case 'group_search': {
      if (result?.ok !== true) return `【group_search】检索失败：${result?.error ?? '未知错误'}`
      const rows = Array.isArray(result.messages) ? result.messages : []
      if (rows.length === 0) return '【group_search】本群历史里没有匹配的消息。'
      return `【group_search】本群历史匹配：\n${rows.map((entry) => `[${entry.time || entry.at}] ${entry.nickname || entry.qq}(${entry.qq}) [id:${entry.id}]：${entry.text || ''}`).join('\n')}`
    }
    default: return `【${tool}】未知工具结果`
  }
}
