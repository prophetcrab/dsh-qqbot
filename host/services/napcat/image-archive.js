/**
 * Download a `docker save` archive from GitHub Releases and load it into the
 * Docker engine. Used by the NapCat installer so a fresh machine does not need
 * Docker Hub access.
 */

import { createHash } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { failure } from './common.js'

const MIN_ARCHIVE_BYTES = 1024 * 1024
const DOWNLOAD_TIMEOUT_MS = 300_000
const LOAD_TIMEOUT_MS = 300_000

/** Stream the release asset to disk while hashing it. */
async function download(url, destination, fetchImpl) {
  if (typeof fetchImpl !== 'function') throw new Error('当前环境不支持 fetch，无法下载 NapCat 镜像包')
  const controller = typeof AbortController === 'function' ? new AbortController() : null
  const timer = controller === null ? null : setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS)
  timer?.unref?.()
  let response
  try {
    response = await fetchImpl(url, { redirect: 'follow', signal: controller?.signal })
  } finally {
    if (timer !== null) clearTimeout(timer)
  }
  if (response === null || response === undefined || response.ok !== true) {
    throw new Error(`下载 NapCat 镜像包失败：HTTP ${response?.status ?? 'unknown'}`)
  }
  if (response.body === null || typeof Readable.fromWeb !== 'function') {
    const { writeFile } = await import('node:fs/promises')
    const buffer = Buffer.from(await response.arrayBuffer())
    await writeFile(destination, buffer)
    if (buffer.length < MIN_ARCHIVE_BYTES) throw new Error('NapCat 镜像包为空或过小')
    return createHash('sha256').update(buffer).digest('hex')
  }
  const hash = createHash('sha256')
  const source = Readable.fromWeb(response.body)
  source.on('data', (chunk) => hash.update(chunk))
  await pipeline(source, createWriteStream(destination))
  const digest = hash.digest('hex')
  const size = (await stat(destination)).size
  if (size < MIN_ARCHIVE_BYTES) throw new Error('NapCat 镜像包为空或过小')
  return digest
}

/** Download, verify and `docker load` a NapCat image archive. */
export async function loadImageArchive({ fetchImpl, run, url, sha256, image }) {
  if (typeof url !== 'string' || url === '') return failure('image-archive-missing', '未配置 NapCat 镜像包地址')
  const tempDir = await mkdtemp(join(tmpdir(), 'dsh-napcat-image-'))
  const archive = join(tempDir, 'napcat-docker.tar.gz')
  try {
    const actual = await download(url, archive, fetchImpl)
    const expected = typeof sha256 === 'string' ? sha256.trim().toLowerCase() : ''
    if (expected !== '' && actual !== expected) {
      return failure('image-archive-checksum', `NapCat 镜像包校验失败：期望 ${expected.slice(0, 12)}…，实际 ${actual.slice(0, 12)}…`)
    }
    const loaded = await run(['load', '-i', archive], { timeoutMs: LOAD_TIMEOUT_MS })
    if (loaded.code !== 0) {
      return failure('docker-load-failed', `docker load NapCat 镜像失败：${String(loaded.stderr || loaded.error || loaded.code).slice(0, 300)}`)
    }
    const inspect = await run(['image', 'inspect', '--format', '{{.Id}}', image], { timeoutMs: 30_000 })
    if (inspect.code !== 0) return failure('docker-load-missing-image', `镜像已加载但找不到 ${image}`)
    return { ok: true, version: image, sha256: actual, source: url, message: 'NapCat 镜像包已下载并加载' }
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {})
  }
}
