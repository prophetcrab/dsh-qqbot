# ADR-0002: 运行时内核 v1 详细设计

```text
状态：Historical
日期：2026-11-02
范围：早期 runtime 设计（qq-bot / plugins/runtime）
对应：ADR-0001
说明：当前 Host 已按 v2 kernel/contracts/services/plugins 重写；本文仅作设计参考
```

## 1. 本阶段目标

实现可独立测试的运行时内核，不直接替换线上 `ai-chat`：

```text
Event / Thread
GroupActor / Budget
ActivationScheduler
DynamicLexicon
Attention
Episode / ReAct
ToolRegistry
Game / Activity 扩展注册
```

线上行为暂不变；下一步再把 `ai-chat` 的触发和上下文切到 runtime。

## 2. 模块

```text
plugins/runtime/
├── index.ts        Koishi 插件入口（默认不激活消息中间件）
├── types.ts        公共类型
├── events.ts       EventStore / ThreadTracker
├── scheduler.ts    MinHeap / ActivationScheduler / GroupActor
├── lexicon.ts      动态关键词词典
├── attention.ts    注意力评分
├── episodes.ts     Episode 状态机 / ReAct 循环
├── tools.ts        ToolRegistry
├── extensions.ts   Game / Activity / LifeSource 注册
└── README.md
```

## 3. Event

```ts
interface BotEvent {
  id: string
  kind: string
  groupId: string
  threadId: string | null
  actorIds: string[]
  evidenceMessageIds: string[]
  createdAt: number
  updatedAt: number
  notBefore: number
  deadline: number | null
  priority: number
  state: 'captured' | 'classified' | 'linked' | 'scheduled'
       | 'eligible' | 'deliberating' | 'replied' | 'skipped'
       | 'snoozed' | 'expired'
  payload: Record<string, unknown>
}
```

`EventStore`：

```ts
create(input): BotEvent
get(id): BotEvent | null
update(id, patch): BotEvent | null
list(filter?): BotEvent[]
```

## 4. Thread

```ts
interface Thread {
  id: string
  groupId: string
  messageIds: string[]
  participants: string[]
  startedAt: number
  lastAt: number
}
```

`ThreadTracker.assign(message)`：

```text
引用/回复目标在同一群 → 复用目标线程
否则同一群最近消息在 threadGapMs 内 → 复用最近线程
否则创建新线程
```

## 5. Scheduler

```ts
interface ScheduledEvent {
  eventId: string
  nextAt: number
  priority: number
}
```

```ts
class ActivationScheduler {
  schedule(event): void
  due(now, limit): BotEvent[]
  snooze(id, until): void
  cancel(id): void
  expire(now): void
  nextAt(): number | null
}
```

规则：

- `notBefore` 前不可用
- `deadline` 后过期
- 同一时刻按 priority 降序
- 返回前把状态改为 `eligible`

## 6. GroupActor / Budget

```ts
interface BudgetOptions {
  minIntervalMs: number
  maxPerWindow: number
  windowMs: number
}

class GroupActor {
  canSpeak(now): boolean
  recordSpeech(now): void
  noteEvent(eventId): void
}
```

每个群：

- 独立冷却
- 独立窗口计数
- 独立预算

## 7. DynamicLexicon

### Scope

```ts
type LexiconScope = 'global' | 'group' | 'thread' | 'persona' | 'activity' | 'game' | 'tool'
```

```ts
interface LexiconKey { scope: LexiconScope; owner: string }
```

### Term

```ts
interface KeywordTerm {
  text: string
  aliases: string[]
  weight: number
  confidence: number
  source: string
  firstSeenAt: number
  lastSeenAt: number
  expiresAt: number | null
  status: 'active' | 'pinned' | 'suppressed'
}
```

### API

```ts
class DynamicLexicon {
  add(key, text, options?): KeywordTerm
  remove(key, text): boolean
  pin(key, text, pinned): void
  match(text, keys): KeywordHit[]
  score(text, keys): number
  learn(text, key, now): KeywordTerm[]
  decay(now): void
  expire(now): void
  snapshot(): KeywordSnapshot[]
}
```

### 动态维护

