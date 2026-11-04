/** SVG → PNG conversion: sips on macOS, rsvg-convert in CI or as fallback. */
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

export async function convertSvgFile(input, output) {
  // GitHub's macOS runner can hang on sips + SVG. Prefer librsvg in CI.
  if (process.env.CI === 'true') {
    try { await viaRsvg(input, output); return } catch { /* fall through */ }
  }
  try {
    await viaSips(input, output)
  } catch {
    await viaRsvg(input, output)
  }
}
