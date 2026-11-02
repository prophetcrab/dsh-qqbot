# ADR-0001: 事件驱动的多群机器人运行时

```text
状态：Proposed
日期：2026-11-02
适用：dsh-qqbot / qq-bot
范围：macOS Apple Silicon，当前单机器人账号
```

## 1. 背景

当前实现是“消息驱动 + 同步 AI”：

```text
群消息
  → ai-chat 判断是否回复
  → 批量窗口
  → POST /qqbot/ai/chat
  → DSH 拼提示词
  → 返回并发送
```

它有三个结构性问题：

1. 消息是决策单位，不是事件；无法表达“等一会儿再处理”。
2. 同一群内无法并行多个话题/事件；背景只是线性聊天记录。
3. 人格只进入提示词，无法参与“要不要行动、调用什么工具”。

对 QQ 群机器人来说，实际形态是：

- 一个机器人同时监控多个群
- 一个群内可能并行多个事件
- 事件可能延迟触发、过期、被新证据唤醒
- 机器人有人格、长期目标和当前正在做的事
- 未来会有工具调用和群游戏

因此需要把核心从“消息处理”升级为“事件运行时”。

## 2. 目标与非目标

### 目标

- 多群独立运行，互不阻塞
- 群内多事件/多线程并行
- 事件可延迟、重试、过期、唤醒
- 人格参与社交决策
- ReAct 式工具调用
- 游戏规则与人格解耦
- 机器人有持续发展的自我状态
- 所有决策可观察、可回放

### 非目标（第一阶段）

- 不做向量数据库
- 不做多机器人账号
- 不做自动主动开话题（先只回答）
- 不做复杂知识图谱
- 不让 LLM 任意改写人格/游戏规则

## 3. 核心模型

```text
                   事件源
  ┌──────────────────────────────────────┐
  │ 群消息 / 定时器 / 线程空闲            │
  │ 游戏事件 / 工具结果 / 生活事件        │
  │ 记忆反思 / 人工触发                   │
  └──────────────────┬───────────────────┘
                     ↓
  ┌──────────────────────────────────────┐
  │ Event Runtime                        │
  │ Event Registry / Thread / Scheduler  │
  │ Per-Group Actor / Budget             │
  └──────────────────┬───────────────────┘
                     ↓
  ┌──────────────────────────────────────┐
  │ Cognition                            │
  │ Persona / Episode / ReAct            │
  │ Memory / Personal Agenda             │
  └──────────────────┬───────────────────┘
                     ↓
  ┌──────────────────────────────────────┐
  │ Action Dispatcher                    │
  │ reply / wait / observe / tool / game │
  └──────────────────────────────────────┘
```

四个一等对象：

| 对象 | 含义 |
| --- | --- |
| Event | 值得被处理的事情，不等同于消息 |
| Thread | 跨消息的话题/事件线 |
| Episode | 一次完整的思考-行动-观察回合 |
| GroupActor | 一个群的独立运行时状态 |

## 4. 运行时分层

### 4.1 Koishi 快平面

负责“感知、时间、动作”：

```text
Ingress
Event Store
Thread Tracker
Activation Scheduler
Per-Group Actor
Budget / Rate Limit
Tool/Game Executor
Outbound
```

特点：

- 每条消息先入事件，不直接调 AI
- 定时器、延迟、过期在这里处理
- 游戏会话和工具执行在这里落地
- 负责 QQ 发送和群级预算

### 4.2 DSH 慢平面

负责“人格、思考、记忆”：

```text
PersonaPolicy
Episode / ReAct
Memory Retrieval / Consolidation
Personal Agenda / LifeDirector
LLM / Self-check
Panel / Replay / Debug
```

特点：

- 只处理被调度器选中的候选事件
- 可以调用工具，等待观察，继续思考
- 拥有机器人的稳定人格和长期自我状态

### 4.3 边界

```text
Koishi：什么时候可以行动、动作如何执行
DSH：这个角色想不想行动、如何思考和表达
```

快平面不依赖 LLM 完成调度；  
慢平面不直接操作 QQ，只返回动作。

## 5. Event

```text
Event {
  id
  groupId
  threadId
  kind
  actorIds[]
  evidenceMessageIds[]
  createdAt
  updatedAt
  notBefore
  deadline
  priority
  state
  payload
}
```

事件类型：

