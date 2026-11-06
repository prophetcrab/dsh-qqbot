/** Compile a JSON prompt config into a validated registry + assembler. */
import { PromptAssembler } from './assembler.js'
import { PromptRegistry } from './registry.js'
import { compileCondition } from './conditions.js'
import { renderTemplate, validateTemplate } from './template.js'

const SECTION_KEYS = new Set([
  'id', 'title', 'tier', 'priority', 'required', 'untrusted', 'maxChars', 'when', 'template',
])
const TIERS = new Set(['system', 'user'])

function validateSection(raw, index) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`prompt config sections[${index}] must be an object`)
  }
  for (const key of Object.keys(raw)) {
    if (!SECTION_KEYS.has(key)) throw new Error(`prompt config sections[${index}]: unknown key ${key}`)
  }
  if (typeof raw.id !== 'string' || raw.id === '') throw new Error(`prompt config sections[${index}]: id is required`)
  if (!TIERS.has(raw.tier)) throw new Error(`prompt config section ${raw.id}: invalid tier`)
  validateTemplate(raw.template)
  return raw
}

function validateStages(stages) {
  if (stages === null || typeof stages !== 'object' || Array.isArray(stages)) {
    throw new Error('prompt config stages must be an object')
  }
  for (const [stage, plan] of Object.entries(stages)) {
    if (plan === null || typeof plan !== 'object' || Array.isArray(plan)) {
      throw new Error(`prompt config stage ${stage} must be an object`)
    }
    for (const key of Object.keys(plan)) {
      if (!['system', 'user', 'budget'].includes(key)) throw new Error(`prompt config stage ${stage}: unknown key ${key}`)
    }
    if (!Array.isArray(plan.system) || !Array.isArray(plan.user)) {
      throw new Error(`prompt config stage ${stage}: system/user must be arrays`)
    }
    if (plan.budget !== null && plan.budget !== undefined && typeof plan.budget !== 'object') {
      throw new Error(`prompt config stage ${stage}: budget must be an object or null`)
    }
  }
}

/**
 * @param {object} config parsed JSON config
 * @returns {{assembler: PromptAssembler, registry: PromptRegistry, config: object}}
 */
export function compilePromptConfig(config) {
  if (config === null || typeof config !== 'object' || Array.isArray(config)) {
    throw new Error('prompt config must be an object')
  }
  if (config.version !== 1) throw new Error(`unsupported prompt config version: ${String(config.version)}`)
  if (!Array.isArray(config.sections)) throw new Error('prompt config sections must be an array')
  validateStages(config.stages)
  const sections = config.sections.map((raw, index) => {
    validateSection(raw, index)
    return {
      id: raw.id,
      title: raw.title ?? '',
      tier: raw.tier,
      priority: raw.priority ?? 50,
      required: raw.required === true,
      untrusted: raw.untrusted === true,
      maxChars: raw.maxChars ?? null,
      when: compileCondition(raw.when),
      render: (context) => renderTemplate(raw.template, context),
    }
  })
  const registry = new PromptRegistry(sections)
  const assembler = new PromptAssembler({ registry, stages: config.stages })
  return { assembler, registry, config }
}
