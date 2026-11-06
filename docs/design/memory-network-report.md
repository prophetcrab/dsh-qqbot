# 静态关联记忆网络 — 技术报告（初版 demo）

| 项 | 内容 |
| --- | --- |
| 日期 | 2026-11-05（2026-11-06 归档） |
| 状态 | 设计文档；实现代码与运行数据已移除，未接入 bot |
| 基线 | `dshbot-mac` v0.7.1 |
| 测试 | 实现时 341 host/client tests；当前基线 333 |

> **归档说明（2026-11-06）**：决定暂不启用该模块。demo 实现代码（`host/services/memory/`、`scripts/memory-demo.mjs`、`scripts/group-chain-demo.mjs`、`test/host/memory.test.js`）与运行数据已删除；本文档保留为完整技术方案参考。文中出现的代码路径、分支、提交、测试数量均为当时的实现记录。

---

# 一、背景与目标

## 1.1 现有记忆机制的问题

当前群聊记忆是 `group-loop/store.js` 里的 `memory.jsonl` + 注入 prompt 的"最近 50 条"：

- 只按时间截断，没有检索规则；
- 跨群全量拼进 prompt，低成本但噪声大；
- 没有关联结构，无法"由 A 想起 B"；
- 没有因果边，回忆无法沿"因为…所以…"展开；
- 回忆是只读的，不加强也不遗忘；
- 上限 50 条，长期记忆实际不可用。

## 1.2 目标

把记忆做成**独立的长期跨对话记忆模块**，支持：

```text
模拟群聊发言 → 模型思考（think） → 回忆（recall） → 决策（decide） → 行为（act）
```

- 静态拓扑：节点、边、权重由规则/统计确定，不做梯度训练；
- 动态激活：每次回忆从核心点出发扩散；
- 回忆巩固：每次回忆后更新网络（Hebbian 式加强 + 统计 + 懒衰减）；
- 不引入向量数据库、embedding、ANN、模型训练。

## 1.3 非目标

- 不做端到端 Engram 式训练（数据量与运行环境都不满足，见 §12）；
- 不做全量语义检索（同义词/改写仍可能漏召回）；
- 不影响现有 bot 行为（demo 未接入 group-loop 运行时）。

---

# 二、设计概览

## 2.1 一句话结构

```text
静态加权异构图 + 动态激活 + 回忆巩固
```

- **无向边**：cue↔cue 关联、memory↔cue 成员关系，参与扩散；
- **有向边**：memory→memory 的 `cause`、`supersedes`、`derivedFrom`；
- 回忆 = 核心点（hubs）定位 → 激活传播 → 记忆排序 → 输出路径；
- 巩固 = 只加强"被选中并注入"的路径。

## 2.2 节点与边

| 类型 | 方向 | 来源 | 参与激活 |
| --- | --- | --- | --- |
| memory—cue | 无向遍历 | 写入时抽取 | 是 |
| cue—cue | 无向 | 同一记忆共现累加 | 是 |
| memory→memory `cause` | 有向 | state-update 显式声明（规划中） | 是（只向前，≤2 跳） |
| memory→memory `supersedes` | 有向 | 合并/更新时自动 | 否（版本解析） |
| memory→memory `derivedFrom` | 有向 | 反思/总结 | 否（来源回溯） |

## 2.3 为什么关联边用无向、因果/生命周期用有向

- 共现/联想本身对称，无向边只需存一份 `(a<b)`，可完全由 memory 记录重建；
- 回忆需要双向扩散，无向图不会漏反向路径；
- 因果不能从共现或时间顺序推断，必须显式来源；有向边只用于语义确定的关系。

---

# 三、数据模型

## 3.1 记忆记录 schema v1

```json
{
  "schemaVersion": 1,
  "id": "mem_20261105153200_a1b2",
  "status": "active",
  "createdAt": "2026-11-05T07:32:00.000Z",
  "updatedAt": "2026-11-05T07:32:00.000Z",
  "scope": "group",
  "groupId": "725042903",
  "userId": null,
  "kind": "event",
  "importance": "medium",
  "summary": "叱咤乾坤催群友当跑团 DM，被婉拒后仍坚持“赶鸭子上架”。",
  "detail": null,
  "tags": ["跑团", "催开团"],
  "participants": ["3090495044", "3044275529"],
  "participantNames": { "3090495044": "螃蟹MKII" },
  "cues": [
    { "term": "跑团", "weight": 1, "source": "tag" },
    { "term": "3090495044", "weight": 0.8, "source": "participant" }
  ],
  "relations": {
    "causedBy": ["mem_20261104181200_c3d4"],
    "supersedes": null,
    "derivedFrom": [],
    "related": []
  },
  "evidence": { "loopId": "loop_...", "messageIds": [] },
  "source": "state-update"
}
```

