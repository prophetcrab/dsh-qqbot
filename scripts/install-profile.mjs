#!/usr/bin/env node
/**
 * Install dsh-qqbot into a DeepSeek Harness profile.
 *
 * A DSH plugin is loaded by a profile: the profile declares the package as a
 * dependency, lists it in `dsh.profile.bundles`, and its bundle patch inserts
 * the plugin row. This script performs those three edits idempotently, backs up
 * the touched files, and optionally runs pnpm install.
 *
 *   node scripts/install-profile.mjs --profile desktop --install
 *   node scripts/install-profile.mjs --dry-run
 *   node scripts/install-profile.mjs --uninstall
 *
 * Restart DeepSeek Harness afterwards for the plugin to load.
 */

import { execFile } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const PLUGIN_NAME = 'dsh-qqbot'
const ROW_ID = 'qqbot'
const PATCH_BLOCK = `
# dsh-qqbot: QQ bot control center — NapCat/Koishi setup, lifecycle, Koishi plugin management.
- insert:
    - id: ${ROW_ID}
      name: ${PLUGIN_NAME}
`

const pluginDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const options = parseArgs(args)

if (options.help) {
  console.log(`用法：node scripts/install-profile.mjs [options]

  --profile <name>   DSH profile 名称（默认 desktop），对应 ~/.dsh/profiles/<name>
  --spec <spec>      依赖 spec（默认 link:<本插件目录>）
  --install          写入后执行 pnpm install
  --dry-run          只打印将要做的修改
  --uninstall        从 profile 中移除本插件（不删除包）
  --yes              跳过确认提示（本脚本无交互，保留兼容）
  -h, --help         显示帮助`)
  process.exit(0)
}

const profileName = options.profile ?? 'desktop'
const profileDir = join(homedir(), '.dsh', 'profiles', profileName)
const packagePath = join(profileDir, 'package.json')
const patchPath = join(profileDir, 'cordis.patch.yml')

if (!existsSync(profileDir)) fail(`找不到 profile 目录：${profileDir}`)
if (!existsSync(packagePath)) fail(`找不到 profile package.json：${packagePath}`)

const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'))
const patchText = existsSync(patchPath) ? readFileSync(patchPath, 'utf8') : ''
const plugins = Array.isArray(packageJson.dsh?.profile?.bundles) ? packageJson.dsh.profile.bundles : []

const installed = Object.hasOwn(packageJson.dependencies ?? {}, PLUGIN_NAME)
const listed = plugins.includes(PLUGIN_NAME)
const patched = new RegExp(`^\\s*- id: ${ROW_ID}\\s*$`, 'mu').test(patchText)
const spec = options.spec ?? `link:${pluginDir.replace(/\\/gu, '/')}`

console.log(`profile: ${profileName} (${profileDir})`)
console.log(`依赖 ${PLUGIN_NAME}: ${installed ? '已存在' : '待添加'}（${installed ? packageJson.dependencies[PLUGIN_NAME] : spec}）`)
console.log(`bundles 列表: ${listed ? '已包含' : '待添加'}`)
console.log(`cordis.patch.yml 插件行: ${patched ? '已存在' : '待添加'}`)

if (options.uninstall) {
  if (options.dryRun) {
    console.log('\n[dry-run] 将移除依赖、bundles 条目与 patch 插件行')
    process.exit(0)
  }
  backup(packagePath)
  if (existsSync(patchPath)) backup(patchPath)
  const next = { ...packageJson }
  delete next.dependencies?.[PLUGIN_NAME]
  if (Array.isArray(next.dsh?.profile?.bundles)) {
    next.dsh.profile.bundles = next.dsh.profile.bundles.filter((name) => name !== PLUGIN_NAME)
  }
  writeJson(packagePath, next)
  if (patched) writeFileSync(patchPath, removePatchBlock(patchText), 'utf8')
  console.log('\n已移除。重启 DeepSeek Harness 生效；旧的 node_modules 拷贝可用 `pnpm install` 清理。')
  process.exit(0)
}

