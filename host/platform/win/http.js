/**
 * JSON HTTP helper for the macOS host platform.
 *
 * Built on the global fetch; network and HTTP errors are reported in the result
 * instead of thrown, which keeps route handlers and services total.
 */

/**
 * @param {string} url
 * @param {{ method?: string, body?: unknown, headers?: Record<string,string>, timeoutMs?: number }} [options]
 * @returns {Promise<{ ok: boolean, status: number, data: any, error?: string }>}
 */
export async function httpJson(url, options = {}) {
  const method = options.method ?? 'GET'
  const headers = { accept: 'application/json', ...(options.headers ?? {}) }
  let body
  if (options.body !== undefined && options.body !== null) {
    headers['content-type'] ??= 'application/json'
    body = typeof options.body === 'string' ? options.body : JSON.stringify(options.body)
  }
  try {
    const response = await fetch(url, {
      method,
      headers,
      body,
      signal: AbortSignal.timeout(options.timeoutMs ?? 10_000),
    })
    const text = await response.text()
    let data = null
    if (text !== '') {
      try {
        data = JSON.parse(text)
      } catch {
        data = text
      }
    }
    return { ok: response.ok, status: response.status, data }
  } catch (error) {
    return { ok: false, status: 0, data: null, error: String(error?.message ?? error) }
  }
}
