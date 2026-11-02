# AI 回复逻辑与当前方案结构

```text
最后更新：2026-11-02
适用：dsh-qqbot 0.4.5 / qq-bot main
```

## 1. 一句话理解

机器人收到一条群消息后，依次经过：

```text
能不能处理
  → 值不值得回
  → 什么时候回
  → 拼什么上下文
  → 模型怎么回
  → 怎么发出去
  → 怎么记账
```

## 2. 总体架构

```text
QQ
 ↓
NapCat
 ↓ OneBot 11 / 反向 WebSocket
Koishi
 ├── access-control 权限过滤
 ├── ai-chat 消息处理
 └── runtime
      ├── Thread
      ├── DynamicLexicon
      ├── Attention
      ├── ActivationScheduler
      └── GroupActor 预算
 ↓ HTTP
DSH Host /qqbot/ai/chat
 ├── contracts 校验
 ├── AiChatService
 │    ├── Persona
 │    ├── 当前用户画像
 │    ├── 群聊背景
 │    ├── 引用 / @ / 图片
 │    ├── AI 自检 gate
 │    └── LLM 调用 / 重试
 └── 完整提示词快照
 ↓
Koishi 发送
 ↓
NapCat → QQ
```

职责：

| 端 | 负责 |
| --- | --- |
| NapCat | QQ 协议、OneBot、收发 |
| Koishi | 消息、权限、触发、上下文、批量、发送 |
| DSH | 人设、画像、提示词、模型、自检、面板 |

## 3. 一条消息的完整路径

```text
1. 收到群消息
2. access-control 检查权限
3. ai-chat 跳过自己 / 机器人 / 命令 / 私聊（按配置）
4. runtime.observeMessage()
   ├── 分配 thread
   ├── 匹配 AI 抽取的语义兴趣
   ├── 计算 interest/attention score
   └── 计算 attention
5. 如果这个用户已有 active batch：
   └── 追加消息，重新调度 batch，结束
6. 否则判断 shouldReply：
   ├── forced
   ├── 群预算
   └── high / medium / low 概率
7. 不回复：
   └── 只写入本群历史背景
8. 回复：
   ├── 创建 batch
   ├── 交给 ActivationScheduler 延迟
   └── 到期后进入 AI 调用
9. DSH 生成回复
10. Koishi 写入历史、记录预算、分条发送
11. DSH 异步更新当前用户画像
12. DSH 异步抽取本轮群聊的语义兴趣（有频率限制）
```

## 4. 第一层：能不能处理

在 `ai-chat` 入口直接跳过：

```text
机器人自己发的消息
其他机器人
私聊（groupOnly = true 时）
命令消息（/ 开头）
```

权限白名单由 `access-control` 在更前面处理。

## 5. 第二层：值不值得回

### 强制触发

```text
@机器人
引用机器人
```

结果：

```text
attention = forced
score = 1
```

### 群预算

当前每个群独立：

```text
最小间隔：10 秒
窗口：10 分钟
窗口内最多：10 条普通回复
```

耗尽时：

```text
attention = low
score = 0
reason = budget-exhausted
```

@机器人 / 引用机器人可以绕过普通预算。

### 普通消息加权

```text
score = 0

interest  : min(0.3, keywordScore * 0.3)
thread    : 当前 thread 已有历史消息 → +0.15
question  : 问句 → +0.10
silence   : 同群沉默 ≥ 5 分钟 → +0.10
recent    : 同群 30 秒内刚回复过 → -0.20
```

然后：

```text
high   >= 0.50
medium >= 0.30
low    < 0.30
```

### 三档概率

基础概率 `p` 默认 `0.15`：

| 档位 | 实际概率 |
| --- | ---: |
| high | 45% |
| medium | 30% |
| low | 7.5% |
| forced | 100% |
| budget-exhausted | 0% |

`p = 1` 时三档都按 100% 处理，主要用于手动测试。

### 语义兴趣从哪来