if (options.dryRun) {
  console.log('\n[dry-run] 修改内容：')
  if (!installed) console.log(`  dependencies["${PLUGIN_NAME}"] = "${spec}"`)
  if (!listed) console.log(`  dsh.profile.bundles += "${PLUGIN_NAME}"`)
  if (!patched) console.log(PATCH_BLOCK.trimEnd())
  if (options.install) console.log(`  (cwd ${profileDir}) pnpm install`)
  process.exit(0)
}

let changed = false
if (!installed) {
  packageJson.dependencies ??= {}
  packageJson.dependencies[PLUGIN_NAME] = spec
  changed = true
}
if (!listed) {
  packageJson.dsh ??= {}
  packageJson.dsh.profile ??= {}
  packageJson.dsh.profile.bundles = [...plugins, PLUGIN_NAME]
  changed = true
}
if (changed) {
  backup(packagePath)
  writeJson(packagePath, packageJson)
  console.log(`已更新 ${packagePath}`)
}
if (!patched) {
  if (existsSync(patchPath)) backup(patchPath)
  const next = `${patchText.trimEnd()}\n${PATCH_BLOCK}`
  writeFileSync(patchPath, next, 'utf8')
  console.log(`已更新 ${patchPath}`)
}

if (options.install) {
  const windows = process.platform === 'win32'
  if (windows) await run('cmd.exe', ['/c', 'pnpm', 'install', '--no-frozen-lockfile'], profileDir)
  else await run('pnpm', ['install', '--no-frozen-lockfile'], profileDir)
}

console.log('\n完成。请退出并重新打开 DeepSeek Harness，侧边栏会出现「QQ 机器人」面板。')
console.log('如果面板报错，查看 DSH 启动日志；卸载可运行：node scripts/install-profile.mjs --uninstall')

// ---------------------------------------------------------------- helpers --

function parseArgs(argv) {
  const result = { profile: undefined, spec: undefined, install: false, dryRun: false, uninstall: false, help: false }
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]
    if (arg === '--profile') result.profile = argv[++index]
    else if (arg === '--spec') result.spec = argv[++index]
    else if (arg === '--install') result.install = true
    else if (arg === '--dry-run') result.dryRun = true
    else if (arg === '--uninstall') result.uninstall = true
    else if (arg === '--yes') result.yes = true
    else if (arg === '-h' || arg === '--help') result.help = true
    else fail(`未知参数：${arg}`)
  }
  return result
}

function backup(path) {
  const stamp = new Date().toISOString().replace(/[:.]/gu, '-')
  copyFileSync(path, `${path}.bak-${stamp}`)
  console.log(`已备份 ${path}.bak-${stamp}`)
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function removePatchBlock(text) {
  const lines = text.split('\n')
  const output = []
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]
    if (/^\s*- id: qqbot\s*$/u.test(line)) {
      // drop the preceding comment and the insert block that owns this row
      let start = output.length - 1
      while (start >= 0 && (output[start].trim().startsWith('#') || output[start].trim() === '')) start--
      while (start >= 0 && /^\s+- insert:\s*$/u.test(output[start])) start--
      // keep the comment lines only if they were not ours
      output.splice(Math.max(0, start + 1))
      // skip the row and any deeper-indented lines that belong to it
      let next = index + 1
      while (next < lines.length && /^\s{4,}/u.test(lines[next])) next++
      index = next - 1
      continue
    }
    output.push(line)
  }
  return output.join('\n')
}

function run(file, args_, cwd) {
  return new Promise((resolvePromise, reject) => {
    const child = execFile(file, args_, { cwd, env: process.env, timeout: 180_000 }, (error, stdout, stderr) => {
      if (stdout) process.stdout.write(stdout)
      if (stderr) process.stderr.write(stderr)
      if (error) reject(error)
      else resolvePromise()
    })
    child.stdin?.end()
  })
}

function fail(message) {
  console.error(message)
  process.exit(1)
}
