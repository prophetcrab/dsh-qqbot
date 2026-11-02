/**
 * Minimal, dependency-free JSON-schema validator.
 *
 * Only the subset used by host/contracts/*.schema.json is implemented:
 * type, properties, required, additionalProperties, items, enum, minimum,
 * maximum, maxLength, minLength and maxItems. This keeps the host free of an
 * `ajv` dependency while still validating every HTTP/plugin boundary.
 */

/**
 * @param {unknown} value
 * @param {Record<string, any>} schema
 * @param {string} [path]
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateAgainstSchema(value, schema, path = '$') {
  const errors = []
  check(value, schema, path, errors)
  return { valid: errors.length === 0, errors }
}

function check(value, schema, path, errors) {
  if (schema === null || typeof schema !== 'object') return

  if (Array.isArray(schema.type)) {
    const matches = schema.type.some((type) => matchesType(value, type))
    if (!matches) errors.push(`${path}: expected one of ${schema.type.join('|')}`)
    return
  }
  if (typeof schema.type === 'string' && !matchesType(value, schema.type)) {
    errors.push(`${path}: expected ${schema.type}`)
    return
  }
  if (Array.isArray(schema.enum) && !schema.enum.some((item) => item === value)) {
    errors.push(`${path}: expected one of ${schema.enum.join(', ')}`)
  }
  if (typeof value === 'number') {
    if (typeof schema.minimum === 'number' && value < schema.minimum) errors.push(`${path}: must be >= ${schema.minimum}`)
    if (typeof schema.maximum === 'number' && value > schema.maximum) errors.push(`${path}: must be <= ${schema.maximum}`)
  }
  if (typeof value === 'string') {
    if (typeof schema.minLength === 'number' && value.length < schema.minLength) errors.push(`${path}: must be at least ${schema.minLength} chars`)
    if (typeof schema.maxLength === 'number' && value.length > schema.maxLength) errors.push(`${path}: must be at most ${schema.maxLength} chars`)
  }
  if (Array.isArray(value)) {
    if (typeof schema.maxItems === 'number' && value.length > schema.maxItems) errors.push(`${path}: must have at most ${schema.maxItems} items`)
    if (schema.items !== undefined) {
      value.forEach((item, index) => check(item, schema.items, `${path}[${index}]`, errors))
    }
  }
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    if (Array.isArray(schema.required)) {
      for (const key of schema.required) {
        if (value[key] === undefined) errors.push(`${path}.${key}: required`)
      }
    }
    if (schema.properties !== undefined) {
      for (const [key, subSchema] of Object.entries(schema.properties)) {
        if (value[key] !== undefined) check(value[key], subSchema, `${path}.${key}`, errors)
      }
    }
    if (schema.additionalProperties === false && schema.properties !== undefined) {
      for (const key of Object.keys(value)) {
        if (!(key in schema.properties)) errors.push(`${path}.${key}: unexpected property`)
      }
    }
  }
}

function matchesType(value, type) {
  if (type === 'object') return value !== null && typeof value === 'object' && !Array.isArray(value)
  if (type === 'array') return Array.isArray(value)
  if (type === 'integer') return Number.isInteger(value)
  if (type === 'number') return typeof value === 'number' && Number.isFinite(value)
  if (type === 'null') return value === null
  return typeof value === type
}
