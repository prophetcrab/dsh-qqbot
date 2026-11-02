# 文件架构与边界规范

> 目标：每个文件只有一个职责；每个依赖方向可解释；每个能力可插拔。
> 本文是 `01-plan.md` 的文件级落地规范。

## 1. 成功标准

重构完成后必须满足：

```text
[ ] index.js 只做组装，不含业务逻辑
[ ] 没有源文件超过 500 行（生成物除外）
[ ] 没有跨层 import
[ ] 没有循环依赖
[ ] 没有跨插件 deep import
[ ] client 源码模块化，产物仍是单 client.js
[ ] template / runtime bundle 是生成物
[ ] 新增能力只新增文件，不改核心入口
[ ] 旧 testid / HTTP 路由 / 数据格式保持兼容
```

## 2. DSH 插件目标树

```text
dsh-qqbot/
├── index.js                      # <=80 行：kernel + 内置插件列表
├── package.json
├── cordis.patch.yml
├── host/
│   ├── kernel/
│   │   ├── index.js              # Kernel 类
│   │   ├── registry.js           # 插件注册/拓扑排序
│   │   ├── contributions.js      # routes/tools/features/status/tabs
│   │   └── manifest.js           # manifest 校验
│   ├── contracts/
│   │   ├── ai-chat.schema.json
│   │   ├── status.schema.json
│   │   ├── panel.schema.json
│   │   └── config.schema.json
│   ├── platform/
│   │   └── mac/
│   │       ├── index.js
│   │       ├── paths.js
│   │       ├── process.js
│   │       └── capabilities.js
│   ├── services/
│   │   ├── napcat/
│   │   │   ├── index.js          # 对外 service
│   │   │   ├── offline.js
│   │   │   ├── lifecycle.js
│   │   │   ├── onebot-config.js
│   │   │   └── webui.js
│   │   ├── koishi/
│   │   │   ├── index.js
│   │   │   ├── project.js
│   │   │   ├── process.js
│   │   │   └── health.js
│   │   ├── setup/
│   │   │   ├── index.js
│   │   │   ├── template.js
│   │   │   └── offline-bundle.js
│   │   ├── ai/
│   │   │   ├── index.js
│   │   │   ├── llm.js
│   │   │   ├── prompt.js
│   │   │   ├── self-check.js
│   │   │   └── retry.js
│   │   ├── persona/
│   │   │   ├── index.js
│   │   │   └── presets.js
│   │   ├── profiles/
│   │   │   └── index.js
│   │   └── access/
│   │       └── index.js
│   └── plugins/
│       ├── lifecycle/
│       │   ├── index.js
│       │   └── routes.js
│       ├── napcat/
│       │   ├── index.js
│       │   ├── routes.js
│       │   └── tools.js
│       ├── koishi/
│       │   ├── index.js
│       │   └── routes.js
│       ├── install/
│       │   ├── index.js
│       │   └── routes.js
│       ├── ai/
│       │   ├── index.js
│       │   └── routes.js
│       ├── persona/
│       │   ├── index.js
│       │   └── routes.js
│       ├── access/
│       │   ├── index.js
│       │   └── routes.js
│       ├── messages/
│       │   ├── index.js
│       │   └── routes.js
│       ├── features/
│       │   └── index.js
│       └── tools/
│           └── index.js
├── client/
│   ├── index.js                  # <=80 行：注册插件
│   ├── runtime/
│   │   ├── api.js
│   │   ├── store.js
│   │   ├── styles.js
│   │   └── locale.js
│   ├── components/
│   │   ├── Card.js
│   │   ├── Field.js
│   │   ├── Toggle.js
│   │   └── StatusBadge.js
│   └── plugins/
│       ├── overview/
│       │   ├── index.js
│       │   └── OverviewTab.js
│       ├── ai/
│       │   ├── index.js
│       │   ├── AiTab.js
│       │   ├── PersonaCard.js
│       │   ├── PromptCard.js
│       │   └── ProfilesCard.js
│       ├── messages/
│       │   ├── index.js
│       │   └── MessagesTab.js
│       ├── access/
│       │   ├── index.js
│       │   └── AccessTab.js
│       ├── plugins/
│       │   ├── index.js
│       │   └── PluginsTab.js
│       ├── features/
│       │   ├── index.js
│       │   └── FeaturesTab.js
│       └── logs/
│           ├── index.js
│           └── LogsTab.js
├── scripts/
│   ├── build-client.mjs          # client/ -> client.js
│   ├── check-architecture.mjs    # 边界/循环/行数
│   ├── sync-template.mjs
│   ├── bundle-runtime.mjs
│   ├── verify-offline.mjs
│   ├── install-profile.mjs
│   ├── smoke-host.mjs
│   └── smoke-client.mjs
├── template/                     # 生成物，由 qq-bot 同步
├── vendor/napcat/                # 离线 payload
├── test/
│   ├── contract/
│   ├── host/
│   ├── client/
│   └── integration/
└── docs/
```

