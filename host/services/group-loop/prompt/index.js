/** Group-chat prompt service backed by a config file. */
import { PromptConfigStore } from './store.js'

export { profileData, emotionPrompt, memoryPrompt } from './format.js'

export class GroupChatPrompts {
  constructor({ projectDir = null, logger = null, configPath = null } = {}) {
    this.store = new PromptConfigStore({ projectDir, logger, configPath })
  }

  buildAnalyze(context) {
    return this.store.build('analyze', context)
  }

  buildCompose(context) {
    return this.store.build('compose', context)
  }

  buildStateUpdate(context) {
    return this.store.build('state-update', context)
  }

  status() {
    return this.store.status()
  }
}