约定：

- `scope`：`group`（默认，必须 groupId）/ `character`（跨群角色记忆）/ `user`（必须 groupId+userId）；
- `kind`：`event / relationship / reflection / fact / preference`；
- `importance`：`low / medium / high`，只作为激活 bias，不单独筛记忆；
- `participants` 只存 **QQ 字符串**；昵称只存 `participantNames` 快照；
- `causedBy` 语义 = "本记忆由哪些记忆导致"，落图为 `被引用者 → 本记忆`；
- 可变学习状态（accessCount、salience、关联权重）不写回记录，避免每次回忆重写 JSONL。

## 3.2 存储布局

```text
<projectDir>/data/state/memory/
├── memories.jsonl       记忆记录（唯一事实源）
├── associations.json    cue 无向边快照（可丢弃重建）
└── memory-stats.json    访问/巩固统计（防抖写）
```

旧文件 `<projectDir>/data/state/group-loop/memory.jsonl` 保留不动。

## 3.3 迁移映射

```text
旧 id/loopId/groupId/at/summary/kind/importance/tags/participants
  → 新 id / evidence.loopId / groupId / createdAt / summary / kind / importance / tags / participants

participants 昵称 → QQ：用 data/assets/profiles.json 的 groupId+nickname 反查；
匹配不到的昵称只保留在 summary/cue 里，不写入 participants。

cues 由 tags/participants/summary 重新生成；relations 全空（旧数据没有因果）。
```

---

# 四、写入流水线

入口只有 `MemoryService.add(entries, context)`，调用方不直接碰文件。

```text
state-update / reflection / migration / seed / manual
  → normalize（枚举/长度/scope/participants 映射）
  → 与同 scope+群+kind 的已有记忆做 cue 向量相似度比较
        ≥ 0.8 → 合并（保留旧 id，更新 summary/importance/tags/participants/cues）
        < 0.8 → 新建
  → 抽取 cues（tags 1.0 / participants 0.8 / 昵称 0.6 / summary 词 0.5，最多 8 个）
  → 校验有向关系（causedBy 必须来自本轮 recalledIds；检查自环/环/scope）
  → 生成 id、写内存索引
  → 图更新：cue 节点、cue↔cue 共现（饱和累加）、memory→cue、有向边
  → 限额淘汰（全局 2000 / 每群 500，按 importance+recency+access+degree 保留分）
  → 标记 dirty，防抖落盘
```

因果边来源约定（规划）：

- 主来源：state-update 模型在候选列表内显式声明 `causedBy`；
- 补充：反思任务（Phase 2）、人工修正；
- **禁止**：共现、时间顺序、"因为/所以"规则推断为 cause；
- 时间先后若要保留，单独记为弱 `temporal` 边，不参与因果门控。

---

# 五、回忆算法

## 5.1 核心点（hubs）

```text
候选 = 调用方给的 cues（未来来自 think） ∪ 从 query 文本抽取的词
逐个打分 = idf(term) × (0.5 + 0.5 × min(1, degree/12)) × 1.25（显式 cue 加权）
排序取 top（默认 3，最多 4）
```

- 只有图中存在的 cue 才能成为 hub；
- think 提供的 cue 优先，但会被 query 里信息量更高的词替换；
- 无合格 hub → 不扩散，按 scope 取最近记忆兜底。

## 5.2 激活范围（四层收敛）

```text
1. 资格：当前群 group、character、参与者命中的 user；排除 superseded/deleted/冷却
2. 结构：无向 ≤2 跳；因果只向前 ≤2 跳；生命周期不扩散
3. 预算：迭代 3 轮、剪枝 ε=0.02、访问节点 ≤256、每轮 frontier ≤64、fanout ≤32
4. 输出：minActivation 0.15、每 hub 最多 2 条、MMR 去重、Top 5
```

## 5.3 激活传播