## 3. DSH 插件文件夹规范

每个 `host/plugins/<name>/` 固定结构：

```text
<name>/
├── index.js       # manifest + apply，<=80 行
├── routes.js      # 只负责 HTTP 输入/输出，可选
├── tools.js       # 只负责 Agent 工具，可选
├── feature.js     # 只负责 Feature 卡片，可选
├── schema.js      # 配置 schema，可选
└── README.md      # 插件边界说明，可选
```

`index.js` 只允许：

```js
export const name
export const inject
export const provides
export const Config
export async function apply(ctx, config) {
  // 组装 service + 注册 contribution
}
```

禁止在 `index.js` 中写：

- 大段业务逻辑
- 文件路径解析
- HTTP 请求细节
- 进程操作
- prompt 拼接
- 页面 UI

## 4. Koishi 目标树

```text
qq-bot/
├── plugins/
│   ├── core/
│   │   ├── index.ts
│   │   ├── service.ts
│   │   └── stats.ts
│   ├── access-control/
│   │   ├── index.ts
│   │   ├── policy.ts
│   │   └── middleware.ts
│   ├── health/
│   │   ├── index.ts
│   │   ├── messages.ts
│   │   ├── contacts.ts
│   │   └── routes.ts
│   ├── ai/
│   │   ├── index.ts              # 编排，<=80 行
│   │   ├── gateway.ts            # DSH HTTP 契约
│   │   ├── trigger.ts            # 概率/@/回复/跟进
│   │   ├── context.ts            # 历史/引用/图片/batch
│   │   ├── delivery.ts           # 发送/静默/错误
│   │   └── config.ts
│   ├── welcome/
│   │   └── index.ts
│   ├── echo/
│   │   └── index.ts
│   └── games/
│       └── README.md             # 后续插件模板
├── presets/
│   └── persona-presets.json
├── data/                         # 运行时数据，不提交
├── tests/
│   ├── ai/
│   ├── access/
│   └── health/
└── koishi.yml
```

每个 Koishi 插件：

```ts
export const name = 'qqbot-ai-trigger'
export const inject = ['qqbotContext']
export const Config = Schema.object({...})

export function apply(ctx: Context, config: Config) {
  ctx.qqbot.trigger = createTrigger(ctx, config)
}
```

规则：

- 插件之间通过 `ctx.qqbot.*` 服务通信
- 禁止 `import '../ai/context'` 这类跨插件 deep import
- 每个插件有独立 `tests/<plugin>/`
- 数据文件由插件自己声明 owner
- 游戏只新增 `plugins/games/<name>`，不修改 ai/core

## 5. 依赖方向

```text
DSH:
contracts
  ↑
platform/mac
  ↑
services/*
  ↑
host/plugins/*
  ↑
host/kernel
  ↑
index.js

Client:
client/runtime
  ↑
client/components
  ↑
client/plugins/*
  ↑
client/index.js
```

硬规则：

```text
index.js                 不得被任何模块 import
host/contracts           不得 import host/*
host/platform            不得 import host/services/*
host/services            不得 import host/plugins/*
host/plugins             不得 import client/*
client/*                 只能通过 HTTP + DTO 与 Host 通信
```

Koishi：

```text
plugins/core
  ↑
plugins/access-control
plugins/health
plugins/ai/{gateway,trigger,context,delivery}
plugins/welcome
plugins/echo
plugins/games/*
```

禁止：

```text
ai/trigger -> ai/context 内部函数
core -> ai
game -> ai 内部文件
```

只允许通过 `ctx.qqbot.*` 服务。

