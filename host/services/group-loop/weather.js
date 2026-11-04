/** Read-only weather tool backed by Open-Meteo (no API key). */

const GEOCODE_ENDPOINT = 'https://geocoding-api.open-meteo.com/v1/search'
const FORECAST_ENDPOINT = 'https://api.open-meteo.com/v1/forecast'
const CACHE_TTL_MS = 5 * 60_000
const cache = new Map()

const WEATHER_CODES = new Map([
  [0, '晴'], [1, '大部晴'], [2, '多云'], [3, '阴'],
  [45, '雾'], [48, '雾凇'],
  [51, '小毛毛雨'], [53, '毛毛雨'], [55, '大毛毛雨'], [56, '冻毛毛雨'], [57, '强冻毛毛雨'],
  [61, '小雨'], [63, '中雨'], [65, '大雨'], [66, '冻雨'], [67, '强冻雨'],
  [71, '小雪'], [73, '中雪'], [75, '大雪'], [77, '米雪'],
  [80, '小阵雨'], [81, '阵雨'], [82, '强阵雨'], [85, '小阵雪'], [86, '强阵雪'],
  [95, '雷暴'], [96, '雷暴伴小冰雹'], [99, '雷暴伴大冰雹'],
])

function text(value, max = 80) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/gu, ' ').trim().slice(0, max)
}
function number(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}
function dayKey(date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date)
}
function shiftDay(base, days) {
  const date = new Date(`${base}T00:00:00+08:00`)
  date.setUTCDate(date.getUTCDate() + days)
  return dayKey(date)
}
function resolveDate(raw, today) {
  const value = text(raw, 20).toLowerCase()
  if (value === '' || value === 'today' || value === '今天' || value === '今日') return today
  if (value === 'tomorrow' || value === '明天') return shiftDay(today, 1)
  if (value === 'dayafter' || value === '后天') return shiftDay(today, 2)
  if (/^\d{4}-\d{2}-\d{2}$/u.test(value)) return value
  return today
}
function description(code) {
  return WEATHER_CODES.get(Number(code)) ?? '未知天气'
}
function keyOf(location, date) {
  return `${location.toLowerCase()}:${date}`
}

async function requestJson(url, { timeoutMs, fetchImpl }) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), Math.max(2000, Number(timeoutMs) || 8000))
  timer.unref?.()
  try {
    const response = await fetchImpl(url, {
      signal: controller.signal,
      headers: { accept: 'application/json', 'user-agent': 'dsh-qqbot-weather/1.0' },
    })
    if (response.ok !== true) return { ok: false, error: `weather HTTP ${response.status}` }
    const data = await response.json()
    return { ok: true, data }
  } catch (error) {
    return { ok: false, error: String(error?.message ?? error) }
  } finally {
    clearTimeout(timer)
  }
}

export function parseWeatherCall(raw, parsed = null) {
  const source = String(raw ?? '')
  if (!/tool_call|<\|\|DSML|DSML|"type"\s*:\s*"tool_call"/iu.test(source)) return null
  if (parsed?.type === 'tool_call' && parsed.tool === 'weather') {
    const location = text(parsed.args?.location, 80)
    if (location === '') return null
    return { location, date: text(parsed.args?.date, 20) }
  }
  const objectMatch = source.match(/\{[^{}]*"location"[^{}]*\}/u)
  if (objectMatch !== null) {
    try {
      const parsedArgs = JSON.parse(objectMatch[0])
      const location = text(parsedArgs.location, 80)
      if (location !== '') return { location, date: text(parsedArgs.date, 20) }
    } catch { /* fall through */ }
  }
  return null
}

