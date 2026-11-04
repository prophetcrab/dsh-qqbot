# 0005 - Deterministic Game Core

## Decision

Gameplay commands are handled by a standalone `game-core` service, never by the group LLM loop.

```text
group message
  → known slash command
  → listener POST /qqbot/game/command
  → GameCore / GameRegistry
  → per-group player store
  → deterministic replies
  → listener sends replies
  → return before buffer / analyze / compose
```

## Module contract

Each module is a deterministic executor registered by slash command:

```js
{
  id,
  version,
  commands: ['/command'],
  async execute({ command, groupId, userId, nickname, store, random, now }) {
    return { ok: true, replies: ['...'] }
  }
}
```

Modules never call the LLM, send QQ messages or read arbitrary files. They receive the shared server-side store and validated context.

## State

```text
data/state/games/players/<groupId>.json
```

Each group has an independent player library. Group ids are validated as filename-safe values. Writes are per-group serialized and atomic.

Player record:

```json
{
  "qq": "20000",
  "nickname": "小明",
  "coins": 0,
  "registeredAt": "...",
  "checkinCount": 0,
  "lastCheckinDate": "2026-11-03",
  "lastCheckinAt": "..."
}
```

## Commands

```text
/注册                    register the sender in the current group
/签到                    once per group per Asia/Shanghai day, random 10-30 coins
/账号背包                show this group's bag for the sender
/兑换钓鱼币 <金币数量>    金币兑换钓鱼币，1 金币 = 10 钓鱼币
/钓鱼 兑换金币 <数量>     钓鱼币兑换金币，不足整十向下取整
```

## Group bag

The player record and its bag are scoped to the current group:

```text
data/state/games/players/<groupId>.json
```

```json
{
  "qq": "20000",
  "nickname": "小明",
  "coins": 18,
  "items": {},
  "checkinCount": 1,
  "lastCheckinDate": "2026-11-03"
}
```

The same QQ account may have independent coins, items and check-in state in
different groups. Future standalone game modules can keep their own state and
are not required to use this bag.

Arguments after a command are ignored; the listener forwards only the exact command token. Nicknames are sanitized and coins are server-owned.

## Prompt injection boundary

- Command text never enters group material or any LLM prompt.
- No model output can mint coins or change player state.
- The route validates group/user/command server-side.
- Unknown slash commands continue through normal middleware handling.
