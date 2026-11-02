# dshbot-mac 重构前盘点

> 分支：`dshbot-mac` · 版本：`0.3.0-mac.1`
> 本文只记录现状和目标边界，不包含代码改动。

## 1. 仓库与构建产物

| 路径 | 内容 | 归属 |
| --- | --- | --- |
| `index.js` | DSH Host 插件入口、HTTP 路由、Agent 工具、Feature 注册、自动 bootstrap | Host |
| `client.js` | 浏览器面板：概览 / AI / 消息 / 权限 / 插件 / 功能 / 日志 | Client |
| `lib/` | Host 服务与纯函数 | Host |
| `lib/features/` | 内置 Feature：overview / lifecycle / configuration / access / koishi-plugins | Host |
| `template/` | 创建 `qq-bot` 运行时项目用的 Koishi 模板 | 生成物 |
| `template/plugins/` | qq-bot 本地 Koishi 插件（AI、health、权限、core、echo、welcome） | 运行时 |
| `vendor/napcat/` | NapCat 4.18.42 离线 payload + manifest | Host 资源 |
| `template/runtime-bundles/` | Koishi 4.18.11 `darwin-arm64` 离线依赖 | 运行时资源 |
| `scripts/` | 安装 profile、打 bundle、校验离线包、Host/Client 冒烟 | 开发工具 |
| `test/` | Host 单元测试和冒烟 | 质量 |

当前包体积约 47 MB（NapCat 36 MB + Koishi bundle 14 MB）。

## 2. Host 模块分布

| 模块 | 行数 | 当前职责 | 问题 |
| --- | ---: | --- | --- |
| `index.js` | 916 | 插件生命周期、40 条路由、6 个 Agent 工具、5 个 Feature、自动安装、状态聚合 | 入口过重，路由/服务/工具混在一起 |
| `client.js` | 3864 | 所有 Tab、样式、文案、表单、状态、API 调用 | 单文件 UI，无法独立维护 |
| `lib/napcat.js` | 1172 | macOS NapCat 检测、离线安装、OneBot 配置、启动/停止、登录/QR、WebUI | 仍然偏大，但平台边界已收窄 |
| `lib/koishi.js` | 850 | Koishi 项目管理、依赖安装、启动/停止、健康检查、日志、进程 | 生命周期与项目检测混合 |
| `lib/koishi-plugins.js` | 802 | `koishi.yml` 解析/文本编辑、插件列表/启停/安装/卸载 | 文本编辑器和业务管理混合 |
| `lib/setup.js` | 347 | 创建运行时项目、解压离线依赖、导入预设、bootstrap | 与 index bootstrap 重叠 |
| `lib/offline.js` | 389 | NapCat offline payload 校验、解压、QQ 容器安装、loader 修补 | 安装步骤集中，可再拆 |
| `lib/platform.js` | 340 | 默认设置、macOS 检测、项目/NapCat 路径、进程/端口 | 设置 schema 与检测混合 |
| `lib/ai.js` | 644 | LLM 调用、persona/profile/prompt、自检、重试、prompt 快照 | 领域服务，边界相对清楚 |
| `lib/ai-settings.js` | 67 | 运行时 AI 设置读写/归一化 | 与 koishi.yml 默认值重复 |
| `lib/persona.js` | 96 | 人设卡读写/格式化 | 清楚 |
| `lib/persona-presets.js` | 92 | 预设卡 CRUD | 清楚 |
| `lib/profiles.js` | 193 | 按群:QQ 画像、合并、队列 | 清楚 |
| `lib/access.js` | 164 | 权限策略默认值/归一化/读写 | 默认策略仍是风险，见 PR |
| `lib/messages.js` | 79 | 消息面板查询 | 清楚 |
| `lib/contacts.js` | 78 | 群/好友列表 | 清楚 |
| `lib/features.js` | 140 | Feature 注册表 | 清楚 |
| `lib/features/*.js` | 30–103 | 面板功能卡片 | 与路由/工具职责部分重复 |

## 3. Client 模块分布

当前 `client.js` 包含：

