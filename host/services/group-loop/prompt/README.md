# Group-chat prompt catalog

The prompt text and stage plans live in `group-chat.prompts.json` (bundled
default). At runtime the service reads
`<projectDir>/data/config/prompts/group-chat.json`; the file is bootstrapped
from the bundled default on first use and hot-reloaded by mtime.

Config shape:

```json
{
  "version": 1,
  "sections": [
    { "id": "character", "tier": "system", "priority": 100, "required": true, "template": "{{characterPrompt}}" },
    { "id": "material", "tier": "user", "required": true, "template": "【本轮群聊素材】\n{{material}}" }
  ],
  "stages": {
    "analyze": { "system": ["character"], "user": ["material"], "budget": null }
  }
}
```

- The `character` section renders `buildCharacterPrompt`: a generic
  `[SETTING LOAD]` block whose body is a list of free-form entries
  (`persona.settings`). When `settings` is empty, entries are derived from the
  legacy persona fields; adding `settings: ["young girl", "whale musume"]`
  replaces them with those lines.
- The `character` section renders `buildCharacterPrompt`: a generic
  `[SETTING LOAD]` block whose body comes from `persona.settings` (ordered
  free-form entries, one per line). The runtime schema is v2: only `settings`
  entries are prompt content; there is no named-field fallback.
- Context keys are produced by `format.js` + the service:
  `characterPrompt`, `statePrompt`, `profilesText`, `imageNote`, `background`,
  `memoryText`, `material`, `direct`, `speak`, `targetBubbles`, `reactTools`,
  `currentText`.
- Conditions are declarative, e.g. `{ "field": "direct", "equals": true }` or
  `{ "field": "targetBubbles", "isInteger": true }`.
- Invalid edits keep the last valid config (or the bundled default on first
  load); the error is exposed by `GroupChatPrompts#status()`.
- `test/fixtures/prompt-golden.json` and `test/host/prompt-config.test.js` guard
  output and config behavior.
