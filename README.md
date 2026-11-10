# dsh-qqbot

DeepSeek Harness 的 **macOS-only** QQ 机器人控制中心。

> 项目级架构、分支策略和发布记录以 `main` 为权威：<https://github.com/prophetcrab/dsh-qqbot/tree/main>。本文件只描述 macOS 平台运行方式。

当前分支：`dshbot-mac`。项目已按 plugin-based 架构重写：

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
│   ├── contracts/           # status/config/panel/plugin-manifest schema
│   ├── platform/            # 平台层：平台差异只允许出现在这里
│   │   ├── index.js         # 门面：本分支只接入 mac 实现
│   │   ├── common/          # 平台无关：paths / data-paths / http / settings
│   │   └── mac/             # macOS 实现：路径、进程、端口、QQ/NapCat 探测
│   ├── services/            # napcat / koishi / lifecycle / setup / persona /
│   │   │                    # profiles / access / group-loop / prompt
│   │   ├── game-core/       # 共享账号 + 玩家存储 + 游戏注册表
│   │   └── game-fishing/    # 钓鱼游戏包（数值、事务、渲染、管理台）
│   └── plugins/             # lifecycle / napcat / koishi / install / discovery /
│                            # persona / access / messages / features / tools /
│                            # game-core / game-fishing / group-loop
├── client/
│   ├── index.js             # 仅注册 Client 插件
│   ├── runtime/             # api / store / styles / locale
│   ├── components/
│   └── plugins/             # overview / ai / messages / access / plugins / features /
│                            # logs / games / tokens
├── template/                # Koishi 运行时模板（从 qq-bot 同步）
├── vendor/napcat/           # NapCat 离线 payload
└── scripts/                 # 构建、校验、冒烟、安装
```

平台层规则（ADR-0008 / 0009）：`process.platform` 只允许出现在
`host/platform/`；本分支只携带 macOS 实现，`host/platform/win`、Docker NapCat
后端和 Windows 离线包属于 `dshbot-win64` 分支，不得带回本分支。

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
core / access-control / health / welcome / echo   # 基础插件
group-listener/    # 群聊监听：缓冲、触发、队列、发送、账号命令
game-fishing/      # /钓鱼 命令入口，转发 DSH
runtime/           # 事件运行时内核（shadow，暂不接入线上链路）
shared/            # DSH transport / 游戏结果发送 / URL 安全
```

插件之间通过 `ctx.qqbot.*` 服务通信，不 deep import 内部实现。

## 小游戏开发架构约定

> 适用于钓鱼及后续所有群小游戏。当前钓鱼实现是参考样板，详见
> [钓鱼玩法设计](docs/design/fishing-game.md) 和
> [小游戏管理台](docs/design/game-admin-console.md)。

### 1. 权限边界：DSH 权威，Koishi 转发，NapCat 传输

| 端 | 负责 | 不负责 |
| --- | --- | --- |
| DSH Host | 规则、概率、状态、事务、资产、图片、管理 API | QQ 协议、消息循环 |
| Koishi | 命令入口、群/用户上下文、把结果发回群 | 游戏状态、概率、保底、玩家数据、资产 |
| NapCat | QQ 登录、OneBot、消息传输 | 游戏命令、业务规则、数据存储 |

钓鱼当前落地方式：

```text
QQ 群消息
→ Koishi game-fishing 识别 /钓鱼
→ POST /qqbot/games/fishing/command
→ DSH game-fishing 执行事务
→ 返回文字 / base64 图片
→ Koishi 发回群
```

**不要求每个小游戏新建一个 Koishi 插件。** 新游戏默认接入通用
`/qqbot/game/command`，只有在确实需要独立命令来源、权限或生命周期时，
才拆 Koishi 插件。历史上的 `0006` 独立插件对方案保留为规模化拆分方向。

### 2. 代码位置

