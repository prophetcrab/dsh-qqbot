/** Read-only market quotes via Tencent's public quote endpoint. */

const ENDPOINT = 'https://qt.gtimg.cn/q='
const SINA_ENDPOINT = 'https://hq.sinajs.cn/list='
const CACHE_TTL_MS = 30_000
const cache = new Map()
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124 Safari/537.36'

const INDEX_ALIASES = new Map([
  ['上证指数', 'sh000001'], ['上证', 'sh000001'], ['沪指', 'sh000001'], ['shanghai', 'sh000001'],
  ['深证成指', 'sz399001'], ['深成指', 'sz399001'], ['深证', 'sz399001'],
  ['创业板指', 'sz399006'], ['创业板', 'sz399006'],
  ['沪深300', 'sh000300'], ['沪深300指数', 'sh000300'], ['csi300', 'sh000300'],
  ['中证500', 'sh000905'], ['中证1000', 'sh000852'], ['科创50', 'sh000688'],
  ['恒生指数', 'hkHSI'], ['恒指', 'hkHSI'],
  ['纳斯达克', 'usIXIC'], ['道琼斯', 'usDJI'], ['标普500', 'usINX'],
])
const COMMODITY_ALIASES = new Map([
  ['黄金', 'hf_GC'], ['现货黄金', 'hf_GC'], ['金价', 'hf_GC'], ['gold', 'hf_GC'],
  ['白银', 'hf_SI'], ['silver', 'hf_SI'],
  ['原油', 'hf_CL'], ['oil', 'hf_CL'], ['wti', 'hf_CL'],
  ['美元人民币', 'fx_susdcny'], ['usdcny', 'fx_susdcny'], ['美元兑人民币', 'fx_susdcny'],
])
const FUTURES = new Set(['IF', 'IH', 'IC', 'IM', 'RB', 'AU', 'AG', 'CU', 'AL', 'ZN', 'NI', 'SN', 'PB', 'HC', 'SS', 'SC', 'FU', 'BU', 'RU', 'SP', 'SA', 'FG', 'MA', 'TA', 'M', 'Y', 'P', 'C', 'A', 'B', 'JD', 'CF', 'SR', 'OI', 'RM', 'AP', 'CJ', 'UR', 'SF', 'SM', 'LC', 'SI', 'EC'])

function text(value, max = 80) { return String(value ?? '').trim().slice(0, max) }
function number(value) { const n = Number(value); return Number.isFinite(n) ? n : null }

export function tencentCode(symbol, market = '') {
  const raw = text(symbol, 40)
  if (raw === '') return ''
  const key = raw.toLowerCase()
  const marketKey = text(market, 30).toLowerCase()
  if (INDEX_ALIASES.has(raw)) return INDEX_ALIASES.get(raw)
  if (INDEX_ALIASES.has(key)) return INDEX_ALIASES.get(key)
  if (COMMODITY_ALIASES.has(raw)) return COMMODITY_ALIASES.get(raw)
  if (COMMODITY_ALIASES.has(key)) return COMMODITY_ALIASES.get(key)
  if (/^(sh|sz|bj|hk|us|nf_|hf_|fx_)/iu.test(raw)) return raw
  if (/^\d{6}$/u.test(raw)) {
    if (marketKey === 'cn_index') return raw.startsWith('399') ? `sz${raw}` : `sh${raw}`
    return /^(6|9)/u.test(raw) ? `sh${raw}` : /^(4|8)/u.test(raw) ? `bj${raw}` : `sz${raw}`
  }
  const upper = raw.toUpperCase()
  if (FUTURES.has(upper) || /^[A-Z]{1,2}\d{3,4}$/u.test(upper)) {
    return /^\d/u.test(upper) ? `nf_${upper}` : `nf_${upper}${/\d/u.test(upper) ? '' : '0'}`
  }
  if (/^[A-Z]{2,5}$/u.test(upper)) return `us_${upper}`
  if (/^[A-Z]{6}$/u.test(upper)) return `fx_s${upper.toLowerCase()}`
  return ''
}

export function parseTencentQuotes(source) {
  const textValue = String(source ?? '')
  const quotes = []
  for (const match of textValue.matchAll(/v_([A-Za-z0-9_]+)="([^"]*)"/gu)) {
    const fields = match[2].split('~')
    if (fields.length < 6) continue
    const timeIndex = fields.findIndex((value, index) => index > 10 && /^\d{12,14}$/u.test(value))
    const after = timeIndex >= 0 ? timeIndex : 30
    quotes.push({
      code: match[1],
      name: fields[1] || match[1],
      price: number(fields[3]),
      previousClose: number(fields[4]),
      open: number(fields[5]),
      volume: number(fields[6]),
      time: fields[after] ?? '',
      change: number(fields[after + 1]),
      changePercent: number(fields[after + 2]),
      high: number(fields[after + 3]),
      low: number(fields[after + 4]),
    })
  }
  return quotes
}

function parseSinaGlobal(code, fields) {
  const name = fields[16] || fields[13] || code
  if (code.startsWith('hf_')) {
    const price = number(fields[0])
    const previousClose = number(fields[7])
    return {
      code, name, price, previousClose,
      open: number(fields[8]), high: number(fields[4]), low: number(fields[5]),
      time: `${fields[12] ?? ''} ${fields[6] ?? ''}`.trim(),
      change: price !== null && previousClose !== null ? price - previousClose : null,
      changePercent: price !== null && previousClose ? (price - previousClose) / previousClose * 100 : null,
    }
  }
  if (code.startsWith('fx_')) {
    const price = number(fields[1])
    const previousClose = number(fields[5])
    return {
      code, name: fields[9] || code, price, previousClose,
      open: null, high: null, low: null,
      time: `${fields[17] ?? ''} ${fields[0] ?? ''}`.trim(),
      change: price !== null && previousClose !== null ? price - previousClose : null,
      changePercent: price !== null && previousClose ? (price - previousClose) / previousClose * 100 : null,
    }
  }
  const price = number(fields[5])
  const previousClose = number(fields[8])
  return {
    code, name, price, previousClose,
    open: number(fields[2]), high: number(fields[3]), low: number(fields[4]),
    time: `${fields[17] ?? ''} ${fields[1] ?? ''}`.trim(),
    change: price !== null && previousClose !== null ? price - previousClose : null,
    changePercent: price !== null && previousClose ? (price - previousClose) / previousClose * 100 : null,
  }
}