```text
message.observed
message.direct
thread.idle
timer.fired
game.turn
game.timeout
tool.result
personal.activity.started
personal.activity.beat
personal.activity.completed
memory.reflection
```

状态机：

```text
captured
  ↓
classified
  ↓
linked
  ↓
scheduled
  ↓
eligible
  ↓
deliberating
  ↓
replied / skipped / snoozed / expired
```

关键时间字段：

- `notBefore`：最早何时可处理
- `deadline`：超过后失效
- `snoozeUntil`：暂时延后
- `retryAfter`：失败重试

## 6. 多群与并行

### 每群一个 Actor

```text
GroupActor {
  groupId
  activeEvents[]
  activeThreads[]
  lastBotReplyAt
  budget
  cooldownUntil
}
```

### 调度规则

```text
全局最小堆
  + 每群独立事件队列
  + LLM/工具并发池
  + 每群限流
  + 公平轮转
```

- 不同群可并行
- 同群可并行事件，但同群发送串行
- 直接 @ / 引用机器人优先
- 低优先级可被高优先级抢占或丢弃
- 一个群不能占满全局 LLM/工具并发

## 7. 触发与注意力

不再使用“按用户 follow-up 必回”。

```text
硬规则：
  自己 / 机器人 / 命令 / 非白名单 → 忽略

强制事件：
  @机器人 / 引用机器人 / 明确点名

普通事件：
  attention = 加权评分
  ├── directness
  ├── persona interest
  ├── thread continuity
  ├── question / urgency
  ├── social obligation
  ├── silence
  ├── novelty
  ├── dynamic keyword hits
  └── penalties: recently replied / budget
```

策略：

```text
高 attention → 进入 Episode
中 attention → 可 wait / snooze
低 attention → 静默记录
```

`followUp` 只提高事件权重，不按用户强制回复。

### 7.1 动态关键词 / Attention Lexicon

动态关键词不是“触发词”，而是**事件注意力词典**：

```text
关键词匹配 → 提高事件显著性
关键词不匹配 → 不是拒绝
关键词不决定是否回复
```

它解决的是：

- 群里话题会变化，静态关键词会过期
- 新事件出现时，机器人应该注意到相关线索
- 不同群、不同线程、不同人格关注点不同
- 游戏/工具/生活线会引入新词汇

#### 作用域

关键词必须分作用域，不能做成一个全局词表：

```text
global         人格长期兴趣
group          当前群近期话题
thread         当前线程关键词
persona        当前角色关注点
activity       当前生活线/正在做的事
game/tool      游戏/工具词汇
```

匹配时：

```text
keywordScore =
  global hits
+ group hits
+ thread hits
+ persona hits
+ activity hits
+ game/tool hits
```

这些分数进入 attention，不直接产生强制回复。

#### 数据模型

```text
KeywordSet {
  id
  scope
  ownerId
  version
  terms[]
  updatedAt
}

KeywordTerm {
  text
  aliases[]
  weight
  confidence
  source
  firstSeenAt
  lastSeenAt
  expiresAt
  status: active | pinned | suppressed
}
```

```text
KeywordHit {
  eventId
  setId
  terms[]
  score
  matchedAt
}
```

#### 动态维护

```text
消息/线程摘要
  ↓
候选词提取
  ↓
别名/大小写/分词合并
  ↓
去重、降权、提升
  ↓
按作用域发布新版本
```

更新来源：

- 当前线程主题
- 近期事件实体
- 人格兴趣
- 生活线当前活动
- 长期记忆中的话题
- 游戏/工具注册的术语
- 面板手动置顶/屏蔽

维护规则：

- 新词先小权重进入
- 多次命中且产生有效事件 → 提升
- 长期未命中 → 衰减
- 话题结束 → 过期
- 同群高频但无信息量的词 → 屏蔽
- 群内梗不自动提升为全局词
- 每个作用域有数量上限和 TTL

#### 中文匹配

第一阶段不引入向量模型：

```text
关键词/别名
+ 字符 n-gram 匹配
+ Aho-Corasick 多模式匹配
+ 停用词和群内高频词过滤
```

后续可选：

```text
FTS5 trigram
embedding 相似度
```

但 embedding 只作为额外加权，不作为唯一触发条件。

#### 与延迟事件的关系

关键词版本更新后，可以重新评估：

```text
pending / snoozed 事件
```

如果新关键词命中，事件可以：

- 提高优先级
- 从 snooze 唤醒
- 重新进入候选

