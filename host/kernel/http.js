/**
 * Shared HTTP route helpers for host plugins.
 *
 * Routes stay tiny: `only()` guards the method and turns async failures into a
 * JSON 500, `readBody()` parses bounded JSON bodies, and the field helpers make
 * route input handling total. This module has no plugin/service knowledge.
 */

export const MAX_BODY_BYTES = 256 * 1024

/** @param {unknown} message */
export const errorText = (message) => String(message ?? 'unknown error')

/** Send a JSON response with no-store caching. */
export function sendJson(res, status, body) {
  const payload = Buffer.from(JSON.stringify(body), 'utf8')
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': String(payload.length),
    'cache-control': 'no-store',
  })
  res.end(payload)
}

/** Method guard + async error wrapper for route handlers. */
export function only(req, res, methods, handler) {
  if (!methods.includes(req.method ?? 'GET')) {
    sendJson(res, 405, { ok: false, error: `method not allowed: ${req.method}` })
    return
  }
  void Promise.resolve()
    .then(handler)
    .catch((error) => {
      if (!res.headersSent) sendJson(res, 500, { ok: false, error: errorText(error?.message ?? error) })
    })
}

/** Read and parse a JSON request body (empty body -> {}). */
export function readBody(req, limit = MAX_BODY_BYTES) {
  return new Promise((resolvePromise, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > limit) {
        reject(new Error('request body too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8').trim()
      if (text === '') {
        resolvePromise({})
        return
      }
      try {
        resolvePromise(JSON.parse(text))
      } catch (error) {
        reject(new Error(`invalid JSON body: ${errorText(error?.message ?? error)}`))
      }
    })
    req.on('error', reject)
  })
}

/** Read a query parameter from a Node request URL. */
export function urlParam(req, name) {
  try {
    return new URL(req.url ?? '/', 'http://localhost').searchParams.get(name)
  } catch {
    return null
  }
}

/** Safely read a trimmed string field from an unknown object. */
export function stringField(value, name) {
  if (value === null || typeof value !== 'object') return ''
  const field = value[name]
  return typeof field === 'string' ? field.trim() : ''
}

/** Clamp an integer candidate. */
export function clampInt(value, fallback, min, max) {
  const number = Number(value)
  if (!Number.isInteger(number)) return fallback
  return Math.min(max, Math.max(min, number))
}

/** Run a synchronous detector, falling back on error. */
export function safeDetect(fn, fallback) {
  try {
    return fn() ?? fallback
  } catch {
    return fallback
  }
}

/**
 * Serialize mutations so two clicks cannot start the same process twice.
 * @returns {(task: () => Promise<any>) => Promise<any>}
 */
export function createSerializer() {
  let queue = Promise.resolve()
  return (task) => {
    const run = queue.then(task, task)
    queue = run.then(() => undefined, () => undefined)
    return run
  }
}

/** Text-only output helper shared by agent tools. */
export function textOutput() {
  return {
    schema: {},
    render: (_args, value) => [{ type: 'text', text: String(value?.text ?? '') }],
  }
}
