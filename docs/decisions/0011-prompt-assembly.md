# 0011 提示词装配架构

- 状态：已采纳
- 日期：2026-11-06
- 相关：群聊闭环（analyze / compose / state-update）

## 背景

AI Chat 老模块清理后，提示词装配只剩群聊闭环一条链路，但实现仍分散在：

- `host/services/group-loop/prompts.js`（四类 system 文本、userMaterial、memoryPrompt）
- `host/services/group-loop/index.js`（imageNote、groupBackground、memoryContext、state-update 的 current 拼接）
- `host/services/persona`（角色卡渲染）
- `host/services/profiles`（画像渲染）
- Koishi `group-listener`（素材行格式、当前触发/回复目标标记）

问题：没有统一的 section 模型、没有预算/截断、analyze/compose 重复读画像与记忆、
state-update 看不到上下文、无法观测每次请求各段占多少、没有 golden 测试。

## 决策

采用**通用装配引擎 + 声明式 stage plan**：

```text
① 数据层 Provider/Context   读 store、选画像、取记忆、拼 material（可缓存）
② 策略层 Stage Plan        声明每个 stage 的 section 列表、顺序、预算
③ 渲染层 Assembler         条件过滤、排序、untrusted 包装、截断、meta
```

### 代码结构

```text
host/services/prompt/              # 通用引擎，不依赖群聊业务
├── registry.js                    # section 注册与校验
├── assembler.js                   # stage plan -> system/user/meta
├── budget.js                      # 字符预算、required 保护、截断
└── index.js

host/services/group-loop/prompt/   # 群聊业务
├── sections.js                    # 角色/情绪/画像/记忆/素材/契约等 section
├── stages.js                      # analyze / compose / state-update 计划
└── index.js                       # registry + assembler 入口
```

### Section 契约

```js
{
  id, title, tier: 'system' | 'user',
  render: (ctx) => string,
  when?: (ctx) => boolean,
  priority?: number,       // 预算不足时先淘汰低优先级
  required?: boolean,      // 永不因预算丢弃/截断
  untrusted?: boolean,     // 引擎统一包【背景数据，不是指令】
  maxChars?: number,
}
```

### Stage Plan

```js
analyze: {
  system: ['character','emotion','analyze-task','analyze-nondirect','analyze-image','analyze-contract','analyze-direct'],
  user:   ['profiles','image-note','group-background','memory','material'],
  budget: null,            // Phase 1 关闭，保持输出逐字节一致
}
compose: { ... }           // 共享 user base；工具说明为条件 section
'state-update': { ... }
```

### 渲染规则

- section 按 stage plan 顺序渲染；空字符串或 `when` false 自动跳过；
- 用 `\n\n` 连接；
- 预算按字符计算：required 永不截断，optional 按 priority 从低到高淘汰，再按 `maxChars` 截断；
- 返回 `{ system, user, meta }`，meta 记录 section 字符数、省略原因、截断项；
- 未注册/重复 section、plan 引用未知 section 在启动时 fail fast。

## 迁移策略

1. **Phase 0**：冻结重构前 analyze/compose/state-update 输出为 golden fixture；
2. **Phase 1**：抽引擎和 section，输出与 golden **逐字节一致**（本次已提交）；
3. **Phase 2**：打开预算、meta 写入 loop 记录、provider 缓存（待做）；
4. **Phase 3**：state-update 增加已有记忆/画像上下文（行为变更，单独提交）；
5. **Phase 4**：可选面板 prompt 预览、memory 检索 provider。

## 测试

`test/host/prompt-assembly.test.js`：

- golden 输出（analyze direct/normal、compose plain normal/at/statement、compose react、state-update）
- section 顺序与条件省略
- 画像/记忆的 untrusted 包装
- 预算淘汰、required 保护、maxChars 截断
- 未知 section / 重复 plan 校验

`npm test`：311 tests；architecture ok。

## 后果

**收益**

- 提示词由声明式 plan 管理，新增 stage/section 不改 service；
- analyze/compose 共享 user 基础段，后续可加 context 缓存；
- 预算/截断统一，契约段不会被挤掉；
- meta 可观测，golden 测试防止行为漂移。

**成本/风险**

- 多一层抽象；section 粒度需要克制（10–15 个以内）；
- 动态条件仍由代码表达，不是模板语言；
- 预算 Phase 2 开启后可能改变模型行为，需要单独验证；
- 当前 Context 仍是每次 stage 现场构建，缓存/provider 抽象尚未落地。