```text
a(anchor)=1
for t in 0..2:
  next = a
  for (term, value) in a:
     按边权取 top fanout
     share = value × (w / totalWeight) × hopDecay(0.6)
     next[neighbor] += share
  剪枝 < 0.02，clamp ≤ 1
  maxDelta < 0.01 → 停止
```

记忆得分：

```text
sum( cue 激活 × memory-cue 权重 )
score = ───────────────────────────── × bias
              sqrt(命中 cue 数)

bias = (0.7 + 0.3×importance) × (0.8 + 0.2×时间衰减) × (1 + 0.1×参与者命中)
```

因果传播：得分 ≥ 0.2 的记忆沿 `causeOut` 向前传播 `value × confidence × 0.35`，最多 2 跳。

补充：**字面兜底**——hub 词直接出现在 summary/tags/participants 里时，给一个 0.2+ 的基础分，避免长 summary 的关键词因 cue 名额被挤掉而完全召回不到。

## 5.4 输出与路径

```json
{
  "hubs": ["跑团", "开团"],
  "recalled": [{
    "id": "mem_...",
    "summary": "...",
    "activation": 0.802,
    "via": ["跑团", "开团"]
  }],
  "scope": { "visited": 16, "expanded": 63 }
}
```

`via` 是 cue 激活路径（从 hub 到命中 cue）；`supersedes` 链在选memory时解析到最新 active 版本。

## 5.5 回忆巩固

每次 recall（update=true）后：

```text
只对被选中并注入的记忆：
  对其激活过的 cue 两两加强：w += η×(1−w/wMax)，η=0.05，wMax=10
  更新该记忆 accessCount / lastRecalledAt / salience（有上限）
因果边：只增加走过链的 confidence，不新造边
衰减：懒衰减（0.5^(age/30d)），在读取/更新时结算
```

防回声室：饱和更新、时间衰减、每 hub 配额、冷却窗口（默认 5 分钟）。

---

# 六、数据规模与迁移结果

首次初始化（真实运行数据）：

| 指标 | 数值 |
| --- | ---: |
| 迁移旧记忆 | 50 |
| 结构化种子 | 139 |
| 总记忆 | 189 |
| group / character / user | 60 / 7 / 122 |
| 事件 / 关系 / 反思 / 事实 / 偏好 | 44 / 2 / 4 / 11 / 128 |
| cue 节点 | 974 |
| 无向关联边 | 4,743 |

种子来源：

- `character.json` core → 1 条身份记忆 + 6 条关键词簇记忆；
- `groups.json` → 10 条群话题/未回答问题；
- `profiles.json` → 122 条按群隔离的 user 偏好/关系记忆。

---

# 七、完整链条（demo）

## 7.1 链路实现

`scripts/group-chain-demo.mjs`（已移除）调用正在运行的 DSH 路由：

```text
模拟消息
  → POST /qqbot/ai/chat            生成 {think, cues}（真实模型）
  → MemoryService.recall()          新记忆库回忆
  → POST /qqbot/group/analyze       真实 analyze 决策
  → POST /qqbot/group/compose       真实 compose（含工具）
  → 打印模拟发送（bubbles / at / quote / poke）
```

说明：

- think 由 `/qqbot/ai/chat` 的 `system` 参数约束输出 JSON；
- 回忆块目前拼进 `material` 传给 analyze/compose（临时方案，正式接入应加独立 `memoryBlock` 参数）；
- analyze 会把模拟素材归档进真实 `messages.jsonl`；demo 不调用 state-update，不改 emotion/memory。

## 7.2 决策能力矩阵

| 能力 | 实现位置 | demo 覆盖 |
| --- | --- | --- |
| 沉默 | analyze `speak.enabled=false` | ✅ |
| statement / reply | analyze `speak.kind` | ✅ |
| normal / quote / at | `speak.replyType` + target | ✅ |
| action（戳一戳） | `replyType=action` + userIds | ✅（能力存在，未稳定触发） |
| focus / quote 更早消息 | messageIds | ✅ |
| 1–3 条气泡 + 节奏 | compose parts + bubbleBudget | ✅ |
| 7 个工具 | compose ReAct | ⚠️ 解析问题已修，待重启 |
| 图片理解 | images/quotedImages/backgroundImages | 未测 |
| 人设/情绪/画像/群状态 | analyze/compose 上下文 | ✅ |
| 长期记忆回忆 | memory.recall | ✅ |
| 记忆写入/因果边 | state-update → memory.add | ⏳ 未接入 |
| 游戏/钓鱼命令 | Koishi 命令通道 | 不属于群聊决策 |