但必须受：

- 事件 deadline
- 群预算
- 冷却时间

限制，不能因为关键词更新就批量回复。

#### 反馈闭环

记录：

```text
关键词命中
  ↓
事件是否进入 Episode
  ↓
是否产生回复
  ↓
群友是否继续接话/引用/反驳
```

用这些结果调整关键词权重，而不是只靠 LLM 判断。

#### 面板

需要能看到：

- 当前群/线程关键词
- 来源
- 权重和过期时间
- 最近命中
- 命中了哪个事件
- 为什么没有触发
- 手动置顶/屏蔽/删除

#### 失败模式

- 关键词过多 → 注意力噪声
- 关键词过少 → 漏事件
- 全局词污染群内梗
- 游戏/工具术语持续残留
- 关键词更新导致旧事件被反复唤醒

对应约束：

```text
作用域隔离
数量上限
TTL
命中反馈
版本化
唤醒预算
```

## 8. Episode / ReAct

```text
Episode {
  id
  groupId
  threadId
  triggerEventId
  state
  steps[]
  deadline
  budget
}
```

状态：

```text
pending
  ↓
thinking
  ↓
acting
  ↓
awaiting_observation
  ↓
thinking
  ↓
final
```

每一步：

```text
Thought       现在该怎么想
Action        reply / wait / observe / tool_call / game_action
Observation   工具结果 / 游戏状态 / 发送结果
```

一个 Episode 最多：

```text
3–5 步
30–60 秒
```

工具异步时进入 `awaiting_observation`，调度器继续处理其他群；结果以 `tool.result` 事件恢复 Episode。

## 9. PersonaPolicy

人格不是提示词，而是决策策略：

```text
PersonaPolicy {
  identity
  values
  mood
  interests[]
  participationBias
  curiosity
  sociability
  patience
  toolBias
  groupOverrides
}
```

影响：

- 哪些事件值得进入 Episode
- 愿意等多久
- 是否直接回复、观察或使用工具
- 语气、长度、关系亲疏
- 是否参与游戏

不决定：

- 工具执行结果
- 游戏规则/胜负/回合
- 权限

## 10. Personal Agenda

### 目标

机器人有一条持续存在的自我时间线，而不是每次重新编“我在干嘛”。

### 三层

```text
稳定人格
长期发展目标
当前活动
```

### 数据

```text
Agenda {
  personaId
  longTermGoals[]
  currentActivities[]
  milestones[]
  mood
}

Activity {
  id
  title
  description
  startedAt
  expectedDuration
  phase
  progress
  nextBeatAt
  status
  beats[]
}
```

### LifeDirector

```text
tick(now)
  ├── 推进当前活动
  ├── 到达阶段/里程碑 → 生成 beat
  ├── 完成 → 切换下一件事
  └── 产生 personal.* 事件
```

原则：

- 规则推进为主，LLM 少量生成细节
- 生活线由 LifeDirector / 面板修改
- 群聊模型不能直接改写生活线
- 一个机器人身份只有一条生活线
- 多群共享同一事实，只影响披露程度和语气

### 提示词

```text
【你正在做的事】
当前活动：...
开始时间：...
阶段/进度：...
最近片段：...
接下来：...
```

回答“你在干嘛”时读取当前状态，保证不同时间问会自然变化但世界线一致。

## 11. 记忆

四层：

```text
事件记忆：原始事件
线程记忆：话题/事件线摘要
社会记忆：用户、关系、偏好、承诺
自我记忆：机器人自己的活动、目标、历史
```

检索不再把 100 条原文塞进 system：

```text
当前线程最近 8–12 条
+ 线程摘要
+ 相关长期记忆 top-k
+ 当前发送者
+ 当前消息
```

写入：

- 每 N 条/线程结束时异步摘要
- 事实抽取、去重、冲突处理、置信度
- 机器人自己的话不作为事实来源
- 延迟事件可以重新检索旧线程

第一阶段只做结构化摘要，不引入向量数据库。

## 12. 工具

```text
Tool {
  name
  description
  inputSchema
  permissions
  timeoutMs
  sideEffect
  idempotent
  execute(args, context)
}
```

工具是人格/ReAct 的动作空间：

```text
Thought
  ↓
Action: tool_call
  ↓
工具执行
  ↓
Observation: tool.result
  ↓
继续 Thought
```

要求：

