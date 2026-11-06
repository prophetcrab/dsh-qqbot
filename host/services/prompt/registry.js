/** Prompt section registry: validated, reusable assembly units. */
const TIERS = new Set(['system', 'user'])

export function defineSection(section) {
  if (section === null || typeof section !== 'object') throw new Error('prompt section must be an object')
  if (typeof section.id !== 'string' || section.id === '') throw new Error('prompt section.id must be a non-empty string')
  if (!TIERS.has(section.tier)) throw new Error(`prompt section ${section.id}: invalid tier`)
  if (typeof section.render !== 'function') throw new Error(`prompt section ${section.id}: render must be a function`)
  if (section.when !== undefined && section.when !== null && typeof section.when !== 'function') throw new Error(`prompt section ${section.id}: when must be a function`)
  return {
    title: '',
    priority: 50,
    required: false,
    untrusted: false,
    maxChars: null,
    when: null,
    ...section,
  }
}

export class PromptRegistry {
  constructor(sections = []) {
    this.sections = new Map()
    for (const section of sections) this.register(section)
  }

  register(section) {
    const normalized = defineSection(section)
    if (this.sections.has(normalized.id)) throw new Error(`duplicate prompt section: ${normalized.id}`)
    this.sections.set(normalized.id, normalized)
    return normalized
  }

  registerAll(sections) {
    for (const section of sections) this.register(section)
    return this
  }

  get(id) {
    const section = this.sections.get(id)
    if (section === undefined) throw new Error(`unknown prompt section: ${id}`)
    return section
  }

  has(id) {
    return this.sections.has(id)
  }

  ids() {
    return [...this.sections.keys()]
  }

  /** Validate every stage plan references known sections without duplicates. */
  validateStages(stages) {
    for (const [stage, plan] of Object.entries(stages)) {
      for (const tier of TIERS) {
        const ids = Array.isArray(plan[tier]) ? plan[tier] : []
        const seen = new Set()
        for (const id of ids) {
          if (seen.has(id)) throw new Error(`prompt stage ${stage} ${tier}: duplicate section ${id}`)
          seen.add(id)
          const section = this.sections.get(id)
          if (section === undefined) throw new Error(`prompt stage ${stage} ${tier}: unknown section ${id}`)
          if (section.tier !== tier) throw new Error(`prompt stage ${stage} ${tier}: section ${id} has tier ${section.tier}`)
        }
      }
    }
    return true
  }
}
