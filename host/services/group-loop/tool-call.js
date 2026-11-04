/** Shared ReAct tool-call parsing and rendering helpers. */
import { renderCalculation } from './calculator.js'
import { renderMarketQuote } from './market-quote.js'
import { renderReadUrl } from './read-url.js'
import { renderWeatherResult } from './weather.js'
import { renderSearchResult } from './web-search.js'

export const TOOL_NAMES = new Set(['web_search', 'weather', 'group_search', 'read_url', 'market_quote', 'calculator'])

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

export function parseToolCall(raw, parsed = null) {
  if (parsed?.type === 'tool_call' && TOOL_NAMES.has(parsed.tool)) {
    return { tool: parsed.tool, args: object(parsed.args) }
  }
  const source = String(raw ?? '')
  if (!/tool_call|<\|\|DSML|DSML/iu.test(source)) return null
  const start = source.indexOf('{')
  const end = source.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    const value = JSON.parse(source.slice(start, end + 1))
    if (value?.type !== 'tool_call' || !TOOL_NAMES.has(value.tool)) return null
    return { tool: value.tool, args: object(value.args) }
  } catch {
    return null
  }
}

export function toolSignature(call) {
  return `${call.tool}:${JSON.stringify(call.args ?? {})}`
}

export function toolQuery(call) {
  const args = call.args ?? {}
  return String(args.query ?? args.location ?? args.url ?? args.symbol ?? args.expression ?? '').slice(0, 200)
}

export function renderObservation(tool, result) {
  switch (tool) {
    case 'web_search': return renderSearchResult(result)
    case 'weather': return renderWeatherResult(result)
    case 'read_url': return renderReadUrl(result)
    case 'market_quote': return renderMarketQuote(result)
    case 'calculator': return renderCalculation(result)
    case 'group_search': {
      if (result?.ok !== true) return `【group_search】检索失败：${result?.error ?? '未知错误'}`
      const rows = Array.isArray(result.messages) ? result.messages : []
      if (rows.length === 0) return '【group_search】本群历史里没有匹配的消息。'
      return `【group_search】本群历史匹配：\n${rows.map((entry) => `[${entry.time || entry.at}] ${entry.nickname || entry.qq}(${entry.qq}) [id:${entry.id}]：${entry.text || ''}`).join('\n')}`
    }
    default: return `【${tool}】未知工具结果`
  }
}
