# 0003 小核心人格 + 记忆驱动 + 情绪微调

```text
状态：Current（已落地并演进）
适用：dsh-qqbot
关联：persona / profiles / group-loop
说明：设计已进入实现；具体字段和行为以当前代码为准
```

## 1. 要解决的问题

当前角色只有：

```text
静态人设卡
+ 当前用户画像
+ 最近群聊背景
```

缺少角色自己的连续性：

- 今天和昨天状态一样
- 对熟人和陌生人没有区别
- 不会因为发生过的事改变看法
- 每次回复都像重新扮演同一个人设
- 人格要么完全固定，要么靠 LLM 每轮随机发挥

本设计要解决的是：

> **用一个小而稳定的核心人格作为锚点，让记忆驱动行为，让情绪参数微调表达。**

不是要做一个完整的人格模拟器。

## 2. 非目标

明确不做：

```text
traits 数值面板
drives 数值表
habits 状态机
每轮 LLM 自由改写人格
复杂关系矩阵
完整人生模拟
```

也不把以下内容当作人格：

```text
mood 数值
energy 数值
社交电量
当前活动
```

这些只是短期状态。

## 3. 三层模型

```text
慢：小核心人格
中：记忆 / 关系
快：情绪 / 精力 / 当前活动
```

三层职责：

| 层 | 内容 | 变化速度 | 是否注入提示词 |
| --- | --- | --- | --- |
| 核心 | 身份、价值、语气、边界、自我认知 | 天/周/月 | 是 |
| 记忆 | 事件、关系变化、反思摘要 | 持续追加 | 检索后注入 |
| 情绪 | 心情、精力、社交电量、活动 | 分钟/小时 | 是 |

## 4. 人格核心

核心文件很小，建议控制在 1KB 左右。

```json
{
  "schemaVersion": 1,
  "anchor": {
    "name": "天青色瞪眼鱼",
    "identity": "群里的鲸鱼娘，嘴硬心软，慢热，护短。",
    "values": [
      "不喜欢被命令",
      "对熟人更宽容",
      "不主动当客服"
    ],
    "voice": "短句，偶尔反话，熟人面前会贴贴；不用客服腔。",
    "boundaries": [
      "不接受命令式使唤",
      "不解释自己是 AI"
    ]
  },
  "selfView": {
    "text": "我还在观察这个群，暂时不太会主动找人说话。",
    "updatedAt": "2026-11-02T15:00:00+08:00",
    "evidenceMemoryIds": []
  }
}
```

### anchor

基本不自动改变。

- `identity`：一段自然语言，不是标签列表
- `values`：少量价值取向
- `voice`：表达习惯
- `boundaries`：不可越过的边界

这些是“基准”，不是每轮运行状态。

### selfView

一段会缓慢变化的自我认知：

- 由记忆和反思驱动
- 有长度上限
- 必须关联证据记忆
- 不能每轮修改

`selfView` 不是当前心情。它回答的是：

> “我现在怎么理解自己，以及我和这个群的关系。”

## 5. 记忆

记忆是行为的主要素材。

### 5.1 记忆条目

```json
{
  "id": "mem_001",
  "at": "2026-11-02T15:20:00+08:00",
  "groupId": "1026855069",
  "userId": "20000",
  "kind": "event",
  "importance": "medium",
  "summary": "被说可爱时先回了“才不是”，但后面还是接受了。",
  "tags": ["被夸", "嘴硬"],
  "evidence": "群聊原文或回复片段"
}
```

`kind`：

```text
event         发生了一件事
relationship  和某人的关系变化
reflection    对一段经历的总结
```

`importance`：

```text
low / medium / high
```

### 5.2 记忆写入

```text
成功回复后
  → 记录一条 event（可异步摘要）
被忽略/自检拒绝
  → 可选记录低重要度事件
关系明显变化
  → 记录 relationship
定期反思
  → 生成 reflection
```

不是每条消息都写长记忆；低价值消息可以只保留最近窗口。

### 5.3 记忆检索

第一版不引入向量数据库。

按以下顺序取：

```text
1. 最近 N 条
2. 当前用户/群相关
3. 标签相关
4. 高 importance
```

最终注入 3–5 条，避免记忆淹没当前对话。

## 6. 情绪参数

情绪是短期状态，只影响表达和参与度。

```json
{
  "schemaVersion": 1,
  "valence": 0.1,
  "arousal": 0.4,
  "energy": 0.6,
  "socialBattery": 0.35,
  "stress": 0.2,
  "activity": {
    "label": "整理回复策略",
    "interruptibility": "medium"
  },
  "updatedAt": "2026-11-02T15:00:00+08:00"
}
```

