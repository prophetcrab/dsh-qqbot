/**
 * Download a `docker save` archive from GitHub Releases and load it into the
 * Docker engine. Downloads go through curl rather than Node fetch so the
 * system CA/proxy configuration is respected; this is required on managed
 * macOS networks where Node's bundled CA rejects the proxy certificate.
 */

import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { failure } from './common.js'

const MIN_ARCHIVE_BYTES = 1024 * 1024
const DOWNLOAD_TIMEOUT_MS = 300_000
const LOAD_TIMEOUT_MS = 300_000

/** SHA-256 of a file without loading it into memory. */
function hashFile(file) {
  return new Promise((resolvePromise, reject) => {
    const hash = createHash('sha256')
    const stream = createReadStream(file)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('error', reject)
    stream.on('end', () => resolvePromise(hash.digest('hex')))
  })
}

/** Download, verify and `docker load` a NapCat image archive. */
export async function loadImageArchive({ download, run, url, sha256, image, onProgress }) {
  if (typeof url !== 'string' || url === '') return failure('image-archive-missing', '未配置 NapCat 镜像包地址')
  if (typeof download !== 'function') return failure('image-archive-download-missing', '当前环境没有 curl 下载通道')
  const tempDir = await mkdtemp(join(tmpdir(), 'dsh-napcat-image-'))
  const archive = join(tempDir, 'napcat-docker.tar.gz')
  try {
    const downloaded = await download(url, archive, {
      timeoutMs: DOWNLOAD_TIMEOUT_MS,
      onProgress: (event) => onProgress?.({ phase: 'downloading', bytes: event.bytes }),
    })
    if (downloaded?.code !== 0) {
      return failure('image-archive-download-failed', `下载 NapCat 镜像包失败：${String(downloaded?.stderr || downloaded?.error || downloaded?.code).slice(0, 300)}`)
    }
    const bytes = (await stat(archive)).size
    if (bytes < MIN_ARCHIVE_BYTES) return failure('image-archive-empty', 'NapCat 镜像包为空或过小')
    onProgress?.({ phase: 'verifying', bytes, percent: 100 })
    const actual = await hashFile(archive)
    const expected = typeof sha256 === 'string' ? sha256.trim().toLowerCase() : ''
    if (expected !== '' && actual !== expected) {
      return failure('image-archive-checksum', `NapCat 镜像包校验失败：期望 ${expected.slice(0, 12)}…，实际 ${actual.slice(0, 12)}…`)
    }
    onProgress?.({ phase: 'loading', bytes, percent: 100 })
    const loaded = await run(['load', '-i', archive], { timeoutMs: LOAD_TIMEOUT_MS })
    if (loaded.code !== 0) {
      return failure('docker-load-failed', `docker load NapCat 镜像失败：${String(loaded.stderr || loaded.error || loaded.code).slice(0, 300)}`)
    }
    onProgress?.({ phase: 'checking-image', bytes, percent: 100 })
    const inspect = await run(['image', 'inspect', '--format', '{{.Id}}', image], { timeoutMs: 30_000 })
    if (inspect.code !== 0) return failure('docker-load-missing-image', `镜像已加载但找不到 ${image}`)
    return { ok: true, version: image, sha256: actual, bytes, source: url, message: 'NapCat 镜像包已下载并加载' }
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {})
  }
}
