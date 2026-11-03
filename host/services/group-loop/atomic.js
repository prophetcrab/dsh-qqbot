/** Small persistence primitives for the group-loop state store. */
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { basename, dirname } from 'node:path'

/** Read JSON; missing files use fallback, corrupt files are explicit errors. */
export async function readJsonFile(path, fallback) {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch (error) {
    if (error?.code === 'ENOENT') return fallback
    throw new Error(`state file is unreadable: ${path} (${String(error?.message ?? error)})`)
  }
}

/** Write JSON through a temporary file and rename, never exposing a partial file. */
export async function writeJsonAtomic(path, value) {
  await mkdir(dirname(path), { recursive: true })
  const temp = `${path}.${basename(path)}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 7)}.tmp`
  try {
    await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
    await rename(temp, path)
  } finally {
    await unlink(temp).catch(() => {})
  }
}

/** Serialize mutations without holding the queue while an LLM call runs. */
export class SerialQueue {
  constructor() { this.tail = Promise.resolve() }

  run(task) {
    const next = this.tail.then(task, task)
    this.tail = next.catch(() => {})
    return next
  }
}
