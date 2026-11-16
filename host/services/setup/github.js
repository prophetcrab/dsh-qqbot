/**
 * GitHub source checkout for the environment reinstall flow.
 *
 * A shallow `git clone` is used instead of the archive/codeload endpoint:
 * some networks expose a transparent HTTP proxy that returns a tiny "OK"
 * body for archive downloads while regular git access works.
 */

import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/** GitHub repository coordinates accepted from settings. */
export function normalizeSource(repo, ref) {
  const repository = String(repo ?? '').trim()
  const branch = String(ref ?? '').trim()
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(repository)) throw new Error(`GitHub 仓库格式不正确：${repository}`)
  if (!/^[A-Za-z0-9_.\/-]+$/u.test(branch)) throw new Error(`GitHub 分支格式不正确：${branch}`)
  return { repository, branch }
}

/** Clone a branch into a fresh temporary directory. */
export async function cloneSource(run, repo, ref) {
  const { repository, branch } = normalizeSource(repo, ref)
  const tempDir = await mkdtemp(join(tmpdir(), 'dsh-qqbot-reinstall-'))
  const rootDir = join(tempDir, 'source')
  const url = `https://github.com/${repository}.git`
  const result = await run('git', ['clone', '--depth', '1', '--branch', branch, url, rootDir], { timeoutMs: 180_000 })
  if (result.code !== 0) {
    throw new Error(`git clone GitHub 仓库失败：${String(result.stderr || result.error || result.code).slice(0, 300)}`)
  }
  return { tempDir, rootDir, url }
}

/** Validate the cloned template and return its path. */
export async function validateTemplate(rootDir) {
  const templateDir = join(rootDir, 'template')
  try {
    const manifest = JSON.parse(await readFile(join(templateDir, 'package.json'), 'utf8'))
    if (manifest === null || typeof manifest !== 'object' || typeof manifest.name !== 'string') {
      throw new Error('template/package.json 无效')
    }
  } catch (error) {
    throw new Error(`GitHub 资源中缺少有效的 template/：${String(error?.message ?? error)}`)
  }
  return { templateDir }
}
