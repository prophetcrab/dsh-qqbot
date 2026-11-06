/** Minimal template rendering for config-defined prompt sections. */
const PLACEHOLDER = /\{\{\s*([^{}]+?)\s*\}\}/gu

export function getPath(context, path) {
  let current = context
  for (const segment of String(path).split('.')) {
    if (current === null || current === undefined || typeof current !== 'object') return undefined
    current = current[segment]
  }
  return current
}

function applyFilter(value, filter) {
  if (filter === '') return value
  if (filter === 'json') {
    if (value === undefined || value === null) return '[]'
    return JSON.stringify(value)
  }
  throw new Error(`unknown template filter: ${filter}`)
}

/** Render `{{path}}` / `{{path|json}}` placeholders against a context object. */
export function renderTemplate(template, context = {}) {
  if (typeof template !== 'string') throw new Error('section template must be a string')
  return template.replace(PLACEHOLDER, (_, expression) => {
    const parts = expression.split('|').map((part) => part.trim())
    const path = parts.shift()
    if (path === undefined || path === '') return ''
    let value = getPath(context, path)
    for (const filter of parts) value = applyFilter(value, filter)
    return value === undefined || value === null ? '' : String(value)
  })
}

/** Validate placeholders/filters at config load time. */
export function validateTemplate(template) {
  if (typeof template !== 'string') throw new Error('section template must be a string')
  for (const match of template.matchAll(PLACEHOLDER)) {
    const parts = match[1].split('|').map((part) => part.trim())
    if (parts[0] === '') throw new Error('empty template placeholder')
    for (const filter of parts.slice(1)) {
      if (filter !== 'json') throw new Error(`unknown template filter: ${filter}`)
    }
  }
  return template
}
