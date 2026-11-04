/** Read-only finance calendar via Eastmoney's public data-center endpoint. */

const ENDPOINT = 'https://datacenter-web.eastmoney.com/web/api/data/v1/get'
const CACHE_TTL_MS = 5 * 60_000
const cache = new Map()
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124 Safari/537.36'
const TYPE_NAMES = new Map([['1', '行业会议'], ['2', '经济数据'], ['3', '其他']])

function text(value, max = 200) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/gu, ' ').trim().slice(0, max)
}
function dateKey(value = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(value)
}
function shift(date, days) {
  const value = new Date(`${date}T00:00:00+08:00`)
  value.setUTCDate(value.getUTCDate() + days)
  return dateKey(value)
}
function resolveRange(args = {}) {
  const today = dateKey()
  const raw = text(args.date, 20).toLowerCase()
  if (/^\d{4}-\d{2}-\d{2}$/u.test(raw)) return { start: raw, end: shift(raw, 1) }
  if (raw === 'today' || raw === '今天' || raw === '今日') return { start: today, end: shift(today, 1) }
  if (raw === 'tomorrow' || raw === '明天') return { start: shift(today, 1), end: shift(today, 2) }
  if (raw === 'week' || raw === '本周' || raw === '7d' || raw === '') return { start: today, end: shift(today, 7) }
  const start = text(args.start, 20)
  const end = text(args.end, 20)
  if (/^\d{4}-\d{2}-\d{2}$/u.test(start) && /^\d{4}-\d{2}-\d{2}$/u.test(end)) return { start, end }
  return { start: today, end: shift(today, 7) }
}

export function parseFinanceCalendarCall(raw, parsed = null) {
  if (parsed?.type === 'tool_call' && parsed.tool === 'finance_calendar') {
    const args = parsed.args !== null && typeof parsed.args === 'object' ? parsed.args : {}
    return { date: text(args.date, 20), start: text(args.start, 20), end: text(args.end, 20), type: text(args.type, 20), limit: Number(args.limit) || 20 }
  }
  const source = String(raw ?? '')
  if (!/tool_call|<\|\|DSML|DSML/iu.test(source)) return null
  const start = source.indexOf('{')
  const end = source.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    const value = JSON.parse(source.slice(start, end + 1))
    if (value?.type !== 'tool_call' || value.tool !== 'finance_calendar') return null
    return { date: text(value.args?.date, 20), start: text(value.args?.start, 20), end: text(value.args?.end, 20), type: text(value.args?.type, 20), limit: Number(value.args?.limit) || 20 }
  } catch {
    return null
  }
}

async function requestCalendar(url, { timeoutMs, fetchImpl }) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), Math.max(2000, Number(timeoutMs) || 8000))
  timer.unref?.()
  try {
    const response = await fetchImpl(url, {
      signal: controller.signal,
      headers: { 'user-agent': USER_AGENT, referer: 'https://data.eastmoney.com/cjrl/', accept: 'application/json' },
    })
    if (response.ok !== true) return { ok: false, error: `calendar HTTP ${response.status}` }
    return { ok: true, data: await response.json() }
  } catch (error) {
    return { ok: false, error: String(error?.message ?? error) }
  } finally {
    clearTimeout(timer)
  }
}

export async function getFinanceCalendar(args = {}, { timeoutMs = 8000, fetchImpl = fetch } = {}) {
  const range = resolveRange(args)
  const type = text(args.type, 20).toLowerCase()
  const key = `${range.start}:${range.end}:${type}`
  const cached = cache.get(key)
  if (cached !== undefined && Date.now() - cached.at < CACHE_TTL_MS) return { ...cached.result, cached: true }
  const conflict = `(END_DATE>='${range.start}')(START_DATE<'${range.end}')`
  const typeFilter = type === 'economic' || type === '2' ? '2' : type === 'event' || type === '1' ? '1' : ''
  const filter = typeFilter === '' ? conflict : `${conflict}(STD_TYPE_CODE="${typeFilter}")`
  const params = new URLSearchParams({
    reportName: 'RPT_CPH_FECALENDAR',
    pageSize: '50',
    sortColumns: 'START_DATE',
    sortTypes: '1',
    filter,
    source: 'WEB',
    client: 'WEB',
    columns: 'START_DATE,END_DATE,FE_CODE,FE_NAME,FE_TYPE,CONTENT,STD_TYPE_CODE,SPONSOR_NAME,CITY',
  })
  const result = await requestCalendar(`${ENDPOINT}?${params.toString()}`, { timeoutMs, fetchImpl })
  if (result.ok !== true) return { ok: false, error: result.error ?? '财经日历请求失败' }
  const rows = Array.isArray(result.data?.result?.data) ? result.data.result.data : []
  const limit = Math.max(1, Math.min(50, Number(args.limit) || 20))
  const events = rows.slice(0, limit).map((row) => ({
    start: text(row.START_DATE, 40),
    end: text(row.END_DATE, 40),
    name: text(row.FE_NAME, 200),
    type: TYPE_NAMES.get(String(row.STD_TYPE_CODE)) ?? text(row.FE_TYPE, 40),
    content: text(row.CONTENT, 500),
    sponsor: text(row.SPONSOR_NAME, 120),
    city: text(row.CITY, 80),
  })).filter((event) => event.name !== '')
  const value = { ok: true, start: range.start, end: range.end, events, source: 'eastmoney', asOf: new Date().toISOString() }
  cache.set(key, { at: Date.now(), result: value })
  return value
}

export function renderFinanceCalendar(result) {
  if (result?.ok !== true) return `【finance_calendar】查询失败：${result?.error ?? '未知错误'}`
  if (!Array.isArray(result.events) || result.events.length === 0) return `【finance_calendar】${result.start} ~ ${result.end} 没有查到财经事件。`
  const lines = [`【finance_calendar】${result.start} ~ ${result.end}，共 ${result.events.length} 条`]
  for (const event of result.events) {
    const date = String(event.start || '').slice(0, 10)
    lines.push(`${date} [${event.type || '事件'}] ${event.name}${event.city ? `（${event.city}）` : ''}${event.content ? `：${event.content.slice(0, 160)}` : ''}`)
  }
  return lines.join('\n')
}
