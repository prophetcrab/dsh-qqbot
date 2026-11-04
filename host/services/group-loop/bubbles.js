/** Shape model text into 1-3 short, sentence-aware QQ bubbles. */

export const BUBBLE_MAX_CHARS = 34
const SENTENCE_PATTERN = /[^。！？!?…\n]+[。！？!?…]?/gu
const CLAUSE_PATTERN = /[^，,；;：:—]+[，,；;：:—]?/gu

function sentenceUnits(text) {
  return (String(text).match(SENTENCE_PATTERN) ?? [])
    .map((part) => part.trim())
    .filter((part) => part !== '')
}

function splitAtClauses(text, maxChars) {
  const clauses = (text.match(CLAUSE_PATTERN) ?? [])
    .map((part) => part.trim())
    .filter((part) => part !== '')
  if (clauses.length === 0) return [text]
  const units = []
  let current = ''
  for (const clause of clauses) {
    if (clause.length > maxChars) {
      if (current !== '') { units.push(current); current = '' }
      for (let start = 0; start < clause.length; start += maxChars) units.push(clause.slice(start, start + maxChars))
      continue
    }
    if (current !== '' && current.length + clause.length > maxChars) {
      units.push(current)
      current = clause
    } else {
      current += clause
    }
  }
  if (current !== '') units.push(current)
  return units
}

function splitLongText(text, maxChars) {
  const units = []
  for (const sentence of sentenceUnits(text)) {
    if (sentence.length <= maxChars) units.push(sentence)
    else units.push(...splitAtClauses(sentence, maxChars))
  }
  return units
}

function partitionUnits(units, maxParts) {
  if (units.length <= maxParts) return units
  const total = units.reduce((sum, unit) => sum + unit.length, 0)
  let low = Math.max(...units.map((unit) => unit.length))
  let high = total
  const groupsNeeded = (limit) => {
    let groups = 1
    let current = 0
    for (const unit of units) {
      if (current + unit.length > limit && current > 0) {
        groups += 1
        current = 0
      }
      current += unit.length
    }
    return groups
  }
  while (low < high) {
    const middle = Math.floor((low + high) / 2)
    if (groupsNeeded(middle) <= maxParts) high = middle
    else low = middle + 1
  }
  const groups = []
  let current = ''
  for (const unit of units) {
    if (current !== '' && current.length + unit.length > low) {
      groups.push(current)
      current = ''
    }
    current += unit
  }
  if (current !== '') groups.push(current)
  return groups
}

/** Split long strings by sentence/clause boundaries, then merge down to maxParts. */
export function shapeBubbleParts(input, { maxParts = 3, maxChars = BUBBLE_MAX_CHARS } = {}) {
  const list = Array.isArray(input) ? input : [input]
  const units = []
  for (const item of list) {
    if (typeof item !== 'string') continue
    for (const line of item.split(/\n+/u)) {
      const trimmed = line.trim()
      if (trimmed === '') continue
      units.push(...splitLongText(trimmed, maxChars))
    }
  }
  if (units.length === 0) return []
  return partitionUnits(units, maxParts)
}

/** Bubble budget is a preference; never merge back into a long bubble just to hit it. */
export function fitBubbleBudget(parts, budget, { maxChars = BUBBLE_MAX_CHARS } = {}) {
  if (!Array.isArray(parts) || parts.length <= budget) return parts
  const kept = parts.slice(0, Math.max(0, budget - 1))
  const tail = parts.slice(Math.max(0, budget - 1)).join(' ').trim()
  if (tail === '' || tail.length > maxChars) return parts
  return [...kept, tail]
}