- 7 个 Tab：概览、AI、消息、权限、插件、功能、日志
- 所有卡片：平台、登录 QR、NapCat/Koishi、AI、人设卡、预设卡、画像、权限、插件、Feature、日志
- 全部样式、中英文 locale、轮询、乐观更新、错误态

目标拆分：

```text
client/
├── index.js          # 注册 sidebar + main
├── state.js          # snapshot/polling/api
├── components/
└── tabs/
    ├── overview.js
    ├── ai.js
    ├── messages.js
    ├── access.js
    ├── plugins.js
    ├── features.js
    └── logs.js
```

构建时仍可输出单文件 `client.js`，但源码按 Tab 分离。

## 4. 两个外部依赖

### 4.1 NapCat（QQ 侧）

职责：QQ 登录、二维码、收发消息、OneBot 11 实现、WebUI、QQ 注入。

| 项 | 当前值 / 路径 |
| --- | --- |
| 已安装版本 | 4.18.41 |
| 内置离线版本 | 4.18.42 |
| QQ.app | `/Applications/QQ.app` |
| QQ 容器 | `~/Library/Containers/com.tencent.qq/Data` |
| NapCat 安装目录 | `.../Documents/napcat` |
| 配置目录 | `.../Library/Application Support/QQ/NapCat/config` 优先，其次 `.../Documents/napcat/config` |
| 二维码缓存 | `<configDir>/../cache/qrcode.png`（面板也缓存到 `data/napcat-login-qr.png`） |
| WebUI | `127.0.0.1:6099` |
| 反向 WS | `ws://127.0.0.1:5140/onebot` |
| 离线包 | `vendor/napcat/payload/NapCat.Shell-4.18.42.zip` |
| 离线校验 | manifest 的 bytes + SHA-256 |

Host 配置项：

| 配置 | 默认 | 说明 |
| --- | --- | --- |
| `napcatPort` | `6099` | NapCat WebUI 端口 |
| `napcatToken` | 空 | Koishi OneBot token |
| `qqPath` | 空 | 覆盖 QQ.app 路径 |
| `napcatDir` | 空 | 覆盖 NapCat 目录 |
| `offlineVendorDir` | 空 | 覆盖内置 vendor 目录 |
| `offlineNapcatVersion` | 空 | 固定离线版本，不匹配则拒绝 |

生命周期：

```text
detect → installOffline → writeOneBotConfig → start(open QQ --no-sandbox)
       → loginStatus / QR → WebUI configure → stop(SIGTERM/SIGKILL)
```

边界原则：

- NapCat 不理解 AI、不直接调用 DSH。
- Host 只通过「进程 + 文件 + WebUI HTTP + OneBot 配置」控制它。
- 安装必须离线；不再存在下载安装器路径。

### 4.2 Koishi（机器人运行时）

职责：OneBot 适配、中间件、权限、消息监控、AI 触发与上下文、Koishi 插件管理。

| 项 | 当前值 / 路径 |
| --- | --- |
| 版本 | 4.18.11 |
| 项目目录 | `~/project/qq-bot` |
| HTTP / WS 端口 | `5140` |
| 反向 WS 路径 | `/onebot` |
| 本地 CLI | `<project>/node_modules/koishi/bin.js` |
| 健康接口 | `http://127.0.0.1:5140/api/qqbot/health` |
| 数据库 | `data/koishi.db` |
| 插件配置 | `koishi.yml` |
| 离线依赖 | `template/runtime-bundles/node_modules-darwin-arm64.tar.gz` |

Host 配置项：

| 配置 | 默认 | 说明 |
| --- | --- | --- |
| `projectDir` | `~/project/qq-bot` | 运行时项目 |
| `koishiPort` | `5140` | Koishi HTTP / 反向 WS |
| `reversePath` | `/onebot` | OneBot 反向 WS 路径 |
| `napcatToken` | 空 | 与 NapCat 一致 |
| `autoRestartKoishi` | `true` | 插件操作后自动重启 |
| `autoInstallDeps` | `true` | 首次自动建项目/依赖 |
| `logLines` | `200` | 日志返回上限 |

