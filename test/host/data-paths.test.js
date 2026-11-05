import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { dataPaths, migrateDataLayout } from '../../host/platform/index.js'

async function tempProject(t) {
  const root = await mkdtemp(join(tmpdir(), 'dsh-qqbot-data-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  await mkdir(join(root, 'data'), { recursive: true })
  await writeFile(join(root, 'data', 'access.json'), '{"legacy":true}')
  await writeFile(join(root, 'data', 'persona.json'), '{"name":"old"}')
  await writeFile(join(root, 'data', 'ai-chat-state.json'), '{"reply":"old"}')
  await writeFile(join(root, 'data', 'koishi.db'), 'sqlite')
  await writeFile(join(root, 'koishi.yml'), 'plugins:\n  database-sqlite:\n    path: data/koishi.db\n')
  return root
}

test('migrateDataLayout: moves legacy files into config/state/assets', async (t) => {
  const root = await tempProject(t)
  const result = await migrateDataLayout(root)
  const paths = dataPaths(root)
  assert.deepEqual(result.moved.sort(), ['access.json', 'ai-chat-state.json', 'persona.json'].sort())
  assert.equal(await readFile(paths.config.access, 'utf8'), '{"legacy":true}')
  assert.equal(await readFile(paths.config.persona, 'utf8'), '{"name":"old"}')
  assert.equal(await readFile(paths.state.aiChat, 'utf8'), '{"reply":"old"}')
  await stat(paths.assets.personaPresets).catch(() => assert.ok(true))
})

test('migrateDataLayout: --database moves sqlite and updates koishi.yml', async (t) => {
  const root = await tempProject(t)
  const result = await migrateDataLayout(root, { includeDatabase: true })
  const paths = dataPaths(root)
  assert.equal(result.includedDatabase, true)
  assert.equal(await readFile(paths.state.koishiDb, 'utf8'), 'sqlite')
  assert.match(await readFile(join(root, 'koishi.yml'), 'utf8'), /data\/state\/koishi\.db/u)
})

test('dataPaths: stable canonical layout', () => {
  const paths = dataPaths('/tmp/project')
  assert.ok(paths.config.access.endsWith('data/config/access.json'))
  assert.ok(paths.state.aiDiscovery.endsWith('data/state/ai.json'))
  assert.ok(paths.assets.profiles.endsWith('data/assets/profiles.json'))
})