## 7.3 实测样例

```text
message: 叱咤乾坤又在群里催我当 DM，说这次再不来就让我画十张海报
think:   又在催DM，先拿赶稿当挡箭牌，再给个软钉子——周日陪年糕，顺便提旧海报换点人情。
cues:    DM | 赶稿 | 年糕 | 旧货市场
hubs:    旧货市场 | 赶稿 | dm | 年糕
recall:  [0.802] 我的关键词：旧货市场、旧楼、招牌、年糕、肥鱼
         [0.659] 叱咤乾坤催天青色瞪眼鱼当跑团DM…以只会画分镜婉拒
         [0.506] 群友叱咤乾坤要我抽博德之门宝物并配图…
决策：发言 reply · replyType=quote messageIds=["m1"] userIds=["10001"]
行为：3 条气泡 · budget=3
  1. DM我真不行，脑子转不动
  2. 十张海报？这是加量不加价啊
  3. 行，我画，周日先去旧货市场喘口气
```

其他用例：

- 行情/算术提问：决策 `reply+at`，compose 输出 `<tool_use>` XML（旧解析器不识别）；
- 食堂吐槽（count 触发）：决策 `reply+normal`，1 条气泡；
- 查课提问：recall 命中群话题 fact + 相关事件；
- 爆仓/分镜：recall 命中角色身份记忆。

---

# 八、代码与测试

## 8.1 实现时新增文件（已移除）

```text
host/services/memory/
├── index.js      MemoryService：add / recall / seed / stats / flush（290 行）
├── schema.js     schema v1、normalize、限制
├── cues.js       cue 抽取、加权 Jaccard
├── graph.js      记忆图、激活、因果传播、快照
├── recall.js     hub 选择、scope、选择/配额、巩固
├── store.js      JSONL/统计/关联快照/迁移
└── README.md
scripts/memory-demo.mjs         记忆库 CLI（迁移/种子/query/hubs/think）
scripts/group-chain-demo.mjs    完整链路 demo
test/host/memory.test.js        7 个记忆模块测试
```

## 8.2 测试覆盖

```text
迁移：字段映射、昵称→QQ、cues 生成
种子：character/group/user、幂等
回忆：hub 命中、scope 隔离、激活 > 0
写入：新建、causedBy 边、相似度去重合并
巩固：共激活边权重增长
持久化：flush 后重载一致
工具解析：toolcall JSON + Anthropic XML（新增 1 条）
```

`npm test`：实现时 341 pass / 0 fail；architecture ok（175 files / 328 imports）。
当前 `dshbot-mac` 基线为 333 tests。

---

# 九、测试中发现并修复的问题

1. **participants 存昵称**：旧 `memory.jsonl` 的 participants 实际是昵称，导致按用户激活/用户 scope 失效。迁移时用 profiles 反查 QQ，新写入强制 QQ。
2. **cue 名额挤掉长摘要关键词**：identity 一条长记忆吃掉所有 cue；拆成关键词簇记忆，并加"字面兜底"。
3. **单 cue 命中被稀释**：得分归一从 `sqrt(总 cue 数)` 改为 `sqrt(命中 cue 数)`。
4. **空召回**：hub 有匹配但没记忆过阈值时回退到最近记忆（标注 fallback）。
5. **重复测试被冷却拦截**：demo 支持 `--no-cooldown`；链路 demo 默认关闭冷却。
6. **工具调用解析**：模型输出 Anthropic `<tool_use>` XML，旧解析器只认 `<toolcall>`/JSON。已扩展解析器并在 compose prompt 明确 JSON 格式；**运行中的 DSH 仍旧代码，需重启生效**。
7. **回忆注入 material**：临时方案会让 analyze 偶发误判（mention 却沉默）；正式接入应改为 `memoryBlock` 参数。

---

# 十、与旧机制对比

| 维度 | 旧机制 | 新 demo |
| --- | --- | --- |
| 注入内容 | 最近 50 条跨群 | 当前群/角色/user 检索结果 + 路径 |
| 容量 | 50 条（截断） | 2000 条 / 每群 500 |
| 关联 | 无 | cue 无向图 + 因果/生命周期有向边 |
| 检索 | 无 | hub 定位 + 扩散激活 + 字面兜底 |
| 回忆副作用 | 无 | 每次回忆加强选中路径 |
| 生命周期 | 无 supersedes | 有（迁移兼容） |
| 可解释性 | 无 | hubs / via / 激活值 |
| 跨群 | 全量拼接 | 仅 character scope 跨群 |