```text
host/services/game-core/       # 共享账号与游戏注册表
├── modules/players.js         # 共享账号：注册/签到/账号背包
├── player-store.js            # 按群玩家状态，原子写入
├── registry.js
└── index.js                   # 装配共享模块和游戏包

host/services/game-fishing/    # 当前游戏参考实现
├── index.js                   # FishingGame 门面：装配服务与帮助
├── catalog.js                 # 目录读取（mtime 热更新，全服务共享）
├── catalog-audit.js           # 启动时检查缺数值/缺美术/新等级
├── data.js                    # 鱼种数值、鱼饵系数
├── admin.js                   # 管理台快照、UP 校验、GAMES
├── up-store.js                # 按群 UP 持久化
├── gacha-config.js            # 默认 UP
├── modules/                   # 命令、状态迁移、事务
└── render/                    # 抽卡/卡池/鱼仓/上鱼图片

host/plugins/game-fishing/     # 路由：/qqbot/games/fishing/*、管理台
host/plugins/game-core/        # 路由：/qqbot/game/command（共享账号命令）
template/plugins/game-fishing/ # Koishi 侧 /钓鱼 命令入口

client/plugins/games/          # 小游戏管理台（群 → 游戏 → 玩家）
assets/<gameId>/               # 游戏专属 sprite/catalog
assets/frames/                 # 共用边框
assets/items/                  # 共用特殊物品/券
```

新增游戏逻辑放在 `host/services/<gameId>/modules/`，通过
`host/services/<gameId>/index.js` 暴露游戏门面；路由放
`host/plugins/<gameId>/`。不要写进 Koishi listener，也不要写进
`players.js` 的账号背包逻辑。

### 3. 状态与配置

共享账号字段只放账号级资产：

```text
player.coins
player.items
player.nickname
```

游戏状态按游戏 ID 命名空间隔离：

```text
player.fishing
player.<gameId>
```

每个游戏必须自己提供默认值、旧数据迁移和越界修复。所有写操作走：

```text
PlayerStore.mutate(groupId, task)
```

禁止绕过 `PlayerStore` 直接写玩家 JSON。

按群配置放在：

```text
data/config/games/<gameId>.json
```

当前钓鱼 UP 使用 `data/config/games/up.json`，按群保存，未配置时使用默认值。
新游戏如果不需要“按群配置”，不要为了统一而硬造配置文件。

### 4. 命令约定

```text
/<游戏名>
/<游戏名> 子命令 [参数]
```

示例：

```text
/钓鱼 抛竿 [鱼饵名]
/钓鱼 收竿
/钓鱼 鱼仓
/钓鱼 卖鱼 编号
```

规则：

```text
命令必须确定性执行，不进入 LLM
同一命令参数不超过一个自然语言自由文本段
所有概率、保底、扣除、发放必须在同一个事务中完成
失败消息要说明缺少什么，不泄露内部状态文件路径
```

Koishi 只维护命令入口：

```text
template/plugins/game-fishing/          # 游戏命令：/钓鱼、/兑换钓鱼币
template/plugins/group-listener/game-commands.ts
  GAME_COMMANDS        # 账号命令白名单（/注册 /签到 /账号背包）
  ARGUMENT_COMMANDS    # 带自然语言参数的账号命令（当前为空）
```

新增游戏时在 Koishi 只加命令入口和转发，不要复制一套游戏逻辑到 Koishi。

### 5. 图片约定

游戏结果优先返回程序化图片，文字作为 fallback：

```text
DSH renderer → SVG → /usr/bin/sips → PNG base64
Koishi 收到 base64 → h.image(...)
```

约定：

```text
宽度 1080
PNG 输出
使用现有 light palette 和共用边框资源
不在 Koishi 里做图片合成
不引入 Playwright/Puppeteer 作为小游戏运行时依赖
```

### 6. 管理台接入

新游戏至少提供：

```text
GameAdminService.GAMES 中的 id / name / description
按群的玩家游戏快照
按游戏的玩家状态表
```

接入后自动出现在：

```text
群列表卡片 → 群详情 → 小游戏入口 → 该群游戏管理
```

如果游戏有“当期 UP”“赛季”“活动”之类的全局选择项，按钓鱼的方式：

```text
数据文件持久化
控制台 POST 保存
业务命令读取同一份配置
```

不要只在控制台内存里改，也不要让控制台和命令各维护一份状态。

### 7. 新游戏检查清单

