# dsh-qqbot

DeepSeek Harness 的 QQ 机器人控制中心。把「装 NapCat、配 OneBot、起 Koishi、管插件」收进一个面板，并提供可扩展的功能注册框架与 Agent 工具。

> 配套机器人项目：[qq-bot](https://github.com/prophetcrab/qq-bot)（Koishi 4 + OneBot 11 + QQ 官方适配器）

## 功能

- **一键化安装 / 配置（运行时全部收拢在 qq-bot）**
  - 插件安装后首次加载会检查运行环境：缺少 Koishi 项目时从内置模板自动创建；依赖**默认直接解压插件内置的离线 node_modules 包**，无需 npm 和网络（当前平台）
  - 没有匹配平台离线包时自动回退 `npm install`（macOS 已内置 arm64 包；Windows 可在 Windows 上运行打包脚本生成）
  - NapCat 安装器下载完成后**自动打开**（10 分钟内不重复弹窗，可用 `autoOpenInstaller: false` 关闭；仅系统授权与扫码需要用户点一下）
  - 自动写入 NapCat 的 OneBot 反向 WebSocket 配置，并通过 NapCat WebUI API 热应用
  - 「一键安装并配置」按顺序完成：创建项目 → 安装依赖 → 安装 NapCat → 启动 Koishi → 写配置 → 启动 NapCat
- **一键启动 / 停止（无需终端）**
  - NapCat（QQ）、Koishi（`npm start`）分别控制，或一键全启/全停
  - NapCat 登录二维码直接显示在面板里，扫码即登录；支持刷新二维码
  - 健康检查（`/api/qqbot/health`）、进程状态、托管日志
- **消息流**
  - 「消息」页实时查看机器人收到的群聊/私聊消息（发送者、来源、内容、时间），支持筛选与刷新
- **Koishi 插件管理系统**
  - 列出 koishi.yml 中的插件（本地 / npm / 内置）
  - 启用 / 禁用（切换 `~` 前缀）、安装（npm install + 写配置）、卸载
  - 操作后可选重启 Koishi
- **高扩展性功能框架**
  - Host 暴露 `qqbot` 服务；其他 DSH 插件可通过 `inject: ['qqbot']` 注册 Feature（状态 + 按钮 + 执行逻辑）
  - 每个 Feature 自动出现在面板「功能」页，并可通过 `/qqbot/features/run` 触发
- **权限管理**
  - 自动读取机器人所在的群列表（群名/群号/人数）和好友列表，点击勾选即可管理，无需手输群号
  - 按「群聊 / 私聊」分别配置接收与发送策略：全部放行 / 白名单 / 黑名单
  - 安静模式：群里只有 `/` 指令或 @机器人 的消息才处理，避免无关消息刷屏
  - 策略写入 Koishi 项目 `data/access.json`，由 Koishi `access-control` 插件实时生效（无需重启）
- **Agent 工具**
  - `qqbot_status`、`qqbot_control`、`qqbot_configure`、`qqbot_plugin`、`qqbot_access`、`qqbot_logs`
  - 对话里即可查询状态、启停、安装 Koishi 插件、读写权限策略

## 架构

```text
┌──────────────────────── DeepSeek Harness ────────────────────────┐
│  client.js  (浏览器)                                              │
│    sidebar.panellist 行 + main 面板                                │
│    概览 / 插件 / 功能 / 日志                                        │
│         │ fetch /qqbot/*                                          │
│  index.js  (Host)                                                 │
│    ├─ webServer 路由：状态、启停、配置、插件管理、Feature          │
│    ├─ tools：qqbot_status / control / configure / plugin / logs   │
│    ├─ qqbot 服务：registerFeature() 扩展入口                       │
│    ├─ lib/napcat.js   检测、安装器、OneBot 配置、登录、启停         │
│    ├─ lib/koishi.js   项目、进程、健康检查、日志                    │
│    ├─ lib/koishi-plugins.js  koishi.yml 文本编辑 + npm 安装         │
│    └─ lib/features/*  内置 Feature（可扩展）                        │
└───────────────┬───────────────────────────┬───────────────────────┘
                │ open / OneBot WS / API     │ npm start / HTTP health
         NapCat（QQ.app） ◀── 反向 WS ──▶ Koishi（qq-bot 项目）
```

## 安装

> 运行时依赖统一放在 `~/project/qq-bot`：Koishi 源码、`node_modules`、`data`、`logs`、`runtime/napcat-installer`。DSH 插件本身只负责安装/控制，不再需要你手动创建项目或装依赖。

### 方式一：安装脚本（推荐）

```bash
cd ~/project/dsh-qqbot
node scripts/install-profile.mjs --profile desktop --install
```

脚本会：

1. 向 `~/.dsh/profiles/<profile>/package.json` 添加 `dsh-qqbot` 依赖（`link:` 本地目录）
2. 把 `dsh-qqbot` 加入 `dsh.profile.bundles`
3. 在 `cordis.patch.yml` 追加插件行（`id: qqbot`）
4. 备份被修改的文件，并执行 `pnpm install`
5. 重启/热加载 DeepSeek Harness 后，插件首次激活会自动准备 `~/project/qq-bot` 运行环境

可用 `--dry-run` 先看改动；`--uninstall` 移除。

### 方式二：手动安装

编辑 `~/.dsh/profiles/<profile>/package.json`：

```json
{
  "dependencies": { "dsh-qqbot": "link:/Users/crab/project/dsh-qqbot" },
  "dsh": { "profile": { "bundles": ["...", "dsh-qqbot"] } }
}
```

在 `cordis.patch.yml` 追加：

```yaml
- insert:
    - id: qqbot
      name: dsh-qqbot
```

然后在 profile 目录执行 `pnpm install`，重启 DSH。

## 使用

侧边栏出现 **QQ 机器人** 后：

1. **总览**：查看 QQ / NapCat / Koishi / 机器人状态；未安装 NapCat 时点「安装 NapCat」
2. 安装器里完成授权、切换入口并用手机 QQ 扫码登录
3. 点「写入 OneBot 配置」（自动写 `ws://127.0.0.1:5140/onebot` 并热应用）
4. 点「一键启动全部」；状态变为 NapCat 运行、Koishi 运行、机器人在线
5. **插件**：管理 Koishi 插件；安装后按需重启 Koishi
6. **功能**：查看所有 Feature；其他插件注册的功能也会出现在这里
7. **日志**：查看托管 Koishi 进程的输出

## AI 聊天（复用 DSH 模型）

- DSH 侧提供 `/qqbot/ai/chat` 本地桥：通过 harness 自带的 `ctx.llm` 服务调用**当前 DSH 已配置的 provider/model 和凭据**，不复制、不保存 API Key。
- provider/model 默认取 DSH 默认模型（`agentDefaultModel`）；也可用 `aiProvider/aiModel` 覆盖。
- 端点自动写入 `qq-bot/data/ai.json`，Koishi 的 `ai-chat` 插件启动时读取；DSH 端口变化后文件会更新。
- 群聊里 **@机器人** 触发（不使用 `/ai` 等指令前缀）；普通群消息会进入该群短期上下文，AI 能理解前文。
- 上下文条数/超时/回复长度在 `koishi.yml` 的 `./plugins/ai-chat`；系统提示词、token 上限、温度在插件配置。

```yaml
# cordis.patch.yml（可选覆盖）
- insert:
    - id: qqbot
      name: dsh-qqbot
      config:
        aiProvider: deepseek-account
        aiModel: deepseek-flash
        aiSystemPrompt: 你是群里的助手，回答简短自然。
        aiMaxTokens: 800
```

```yaml
# qq-bot/koishi.yml（触发方式）
./plugins/ai-chat:ai7k2m:
  historyLimit: 12   # 每个群保留的上下文条数
```

## 配置项

在 `cordis.patch.yml` 的插件行里覆盖（都有默认值）：

```yaml
- insert:
    - id: qqbot
      name: dsh-qqbot
      config:
        projectDir: ~/project/qq-bot
        koishiPort: 5140
        napcatPort: 6099
        reversePath: /onebot
        installerDir: ~/Library/Application Support/dsh-qqbot/napcat-installer
        napcatToken: ''
        autoRestartKoishi: true
        logLines: 200
```

| 配置 | 默认 | 说明 |
| --- | --- | --- |
| `projectDir` | `~/project/qq-bot` | Koishi 项目目录 |
| `koishiPort` | `5140` | Koishi HTTP/控制台/反向 WS 端口 |
| `napcatPort` | `6099` | NapCat WebUI 端口（用于读配置/登录状态） |
| `reversePath` | `/onebot` | 反向 WS 路径 |
| `installerDir` | `<projectDir>/runtime/napcat-installer` | NapCat 安装器缓存（也在 qq-bot 内） |
| `qqPath` | 空 | 覆盖 QQ 安装路径（Windows 非标准安装时使用） |
| `napcatDir` | 空 | 覆盖 NapCat 安装目录（Windows OneKey/Shell 或 Linux 手动安装时使用） |
| `napcatToken` | 空 | Koishi 侧 OneBot token（与 NapCat 一致） |
| `autoRestartKoishi` | `true` | 插件管理操作后是否自动重启 |
| `autoInstallDeps` | `true` | 首次加载时自动创建项目/安装依赖 |
| `autoOpenInstaller` | `true` | NapCat 安装器下载后自动打开（10 分钟防重复弹窗） |
| `aiProvider` | 空 | AI 模型 provider；留空复用 DSH 默认 |
| `aiModel` | 空 | AI 模型 id；留空复用 DSH 默认 |
| `aiSystemPrompt` | 内置中文提示 | 群聊 AI 系统提示词 |
| `aiMaxTokens` | `800` | 回复 token 上限 |
| `aiTemperature` | `0.7` | 采样温度 |
| `logLines` | `200` | 日志/状态返回的行数上限 |

## 扩展：注册自己的功能

任何 DSH 插件：

```js
export const name = 'my-qq-feature'
export const inject = ['qqbot']

export function apply(ctx) {
  ctx.qqbot.registerFeature({
    id: 'my-feature',
    title: { zh: '我的功能', en: 'My feature' },
    description: { zh: '做点有趣的事', en: 'Does something fun' },
    status: async (deps) => ({ napcat: deps.napcat ? 'ready' : 'missing' }),
    actions: [{
      id: 'run',
      title: { zh: '执行', en: 'Run' },
      tone: 'primary',
      run: async (deps) => {
        // deps: { settings, logger, napcat, koishi, plugins, platform }
        return { ok: true, message: '完成' }
      },
    }],
  })
}
```

Feature 会自动出现在面板「功能」页。也可以在 Host 端复用 `ctx.qqbot.status`（`napcat`/`koishi`/`plugins` manager 实例）与 `ctx.qqbot.getStatus()`。

## 目录结构

```text
dsh-qqbot/
├── index.js                  # Host plugin：路由、工具、qqbot 服务
├── client.js                 # 浏览器面板（sidebar + main）
├── lib/
│   ├── util.js               # 执行器、HTTP、JSON、日志环
│   ├── platform.js           # 只读环境探测
│   ├── napcat.js             # NapCat 安装/配置/启停
│   ├── koishi.js             # Koishi 项目/进程/健康/日志
│   ├── koishi-plugins.js     # koishi.yml 插件管理
│   ├── access.js             # 权限策略读写/归一化（data/access.json）
│   ├── contacts.js           # 群/好友列表代理（Koishi /api/qqbot/contacts）
│   ├── messages.js           # 消息流代理（Koishi /api/qqbot/messages）
│   ├── ai.js                 # AI 桥：复用 ctx.llm 调用 DSH 当前模型
│   ├── setup.js              # 环境自举：模板建项目 + 离线依赖解压 / npm 回退
│   ├── features.js           # FeatureRegistry
│   └── features/             # 内置 Feature（含 access）
├── scripts/
│   ├── install-profile.mjs   # 写入 DSH profile
│   ├── smoke-host.mjs        # Host 冒烟
│   └── smoke-client.mjs      # 客户端渲染冒烟
├── test/                     # node:test 单元测试
├── template/                 # 内置 Koishi 项目模板（首次安装时复制到 qq-bot）
│   └── runtime-bundles/      # 离线 node_modules 包（按 平台-架构 命名）
├── locale/                   # 插件市场显示文案
├── cordis.patch.yml          # bundle patch
└── SETUP.md                  # 本机安装/卸载/排错
```

## 开发

```bash
npm test          # 112 个单元测试
npm run smoke:host
npm run smoke:client
npm run check     # 全部
```

无运行时依赖；Host 只用 Node 内置模块；客户端只有 React（由 DSH 提供）。

### 离线 Koishi 依赖

- 插件内置 `template/runtime-bundles/node_modules-<platform>-<arch>.tar.gz`（当前仓库包含 `darwin-arm64`，13.8 MiB）；首次创建运行时项目时直接解压，**不需要 npm、不需要网络**；启动时优先用项目内的 `node_modules/koishi/bin.js`，因此即使机器没有 npm 也能运行。
- 重新生成：
  ```bash
  node scripts/bundle-runtime.mjs --source ~/project/qq-bot
  ```
  在目标平台（Windows、Linux）上执行同一命令即可生成对应平台的包；插件会按 `process.platform-process.arch` 选择，找不到时回退 `npm install`。

### 已验证

- 单元测试 112/112 通过（含 macOS/Windows 分支与 AI 桥：NapCat 34、Koishi 24、插件管理 15、平台 8、环境自举 10、权限 7、群友列表 3、消息 3、Feature 2、AI 6）
- Host 冒烟：29 条路由、6 个工具、5 个内置 Feature、真实环境 17 个 Koishi 插件
- 客户端冒烟：注册、渲染、按钮 POST、插件开关、Feature 执行、日志切换
- 在独立 profile 中以 DSH `0.2.1-rc.3` headless 实例真实加载：`/qqbot/status`、`/qqbot/features`、`/qqbot/koishi/plugins` 均返回 200，客户端 bundle 被 DSH 注入到页面插件列表

## 安全与限制

- NapCat 安装器需要 macOS「App 管理」权限；QQ 扫码登录必须由用户完成
- 不记录、不返回 NapCat token 明文（面板/日志只出现掩码）
- 所有命令使用参数数组执行，不拼 shell
- 插件管理直接修改 Koishi 项目的 `koishi.yml`，操作前建议备份（脚本会自动备份 DSH profile，Koishi 配置可用 Git 管理）
- NapCat 控制台日志不由本插件捕获；请用 NapCat WebUI 的日志页
- 目前面向 macOS；Windows/Linux 的安装路径检测留作 Feature 扩展

## 路线图

- [ ] 安装向导分步 UI（下载/打开/检测/配置/登录 逐步引导）
- [ ] QQ 官方机器人接入（作为内置 Feature）
- [ ] 群管理、定时推送、AI 对话等 QQ 侧功能以 Feature 形式提供
- [ ] Windows / Linux 支持
- [ ] 发布到 DSH 插件市场（dsh-plugins index）

## License

MIT
