/** Declarative assembly plans for the group-chat stages. */
export const STAGES = {
  analyze: {
    system: ['character', 'emotion', 'analyze-task', 'analyze-nondirect', 'analyze-image', 'analyze-contract', 'analyze-direct'],
    user: ['profiles', 'image-note', 'group-background', 'memory', 'material'],
    budget: null,
  },
  compose: {
    system: [
      'character', 'emotion', 'compose-protocol', 'compose-kind',
      'compose-reply-normal', 'compose-reply-at', 'compose-reply-quote',
      'compose-image', 'compose-parts', 'compose-bubble', 'compose-target',
      'compose-react-tools',
    ],
    user: ['profiles', 'image-note', 'group-background', 'memory', 'material'],
    budget: null,
  },
  'state-update': {
    system: ['state-update-task', 'state-update-contract', 'state-update-guidance', 'state-update-untrusted'],
    user: ['state-current', 'state-material'],
    budget: null,
  },
}
