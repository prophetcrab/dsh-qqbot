# dsh-qqbot 重构计划

> 目标分支：`dshbot-mac`
> 目标版本：重构期间保持行为兼容，完成后版本号单独提升
> 本文是执行计划，不代表立即重构所有模块

## 0. 目标与原则

### 用户要求

1. 尽可能解耦模块
2. 三个端侧职责清晰
3. 可扩展性高
4. Koishi 侧和 DSH 侧都遵循 **everything is plugin**

### 本次重构的非目标

- 不新增游戏/炼宝/钓鱼等玩法
- 不改变现有 QQ 机器人行为
- 不重写 AI prompt 的语义
- 不一次性清空现有 `data/`
- 不先拆仓库

### 架构原则

- **单向依赖**：契约 ← 平台 ← 服务 ← 插件 ← 组装入口
- **不跨层 import**：禁止 UI 直接 import 服务，禁止 NapCat 模块 import AI
- **一个值只有一个 owner**
- **每个能力可注册、可发现、可关闭、可替换**
- **没有平台相关代码泄漏到业务层**
- **先行为等价，再优化结构**

## 1. “三个端侧”定义

本文把三端定义为：

| 端 | 运行位置 | 核心职责 | 不负责 |
| --- | --- | --- | --- |
| NapCat 端 | QQ.app + 容器 | QQ 登录、协议、收发消息、OneBot 实现、WebUI | 权限、AI、业务逻辑、面板 |
| Koishi 端 | `~/project/qq-bot` | 消息 Session、权限、触发、上下文、指令/插件、游戏、发送 | QQ 协议、QQ 注入、模型调用、人设存储 |
| DSH 端 | DSH Host + Client | 安装/启停、配置控制面、AI 网关、人设/画像、面板、Agent 工具 | QQ 协议、消息循环、权限执行 |

> Client 是 DSH 端的一部分，不单独算第四端。

### 职责矩阵

| 能力 | NapCat | Koishi | DSH |
| --- | --- | --- | --- |
| QQ 登录/二维码 | ✅ | ❌ | 展示/控制 |
| OneBot 事件/动作 | ✅ | 适配 | ❌ |
| 消息入站/出站 | ✅ | 处理 | 监控 |
| 权限执行 | ❌ | ✅ | 写策略/展示 |
| 触发策略 | ❌ | ✅ | 提供默认值 |
| 上下文/引用/图片 | ❌ | ✅ | 消费 |
| AI 调用 | ❌ | 发起 HTTP | ✅ |
| 人设/画像/预设 | ❌ | ❌ | ✅ |
| 自检/提示词 | ❌ | ❌ | ✅ |
| 安装/启停 | ❌ | ❌ | ✅ |
| 游戏/业务插件 | ❌ | ✅ | 管理/面板 |

## 2. 目标目录

### DSH 插件

```text
dsh-qqbot/
├── index.js                  # 只做 kernel + 内置插件列表
├── host/
│   ├── kernel.js             # 插件注册、路由/工具/Feature/Client 贡献点
│   ├── contracts/            # 请求/响应/状态 schema
│   ├── platform/mac/         # 平台能力
│   ├── services/
│   │   ├── napcat.js
│   │   ├── koishi.js
│   │   ├── setup.js
│   │   ├── ai.js
│   │   ├── persona.js
│   │   └── profiles.js
│   └── plugins/
│       ├── lifecycle/
│       ├── napcat/
│       ├── koishi/
│       ├── install/
│       ├── ai/
│       ├── persona/
│       ├── access/
│       ├── messages/
│       ├── features/
│       └── tools/
├── client/
│   ├── index.js
│   ├── state.js
│   ├── components/
│   └── plugins/
│       ├── overview/
│       ├── ai/
│       ├── messages/
│       ├── access/
│       ├── plugins/
│       ├── features/
│       └── logs/
├── template/                 # 生成物
├── vendor/                   # 或 release 资产
└── test/
```

### Koishi 插件

```text
qq-bot/plugins/
├── core/                     # 仅内核服务：ctx.qqbot
├── access-control/
├── health/
├── ai/
│   ├── gateway/              # 调 DSH /qqbot/ai/chat
│   ├── trigger/              # 概率、@、回复、跟进
│   ├── context/              # 历史、引用、图片、batch
│   ├── delivery/             # 发送、静默、错误策略
│   └── index.ts              # 编排
├── welcome/
├── echo/
└── games/                    # 后续，不混入 ai
```

## 3. Everything is plugin

### DSH 端插件模型

每个内置能力都是一个 Cordis 插件模块：

```js
export const name = 'qqbot-napcat'
export const inject = ['webServer', 'qqbotKernel']
export const provides = ['napcat']
export const Config = Schema.object({ ... })

export async function apply(ctx, config) {
  const service = new NapcatService(config, ctx)
  ctx.qqbotKernel.provide('napcat', service)
  ctx.qqbotKernel.registerRoutes('napcat', ...)
  ctx.qqbotKernel.registerTools(...)
  ctx.qqbotKernel.registerFeature(...)
}
```

