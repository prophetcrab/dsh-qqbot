/** Character-budget fitting for assembled prompt sections. */
const TRUNCATED = '…（已截断）'

function truncate(text, maxChars) {
  if (!Number.isFinite(maxChars) || maxChars <= 0 || text.length <= maxChars) {
    return { text, truncated: false }
  }
  const cut = Math.max(0, Math.floor(maxChars) - TRUNCATED.length)
  return { text: `${text.slice(0, cut)}${TRUNCATED}`, truncated: true }
}

/**
 * Fit rendered sections into a character budget.
 *
 * Required sections are never dropped or truncated by the global budget.
 * Optional sections are kept in descending priority order until the budget is
 * exhausted; lower-priority sections are dropped. Order of the surviving
 * sections always follows the original plan.
 *
 * @param {Array<{section: object, text: string}>} entries
 * @param {{budgetChars?: number|null, truncate?: boolean}} [options]
 */
export function fitBudget(entries, { budgetChars = null } = {}) {
  const required = entries.filter((entry) => entry.section.required === true)
  const optional = entries.filter((entry) => entry.section.required !== true)
  let requiredChars = required.reduce((sum, entry) => sum + entry.text.length, 0)
  let remaining = Number.isFinite(budgetChars) && budgetChars > 0 ? budgetChars - requiredChars : Infinity
  const kept = new Set(required.map((entry) => entry.section.id))
  const dropped = []
  const truncated = []

  const ranked = [...optional].sort((left, right) => (right.section.priority ?? 50) - (left.section.priority ?? 50))
  for (const entry of ranked) {
    if (entry.text.length <= remaining) {
      kept.add(entry.section.id)
      remaining -= entry.text.length
    } else {
      dropped.push(entry.section.id)
    }
  }

  const output = []
  for (const entry of entries) {
    if (!kept.has(entry.section.id)) continue
    let text = entry.text
    let wasTruncated = false
    if (Number.isFinite(entry.section.maxChars)) {
      const result = truncate(text, entry.section.maxChars)
      text = result.text
      wasTruncated = result.truncated
    }
    if (wasTruncated) truncated.push(entry.section.id)
    output.push({ ...entry, text, truncated: wasTruncated })
  }
  const total = output.reduce((sum, entry) => sum + entry.text.length, 0)
  return { entries: output, totalChars: total, dropped, truncated }
}

export { TRUNCATED }
