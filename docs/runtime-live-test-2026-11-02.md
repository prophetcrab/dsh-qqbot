# Runtime live test — 2026-11-02

## 环境

```text
Mac: Apple Silicon
Bot: 676512192（天青色瞪眼鱼）
Group: 1026855069（龙图群，5 人）
DSH: 本地 64420
Koishi: 5140
Runtime: plugins/runtime enabled
```

## 测试设置

为避免概率导致样本不可控，测试期间临时设置：

```text
replyProbability = 1
runtime minIntervalMs = 0
runtime maxPerWindow = 10
```

测试结束后已恢复生产值：

```text
replyProbability = 0.15
minIntervalMs = 20000
maxPerWindow = 3
```

## 结果

| 时间 (UTC) | 发送者 | 消息 | threadId | keywordScore | attention | reasons | 结果 |
| --- | --- | --- | --- | ---: | ---: | --- | --- |
| 05:03:51 | 螃蟹MKII | 今天在聊什么 | thread:2 | 0 | 0 | — | 回复 |
| 05:03:57 | 螃蟹MKII | 我在看龙图 | thread:2 | 0 | 0 | budget-exhausted | 不回复 |
| 05:04:03 | 螃蟹MKII | @你 你觉得呢 | thread:2 | 0 | 1 | forced | 回复 |
| 05:04:26 | 螃蟹MKII | 111 | thread:2 | 0 | 0 | budget-exhausted | 不回复 |
| 05:04:30 | 螃蟹MKII | www | thread:2 | 0 | 0 | thread, recent-penalty | 回复（概率 1） |
| 05:06:00 | 螃蟹MKII | 龙图 | thread:2 | 0 | 0 | budget-exhausted | 不回复 |
| 05:06:37 | 亖Y | 今天真热 | thread:2 | 0.16 | 0 | budget-exhausted | 不回复 |
| 05:07:38 | 螃蟹MKII | 龙图 | thread:1 | 0 | 0 | — | 回复 |
| 05:07:51 | 亖Y | 今天真热 | thread:1 | 0 | 0 | thread, recent-penalty | 回复 |
| 05:07:56 | 亖Y | @你 你怎么看 | thread:1 | 0 | 1 | forced | 回复 |
| 05:08:34 | 螃蟹MKII | 今天真热 | thread:1 | **0.96** | **0.438** | keyword, thread | 回复 |

## 已验证

- 事件归入线程：同一群短时间内消息复用 thread，重启后创建新线程
- 群预算：达到窗口上限/冷却后，普通消息不触发
- 强制触发：@机器人 不受普通预算限制，正常回复
- 动态关键词：第二轮“今天真热”命中已学习词，`keywordScore=0.96`
- 关键词抬升注意力：`attention=0.438`，reasons 为 `keyword + thread`
- 多发送者：背景中保留“螃蟹MKII”“亖Y”，当前发送者单独标记
- 提示词：包含【当前消息发送者】、引用内容、不同发送者独立规则
- 回复链路：DSH AI 正常返回并发送到 QQ

## 发现与限制

1. 新词只对**下一次**消息生效，当前消息先打分后学习；这是有意的，避免自命中。
2. `Intl.Segmenter` 会把“龙图”切成单字，已增加 2–4 字中文 n-gram 提取。
3. 动态关键词现已持久化到 `data/state/runtime-lexicon.json`；本条记录的是当时测试版本。
4. `ai-chat` 批量延迟现已改由 ActivationScheduler 驱动；本条记录的是当时测试版本。
5. ReAct、ToolRegistry、Game/Activity 注册已实现内核，但尚未接入线上 AI 动作。

## 结论

Phase 1/2 的线程、关键词、attention、群预算、发送链路已在龙图群完成真实群聊验证。
生产参数已恢复，机器人保持在线。