runtime 不再从每条消息里学习 2–4 字片段。关键词分来自 Host 的语义兴趣文件：

```text
回复成功后
  ↓
DSH 用 LLM 从群聊片段提取主题
  ↓
{"label":"龙图表情包","aliases":["龙图","表情包"],"summary":"..."}
  ↓
写入 data/state/interests.json
  ↓
Koishi runtime 监听文件
  ↓
下一条消息按语义主题的 label/aliases 命中
```

特点：

```text
不设每群候选数量上限
同一群 10 分钟内最多抽取一次
label 必须是具体主题，不是逐字片段
每个兴趣有 weight / confidence / TTL
默认 TTL 约 3–7 天（由抽取结果指定）
运行时会按 expiresAt 过滤，Host 会做衰减和清理
运行诊断里会显示语义兴趣和每条消息命中的兴趣
```

所以“感兴趣”现在是：

```text
LLM 抽取的语义主题
+ 标签/同义表达命中
+ 权重和置信度
+ 过期与衰减
```

而不是原始 n-gram 词表。

## 6. 第三层：什么时候回

触发后不会立刻调 AI，而是进入 batch：

```text
batchWindowMs = 2500
batchMaxWaitMs = 10000
```

效果：

```text
同一用户连续发消息
  → 每次重置 2.5 秒窗口
  → 但最多从第一条开始等 10 秒
  → 到期后合并为一次 AI 请求
```

Batch 由 `ActivationScheduler` 驱动：

```text
到期事件
  → flushBatch()
  → processReply()
```

不同的用户有不同 batch，互不合并。

## 7. 第四层：提示词拼装

DSH 的 system 顺序：

```text
1. 【角色设定】
2. 【对话示例】
3. 【用户画像】
4. 【当前消息发送者】
5. 【最近群聊背景】
6. 【当前消息引用的内容】
7. 【当前消息对象】
8. 额外系统提示词
9. 【回复要求】
```

### 角色设定

来自：

```text
data/config/persona.json
```

字段：

```text
名称 / 角色 / 语气 / 性格 / 行为准则 / 对话示例
```

### 当前用户画像

只拼当前发送者的画像：

```text
data/assets/profiles.json
```

包含：

```text
昵称 / QQ / 概要 / 性格 / 风格 / 关系 / 兴趣 / 近期互动
```

其他人的画像不会拼入。

### 群聊背景

来自 Koishi 内存中的本群历史：

```text
最近 historyLimit = 100 条
Host 再截取最后 24000 字符
```

格式：

```text
- 小明：内容
- AI：回复
- 小红：内容
```

注意：

> 群聊背景进入 system，不是真正的多轮 messages 历史。

### 引用和图片

```text
引用文字 → 当前消息引用的内容
引用图片 → 单独的前置 user 消息
当前图片 → 追加到当前 user 消息
背景图片 → 单独的前置 user 消息
```

图片限制：

```text
imageLimit = 4 张
imageMaxBytes = 6 MB
```

## 8. 第五层：AI 自检

在正式回复前，如果满足：

```text
开启 aiSelfCheck
没有图片
有消息
```

会先调用一次短模型请求：

```text
结合人设判断这条消息是否值得接话
```

输出：

```json
{"reply": true, "reason": "..."}
```

如果 `reply: false`：

```text
不进入正式回复
写入历史
结束
```

如果自检本身失败：

```text
默认回复，不因为自检故障静默
```

有图片时跳过自检，直接正式生成。

## 9. 第六层：模型调用

DSH 会：

```text
选择 provider / model
拼 system + messages
调用 ctx.llm.stream
```

临时失败会重试一次：

```text
最多 2 次
500ms / 1000ms 退避
只对 transient failure 重试
```

返回后：

```text
sanitizeReply() 清理上下文标签
空回复 → EMPTY_REPLY
```

## 10. 第七层：发送和记账

Koishi：

```text
pushHistory 用户消息
pushHistory AI 回复
runtime.recordReply() 记录群预算
splitReply() 按 maxReplyChars 分条
session.send()
```