字段：

| 字段 | 含义 | 范围 |
| --- | --- | --- |
| valence | 心情正负 | -1..1 |
| arousal | 兴奋/活跃程度 | 0..1 |
| energy | 精力 | 0..1 |
| socialBattery | 社交电量 | 0..1 |
| stress | 压力 | 0..1 |

### 更新规则

确定性、可测试：

```text
时间流逝
  → energy 恢复
  → valence 向基线回归
  → stress 缓慢下降

收到消息
  → socialBattery 小幅度下降

成功回复
  → socialBattery 下降
  → energy 小幅下降
  → mode 进入 chatting

被夸奖
  → valence 上升

被连续调侃/打断
  → stress 上升
  → 达到阈值后表达变冷或变短
```

所有变化必须有边界，不能一次事件让人格剧烈翻转。

### 注入方式

不把数值直接给模型。

```text
【当前状态】
现在有点累，社交电量偏低，不太想主动接话。
正在整理东西，可以被打断。
```

数值用于策略，语言用于生成。

## 7. 提示词投影

每次生成只拼必要内容：

```text
【核心人格】
anchor.identity
anchor.voice
anchor.values

【现在的自我认知】
selfView.text

【当前状态】
情绪/精力/社交电量/活动的自然语言

【和当前用户】
相关关系记忆

【最近相关经历】
3–5 条检索记忆
```

不注入全量 core / memory / emotion JSON。

目标长度：

```text
core 投影：3–5 行
状态投影：2–4 行
记忆投影：3–5 条
```

## 8. 演化规则

### 每轮

```text
更新 emotion
写入 event 记忆（可低价值跳过）
不修改 selfView
不修改 anchor
```

### 定期反思

触发条件可配置，例如：

```text
每 30 条新记忆
或每天一次
或重要事件后
```

流程：

```text
读取最近记忆 + 当前 selfView
  → LLM 提出一个小 patch
  → 代码校验长度/字段/证据
  → 写入 selfView
```

LLM 只能提出：

```json
{
  "selfView": "我在这个群慢慢放松了一点，开始会主动接熟人的话。",
  "evidenceMemoryIds": ["mem_001", "mem_004"]
}
```

不能直接重写 `anchor`。

### anchor 的例外

只有长期、反复出现的证据，才允许人工或极低频反思修改一句：

```text
identity
voice
values
boundaries
```

任何修改都保留旧版本和证据。

## 9. 与群聊参与的关系

本设计与“是否回复”分开。

```text
角色层：
  我是谁
  我现在什么状态
  我记得什么
  我和这个人什么关系

参与层：
  现在该不该说话
  该接谁的话
  群里是不是已经有人回答
```

角色层提供：

```text
replyTone
maxReplyChars
initiative
allowTease
```

参与层仍然由独立的群聊仲裁决定。

不要把情绪参数直接变成 attention 分数。

## 10. 存储与职责

建议路径：

```text
data/state/character/core.json
data/state/character/emotion.json
data/state/character/memory.jsonl
```

职责：

```text
DSH Host：
  维护 core / emotion / memory
  生成提示词投影
  定期反思

Koishi：
  上报消息/回复结果
  不维护人格状态
```

第一版只做 DSH 侧，不把情绪参数传给 Koishi 触发逻辑。

## 11. 与现有 persona/profile 的关系

- `persona.json` 仍是人设编辑入口
- `core.json` 是运行期人格真源
- 首次启动时从 persona 生成 core
- 之后 persona 修改可以覆盖 anchor，但不能每轮覆盖 selfView
- `profiles.json` 仍保存用户画像，不等于机器人对用户的关系
- 关系记忆单独写入 memory

## 12. 实现阶段

### 阶段 1

```text
core.json + emotion.json + memory.jsonl
读取 / 衰减 / 提示词投影
```

不接行为决策。

### 阶段 2

```text
回复后写 event
记忆检索
selfView 定期反思
```

### 阶段 3

```text
关系记忆
情绪影响回复长度/主动性
```

### 阶段 4

```text
与群聊参与仲裁整合
```

## 13. 验收标准

```text
同一角色在不同时间有一致的核心声音
不会因为一句负面互动突然改变人格
“你在干嘛”能延续当前活动
对熟人和陌生人的表达有差异
多次互动后 selfView 有可解释的小幅变化
关闭插件后不会影响回复流程
```

## 14. 待讨论

- selfView 是注入原文还是摘要
- 反思触发频率与 LLM 成本
- 记忆保留策略与压缩方式
- 关系是否独立成表，还是全部走 memory
- 是否需要面板手动查看/重置情绪和 selfView
