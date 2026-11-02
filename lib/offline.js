/**
 * Bundled offline NapCat payload for macOS.
 *
 * `vendor/napcat/manifest.json` describes the `NapCat.Shell` archive committed
 * to this repository. The archive is verified by size and SHA-256 before use.
 * This build never downloads NapCat: installation is strictly offline.
 *
 * @module lib/offline
 */

import { createHash } from 'node:crypto'
import { createReadStream, promises as fsp } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ensureDir, existsSync, expandHome, run as execFileRun } from './util.js'

/** Environment override pointing at an alternative `vendor/napcat` directory. */
export const VENDOR_ENV = 'DSH_QQBOT_VENDOR_DIR'

/** Manifest file name inside the vendor directory. */
const MANIFEST_FILE = 'manifest.json'

/** macOS QQ application bundle. */
export const MAC_QQ_APP = '/Applications/QQ.app'

/** The NapCat Shell archive must carry a real payload, not a placeholder. */
const MIN_ARCHIVE_BYTES = 1024 * 1024

function failure(error, message) {
  return { ok: false, error, message }
}

function detail(result) {
  const text = String(result?.stderr ?? '').trim() || String(result?.stdout ?? '').trim() || String(result?.error ?? '').trim()
  return text === '' ? `exit ${result?.code ?? '?'}` : text.split('\n')[0].slice(0, 300)
}

