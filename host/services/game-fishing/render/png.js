/** SVG → PNG conversion for game cards. resvg is bundled; rsvg is optional. */
import { readFile, writeFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const run = promisify(execFile)
const TIMEOUT = 15000

async function viaRsvg(input, output) {
  await run('rsvg-convert', ['-f', 'png', '-o', output, input], { timeout: TIMEOUT })
}

/** Bundled, platform-independent renderer via @resvg/resvg-js. */
async function viaResvg(input, output) {
  const { Resvg } = await import('@resvg/resvg-js')
  const svg = await readFile(input, 'utf8')
  const png = new Resvg(svg).render().asPng()
  await writeFile(output, png)
}

export async function convertSvgFile(input, output) {
  try {
    await viaResvg(input, output)
    return
  } catch {
    // Fall back to a system rsvg-convert when the bundled renderer fails.
  }
  await viaRsvg(input, output)
}
