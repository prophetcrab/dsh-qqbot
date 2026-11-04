/**
 * Shared NapCat/Koishi lifecycle actions.
 *
 * The panel buttons, `/qqbot/all/*` routes and the `qqbot_control` agent tool
 * all go through these helpers so "start everything" has exactly one ordering
 * and one error-reporting shape. Services are passed in (rather than imported)
 * so unit tests and alternative hosts can inject fakes.
 */

/**
 * Run one lifecycle step and capture its failure instead of throwing.
 *
 * @param {string} name
 * @param {() => Promise<any>} fn
 */
async function step(name, fn) {
  try {
    const result = await fn()
    return { name, ok: result?.ok !== false, message: result?.message, data: result?.data }
  } catch (error) {
    return { name, ok: false, message: String(error?.message ?? error) }
  }
}

/** Human-readable step summary shared by all callers. */
function describeSteps(steps, fallback) {
  return steps
    .map((entry) => `${entry.name}: ${entry.ok ? fallback.ok : fallback.fail}${entry.message ? ` (${entry.message})` : ''}`)
    .join('; ')
}

/**
 * Start Koishi first, then NapCat. Koishi must be listening before NapCat
 * connects its reverse WebSocket; NapCat may then wait for a QR scan.
 *
 * @param {{ koishi: { start: Function }, napcat: { start: Function } }} services
 */
export async function startAll(services) {
  const steps = []
  steps.push(await step('koishi', () => services.koishi.start()))
  steps.push(await step('napcat', () => services.napcat.start()))
  return {
    ok: steps.every((entry) => entry.ok),
    message: describeSteps(steps, { ok: 'ok', fail: 'failed' }),
    steps,
  }
}

/**
 * Stop Koishi first, then NapCat. Stopping Koishi first prevents the adapter
 * from logging reconnect errors while the container/process shuts down.
 *
 * @param {{ koishi: { stop: Function }, napcat: { stop: Function } }} services
 */
export async function stopAll(services) {
  const steps = []
  steps.push(await step('koishi', () => services.koishi.stop()))
  steps.push(await step('napcat', () => services.napcat.stop()))
  return {
    ok: steps.every((entry) => entry.ok),
    message: describeSteps(steps, { ok: 'stopped', fail: 'failed' }),
    steps,
  }
}
