# Group-chat prompt catalog

Section catalog and stage plans for the group loop:

- `sections.js`: character/emotion/profiles/group/memory/material plus the
  analyze, compose and state-update contracts.
- `stages.js`: ordered section ids for each stage. `compose` shares the user
  base with `analyze`; the ReAct tool block is a conditional section.
- `index.js`: registry + assembler instance and `buildAnalyzePrompt` /
  `buildComposePrompt` / `buildStateUpdatePrompt`.

The character section renders the persona block from `buildCharacterPrompt`,
whose header is `[SETTING LOAD]`.

Rules:

- required contract sections must never be removed by budgets;
- adding a stage means adding a plan + sections, not editing the service;
- prompt text changes require updating `test/fixtures/prompt-golden.json`
  deliberately.
