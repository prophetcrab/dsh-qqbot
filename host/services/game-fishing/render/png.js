/** SVG → PNG conversion: resvg everywhere, sips/rsvg-convert when available. */
import { readFile, writeFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const run = promisify(execFile)
const TIMEOUT = 15000

async function viaRsvg(input, output) {
  await run('rsvg-convert', ['-f', 'png', '-o', output, input], { timeout: TIMEOUT })
}
async function viaSips(input, output) {
  await run('/usr/bin/sips', ['-s', 'format', 'png', input, '--out', output], { timeout: TIMEOUT })
}

/**
 * Bundled, dependency-free fallback (WASM/native N-API via @resvg/resvg-js).
 * Works on Windows where neither sips nor rsvg-convert is installed.
 */
async function viaResvg(input, output) {
  const { Resvg } = await import('@resvg/resvg-js')
  const svg = await readFile(input, 'utf8')
  const png = new Resvg(svg).render().asPng()
  await writeFile(output, png)
}

export async function convertSvgFile(input, output) {
  // GitHub's macOS runner can hang on sips + SVG. Prefer librsvg in CI.
  if (process.env.CI === 'true') {
    try { await viaRsvg(input, output); return } catch { /* fall through */ }
  }
  try {
    await viaSips(input, output)
    return
  } catch {
    // Not macOS (or sips failed): try the system rsvg-convert next.
  }
  try {
    await viaRsvg(input, output)
    return
  } catch {
    // Not installed: fall back to the bundled resvg renderer.
  }
  await viaResvg(input, output)
}