要求：

- 插件有唯一 `id`、`version`、`inject`、`provides`、`Config`
- 插件只能通过 `ctx.qqbotKernel` 暴露的贡献点注册能力
- 关闭插件后，对应路由、工具、Feature、Client Tab 一起消失
- `index.js` 不包含业务，只列出内置插件

推荐贡献点：

```text
registerRoute(route)
registerTool(tool)
registerFeature(feature)
registerStatusProvider(provider)
registerClientTab(tab)
provide(serviceName, instance)
```

### Koishi 端插件模型

每个 Koishi 插件：

- 有 `name` / `Config` / `apply`
- 通过 `inject` 声明依赖
- 通过 `ctx.qqbot` 暴露服务
- 不直接 import 其他插件的内部实现

推荐服务：

```text
ctx.qqbot.ai        # 发请求给 DSH
ctx.qqbot.context   # 历史/引用/图片
ctx.qqbot.trigger   # 策略判断
ctx.qqbot.delivery  # 发送与错误处理
ctx.qqbot.health    # 监控
ctx.qqbot.access    # 权限
```

插件之间通过服务通信，不通过相对路径互相 import。

## 4. 契约

第一阶段先定义：

```text
contracts/
├── ai-chat.schema.json
├── status.schema.json
├── panel.schema.json
├── config.schema.json
└── plugin-manifest.schema.json
```

### AI 契约

```json
{
  "apiVersion": 1,
  "messages": [],
  "background": "",
  "images": [],
  "backgroundImages": [],
  "quotedImages": [],
  "quote": {},
  "mentionSelf": false,
  "mentionOthers": [],
  "mentionAll": false,
  "replyToBot": false,
  "groupId": "",
  "userId": "",
  "userName": ""
}
```

响应：

```json
{ "ok": true, "reply": "", "provider": "", "model": "" }
{ "ok": true, "skipped": true, "reason": "" }
{ "ok": false, "code": "BUSY", "retryable": true }
```

- 请求/响应在 DSH HTTP 层校验
- Koishi 只依赖契约，不依赖 DSH 内部字段
- 增加 `apiVersion`，未来可兼容旧版

### 状态契约

`/qqbot/status` 固定 shape：platform / napcat / koishi / bot / ai / persona / features。Client 只消费 DTO。

## 5. 配置与数据归属

### 配置分层

```text
DSH Host 配置（cordis.patch.yml）
  安装路径、端口、离线路径、生命周期开关

Koishi 配置（koishi.yml）
  插件树、adapter-onebot、插件实例配置

Koishi 插件配置（data/config/<plugin>.json）
  每个插件自己的运行时参数

DSH 领域数据（data/ai/）
  人设、预设、画像、AI 设置
```

### 单一 owner

| 配置 | Owner | 谁写 |
| --- | --- | --- |
| 端口/路径/离线包 | DSH Host | Host API |
| Koishi 插件树 | Koishi Loader | DSH 插件管理 API |
| 权限策略 | Koishi access-control | DSH 写文件，Koishi 执行 |
| AI 触发/批量 | Koishi ai-trigger | DSH 面板编辑 |
| 模型/人设/画像 | DSH | DSH API |
| NapCat OneBot 配置 | NapCat | DSH configure |
| 游戏状态 | 对应 Koishi 游戏插件 | 插件自己 |

### 数据目录目标

```text
qq-bot/data/
├── config/
│   ├── access.json
│   ├── ai-trigger.json
│   └── plugins/
├── state/
│   ├── ai-chat.json
│   └── games/
├── assets/
│   ├── persona-presets.json
│   └── profiles.json
└── logs/
```

兼容期读取旧路径，迁移完成后删除兼容代码。

## 6. 依赖规则

### DSH

```text
index.js
  └── host/kernel
        ├── host/plugins/*
        │     ├── host/services/*
        │     └── host/contracts
        └── host/platform/mac
```

- `host/platform` 不得 import `host/services`
- `host/services` 不得 import `host/plugins`
- `host/plugins` 不得 import `client`
- `client` 只能通过 HTTP DTO 与 Host 通信
- `index.js` 只做组装

### Koishi

```text
plugins/ai/index
  ├── gateway
  ├── trigger
  ├── context
  └── delivery
```

- `gateway` 只懂 HTTP 契约
- `trigger` 只懂消息与策略
- `context` 只懂历史/图片/引用
- `delivery` 只懂发送
- 谁都不 import 彼此的 `index.ts` 内部函数

## 7. 可扩展性设计

### DSH 扩展点

- 第三方 DSH 插件可注册 Feature、路由、工具栏、状态 provider
- 面板 Tab 由 Client 插件贡献，不再改 `client.js`
- 插件 manifest 声明 `provides` / `inject` / `configSchema`
- 功能可开关；关闭后不加载对应路由/工具

### Koishi 扩展点

