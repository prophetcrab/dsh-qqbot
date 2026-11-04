import assert from 'node:assert/strict'
import { test } from 'node:test'
import { getWeather, parseWeatherCall, renderWeatherResult } from '../../host/services/group-loop/weather.js'

function dayKey(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}
function plusDays(date, days) {
  const value = new Date(`${date}T00:00:00+08:00`)
  value.setUTCDate(value.getUTCDate() + days)
  return dayKey(value)
}

function fakeFetch(record) {
  return async (url) => {
    const target = String(url)
    record.push(target)
    if (target.startsWith('https://geocoding-api.open-meteo.com')) {
      return { ok: true, json: async () => ({ results: [{ name: '上海', admin1: '上海市', country: '中国', latitude: 31.23, longitude: 121.47 }] }) }
    }
    const today = dayKey()
    return {
      ok: true,
      json: async () => ({
        timezone: 'Asia/Shanghai',
        current: { time: `${today}T10:00`, temperature_2m: 18.2, apparent_temperature: 17.4, relative_humidity_2m: 72, precipitation: 0, weather_code: 2, wind_speed_10m: 12, is_day: 1 },
        daily: {
          time: [today, plusDays(today, 1), plusDays(today, 2)],
          weather_code: [2, 61, 0],
          temperature_2m_max: [22, 20, 24],
          temperature_2m_min: [15, 14, 16],
          precipitation_probability_max: [10, 70, 0],
        },
      }),
    }
  }
}

test('weather resolves a place and returns current and daily data', async () => {
  const calls = []
  const result = await getWeather('上海', { fetchImpl: fakeFetch(calls), timeoutMs: 1000 })
  assert.equal(result.ok, true)
  assert.equal(result.location.name, '上海')
  assert.equal(result.current.description, '多云')
  assert.equal(result.current.temperature, 18.2)
  assert.equal(result.day.max, 22)
  assert.equal(result.forecast.length, 3)
  assert.match(renderWeatherResult(result), /上海.*上海市.*中国/u)
  assert.match(renderWeatherResult(result), /当前：多云/u)
  assert.equal(calls.length, 2)
})

test('weather accepts tomorrow and parses ReAct-style calls', async () => {
  const calls = []
  const tomorrow = plusDays(dayKey(), 1)
  const result = await getWeather('上海', { fetchImpl: fakeFetch(calls), date: 'tomorrow', timeoutMs: 1000 })
  assert.equal(result.ok, true)
  assert.equal(result.date, tomorrow)
  assert.equal(result.current, null)
  assert.equal(result.day.description, '小雨')
  assert.deepEqual(parseWeatherCall('{"type":"tool_call","tool":"weather","args":{"location":"上海","date":"明天"}}', { type: 'tool_call', tool: 'weather', args: { location: '上海', date: '明天' } }), { location: '上海', date: '明天' })
  assert.equal(parseWeatherCall('{"parts":["嗯"]}'), null)
})

test('weather reports unknown places cleanly', async () => {
  const result = await getWeather('不存在的地方', {
    fetchImpl: async () => ({ ok: true, json: async () => ({ results: [] }) }),
    timeoutMs: 1000,
  })
  assert.equal(result.ok, false)
  assert.match(result.error, /未找到地点/u)
  assert.match(renderWeatherResult(result), /查询失败/u)
})
