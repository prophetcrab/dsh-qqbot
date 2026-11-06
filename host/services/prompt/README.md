# Prompt assembly engine

Generic, business-agnostic prompt composition:

- `PromptRegistry`: register and validate sections (`id`, `tier`, `render`, `when`, budget metadata).
- `PromptAssembler`: render a declarative stage plan into `{ system, user, meta }`.
- `fitBudget`: character-budget fitting; required sections are never dropped,
  optional sections are kept by priority, `maxChars` truncation is explicit.

Sections are plain objects with a `render(context)` function. The engine never
reads files or calls models; callers pass an already-built context.