- 新增业务 = 新插件目录
- 新游戏 = `plugins/games/<name>`，不修改 ai-chat
- 新 AI 能力 = 在 `plugins/ai` 增加子服务，不复制 HTTP 逻辑
- 每个插件可单独测试、单独禁用

### 验收：加一个示例功能

重构完成后做两个验收：

1. 新增一个“状态卡片 + 按钮 + API + Agent 工具”的 DSH Feature，只新增文件，不改 `index.js`
2. 新增一个 Koishi 骰子插件，只新增 `plugins/dice`，不改 `ai` 或 `core`

如果做不到，说明插件边界还不成立。

## 8. 迁移阶段

### 阶段 0：冻结与基线

- 冻结新功能
- 保存当前测试基线（131 单元测试、Host/Client 冒烟、离线校验）
- 建立 ADR 和本计划
- 记录当前数据/配置样本

验收：基线全绿，文档可执行。

### 阶段 1：契约与 Kernel

- 新建 `host/contracts`、`host/kernel`
- 实现插件注册器、贡献点、manifest 校验
- 保持现有 route/tool 行为不变
- 加 contract 测试

验收：旧测试全绿；Kernel 能加载一个最小插件。

### 阶段 2：拆 Host 路由与服务

- `index.js` 只保留 composition
- 路由拆到 `host/plugins/*`
- 服务拆到 `host/services/*`
- 状态快照改为 provider 聚合
- 保留旧 URL

验收：40 条路由逐条对比；Host smoke 全绿。

### 阶段 3：拆 Client

- `client/` 按 Tab/组件拆分
- Client 插件注册 Tab
- 构建仍输出单 `client.js`
- 视觉与交互不变

验收：Client smoke、截图对比、所有 testid 不变。

### 阶段 4：Koishi 插件边界

- `core` 只保留服务
- `ai` 拆 gateway/trigger/context/delivery
- 配置迁移到 `data/config`
- 权限/健康保持独立插件
- 游戏目录预留

验收：qq-bot 测试全绿；AI 触发、批量、引用/图片行为不变。

### 阶段 5：生成物与发布

- `template` 由 qq-bot 生成
- runtime bundle 由脚本生成
- CI 校验 template 不漂移
- release 资产打包
- 离线资产策略确认

验收：干净环境一键安装；不联网可启动。

### 阶段 6：扩展验收与清理

- 两个扩展验收示例
- 删除兼容 shim
- 清理旧文档/脚本
- 版本发布

验收：全部测试 + 实机系统测试通过。

## 9. 测试策略

| 层级 | 内容 |
| --- | --- |
| 单元 | 每个 service/plugin 纯逻辑 |
| 契约 | schema 校验、旧响应兼容 |
| Host | 40 条路由 + tools + features |
| Client | testid、交互、错误态 |
| Koishi | 假 OneBot、AI 触发、权限、引用/图片 |
| E2E | 真实 NapCat/Koishi、扫码、收发、AI |
| 离线 | 干净目录、无网络安装、bundle 校验 |

每个阶段必须保持：

```text
npm test
npm run smoke:host
npm run smoke:client
npm run offline:verify
```

### 阶段 4 额外

```text
qq-bot: npm test
```

## 10. 风险

| 风险 | 缓解 |
| --- | --- |
| 行为漂移 | 先契约/测试，后重构；保留旧入口 |
| 数据损坏 | 迁移前备份，双读兼容 |
| 插件加载顺序 | manifest 依赖 + 拓扑加载 |
| Client 重构破坏 UI | 保持 testid，截图对比 |
| 两仓库漂移 | template 生成 + CI diff |
| 离线资产过大 | 后续移到 release 资产 |
| 版本兼容 | apiVersion + 旧字段兼容 |

## 11. 需要确认的决策

1. DSH 内置插件是**单包内部插件**，还是拆成多个 npm 包？
   - 建议：先单包内部插件，稳定后再考虑拆包。
2. Koishi AI 是否按 gateway/trigger/context/delivery 四插件拆？
   - 建议：按此拆，但保留一个 `ai-chat` 编排入口。
3. 现有 `data/` 是否必须无感迁移？
   - 建议：必须兼容，先双读，后清理。
4. Client 构建是否保持单 bundle？
   - 建议：源码拆模块，产物仍是单 `client.js`。
5. 两个仓库是否继续保留？
   - 建议：重构期保留，`template` 改为生成物；之后再决定 monorepo。
6. 离线资产是否继续提交源码？
   - 建议：源码阶段保留，发布阶段改为 release 资产/可选下载。

## 12. 完成定义

```text
[ ] 三端职责矩阵冻结
[ ] DSH kernel + 插件注册器可用
[ ] 40 条路由全部由插件注册
[ ] Client Tab 全部由插件注册
[ ] Koishi AI 拆分为 gateway/trigger/context/delivery
[ ] 配置只有一个 owner
[ ] template/bundle 生成且 CI 防漂移
[ ] 新增 Feature 不改 index.js
[ ] 新增 Koishi 插件不改 ai/core
[ ] 全部测试、冒烟、实机系统测试通过
```