---

# 十一、风险与待决事项

1. **回声室**：常被回忆的记忆更容易被召回；已有饱和更新/衰减/冷却，仍需观察。
2. **hub 支配**：高 degree cue 可能吸走激活；已有 fanout/配额，需评测。
3. **因果幻觉**：模型声明 `causedBy` 可能错误；需要 allowlist、方向/环校验、confidence 门控、人工修正。
4. **词面检索**：同义/改写会漏；字面兜底只缓解，不做 embedding。
5. **数据稀疏**：目前 189 条、3.4 小时迁移数据；召回质量受数据量限制。
6. **不可复现**：回忆会改权重；需要 snapshot/restore 与只读 `update:false` 供评测。
7. **持久化写入频率**：目前 flush 全量重写；正式版需防抖 + stats 分离 + 压实。
8. **多实例/并发**：当前单进程内存图；多群并发写需串行队列。
9. **限额淘汰**：当前只在超限时按保留分删除，尚未实现边清理与孤儿 cue 回收。
10. **DSH 重启**：工具解析/prompt 修复需重启运行中的 DSH；记忆模块尚未被 bot 加载。

---

# 十二、下一步路线图

> 2026-11-06 决定暂停该方向；以下路线图保留为后续若重启该模块时的参考。

```text
Phase 1（正式接入）
  - group-loop 初始化 MemoryService
  - analyze/compose 增加 memoryBlock 参数，替换旧 memoryContext
  - state-update → memory.add()（含 causedBy）
  - 新增 /qqbot/group/simulate 路由，面板可触发
  - 重启 DSH 后跑：沉默 / 普通接话 / @ / 引用 / 戳一戳 / 工具 6 类用例

Phase 2（质量）
  - 面板：记忆列表/搜索/删除、回忆路径
  - 反思任务：生成 reflection + derivedFrom
  - 遗忘/压实：懒衰减、边清理、孤儿 cue
  - 评测：replay + 快照对比，调 hub/阈值/配额

Phase 3（可选学习）
  - 记录 recall 反馈（是否注入、是否发言、用户反应）
  - 离线训练轻量 reranker，插件只加载权重
  - 不做端到端 Engram 训练（模型训练不在插件范围内）
```

---

# 十三、附录

## 13.1 常用命令

```bash
# 记忆库统计（首次会迁移旧记忆）
node scripts/memory-demo.mjs --stats

# 种子（幂等）
node scripts/memory-demo.mjs --seed --stats

# 只测回忆
node scripts/memory-demo.mjs --query "跑团 DM 开团" --group 725042903

# 模拟发言 → think → recall
node scripts/memory-demo.mjs \
  --message "叱咤乾坤又在群里催我当 DM" \
  --think "他还在催开团，回忆被催开团、自嘲画海报的经历" \
  --hubs "跑团,开团,叱咤,海报" --group 725042903 --no-cooldown

# 完整链路（真实模型 + 决策 + 行为 + 模拟发送）
node scripts/group-chain-demo.mjs \
  --message "叱咤乾坤又在群里催我当 DM，说这次再不来就让我画十张海报" \
  --group 725042903 --qq 10001 --nickname 叱咤乾坤 --trigger mention
```

## 13.2 默认参数

```text
memoryHubCount          3
memoryMinActivation     0.15
memoryOutputLimit       5
memoryPerHubQuota       2
memoryDedupeSimilarity  0.8
memoryMaxRecords        2000
memoryPerGroupMax       500
memoryHebbianEta        0.05
memoryEdgeMax           10
memoryHalfLifeDays      30
memoryCooldownMs        300000
memoryCausalHops        2
memoryIterations        3
```

## 13.3 数据与代码位置

- 运行数据：`~/project/qq-bot/data/state/memory/`（已删除）
- 旧数据：`~/project/qq-bot/data/state/group-loop/memory.jsonl`（未改动）
- 分支：`feat/memory-network-demo` @ `1b1ef48`（已删除，代码未保留）
- 测试：`test/host/memory.test.js`（已删除）；`test/host/tools.test.js` 的工具解析改动随分支一并移除
- 本文档：`docs/design/memory-network-report.md`（保留）
