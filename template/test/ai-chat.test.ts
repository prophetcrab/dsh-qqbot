import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test, type TestContext } from 'node:test'
import { App } from 'koishi'
import mock from '@koishijs/plugin-mock'
import * as aiChat from '../plugins/ai-chat/index.ts'

const SELF_ID = '10000'
const GROUP = '123456'
const USER = '20000'

interface FetchCall {
  url: string
  body: any
}

async function setup(t: TestContext, config: Record<string, any> = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'qqbot-ai-'))
  const discoveryFile = join(dir, 'data', 'ai.json')
  mkdirSync(dirname(discoveryFile), { recursive: true })
  writeFileSync(discoveryFile, JSON.stringify({
    endpoint: 'http://127.0.0.1:9/qqbot/ai/chat',
    provider: 'deepseek-account',
    model: 'deepseek-flash',
  }), 'utf8')

  const calls: FetchCall[] = []
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async (url: any, init: any) => {
    calls.push({ url: String(url), body: JSON.parse(init.body) })
    return {
      ok: true,
      status: 200,
      json: async () => ({ ok: true, reply: '这是 AI 的回复', provider: 'deepseek-account', model: 'deepseek-flash' }),
    } as Response
  }) as typeof fetch

  const app = new App({ prefix: ['/'] })
  app.plugin(mock, { selfId: SELF_ID })
  app.plugin(aiChat as any, { discoveryFile, ...config })
  await app.start()
  t.after(async () => {
    globalThis.fetch = originalFetch
    await app.stop()
    rmSync(dir, { recursive: true, force: true })
  })
  return { app, calls }
}

test('群消息进入上下文，/ai 触发时把历史一起发给 DSH 并回复', async (t) => {
  const { app, calls } = await setup(t)
  await app.mock.client(USER, GROUP).receive('今天天气不错')
  await app.mock.client(USER, GROUP).receive('你们在聊什么')
  const replies = await app.mock.client(USER, GROUP).receive('/ai 总结一下')
  assert.deepEqual(replies, ['这是 AI 的回复'])
  assert.equal(calls.length, 1)
  assert.match(calls[0].url, /\/qqbot\/ai\/chat/u)
  const sent = calls[0].body.messages
  assert.ok(sent.some((m: any) => m.text.includes('今天天气不错')))
  assert.ok(sent.some((m: any) => m.text.includes('你们在聊什么')))
  assert.ok(sent.some((m: any) => m.text.includes('总结一下')))
})

test('@机器人 同样触发 AI', async (t) => {
  const { app, calls } = await setup(t)
  const replies = await app.mock.client(USER, GROUP).receive(`<at id="${SELF_ID}"/> 你好`)
  assert.deepEqual(replies, ['这是 AI 的回复'])
  assert.equal(calls.length, 1)
})

test('未触发时只记录上下文，不调用 AI', async (t) => {
  const { app, calls } = await setup(t)
  const replies = await app.mock.client(USER, GROUP).receive('随便聊聊')
  assert.deepEqual(replies, [])
  assert.equal(calls.length, 0)
})

test('AI 返回错误时给出友好提示', async (t) => {
  const { app } = await setup(t)
  globalThis.fetch = (async () => ({
    ok: false,
    status: 500,
    json: async () => ({ ok: false, error: '模型返回错误：AUTH' }),
  })) as typeof fetch
  const replies = await app.mock.client(USER, GROUP).receive('/ai 在吗')
  assert.equal(replies.length, 1)
  assert.match(replies[0], /AI 暂时不可用/u)
})

test('splitReply 按长度拆分长回复', () => {
  const parts = aiChat.splitReply('a'.repeat(2500), 1000)
  assert.deepEqual(parts.map((p) => p.length), [1000, 1000, 500])
})