## 6. 旧文件到新结构映射

| 旧文件 | 新位置 |
| --- | --- |
| `index.js` 路由段 | `host/plugins/*/routes.js` |
| `index.js` 工具段 | `host/plugins/tools/` + 各插件 `tools.js` |
| `index.js` bootstrap | `host/plugins/install/` |
| `lib/napcat.js` | `host/services/napcat/` + `host/platform/mac/` |
| `lib/koishi.js` | `host/services/koishi/` |
| `lib/setup.js` | `host/services/setup/` |
| `lib/offline.js` | `host/services/napcat/offline.js` |
| `lib/ai.js` | `host/services/ai/` |
| `lib/persona.js` | `host/services/persona/` |
| `lib/profiles.js` | `host/services/profiles/` |
| `lib/access.js` | `host/services/access/` |
| `lib/messages.js` | `host/plugins/messages/` |
| `lib/contacts.js` | `host/services/napcat/contacts.js` |
| `lib/features/*` | `host/plugins/features/` |
| `client.js` 单文件 | `client/plugins/*` |
| `template/` 手工副本 | 生成物 |

## 7. 自动化校验

新增 `scripts/check-architecture.mjs`，CI/本地都跑：

1. **行数**
   - `index.js` / 插件 entry <= 80
   - 普通源码 <= 500
   - 生成物白名单

2. **import 图**
   - 解析相对 import
   - 禁止跨层
   - 检测循环依赖

3. **平台泄漏**
   - `process.platform`、`win32`、`darwin` 只允许出现在 `host/platform/`

4. **插件 isolation**
   - `host/plugins/a` 不得 import `host/plugins/b`
   - Koishi `plugins/a` 不得 import `plugins/b` 内部文件

5. **contract**
   - 所有 HTTP 请求/响应通过 schema
   - AI 请求带 `apiVersion`

6. **生成物漂移**
   - `template` 与 qq-bot 一致
   - `client.js` 与 `client/` 构建结果一致
   - runtime bundle / offline payload 校验

7. **UI 兼容**
   - testid 列表不允许丢失
   - Host 路由列表不允许意外减少

失败时构建直接失败。

## 8. 生成物策略

### client.js

```text
client/ 源码
   ↓ npm run build:client
client.js 单文件产物
```

- `client/` 提交源码
- `client.js` 作为构建产物提交/打包
- CI 校验重新构建后无差异
- 不手工编辑 `client.js`

### template

```text
qq-bot/ 源码
   ↓ scripts/sync-template.mjs
template/ 生成物
```

- 不手工编辑 `template/`
- CI 校验无漂移
- 发布包带 template

### vendor / runtime-bundles

- `vendor/napcat` 与 `runtime-bundles` 视为二进制资产
- 有 manifest + SHA-256
- 后续可移到 release 资产，但源码阶段保留

## 9. 文件命名规范

```text
host/kernel/index.js
host/platform/mac/paths.js
host/services/napcat/offline.js
host/plugins/napcat/routes.js
client/plugins/ai/AiTab.js
client/components/StatusBadge.js
test/host/napcat.test.js
docs/refactor/02-file-layout.md
```

- 目录：小写、短横线/单词
- 类文件：PascalCase（仅组件/类）
- 函数/服务：kebab/camel 与现有项目一致
- 测试：`<module>.test.js`
- 不出现 `utils.js` 这种无边界文件；`runtime/` 下才允许通用工具

## 10. 迁移方式

按“先骨架、后搬家、最后删旧”的顺序：

```text
1. 新建 kernel / contracts / platform
2. 新插件文件夹逐个接路由
3. 旧 index.js 删除对应段
4. 每步保持 URL/testid 不变
5. 所有旧入口都迁完后删除旧文件
6. 最后跑架构检查
```

禁止：

- 一次性全局重命名
- 同时改行为和结构
- 大文件直接删了重写
- 未加测试就迁移

## 11. 验收

```text
[ ] 目录树与本文一致
[ ] check-architecture 通过
[ ] 无循环依赖
[ ] index.js <= 80 行
[ ] client.js 由 client/ 生成
[ ] 新增 Feature 不改 index.js
[ ] 新增 Koishi 插件不改 ai/core
[ ] 旧路由/testid 全保留
[ ] 测试/冒烟/离线校验全绿
```