```text
[ ] 选择稳定 gameId，camelCase/snake_case 固定
[ ] games/<gameId>/modules：命令解析、状态迁移、事务执行
[ ] player.<gameId> 命名空间和旧数据迁移
[ ] 账号背包不展示游戏专属仓库/货币
[ ] 概率、保底、扣除和发放原子完成
[ ] 需要图片时提供 games/<gameId>/render/*.js
[ ] 管理台 GAMES + getGame 快照
[ ] Koishi GAME_COMMANDS / ARGUMENT_COMMANDS
[ ] 服务测试：成功、失败、原子性、边界
[ ] 管理台测试：群/玩家/游戏/配置
[ ] 命令转发与客户端 smoke
[ ] npm run check
[ ] template 与 qq-bot 同步
```

### 8. 明确禁止

```text
在 Koishi 里保存游戏状态
在 Koishi 里计算概率/保底
把游戏仓库塞进 /账号背包
控制台直接改玩家 JSON 绕过 PlayerStore
在 DSH 里直接发 QQ 消息
为每个小游戏复制一份结果发送代码
把游戏逻辑放进 LLM
```

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
napcatBackend        local（本分支固定使用本地 QQ.app + NapCat）
napcatPort           6099
napcatToken          空
qqPath               空
napcatDir            空
offlineVendorDir     空
offlineNapcatVersion 空
lifecycleGuard       true（DSH 崩溃时由 watchdog 结束 Koishi 进程）
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

启动前会把 `settings.koishiPort` 同步进 `koishi.yml` 的 `server` 端口。

生命周期：DSH 正常退出或卸载插件时，插件会停止 Koishi 与 NapCat（本地 QQ
进程）；`lifecycleGuard=true`（默认）时另有一个脱离 DSH 的 watchdog，在 DSH
崩溃/被杀时结束本项目的 Koishi 进程。该开关只控制 watchdog，不改变正常退出/
卸载时的停止行为。NapCat 是本地 `QQ.app`，watchdog 不会结束它，避免误杀用户
自己的 QQ 会话。

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
├── config/
│   ├── access.json
│   ├── persona.json
│   └── prompts/group-chat.json
├── state/
│   ├── ai.json          # DSH discovery endpoint（Koishi 插件读取）
│   ├── koishi.db
│   └── napcat-login-qr.png
├── assets/
│   ├── persona-presets.json
│   └── profiles.json
└── logs/
```

DSH 写配置/人设/画像；Koishi 执行权限、触发和发送。旧版平铺的 `data/*.json` 可用 `node scripts/migrate-data.mjs ~/project/qq-bot --database` 一次性迁移（迁移前停止 Koishi）。

## 开发

```bash
npm test                 # 291 个 host/client 测试
npm run test:template    # 67 个 Koishi 模板测试（需 template 依赖）
npm run build:client
npm run smoke:host       # 53 routes / 6 tools / 3 features
npm run smoke:client
npm run check:architecture
npm run check:template
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

- [当前架构总览](docs/architecture/README.md)
- [分支对比与同步状态](docs/architecture/branches.md)
- [模块盘点](docs/archive/refactor-v2/00-module-inventory.md)
- [重构计划](docs/archive/refactor-v2/01-plan.md)
- [文件架构](docs/archive/refactor-v2/02-file-layout.md)

## 安全

- NapCat token 不落日志、不返回明文
- 外部命令使用 argv 数组，不拼 shell
- 离线包 size/SHA-256 校验失败即拒绝
- 权限策略由 Koishi `access-control` 执行
- 平台差异只落在 `host/platform/`，其他分支的平台实现不进入本分支
- 当前分支只支持 macOS / Apple Silicon

- [事件运行时架构计划](docs/decisions/0001-event-runtime-plan.md)
- [运行时内核 v1 详细设计](docs/decisions/0002-runtime-v1-detailed-design.md)
- [小核心人格 + 记忆驱动 + 情绪微调](docs/decisions/0003-character-memory-design.md)
- [群消息监听与反馈闭环](docs/decisions/0004-group-listener-loop-design.md)
- [确定性游戏核心](docs/decisions/0005-game-core.md)
- [小游戏插件架构](docs/decisions/0006-game-plugin-architecture.md)
- [多平台分支策略](docs/decisions/0007-multiplatform-branch-strategy.md)
- [main 作为 guidance-only 分支](docs/decisions/0008-main-guidance-only.md)
- [功能流与发布约定](docs/decisions/0009-feature-flow-and-release-convention.md)
- [群聊监听状态机 HTML 图](docs/design/group-listener-state-machine.html)
