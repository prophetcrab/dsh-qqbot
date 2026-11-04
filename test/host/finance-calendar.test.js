import assert from 'node:assert/strict'
import { test } from 'node:test'
import { getFinanceCalendar, parseFinanceCalendarCall, renderFinanceCalendar } from '../../host/services/group-loop/finance-calendar.js'

function fakeFetch(record) {
  return async (url) => {
    record.push(String(url))
    return {
      ok: true,
      json: async () => ({
        result: {
          data: [
            { START_DATE: '2026-11-04 00:00:00', END_DATE: '2026-11-04 00:00:00', FE_NAME: '美国:ADP就业人数', FE_TYPE: '经济数据', STD_TYPE_CODE: '2', CONTENT: '市场预期', CITY: '美国' },
            { START_DATE: '2026-11-05 00:00:00', END_DATE: '2026-11-05 00:00:00', FE_NAME: '进博会', FE_TYPE: '行业会议', STD_TYPE_CODE: '1', CITY: '上海' },
          ],
        },
      }),
    }
  }
}

test('finance calendar fetches and renders events', async () => {
  const calls = []
  const result = await getFinanceCalendar({ date: 'today' }, { fetchImpl: fakeFetch(calls), timeoutMs: 1000 })
  assert.equal(result.ok, true)
  assert.equal(result.events.length, 2)
  assert.equal(result.events[0].type, '经济数据')
  assert.match(renderFinanceCalendar(result), /ADP/u)
  assert.match(renderFinanceCalendar(result), /进博会/u)
  assert.match(calls[0], /RPT_CPH_FECALENDAR/u)
})

test('finance calendar parses tool calls and reports empty ranges', async () => {
  assert.deepEqual(parseFinanceCalendarCall('{"type":"tool_call","tool":"finance_calendar","args":{"date":"today","type":"economic"}}'), { date: 'today', start: '', end: '', type: 'economic', limit: 20 })
  const empty = await getFinanceCalendar({ date: 'tomorrow' }, { fetchImpl: async () => ({ ok: true, json: async () => ({ result: { data: [] } }) }), timeoutMs: 1000 })
  assert.equal(empty.ok, true)
  assert.match(renderFinanceCalendar(empty), /没有查到/u)
})