- 候选词从文本提取，过滤停用词/单字/纯数字
- 新词 `weight=0.2`
- 重复出现：`weight = min(1, weight + 0.1)`
- 未命中衰减：`weight *= 0.5^(elapsed/halfLife)`
- 低于阈值删除（pinned 除外）
- `expiresAt` 到期删除
- 每个 scope+owner 有 maxTerms 上限

### 匹配

第一阶段：

```text
normalize: lower case, 全角转半角, 去首尾空白
term/alias includes 匹配
中文 2 字以上
```

后续可替换 Aho-Corasick / FTS5，API 不变。

### Attention 接入

```ts
attention = base(directness, question, thread...) + keywordScore * weight
```

关键词只加分，不强制回复。

## 8. Attention

```ts
interface AttentionInput {
  forced?: boolean
  direct?: boolean
  keywordScore?: number
  threadContinuity?: number
  question?: boolean
  silenceMs?: number
  recentlyReplied?: boolean
  budgetExhausted?: boolean
}
```

输出：

```ts
{ score: number, decision: 'forced' | 'high' | 'medium' | 'low', reasons: string[] }
```

阈值先固定：

```text
forced → forced
score >= 0.65 → high
score >= 0.35 → medium
else low
```

## 9. Episode / ReAct

```ts
interface Episode {
  id: string
  groupId: string
  threadId: string | null
  eventId: string
  status: 'pending' | 'thinking' | 'acting'
        | 'awaiting_observation' | 'waiting'
        | 'done' | 'expired' | 'failed'
  steps: EpisodeStep[]
  startedAt: number
  deadline: number
  maxSteps: number
}
```

Action：

```ts
type EpisodeAction =
  | { type: 'reply'; text: string }
  | { type: 'wait'; until: number; reason?: string }
  | { type: 'observe'; reason?: string }
  | { type: 'tool'; tool: string; args: Record<string, unknown> }
  | { type: 'expire'; reason?: string }
```

循环：

```ts
runEpisode(initial, { reasoner, tools })
  while steps < maxSteps && now < deadline:
    action = reasoner.next(episode, tools)
    reply → done
    wait → waiting
    observe → done
    expire → expired
    tool → execute; append observation; continue
  return timeout/step-limit
```

工具结果作为 Observation 回给 reasoner。

## 10. ToolRegistry

```ts
interface ToolSpec {
  name: string
  description: string
  permissions: string[]
  timeoutMs: number
  sideEffect: boolean
  execute(args, context): Promise<unknown>
}
```

```ts
class ToolRegistry {
  register(spec): void
  unregister(name): void
  list(permissions?): ToolSpec[]
  invoke(name, args, context): Promise<ToolResult>
}
```

- 未知工具 → 失败 observation
- 权限不足 → 失败 observation
- 超时 → 失败 observation
- 结果大小限制

## 11. Game / Activity 扩展

只定注册接口，不实现具体游戏：

```ts
registerGame(spec)
registerActivity(spec)
registerLifeSource(spec)
```

硬约束：

- 游戏规则不读取 PersonaPolicy
- 游戏可暴露为工具
- 人格通过 ReAct 决定是否调用游戏工具
- Activity 由 LifeDirector 推进，不由群聊模型直接修改

## 12. 本阶段不做的

- 不替换 ai-chat
- 不接 LLM
- 不接数据库持久化
- 不实现具体游戏
- 不实现 LifeDirector tick
- 不做向量检索

## 13. 测试矩阵

```text
events: 线程创建、引用链接、时间间隔
scheduler: notBefore、deadline、优先级、snooze
group: 冷却、窗口预算
lexicon: 作用域、别名、动态学习、衰减、过期、上限
attention: forced/high/medium/low、关键词加分
episode: reply、wait、observe、tool、步骤上限、超时
tools: 注册、权限、未知工具、超时
extensions: 注册/注销、插件卸载清理
```

## 14. 后续接入顺序

```text
1. runtime 内核测试
2. ai-chat 接收 runtime 的 attention/decision
3. 直接 @ 走 forced
4. 普通消息走 scheduler
5. 工具调用接 DSH
6. 游戏/活动注册
```
