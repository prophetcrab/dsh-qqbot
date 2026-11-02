#!/usr/bin/env node
/**
 * Build an offline `node_modules` bundle for the plugin's Koishi template.
 *
 *   node scripts/bundle-runtime.mjs
 *   node scripts/bundle-runtime.mjs --source ~/project/qq-bot
 *   node scripts/bundle-runtime.mjs --arch arm64
 *
 * The resulting `template/runtime-bundles/node_modules-<platform>-<arch>.tar.gz`
 * is extracted by host/services/setup when the runtime project is created, so the
 * target machine needs neither npm nor network for Koishi dependencies.
 *
 * This branch is macOS-only. The default target is darwin-arm64; `--arch x64`
 * can produce an Intel macOS bundle when the source dependencies match.
 */

import { execFile } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, statSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const pluginDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const options = {
  source: join(homedir(), 'project', 'qq-bot'),
  out: join(pluginDir, 'template', 'runtime-bundles'),
  platform: 'darwin',
  arch: 'arm64',
  install: false,
}
for (let index = 0; index < args.length; index++) {
  if (args[index] === '--source') options.source = resolve(args[++index])
  else if (args[index] === '--out') options.out = resolve(args[++index])
  else if (args[index] === '--platform') options.platform = String(args[++index])
  else if (args[index] === '--arch') options.arch = String(args[++index])
  else if (args[index] === '--install') options.install = true
  else if (args[index] === '--help' || args[index] === '-h') {
    console.log('用法：node scripts/bundle-runtime.mjs [--source <Koishi项目>] [--out <输出目录>] [--arch <arm64|x64>] [--install]')
    process.exit(0)
  } else {
    console.error(`未知参数：${args[index]}`)
    process.exit(1)
  }
}

if (options.platform !== 'darwin') {
  console.error('此分支只构建 macOS 运行时离线包')
  process.exit(1)
}
const platformKey = `${options.platform}-${options.arch}`
mkdirSync(options.out, { recursive: true })
const target = join(options.out, `node_modules-${platformKey}.tar.gz`)
let sourceDir = options.source
let tempDir = null

if (options.install) {
  tempDir = mkdtempSync(join(tmpdir(), 'dsh-qqbot-bundle-'))
  const templateDir = join(pluginDir, 'template')
  const skip = new Set(['node_modules', 'data', 'logs', 'runtime', 'runtime-bundles', '.git', '.DS_Store'])
  cpSync(templateDir, tempDir, {
    recursive: true,
    filter: (source) => !skip.has(source.split('/').pop() ?? ''),
  })
  console.log(`正在为 ${platformKey} 安装运行时依赖（npm --os=${options.platform} --cpu=${options.arch}）…`)
  await run('npm', ['install', '--omit=dev', '--os', options.platform, '--cpu', options.arch, '--no-audit', '--no-fund'], tempDir)
  sourceDir = tempDir
}

const sourceModules = join(sourceDir, 'node_modules')
if (!existsSync(sourceModules)) {
  console.error(`找不到 node_modules：${sourceModules}\n请先在 Koishi 项目执行 npm install，或用 --install 生成目标平台依赖。`)
  process.exit(1)
}
await run('tar', ['-czf', target, '--exclude=node_modules/.bin', '-C', sourceDir, 'node_modules'])
const size = statSync(target).size
console.log(`已生成 ${target} (${(size / 1024 / 1024).toFixed(1)} MiB, platform=${platformKey})`)
if (tempDir !== null) rmSync(tempDir, { recursive: true, force: true })
console.log('重新加载 DSH 插件后，新建运行时项目会解压此 macOS 离线包。')

function run(file, commandArgs, cwd) {
  return new Promise((resolvePromise, reject) => {
    execFile(file, commandArgs, { cwd, timeout: 600_000, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
      if (stdout) process.stdout.write(stdout)
      if (stderr) process.stderr.write(stderr)
      if (error) reject(error)
      else resolvePromise()
    })
  })
}
