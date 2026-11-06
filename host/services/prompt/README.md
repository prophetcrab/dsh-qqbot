# Prompt assembly engine

Generic, business-agnostic prompt composition:

- `PromptRegistry`: register and validate sections (`id`, `tier`, `render`, `when`, budget metadata).
- `PromptAssembler`: render a declarative stage plan into `{ system, user, meta }`.
- `fitBudget`: character-budget fitting; required sections are never dropped,
  optional sections are kept by priority, `maxChars` truncation is explicit.

Sections are plain objects with a `render(context)` function. The engine never
reads files or calls models; callers pass an already-built context.

`compilePromptConfig()` turns a JSON config into such sections:

```json
{
  "version": 1,
  "sections": [
    { "id": "profiles", "tier": "user", "template": "{{profilesText}}" },
    { "id": "bubble", "tier": "system", "when": { "field": "targetBubbles", "isInteger": true }, "template": "本轮计划 {{targetBubbles}} 条气泡。" }
  ],
  "stages": {
    "analyze": { "system": ["bubble"], "user": ["profiles"], "budget": null }
  }
}
```

Templates support `{{path.to.value}}` and the `json` filter; conditions are
declarative (`equals`, `notEquals`, `in`, `truthy`, `exists`, `isInteger`,
`all`, `any`, `not`) so configuration cannot execute code.