生命周期：

```text
ensureProject → extract offline node_modules → installDeps(fallback)
→ start(local koishi/bin.js) → health → stop(SIGTERM/SIGKILL)
→ plugins read/toggle/install/uninstall
```

运行时的配置归属：

| 文件 | 内容 | 谁写 |
| --- | --- | --- |
| `koishi.yml` | 插件树、adapter-onebot、AI 默认值 | Host 插件管理 + 用户 |
| `data/access.json` | 入站/出站权限、quiet | Host 权限 API |
| `data/ai-settings.json` | 概率、跟进、batch、上下文 | Host AI 设置 API，Koishi 热加载 |
| `data/persona.json` | 当前人设卡 | Host persona API |
| `data/persona-presets.json` | 预设卡 | Host preset API |
| `data/profiles.json` | 按 `群:QQ` 长期画像 | Host profile/AI |
| `data/ai-chat-state.json` | 最近入站/回复诊断 | Koishi ai-chat |
| `data/ai.json` | AI 桥 endpoint/provider/model discovery | Host |
| `data/koishi.db` | Koishi SQLite | Koishi |

## 5. 现在的重复与耦合

1. `template/` 是 `qq-bot` 的复制品，靠人工 `rsync` 同步。
2. `index.js` 同时做 composition、routes、tools、bootstrap、status。
3. `client.js` 是单文件 3864 行。
4. AI 设置有三层来源：`koishi.yml` 默认值、`data/ai-settings.json`、Host 状态快照。
5. `features/` 与 HTTP 路由/Agent 工具存在同一动作的多套入口。
6. `setup.js` 与 `index.js` 的 `autoBootstrap` 都负责首次安装。
7. `data/` 混合 config、state、logs、QR、SQLite。
8. 离线二进制（50 MB）长期放在源码仓库。
9. NapCat 实际 4.18.41 与内置 4.18.42 尚未统一。

## 6. 目标边界

```text
QQ
 │
 ▼
NapCatAdapter
 ├─ detect / installOffline / lifecycle / login / QR
 └─ config: app port token vendor version
 │
 ▼ OneBot WS
KoishiRuntime
 ├─ ensureProject / start / stop / health / logs
 ├─ KoishiPluginsManager
 └─ runtime data: access / ai-settings / persona / profiles
 │
 ▼ HTTP contract
Host
 ├─ routes/*        # 40 条路由按域拆分
 ├─ services/*      # napcat / koishi / setup / ai / persona / profiles
 ├─ platform/mac    # 路径/进程/能力
 └─ features/*
 │
 ▼
Client (tabs/components)
```

目标原则：

- Host 不直接理解 OneBot 消息格式。
- NapCatAdapter 不包含 AI/权限/面板逻辑。
- KoishiRuntime 不包含 DSH 路由和安装 UI。
- AI 的「是否触发/上下文」留在 Koishi；「模型/人设/画像/自检」留在 Host。
- 配置按「Host 设置 / 运行时配置 / 状态 / 日志 / 资产」五类归位。
- `template`、离线 bundle、release 资产都由脚本生成。

## 7. 建议的重构顺序

1. 固化本文档和配置契约（schema/默认值/所有权）。
2. 拆 Host：routes / services / platform / features，`index.js` 只做 composition。
3. 拆 Client：tabs / components / state，输出仍是单 bundle。
4. 把 `template` 和 runtime bundle 改为脚本生成 + CI 校验。
5. 合并 AI 设置来源，明确单一读写入口。
6. 规范 `data/` 目录：config / state / logs / assets。
7. 再引入游戏等新插件，保持 Host 只提供管理面。

## 8. 需要确认的决策

1. 两个仓库保留，还是合并成 monorepo？
2. `template` 作为生成物，还是成为唯一源码？
3. AI prompt 继续由 Host 负责，Koishi 只做消息适配？
4. 是否兼容现有 `data/` 文件格式？
5. 离线资产是否继续提交在源码仓库？
6. `dshbot-mac` 的版本策略：独立 `0.3.0-mac.x`，还是跟主分支同步版本？