export async function getWeather(locationInput, { timeoutMs = 8000, fetchImpl = fetch, date = '' } = {}) {
  const location = text(locationInput, 80)
  if (location === '') return { ok: false, error: 'empty location' }
  const today = dayKey(new Date())
  const targetDate = resolveDate(date, today)
  const key = keyOf(location, targetDate)
  const cached = cache.get(key)
  if (cached !== undefined && Date.now() - cached.at < CACHE_TTL_MS) return { ...cached.result, cached: true }

  const geocodeUrl = new URL(GEOCODE_ENDPOINT)
  geocodeUrl.searchParams.set('name', location)
  geocodeUrl.searchParams.set('count', '1')
  geocodeUrl.searchParams.set('language', 'zh')
  geocodeUrl.searchParams.set('format', 'json')
  const geocode = await requestJson(geocodeUrl.href, { timeoutMs, fetchImpl })
  if (geocode.ok !== true) return { ok: false, error: geocode.error ?? 'geocoding failed' }
  const place = Array.isArray(geocode.data?.results) ? geocode.data.results[0] : null
  if (place === null || place === undefined) return { ok: false, error: `未找到地点：${location}` }
  const latitude = number(place.latitude)
  const longitude = number(place.longitude)
  if (latitude === null || longitude === null) return { ok: false, error: '无效地点坐标' }

  const forecastUrl = new URL(FORECAST_ENDPOINT)
  forecastUrl.searchParams.set('latitude', String(latitude))
  forecastUrl.searchParams.set('longitude', String(longitude))
  forecastUrl.searchParams.set('current', 'temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m,is_day')
  forecastUrl.searchParams.set('daily', 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max')
  forecastUrl.searchParams.set('timezone', 'auto')
  forecastUrl.searchParams.set('forecast_days', '7')
  const forecast = await requestJson(forecastUrl.href, { timeoutMs, fetchImpl })
  if (forecast.ok !== true) return { ok: false, error: forecast.error ?? 'forecast failed' }
  const data = forecast.data ?? {}
  const daily = data.daily !== null && typeof data.daily === 'object' ? data.daily : {}
  const dates = Array.isArray(daily.time) ? daily.time : []
  const index = dates.indexOf(targetDate)
  if (index < 0) return { ok: false, error: `预报范围不包含 ${targetDate}` }
  const current = data.current !== null && typeof data.current === 'object' ? data.current : {}
  const result = {
    ok: true,
    location: {
      name: text(place.name, 80), admin1: text(place.admin1, 80), country: text(place.country, 80),
      latitude, longitude, timezone: text(data.timezone, 80),
    },
    date: targetDate,
    today,
    current: targetDate === today ? {
      time: text(current.time, 40),
      temperature: number(current.temperature_2m),
      apparent: number(current.apparent_temperature),
      humidity: number(current.relative_humidity_2m),
      precipitation: number(current.precipitation),
      wind: number(current.wind_speed_10m),
      isDay: current.is_day === 1,
      code: Number(current.weather_code),
      description: description(current.weather_code),
    } : null,
    day: {
      code: Number(daily.weather_code?.[index]),
      description: description(daily.weather_code?.[index]),
      max: number(daily.temperature_2m_max?.[index]),
      min: number(daily.temperature_2m_min?.[index]),
      precipitationProbability: number(daily.precipitation_probability_max?.[index]),
    },
    forecast: dates.slice(index, index + 3).map((day, offset) => ({
      date: day,
      code: Number(daily.weather_code?.[index + offset]),
      description: description(daily.weather_code?.[index + offset]),
      max: number(daily.temperature_2m_max?.[index + offset]),
      min: number(daily.temperature_2m_min?.[index + offset]),
      precipitationProbability: number(daily.precipitation_probability_max?.[index + offset]),
    })),
    asOf: new Date().toISOString(),
    source: 'open-meteo',
  }
  cache.set(key, { at: Date.now(), result })
  return result
}

export function renderWeatherResult(result) {
  if (result?.ok !== true) return `【weather】查询失败${result?.error ? `：${result.error}` : ''}`
  const place = [result.location?.name, result.location?.admin1, result.location?.country].filter(Boolean).join('，')
  const lines = [`【weather 天气数据，截至 ${result.asOf}】`, `地点：${place || '未知'}`]
  if (result.current !== null && result.current !== undefined) {
    const current = result.current
    lines.push(`当前：${current.description}，${current.temperature ?? '?'}°C，体感 ${current.apparent ?? '?'}°C，湿度 ${current.humidity ?? '?'}%，风速 ${current.wind ?? '?'} km/h`)
  }
  const day = result.day
  if (day !== null && day !== undefined) {
    lines.push(`${result.date}：${day.description}，${day.min ?? '?'}–${day.max ?? '?'}°C，降水概率 ${day.precipitationProbability ?? '?'}%`)
  }
  if (Array.isArray(result.forecast) && result.forecast.length > 0) {
    lines.push('未来：')
    for (const entry of result.forecast) {
      lines.push(`${entry.date}：${entry.description}，${entry.min ?? '?'}–${entry.max ?? '?'}°C，降水概率 ${entry.precipitationProbability ?? '?'}%`)
    }
  }
  return lines.join('\n')
}