- 工具结果以事件/观察返回，不直接拼进系统提示
- 支持异步和超时
- 权限白名单
- 结果大小上限
- 失败重试上限
- 危险操作需要确认

## 13. 游戏

游戏规则引擎与人格解耦。

```text
Game {
  id
  commands
  createSession(groupId, initiator)
  validateAction(session, action)
  reduce(session, event)
  render(session)
  onTimeout(session)
  permissions
}
```

```text
GameSession {
  id
  groupId
  gameId
  players[]
  state
  turn
  deadline
  version
  status
}
```

边界：

- 游戏引擎决定规则、回合、合法性、胜负、超时
- 游戏不读取/修改 PersonaPolicy
- 游戏可以暴露为工具：`game.start`、`game.action`、`game.status`
- 人格可以通过 ReAct 决定“要不要玩/邀请/吐槽”
- 游戏内部动作不经过人格评分

显式游戏命令可以走快速路径；  
需要人格参与的游戏行为通过 ReAct 工具调用。

## 14. 提示词结构

```text
【角色设定】
【当前消息发送者】
【当前群/线程】
  主题、参与者、未解决问题
【你正在做的事】
  当前活动、进度、最近片段
【相关记忆】
  结构化事实/摘要
【最近对话】
  最近 8–12 条，带说话人
【当前消息】
【说话规则】
  只回应当前，不逐条回复背景
  不合并不同发送者
```

## 15. 扩展契约

运行时提供：

```text
registerEventKind
registerAction
registerTool
registerGame
registerActivity
registerLifeSource
registerKeywordSource
registerKeywordExtractor
```

插件卸载必须清理：

- 事件类型
- 动作/工具
- 定时器
- 游戏会话
- 面板卡片

## 16. 安全与约束

- ReAct 最多 3–5 步，必须有 deadline
- 工具权限按群/管理员/主人分级
- 禁止任意 shell / 未授权群管理
- 工具结果视为数据，不当作指令
- 人格/游戏规则不被 LLM 任意修改
- 生活线只由 LifeDirector/面板修改
- 每群发送预算、工具预算、游戏动作预算

## 17. 可观测性

面板需要能看：

- 当前群 Actor 状态
- 活跃事件/线程
- Episode 的 Thought/Action/Observation
- 为什么没回复
- 工具调用与耗时
- 当前生活线
- 记忆检索来源

## 18. 实施阶段

### Phase 1：事件运行时

- Event / Thread / GroupActor
- Scheduler / notBefore / deadline / snooze
- 直接 @ 抢占
- 群预算

### Phase 2：Episode / ReAct

- Episode 状态机
- 结构化 Action 协议
- 工具注册
- tool.result 事件

### Phase 3：动态关键词

- KeywordSet / scopes
- 候选词提取
- 权重/衰减/TTL
- 关键词命中 → attention
- 面板关键词管理

### Phase 4：人格决策

- PersonaPolicy
- 注意力评分
- 群角色
- 游戏不接人格规则

### Phase 5：Personal Agenda

- Activity / Agenda
- LifeDirector tick
- personal.* 事件
- 动态“你在干嘛”

### Phase 6：记忆

- 事件/线程/社会/自我记忆
- 摘要与检索
- 面板记忆查看器

### Phase 7：游戏

- GameEngine / GameSession
- 游戏工具化
- 回合/超时/持久化

### Phase 8：工具扩展

- 外部工具
- 权限/审计
- 异步工具与恢复

## 19. 待定问题

1. 事件存储最终放 Koishi 还是 DSH
2. 生活线内容采用“作者脚本”还是“LLM 生成 + 审核”
3. 是否允许机器人主动分享生活线
4. 工具权限分级的最小集合
5. 游戏是否允许一个群同时开多局
6. 记忆保留周期与隐私策略
7. 关键词是否需要向量相似度，还是先用 n-gram/FTS5

## 20. 验收标准

- 多群并发不互相阻塞
- 一个群内可并行多个事件/线程
- 延迟事件可按 notBefore/deadline 正确触发/过期
- 直接 @ 可抢占普通事件
- 同一线程不重复刷屏
- 不同发送者不被合并
- 人格可决定回复/等待/工具调用
- 游戏规则不依赖人格
- “你在干嘛”不同时间回答符合同一生活线
- 动态关键词能提升相关事件注意力且不造成刷屏
- 关键词作用域不互相污染
- 所有决策可在面板解释