预算只在**成功回复**后记账：

```text
自检拒绝 / BUSY / 错误 → 不记账
```

## 11. 第八层：画像维护

回复成功后，DSH 异步调用一次模型：

```text
buildProfileUpdatePrompt()
  ↓
现有画像 + 最近对话 + 机器人回复
  ↓
JSON patch
  ↓
mergeProfile()
  ↓
profiles.json
```

所以画像更新可能比回复晚一轮。

## 12. 当前数据位置

```text
~/project/qq-bot/
├── data/
│   ├── config/
│   │   ├── persona.json
│   │   └── ai-settings.json
│   ├── assets/
│   │   └── profiles.json
│   └── state/
│       ├── ai-chat-state.json
│       └── interests.json
```

内存数据：

```text
Koishi 重启后丢失：
  群聊 history
  未处理 batch
  thread
  群预算计数
```

持久化：

```text
画像
人设
AI 设置
语义兴趣
```

## 13. 失败时的行为

| 情况 | 行为 |
| --- | --- |
| 没有 LLM | 返回 NO_LLM_SERVICE |
| 消息为空 | EMPTY_MESSAGES |
| 自检拒绝 | skipped |
| 模型 BUSY | 不发错误提示，避免刷屏 |
| 临时错误 | 自动重试一次 |
| 最终失败 | 发送“AI 暂时不可用” |
| 空回复 | 不发送 |
| 回复过长 | 自动分条 |

## 14. 当前方案结构图

```text
┌─────────────────────────────────────┐
│              Koishi                 │
│                                     │
│ 权限过滤                            │
│   ↓                                 │
│ ai-chat                             │
│  ├── 接收 / 去重 / batch             │
│  ├── runtime.observeMessage         │
│  │    ├── thread                    │
│  │    ├── keyword                   │
│  │    ├── attention                 │
│  │    └── budget                    │
│  ├── shouldReply                    │
│  ├── ActivationScheduler            │
│  └── 发送 / history / recordReply   │
└──────────────────┬──────────────────┘
                   │ HTTP
┌──────────────────▼──────────────────┐
│                DSH                  │
│                                     │
│ contracts                           │
│ AiChatService                       │
│  ├── persona                        │
│  ├── profile                        │
│  ├── background                     │
│  ├── sender / quote / target        │
│  ├── self-check gate                │
│  ├── LLM + retry                    │
│  ├── sanitize                       │
│  └── profile update                 │
└─────────────────────────────────────┘
```

## 15. 当前已实现 / 未实现

### 已实现

```text
多群独立预算
@ / 引用强制触发
LLM 抽取的语义兴趣
attention 三档
ActivationScheduler 批量延迟
图片 / 引用图片
AI 自检
模型重试
画像异步更新
完整提示词快照
面板运行诊断
```

### 未实现

```text
长期记忆 / 摘要 / 检索
跨重启的群聊 history
ReAct 工具调用
游戏 / 工具扩展接线
真正的定时延迟回复
事件级持久化
followUpMinutes 的实际语义（目前字段存在但不再参与判定）
```

## 16. 最简调参地图

| 想改什么 | 去哪里 |
| --- | --- |
| 回复概率 | AI 面板 → 回复设置 |
| 语义兴趣抽取频率 | `host/services/ai/interest-extract.js` 的调用阈值 |
| 高/中/低概率 | `plugins/runtime/attention.ts` |
| 上下文条数 | AI 面板 → 上下文条数 |
| 群预算 | AI 面板 → 群预算 |
| 批量窗口 | AI 面板 → 批量 |
| 人设 | AI 面板 → 人设卡 |
| 用户画像 | AI 面板 → 成员画像 |
| 自检 | DSH aiSettings |
| 模型/供应商 | DSH 默认模型配置 |

## 17. 一句话总结

> **Koishi 决定“这条消息值不值得回、什么时候回”；DSH 决定“以什么人设、带哪些画像和历史、怎么回”。**