async function requestSinaQuotes(codes, { timeoutMs = 8000, fetchImpl = fetch } = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), Math.max(2000, Number(timeoutMs) || 8000))
  timer.unref?.()
  try {
    const response = await fetchImpl(`${SINA_ENDPOINT}${codes.join(',')}`, {
      signal: controller.signal,
      headers: { 'user-agent': USER_AGENT, referer: 'https://finance.sina.com.cn/', accept: 'text/plain' },
    })
    if (response.ok !== true) return { ok: false, error: `quote HTTP ${response.status}` }
    const buffer = Buffer.from(await response.arrayBuffer())
    let decoded
    try { decoded = new TextDecoder('gbk').decode(buffer) } catch { decoded = buffer.toString('utf8') }
    const quotes = []
    for (const match of decoded.matchAll(/hq_str_([A-Za-z0-9_]+)="([^"]*)"/gu)) {
      const fields = match[2].split(',')
      if (fields.length < 6) continue
      const quote = parseSinaGlobal(match[1], fields)
      quotes.push({ ...quote, source: 'sina' })
    }
    return { ok: true, quotes }
  } catch (error) {
    return { ok: false, error: String(error?.message ?? error) }
  } finally {
    clearTimeout(timer)
  }
}

async function requestQuotes(codes, { timeoutMs = 8000, fetchImpl = fetch } = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), Math.max(2000, Number(timeoutMs) || 8000))
  timer.unref?.()
  try {
    const response = await fetchImpl(`${ENDPOINT}${codes.join(',')}`, {
      signal: controller.signal,
      headers: { 'user-agent': USER_AGENT, referer: 'https://gu.qq.com/', accept: 'text/plain' },
    })
    if (response.ok !== true) return { ok: false, error: `quote HTTP ${response.status}` }
    const buffer = Buffer.from(await response.arrayBuffer())
    let decoded
    try { decoded = new TextDecoder('gbk').decode(buffer) } catch { decoded = buffer.toString('utf8') }
    return { ok: true, quotes: parseTencentQuotes(decoded) }
  } catch (error) {
    return { ok: false, error: String(error?.message ?? error) }
  } finally {
    clearTimeout(timer)
  }
}

export function parseMarketQuoteCall(raw, parsed = null) {
  if (parsed?.type === 'tool_call' && parsed.tool === 'market_quote') {
    const symbol = text(parsed.args?.symbol, 40)
    if (symbol === '') return null
    return { symbol, market: text(parsed.args?.market, 30) }
  }
  const source = String(raw ?? '')
  if (!/tool_call|<\|\|DSML|DSML/iu.test(source)) return null
  const match = source.match(/\{[^{}]*"symbol"\s*:\s*"([^"]+)"[^{}]*\}/u)
  return match === null ? null : { symbol: match[1].slice(0, 40), market: '' }
}

export async function getMarketQuote(symbol, { market = '', timeoutMs = 8000, fetchImpl = fetch } = {}) {
  const code = tencentCode(symbol, market)
  if (code === '') return { ok: false, error: `无法识别的行情代码：${symbol}` }
  const cached = cache.get(code)
  if (cached !== undefined && Date.now() - cached.at < CACHE_TTL_MS) return { ...cached.result, cached: true }
  const result = code.startsWith('hf_') || code.startsWith('fx_') || code.startsWith('nf_')
    ? await requestSinaQuotes([code.startsWith('nf_') ? code.slice(3) : code], { timeoutMs, fetchImpl })
    : await requestQuotes([code], { timeoutMs, fetchImpl })
  if (result.ok !== true) return { ok: false, error: result.error ?? '行情请求失败' }
  const quote = result.quotes[0]
  if (quote === undefined) return { ok: false, error: `没有查到行情：${code}` }
  const value = { ok: true, ...quote, code, source: code.startsWith('hf_') || code.startsWith('fx_') || code.startsWith('nf_') ? 'sina' : 'tencent', asOf: new Date().toISOString() }
  cache.set(code, { at: Date.now(), result: value })
  return value
}

export function renderMarketQuote(result) {
  if (result?.ok !== true) return `【market_quote】查询失败：${result?.error ?? '未知错误'}`
  const round = (value) => value === null ? '—' : Number(value).toFixed(2)
  const change = result.change === null ? '—' : `${result.change > 0 ? '+' : ''}${round(result.change)}`
  const percent = result.changePercent === null ? '—' : `${result.changePercent > 0 ? '+' : ''}${round(result.changePercent)}%`
  const sourceName = result.source === 'sina' ? '新浪行情' : '腾讯行情'
  const lines = [
    `【market_quote】数据源：${sourceName}，截至 ${result.time || result.asOf}`,
    `${result.name}（${result.code}）：${round(result.price)}，涨跌 ${change}（${percent}）`,
    `今开 ${round(result.open)} / 最高 ${round(result.high)} / 最低 ${round(result.low)} / 昨收 ${round(result.previousClose)}`,
  ]
  return lines.join('\n')
}
