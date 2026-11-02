# dsh-qqbot

DeepSeek Harness 的 **macOS-only** QQ 机器人控制中心。

当前分支：`refactor/v2`。项目已按 plugin-based 架构重写：

```text
QQ ↔ NapCat ↔ OneBot 11 ↔ Koishi ↔ DSH Host ↔ 面板 / LLM
```

## 三端职责

| 端 | 职责 | 不负责 |
| --- | --- | --- |
| NapCat | QQ 登录、协议、收发消息、OneBot 实现、WebUI | 权限、AI、业务、面板 |
| Koishi | Session、权限、触发、上下文、指令/插件、发送 | QQ 协议、QQ 注入、模型调用 |
| DSH | 安装/启停、配置控制面、AI 网关、人设/画像、面板 | QQ 协议、消息循环、权限执行 |

`dsh-qqbot` 属于 DSH 端；NapCat/Koishi 是外部运行时，由 DSH 管理。

## 架构

```text
dsh-qqbot/
├── index.js                 # 仅组装
├── host/
│   ├── kernel/              # 插件注册、贡献点、路由/工具/Feature/Tab
│   ├── contracts/           # AI/status/config/panel/plugin-manifest schema
│   ├── platform/mac/        # 路径、进程、端口、能力
│   ├── services/            # napcat / koishi / setup / ai / persona / profiles / access
│   └── plugins/             # lifecycle / napcat / koishi / install / ai / persona /
│                            # access / messages / features / tools
├── client/
│   ├── index.js             # 仅注册 Client 插件
│   ├── runtime/             # api / store / styles / locale
│   ├── components/
│   └── plugins/             # overview / ai / messages / access / plugins / features / logs
├── template/                # Koishi 运行时模板（从 qq-bot 同步）
├── vendor/napcat/           # NapCat 离线 payload
└── scripts/                 # 构建、校验、冒烟、安装
```

### DSH Host 插件模型

每个能力是一个 host plugin，统一贡献：

```text
registerRoute
registerTool
registerFeature
registerStatusProvider
registerClientTab
provide(service)
```

`index.js` 只列内置插件；关闭一个插件，它的路由/工具/Feature/Tab 一起消失。

### Client 插件模型

`client.js` 是构建产物，源码在 `client/`：

```bash
npm run build:client            # client/ -> client.js
node scripts/build-client.mjs --check
```

每个 Tab 是一个 Client 插件，不再改一个 4000 行单文件。

### Koishi 插件模型

`template/plugins/` 是 Koishi 侧源码：

```text
core / access-control / health / welcome / echo
ai/
├── gateway.ts     # DSH HTTP 契约
├── trigger.ts     # 概率/@/回复/跟进
├── context.ts     # 背景/图片
├── media.ts
├── message.ts
├── delivery.ts
├── config.ts
└── index.ts       # 编排
```

插件之间通过 `ctx.qqbot.*` 服务通信，不 deep import 内部实现。

## 两个外部依赖

### NapCat（macOS）

| 项 | 值 |
| --- | --- |
| QQ.app | `/Applications/QQ.app` |
| QQ 容器 | `~/Library/Containers/com.tencent.qq/Data` |
| NapCat 目录 | `.../Documents/napcat` |
| 配置目录 | `.../Library/Application Support/QQ/NapCat/config` 或 `.../Documents/napcat/config` |
| WebUI | `127.0.0.1:6099` |
| 反向 WS | `ws://127.0.0.1:5140/onebot` |
| 离线包 | `vendor/napcat/payload/NapCat.Shell-4.18.42.zip` |

配置：

```text
napcatPort           6099
napcatToken          空
qqPath               空
napcatDir            空
offlineVendorDir     空
offlineNapcatVersion 空
```

NapCat **只从内置离线包安装**，校验 size + SHA-256，不下载。

### Koishi

| 项 | 值 |
| --- | --- |
| 版本 | 4.18.11 |
| 项目 | `~/project/qq-bot` |
| 端口 | 5140 |
| 反向 WS | `/onebot` |
| 本地 CLI | `node_modules/koishi/bin.js` |
| 离线依赖 | `template/runtime-bundles/node_modules-darwin-arm64.tar.gz` |

配置：

```text
projectDir         ~/project/qq-bot
koishiPort         5140
reversePath        /onebot
napcatToken        空
autoRestartKoishi  true
autoInstallDeps    true
autoSyncSelfId     true
logLines           200
```

## 安装

```bash
cd ~/project/dsh-qqbot
node scripts/install-profile.mjs --profile desktop --install
```

首次加载会：

1. 从 `template/` 创建 `~/project/qq-bot`
2. 解压内置 Koishi `darwin-arm64` 依赖
3. 从 `vendor/napcat` 离线安装 NapCat
4. 写 OneBot 反向 WS 配置
5. 启动后扫码登录

## 运行时数据

```text
~/project/qq-bot/data/
├── access.json
├── ai-settings.json
├── ai-chat-state.json
├── ai.json
├── persona.json
├── persona-presets.json
├── profiles.json
├── koishi.db
└── logs/
```

DSH 写配置/人设/画像；Koishi 执行权限、触发和发送。

## 开发

```bash
npm test                 # 183 tests
npm run build:client
npm run smoke:host       # 41 routes / 6 tools / 5 features
npm run smoke:client
npm run check:architecture
npm run offline:verify
npm run check            # 全部
```

架构规则：

- `index.js` / 插件入口 ≤80 行
- 普通源码 ≤500 行
- 无跨层/跨插件 deep import
- 无循环依赖
- `process.platform` 仅限 `host/platform/`
- client 源码与生成物同步
- 旧路由、testid、数据格式保持兼容

详细文档：

- [模块盘点](docs/refactor/00-module-inventory.md)
- [重构计划](docs/refactor/01-plan.md)
- [文件架构](docs/refactor/02-file-layout.md)

## 安全

- NapCat token 不落日志、不返回明文
- 外部命令使用 argv 数组，不拼 shell
- 离线包 size/SHA-256 校验失败即拒绝
- 权限策略由 Koishi `access-control` 执行
- 当前分支只支持 macOS / Apple Silicon
