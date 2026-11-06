/** Config-file driven prompt assembly: bootstrap, custom config, reload, fallback. */
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { GroupChatPrompts, emotionPrompt, profileData } from '../../host/services/group-loop/prompt/index.js'
import { compilePromptConfig, renderTemplate } from '../../host/services/prompt/index.js'

async function tempProject(t) {
  const root = await mkdtemp(join(tmpdir(), 'dsh-prompt-config-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  return root
}

function analyzeContext() {
  return {
    characterPrompt: '[SETTING LOAD]\n名称：鱼鱼',
    statePrompt: emotionPrompt({ valence: 0.1, energy: 0.5, socialBattery: 0.5, stress: 0.2, arousal: 0.4 }),
    profilesText: profileData([]),
    imageNote: '',
    background: '',
    memoryText: '',
    material: '晚上开黑吗',
    direct: false,
  }
}

function configPath(root) {
  return join(root, 'data', 'config', 'prompts', 'group-chat.json')
}

async function writeConfig(path, config) {
  await writeFile(path, JSON.stringify(config), 'utf8')
}

test('prompt config bootstraps from the bundled default and loads it', async (t) => {
  const root = await tempProject(t)
  const prompts = new GroupChatPrompts({ projectDir: root })
  assert.equal(existsSync(configPath(root)), true)
  const status = prompts.status()
  assert.equal(status.source, 'runtime')
  assert.equal(status.sections > 0, true)
  const built = prompts.buildAnalyze(analyzeContext())
  assert.match(built.system, /^\[SETTING LOAD\]/u)
  assert.match(built.user, /【本轮群聊素材】\n晚上开黑吗/u)
})

test('a custom config file controls templates, conditions and template filters', async (t) => {
  const root = await tempProject(t)
  const prompts = new GroupChatPrompts({ projectDir: root })
  const config = {
    version: 1,
    sections: [
      { id: 'custom', tier: 'system', template: 'CUSTOM {{direct}}' },
      { id: 'raw', tier: 'user', template: 'material={{material}}' },
    ],
    stages: {
      analyze: { system: ['custom'], user: ['raw'], budget: null },
      compose: { system: [], user: [], budget: null },
      'state-update': { system: [], user: [], budget: null },
    },
  }
  await writeConfig(configPath(root), config)
  const built = prompts.buildAnalyze(analyzeContext())
  assert.equal(built.system, 'CUSTOM false')
  assert.equal(built.user, 'material=晚上开黑吗')
})

test('prompt config hot reloads on mtime and keeps the last good config', async (t) => {
  const root = await tempProject(t)
  const prompts = new GroupChatPrompts({ projectDir: root })
  const path = configPath(root)
  const first = {
    version: 1,
    sections: [{ id: 'v', tier: 'system', template: 'V1' }],
    stages: {
      analyze: { system: ['v'], user: [], budget: null },
      compose: { system: [], user: [], budget: null },
      'state-update': { system: [], user: [], budget: null },
    },
  }
  await writeConfig(path, first)
  const future = new Date(Date.now() + 10000)
  await utimes(path, future, future)
  assert.equal(prompts.buildAnalyze({}).system, 'V1')

  const second = { ...first, sections: [{ id: 'v', tier: 'system', template: 'V2' }] }
  await writeConfig(path, second)
  await utimes(path, new Date(Date.now() + 20000), new Date(Date.now() + 20000))
  assert.equal(prompts.buildAnalyze({}).system, 'V2')

  await writeFile(path, '{ broken json', 'utf8')
  await utimes(path, new Date(Date.now() + 30000), new Date(Date.now() + 30000))
  assert.equal(prompts.buildAnalyze({}).system, 'V2')
  assert.match(prompts.status().error, /JSON|Unexpected|Expected/u)
})

test('template placeholders support paths and the json filter', () => {
  assert.equal(renderTemplate('a={{speak.target.messageIds|json}}', { speak: { target: { messageIds: ['m1'] } } }), 'a=["m1"]')
  assert.equal(renderTemplate('missing={{nope}}', {}), 'missing=')
  assert.equal(renderTemplate('count={{targetBubbles}}', { targetBubbles: 2 }), 'count=2')
})

test('config compiler rejects unknown sections and invalid conditions', () => {
  assert.throws(() => compilePromptConfig({
    version: 1,
    sections: [{ id: 'a', tier: 'system', template: 'a' }],
    stages: { s: { system: ['missing'], user: [] } },
  }), /unknown section/u)
  assert.throws(() => compilePromptConfig({
    version: 1,
    sections: [{ id: 'a', tier: 'system', template: 'a', when: { field: 'direct', magic: true } }],
    stages: { s: { system: ['a'], user: [] } },
  }), /unknown operator|exactly one operator/u)
})
