/** Group-chat prompt assembly entry point. */
import { PromptAssembler, PromptRegistry } from '../../prompt/index.js'
import { SECTIONS, emotionPrompt, memoryPrompt, profileData } from './sections.js'
import { STAGES } from './stages.js'

export { SECTIONS, STAGES, emotionPrompt, memoryPrompt, profileData }

export const promptRegistry = new PromptRegistry(SECTIONS)
export const promptAssembler = new PromptAssembler({ registry: promptRegistry, stages: STAGES })

export function buildAnalyzePrompt(context) {
  return promptAssembler.build('analyze', context)
}

export function buildComposePrompt(context) {
  return promptAssembler.build('compose', context)
}

export function buildStateUpdatePrompt(context) {
  return promptAssembler.build('state-update', context)
}
