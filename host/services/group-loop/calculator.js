/** Safe arithmetic evaluator for the ReAct calculator tool (no eval). */

const MAX_EXPRESSION = 240

function tokenize(input) {
  const tokens = []
  const source = String(input ?? '')
  if (source.length > MAX_EXPRESSION) throw new Error('表达式过长')
  let index = 0
  while (index < source.length) {
    const char = source[index]
    if (/\s/u.test(char)) { index += 1; continue }
    if (/[0-9.]/u.test(char)) {
      const match = /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/u.exec(source.slice(index))
      if (match === null) throw new Error('数字格式错误')
      tokens.push({ type: 'number', value: Number(match[0]) })
      index += match[0].length
      continue
    }
    if ('+-*/%()'.includes(char)) { tokens.push({ type: char }); index += 1; continue }
    throw new Error(`不支持的字符：${char}`)
  }
  return tokens
}

export function evaluateExpression(input) {
  const expression = String(input ?? '').trim()
  if (expression === '') return { ok: false, error: '表达式为空' }
  let tokens
  try { tokens = tokenize(expression) } catch (error) { return { ok: false, error: String(error?.message ?? error) } }
  let cursor = 0
  const peek = () => tokens[cursor]
  const take = () => tokens[cursor++]
  let depth = 0
  function primary() {
    const token = take()
    if (token === undefined) throw new Error('表达式不完整')
    if (token.type === 'number') return token.value
    if (token.type === '(') {
      depth += 1
      if (depth > 16) throw new Error('括号过深')
      const value = expression_()
      if (take()?.type !== ')') throw new Error('括号不匹配')
      depth -= 1
      return value
    }
    if (token.type === '-' || token.type === '+') {
      const value = primary()
      return token.type === '-' ? -value : value
    }
    throw new Error('表达式不合法')
  }
  function term() {
    let value = primary()
    while (peek()?.type === '*' || peek()?.type === '/' || peek()?.type === '%') {
      const op = take().type
      const right = primary()
      if ((op === '/' || op === '%') && right === 0) throw new Error('除数不能为 0')
      value = op === '*' ? value * right : op === '/' ? value / right : value % right
    }
    return value
  }
  function expression_() {
    let value = term()
    while (peek()?.type === '+' || peek()?.type === '-') {
      const op = take().type
      const right = term()
      value = op === '+' ? value + right : value - right
    }
    return value
  }
  try {
    const value = expression_()
    if (cursor !== tokens.length) throw new Error('表达式不完整')
    if (!Number.isFinite(value)) throw new Error('结果不是有限数字')
    return { ok: true, expression, value }
  } catch (error) {
    return { ok: false, error: String(error?.message ?? error) }
  }
}

export function parseCalculatorCall(raw, parsed = null) {
  if (parsed?.type === 'tool_call' && parsed.tool === 'calculator') {
    const expression = String(parsed.args?.expression ?? '').trim().slice(0, MAX_EXPRESSION)
    return expression === '' ? null : { expression }
  }
  const source = String(raw ?? '')
  if (!/tool_call|<\|\|DSML|DSML/iu.test(source)) return null
  const match = source.match(/\{[^{}]*"expression"\s*:\s*"([^"]*)"[^{}]*\}/u)
  return match === null ? null : { expression: match[1].slice(0, MAX_EXPRESSION) }
}

export function renderCalculation(result) {
  if (result?.ok !== true) return `【calculator】计算失败：${result?.error ?? '未知错误'}`
  return `【calculator】${result.expression} = ${result.value}`
}
