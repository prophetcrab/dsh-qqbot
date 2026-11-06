/** Declarative condition compiler for config-defined prompt sections. */
import { getPath } from './template.js'

function compareEquals(left, right) {
  if (left === right) return true
  if (left !== null && right !== null && typeof left === 'object' && typeof right === 'object') {
    try {
      return JSON.stringify(left) === JSON.stringify(right)
    } catch {
      return false
    }
  }
  return false
}

function compileLeaf(condition) {
  const path = condition.field
  if (typeof path !== 'string' || path === '') throw new Error('condition.field must be a non-empty string')
  const operators = Object.keys(condition).filter((key) => key !== 'field')
  if (operators.length !== 1) throw new Error(`condition ${path}: exactly one operator is required`)
  const operator = operators[0]
  const expected = condition[operator]
  if (operator === 'equals') return (ctx) => compareEquals(getPath(ctx, path), expected)
  if (operator === 'notEquals') return (ctx) => !compareEquals(getPath(ctx, path), expected)
  if (operator === 'in') {
    if (!Array.isArray(expected)) throw new Error(`condition ${path}.in must be an array`)
    return (ctx) => expected.includes(getPath(ctx, path))
  }
  if (operator === 'truthy') return (ctx) => Boolean(getPath(ctx, path))
  if (operator === 'exists') return (ctx) => {
    const value = getPath(ctx, path)
    return value !== undefined && value !== null
  }
  if (operator === 'isInteger') return (ctx) => Number.isInteger(getPath(ctx, path))
  throw new Error(`condition ${path}: unknown operator ${operator}`)
}

/** Compile `{field, equals}` / `{all}` / `{any}` / `{not}` into a predicate. */
export function compileCondition(condition) {
  if (condition === undefined || condition === null) return null
  if (condition === null || typeof condition !== 'object' || Array.isArray(condition)) {
    throw new Error('condition must be an object')
  }
  if (Array.isArray(condition.all)) {
    const parts = condition.all.map((item) => compileCondition(item))
    return (ctx) => parts.every((part) => part(ctx))
  }
  if (Array.isArray(condition.any)) {
    const parts = condition.any.map((item) => compileCondition(item))
    return (ctx) => parts.some((part) => part(ctx))
  }
  if (condition.not !== undefined) {
    const part = compileCondition(condition.not)
    return (ctx) => !part(ctx)
  }
  return compileLeaf(condition)
}