function shellQuote(value) {
  return `'${String(value).replace(/'/gu, `'\\''`)}'`
}

function safeJoin(root, file) {
  const base = resolve(root)
  const path = resolve(base, file)
  if (path !== base && !path.startsWith(base + sep)) throw new Error(`离线包清单路径越界：${file}`)
  return path
}

/**
 * Default vendor directory: `vendor/napcat` beside this package, or the
 * `DSH_QQBOT_VENDOR_DIR` override.
 * @returns {string} absolute directory (which may not exist).
 */
export function defaultVendorDir() {
  const override = process.env[VENDOR_ENV]
  if (typeof override === 'string' && override.trim() !== '') return expandHome(override.trim())
  return fileURLToPath(new URL('../vendor/napcat/', import.meta.url))
}

/**
 * Read and shape-check the offline manifest.
 * @param {string} vendorDir vendor directory.
 * @returns {Promise<Record<string, any>>} parsed manifest.
 */
export async function readManifest(vendorDir) {
  const path = join(expandHome(vendorDir), MANIFEST_FILE)
  let text
  try {
    text = await fsp.readFile(path, 'utf8')
  } catch (error) {
    throw new Error(`离线包清单缺失：${path}（${String(error?.message ?? error)}）`)
  }
  let manifest
  try {
    manifest = JSON.parse(text)
  } catch {
    throw new Error(`离线包清单不是合法 JSON：${path}`)
  }
  if (manifest?.format !== 1) throw new Error(`离线包清单 format 必须为 1：${path}`)
  if (typeof manifest?.napcat?.version !== 'string' || manifest.napcat.version === '') {
    throw new Error(`离线包清单缺少 napcat.version：${path}`)
  }
  if (typeof manifest?.napcat?.shell?.file !== 'string' || manifest.napcat.shell.file === '') {
    throw new Error(`离线包清单缺少 napcat.shell.file：${path}`)
  }
  return manifest
}

/**
 * Resolve the bundled NapCat Shell archive.
 * @param {string} vendorDir vendor directory.
 * @param {{ version?: string }} [options] optional version pin.
 */
export async function resolvePayload(vendorDir, options = {}) {
  const manifest = await readManifest(vendorDir)
  const version = String(manifest.napcat.version)
  const pinned = typeof options.version === 'string' ? options.version.trim() : ''
  if (pinned !== '' && pinned !== version) {
    throw new Error(`离线包为 NapCat ${version}，与请求的 ${pinned} 不一致`)
  }
  const shell = manifest.napcat.shell
  if (Number.isFinite(shell.bytes) && shell.bytes < MIN_ARCHIVE_BYTES) {
    throw new Error(`离线 NapCat 包过小（${shell.bytes} 字节），拒绝安装`)
  }
  return {
    manifest,
    version,
    shellPath: safeJoin(vendorDir, shell.file),
    shell,
  }
}

/**
 * Verify one archive's size and SHA-256.
 * @param {string} path archive path.
 * @param {{ bytes?: number, sha256?: string }} expected manifest entry.
 */
export async function verifyArchive(path, expected = {}) {
  const stat = await fsp.stat(path).catch(() => null)
  if (stat === null || !stat.isFile()) {
    return failure('archive-missing', `离线安装包不存在：${path}`)
  }
  if (Number.isFinite(expected.bytes) && stat.size !== expected.bytes) {
    return failure('archive-size-mismatch', `离线安装包大小不符：${stat.size} != ${expected.bytes}`)
  }
  if (typeof expected.sha256 === 'string' && expected.sha256 !== '') {
    const digest = await new Promise((resolvePromise, reject) => {
      const hash = createHash('sha256')
      createReadStream(path)
        .on('data', (chunk) => hash.update(chunk))
        .on('error', reject)
        .on('end', () => resolvePromise(hash.digest('hex')))
    })
    if (digest !== expected.sha256.toLowerCase()) {
      return failure('archive-digest-mismatch', `离线安装包 SHA-256 不符：期望 ${expected.sha256}，实际 ${digest}`)
    }
    return { ok: true, bytes: stat.size, sha256: digest }
  }
  return { ok: true, bytes: stat.size, sha256: '' }
}

/** Extract a zip with macOS `ditto` (fallback: `unzip`). */
export async function extractZip(options) {
  const { zipPath, destDir } = options
  const run = typeof options.run === 'function' ? options.run : execFileRun
  const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : 300_000
  await ensureDir(destDir)
  const ditto = await run('/usr/bin/ditto', ['-x', '-k', zipPath, destDir], { timeoutMs })
  if (ditto.code === 0) return { ok: true }
  const unzip = await run('/usr/bin/unzip', ['-o', zipPath, '-d', destDir], { timeoutMs })
  if (unzip.code === 0) return { ok: true }
  return failure('extract-failed', `解压 NapCat 失败：${detail(unzip) || detail(ditto)}`)
}

/** NapCat's macOS data locations inside the QQ container. */
export function macContainerPaths(home = homedir()) {
  const container = join(home, 'Library/Containers/com.tencent.qq/Data')
  const documents = join(container, 'Documents')
  return {
    container,
    documents,
    napcatDir: join(documents, 'napcat'),
    loaderPath: join(documents, 'loadNapCat.js'),
    versionsDir: join(container, 'Library/Application Support/QQ/versions'),
  }
}

/**
 * `loadNapCat.js`, the entry QQ runs. It boots NapCat when QQ is started with
 * `--no-sandbox` and otherwise delegates to the matching QQ launcher (including
 * hot-update packages), mirroring the official macOS installer.
 * @param {string} appDir `/Applications/QQ.app`.
 */
export function macLoaderSource(appDir = MAC_QQ_APP) {
  const appRoot = join(appDir, 'Contents/Resources/app')
  const packagePath = join(appRoot, 'package.json')
  return `const path = require('node:path');
const { pathToFileURL } = require('node:url');
const loadNapcat = process.argv.includes('--no-sandbox');
const packageJson = require(${JSON.stringify(packagePath)});
if (loadNapcat) {
    (async () => {
        await import(pathToFileURL(path.join(__dirname, 'napcat/napcat.mjs')).href);
    })();
} else {
    const fs = require('node:fs');
    const baseAppDir = ${JSON.stringify(appRoot)};
    const versionsDir = path.resolve(__dirname, '../Library/Application Support/QQ/versions');
    const frameworkVersion = (dir) => {
        try {
            const plist = fs.readFileSync(path.resolve(dir, '../../Frameworks/QQNT.framework/Resources/Info.plist'), 'utf8');
            const m = plist.match(/<key>CFBundleVersion<\\/key>\\s*<string>([^<]+)<\\/string>/);
            return m ? m[1] : null;
        } catch {
            return null;
        }
    };
    const candidates = [];
    const configPath = path.join(versionsDir, 'config.json');
    if (fs.existsSync(configPath)) {
        const { curVersion } = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        if (curVersion) candidates.push(path.join(versionsDir, curVersion, 'QQUpdate.app/Contents/Resources/app'));
    }
    candidates.push(baseAppDir);
    const runtime = process.versions.electron;
    const launcherAppDir = candidates.find((dir) => frameworkVersion(dir) === runtime);
    if (!launcherAppDir) {
        throw new Error('[loadNapCat] no QQ launcher matches Electron ' + runtime + ': '
            + candidates.map((dir) => dir + ' (Electron ' + frameworkVersion(dir) + ')').join('; '));
    }
    const launcherEntry = path.join(launcherAppDir, 'app_launcher/index.js');
    if (!fs.existsSync(launcherEntry) || !fs.existsSync(path.join(launcherAppDir, 'major.node'))) {
        throw new Error('[loadNapCat] incomplete QQ launcher entry: ' + launcherEntry);
    }
    require(launcherEntry);
    setImmediate(() => {
        if (global.launcher && global.launcher.installPathPkgJson) {
            global.launcher.installPathPkgJson.main = ((version) => {
                if (version >= 29271) return './application.asar/app_launcher/index.js';
                if (version >= 28060) return './application/app_launcher/index.js';
                return './app_launcher/index.js';
            })(packageJson.buildVersion);
        }
    });
}
`
}

/** Run one root-owned file copy through the macOS authorization dialog. */
async function copyWithPrivileges(run, source, target) {
  const command = `cp -f ${shellQuote(source)} ${shellQuote(target)}`
  const script = `do shell script ${JSON.stringify(command)} with administrator privileges`
  return run('/usr/bin/osascript', ['-e', script], { timeoutMs: 120_000 })
}

/**
 * Patch one JSON file, optionally through the macOS admin prompt.
 * @param {{ file: string, mutate: (value: Record<string, any>) => Record<string, any>, run: Function, privileged?: boolean, backup?: boolean }} options
 */
async function patchJsonFile(options) {
  const { file, mutate } = options
  let current
  try {
    current = JSON.parse(await fsp.readFile(file, 'utf8'))
  } catch (error) {
    return failure('json-read-failed', `读取 ${file} 失败：${String(error?.message ?? error)}`)
  }
  const next = mutate(current)
  if (JSON.stringify(next) === JSON.stringify(current)) return { ok: true, changed: false }
  const temp = join(tmpdir(), `dsh-qqbot-patch-${process.pid}-${Date.now()}.json`)
  await fsp.writeFile(temp, `${JSON.stringify(next, null, 2)}\n`, 'utf8')
  try {
    if (options.backup === true && !existsSync(`${file}.bak`)) {
      const backup = await copyWithPrivileges(options.run, file, `${file}.bak`)
      if (backup.code !== 0) return failure('backup-failed', `备份 ${file} 失败：${detail(backup)}`)
    }
    const copied = options.privileged === false
      ? await fsp.copyFile(temp, file).then(() => ({ code: 0 }))
      : await copyWithPrivileges(options.run, temp, file)
    if (copied.code !== 0) return failure('patch-failed', `写入 ${file} 失败：${detail(copied)}`)
    return { ok: true, changed: true }
  } finally {
    await fsp.rm(temp, { force: true })
  }
}

/** Point every QQ hot-update package at the NapCat loader. */
export async function patchHotUpdatePackages(versionsDir, loaderPath) {
  let entries = []
  try {
    entries = await fsp.readdir(versionsDir)
  } catch {
    return 0
  }
  let patched = 0
  for (const entry of entries) {
    const appRoot = join(versionsDir, entry, 'QQUpdate.app/Contents/Resources/app')
    const packagePath = join(appRoot, 'package.json')
    if (!existsSync(packagePath)) continue
    let current
    try {
      current = JSON.parse(await fsp.readFile(packagePath, 'utf8'))
    } catch {
      continue
    }
    const next = relative(appRoot, loaderPath).split(sep).join('/')
    if (current.main === next) continue
    current.main = next
    await fsp.writeFile(packagePath, `${JSON.stringify(current, null, 2)}\n`, 'utf8')
    patched += 1
  }
  return patched
}

/** Copy an extracted tree into place, keeping an existing config/ and plugins/. */
async function mergeTree(source, target) {
  await ensureDir(target)
  for (const entry of await fsp.readdir(source)) {
    const from = join(source, entry)
    const to = join(target, entry)
    if ((entry === 'config' || entry === 'plugins') && existsSync(to)) {
      for (const child of await fsp.readdir(from)) {
        const childTarget = join(to, child)
        if (!existsSync(childTarget)) await fsp.cp(join(from, child), childTarget, { recursive: true })
      }
      continue
    }
    await fsp.rm(to, { recursive: true, force: true })
    await fsp.cp(from, to, { recursive: true })
  }
}

/** Rewrite the extracted Shell package version so detection reports the release. */
async function stampPackageVersion(packagePath, version) {
  try {
    const text = await fsp.readFile(packagePath, 'utf8')
    const manifest = JSON.parse(text)
    if (manifest.version === version) return
    manifest.version = version
    await fsp.writeFile(packagePath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  } catch {
    // cosmetic; caller validates the payload
  }
}

/**
 * Install NapCat on macOS strictly from the bundled Shell payload: copy it into
 * the QQ container, write `loadNapCat.js`, point QQ's `package.json` at that
 * loader (one administrator prompt) and sync hot-update packages.
 *
 * @param {{ vendorDir?: string, appDir?: string, home?: string, run?: Function, logger?: object, skipPrivileged?: boolean, version?: string }} [options]
 */
export async function installMacOffline(options = {}) {
  const vendorDir = typeof options.vendorDir === 'string' ? options.vendorDir : defaultVendorDir()
  const appDir = typeof options.appDir === 'string' && options.appDir !== '' ? options.appDir : MAC_QQ_APP
  const run = typeof options.run === 'function' ? options.run : execFileRun
  const paths = macContainerPaths(typeof options.home === 'string' ? options.home : homedir())
  try {
    const appRoot = join(appDir, 'Contents/Resources/app')
    const appPackage = join(appRoot, 'package.json')
    if (!existsSync(appPackage)) {
      return failure('qq-not-found', `未找到 QQ：${appPackage}`)
    }
    const plan = await resolvePayload(vendorDir, { version: options.version })
    if (existsSync(join(paths.napcatDir, 'package.json'))) {
      try {
        const installed = JSON.parse(await fsp.readFile(join(paths.napcatDir, 'package.json'), 'utf8'))
        if (installed.version === plan.version) {
          return { ok: true, reused: true, installDir: paths.napcatDir, version: plan.version, loaderPath: paths.loaderPath, patchedHotUpdates: 0 }
        }
      } catch {
        // A broken installed package.json is replaced below.
      }
    }
    const verified = await verifyArchive(plan.shellPath, plan.shell)
    if (verified.ok !== true) return verified
    const staging = await fsp.mkdtemp(join(tmpdir(), 'dsh-qqbot-napcat-'))
    try {
      const extracted = await extractZip({ zipPath: plan.shellPath, destDir: staging, run })
      if (extracted.ok !== true) return extracted
      if (!existsSync(join(staging, 'napcat.mjs')) || !existsSync(join(staging, 'package.json'))) {
        return failure('offline-payload-invalid', '离线包解压后缺少 napcat.mjs 或 package.json')
      }
      await stampPackageVersion(join(staging, 'package.json'), plan.version)
      await mergeTree(staging, paths.napcatDir)
      await ensureDir(paths.documents)
      await fsp.writeFile(paths.loaderPath, macLoaderSource(appDir), 'utf8')
      const main = relative(appRoot, paths.loaderPath).split(sep).join('/')
      const patched = await patchJsonFile({
        file: appPackage,
        run,
        privileged: options.skipPrivileged !== true,
        backup: true,
        mutate: (value) => ({ ...value, main }),
      })
      if (patched.ok !== true) {
        return failure(patched.error ?? 'patch-failed', patched.message ?? '无法把 QQ 入口指向 NapCat 加载器')
      }
      const patchedHotUpdates = await patchHotUpdatePackages(paths.versionsDir, paths.loaderPath)
      options.logger?.info?.(`NapCat 已从离线包安装：${paths.napcatDir} (v${plan.version})`)
      return { ok: true, reused: false, installDir: paths.napcatDir, version: plan.version, loaderPath: paths.loaderPath, patchedHotUpdates }
    } finally {
      await fsp.rm(staging, { recursive: true, force: true })
    }
  } catch (error) {
    return failure('offline-failed', `离线安装 NapCat 失败：${String(error?.message ?? error)}`)
  }
}
