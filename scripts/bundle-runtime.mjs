#!/usr/bin/env node
/**
 * Build an offline `node_modules` bundle for the plugin's Koishi template.
 *
 *   node scripts/bundle-runtime.mjs
 *   node scripts/bundle-runtime.mjs --source ~/project/qq-bot
 *
 * The resulting `template/runtime-bundles/node_modules-<platform>-<arch>.tar.gz`
 * is extracted by lib/setup.js when the runtime project is created, so the
 * target machine needs neither npm nor network for Koishi dependencies.
 *
 * Platform-specific native packages mean a bundle only works on the platform it
 * was built on. Build one per platform (macOS arm64, Windows x64, …); missing
 * bundles fall back to `npm install`.
 */

import { execFile } from 'node:child_process'
import { existsSync, mkdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const pluginDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const options = { source: join(homedir(), 'project', 'qq-bot'), out: join(pluginDir, 'template', 'runtime-bundles') }
for (let index = 0; index < args.length; index++) {
  if (args[index] === '--source') options.source = resolve(args[++index])
  else if (args[index] === '--out') options.out = resolve(args[++index])
  else if (args[index] === '--help' || args[index] === '-h') {
    console.log('用法：node scripts/bundle-runtime.mjs [--source <Koishi项目>] [--out <输出目录>]')
    process.exit(0)
  } else {
    console.error(`未知参数：${args[index]}`)
    process.exit(1)
  }
}

const sourceModules = join(options.source, 'node_modules')
if (!existsSync(sourceModules)) {
  console.error(`找不到 node_modules：${sourceModules}\n请先在 Koishi 项目执行 npm install，或用 --source 指定项目。`)
  process.exit(1)
}
mkdirSync(options.out, { recursive: true })
const platformKey = `${process.platform}-${process.arch}`
const target = join(options.out, `node_modules-${platformKey}.tar.gz`)

await run('tar', ['-czf', target, '-C', options.source, 'node_modules'])
const size = statSync(target).size
console.log(`已生成 ${target} (${(size / 1024 / 1024).toFixed(1)} MiB, platform=${platformKey})`)
console.log('重新加载 DSH 插件后，新建运行时项目会直接解压此包，不再执行 npm install。')

function run(file, args_) {
  return new Promise((resolvePromise, reject) => {
    execFile(file, args_, { timeout: 300_000, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
      if (stdout) process.stdout.write(stdout)
      if (stderr) process.stderr.write(stderr)
      if (error) reject(error)
      else resolvePromise()
    })
  })
}
