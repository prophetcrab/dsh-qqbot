# dsh-qqbot — 规格与接口契约（SPEC）

> 本文件是并行实现的唯一契约。所有模块按此实现；接口、返回结构、测试要求不得擅自改动。
> 若确需调整，先改此文件并在 PR/汇报中说明。

## 1. 产品目标

`dsh-qqbot` 是 DeepSeek Harness（DSH）的外部插件，提供一个 **QQ 机器人控制中心**：

1. **一键化安装 / 配置 NapCat + Koishi**
   - 检测 macOS 上的 QQ、NapCat、Koishi 项目状态
   - 下载并拉起官方 NapCat macOS 安装器（GUI 部分由用户完成扫码/授权）
   - 自动写入 NapCat 的 OneBot 反向 WebSocket 配置，并通过 NapCat WebUI API 热应用
   - 自动安装 Koishi 项目依赖
2. **一键启动 / 停止**
   - 启动/停止 NapCat（QQ.app）、Koishi（npm start），一键启动全部
   - 健康检查、进程状态、日志
3. **Koishi 插件管理系统**
   - 列出 koishi.yml 中启用的插件（含本地插件、官方/社区 npm 插件）
   - 启用/禁用（切换 koishi.yml 的 `~` 前缀）、安装（npm install + 写入配置）、卸载
   - 操作后可选择重启 Koishi 生效
4. **高扩展性功能框架**
   - Host 暴露 `qqbot` 服务与 FeatureRegistry；其他 DSH 插件可 `inject: ['qqbot']` 注册新功能
   - 每个 Feature 提供状态、操作按钮、可选路由；客户端统一渲染
   - 内置 Feature：环境状态、生命周期、NapCat 配置、Koishi 插件管理
5. **Agent 工具**
   - `qqbot_status` / `qqbot_control` / `qqbot_plugin` / `qqbot_configure` / `qqbot_logs`，让对话直接操控机器人

## 2. 运行环境与边界

- Host 运行在 DSH（Node 22.19+ / 24+，ESM，无运行时 npm 依赖，只用 Node 内置模块）
- 目标平台：macOS（darwin/arm64 优先；其他平台返回友好错误）
- 已知本机事实（测试时使用）：
  - QQ：`/Applications/QQ.app`，NapCat 入口已切换
  - NapCat 安装根：`~/Library/Containers/com.tencent.qq/Data/Documents/napcat`
  - NapCat 运行配置：`~/Library/Containers/com.tencent.qq/Data/Library/Application Support/QQ/NapCat/config`
    - `webui.json`（port/token）、`onebot11_<uin>.json`、`napcat_<uin>.json`
  - Koishi 项目：`~/project/qq-bot`，端口 5140，健康检查 `GET /api/qqbot/health`
  - NapCat WebUI：`http://127.0.0.1:6099`，认证 `POST /api/auth/login {"hash": sha256(token + ".napcat")}` → `{data:{Credential}}`
- **禁止**在测试中启停真实的 NapCat/Koishi 进程，或修改真实配置；测试全部使用临时目录/注入的假执行器。
- 不实现 QQ 官方机器人（后续 Feature 扩展位）。
- 安全：所有命令用参数数组（execFile/spawn），禁止把用户输入拼进 shell 字符串。

## 3. 文件所有权

| 文件 | 负责人 | 说明 |
| --- | --- | --- |
| `index.js` | Lead | Host 插件：路由、工具、服务、生命周期 |
| `lib/util.js` | Lead | 执行器、HTTP、JSON、日志环、路径 |
| `lib/platform.js` | Lead | 环境探测（只读） |
| `lib/features.js`, `lib/features/*.js` | Lead | 功能注册框架 + 内置功能 |
| `lib/napcat.js` | **Teammate A** | NapCat 检测/安装/配置/启停 |
| `test/napcat.test.js` | **Teammate A** | 单元测试（fixtures） |
| `lib/koishi.js` | **Teammate B** | Koishi 项目/进程/健康/日志 |
| `lib/koishi-plugins.js` | **Teammate B** | koishi.yml + package.json 插件管理 |
| `test/koishi.test.js`, `test/koishi-plugins.test.js` | **Teammate B** | 单元测试 |
| `client.js` | **Teammate C** | 浏览器 UI（sidebar + main panel） |
| `scripts/smoke-client.mjs` | **Teammate C** | React 替身渲染冒烟 |
| `scripts/smoke-host.mjs`, `README.md`, `SETUP.md`, `package.json`, `cordis.patch.yml`, `icon.svg` | Lead | 集成、文档、发布 |

只改自己名下的文件；需要别的接口改动时先告知 Lead。

## 4. 共享模块（Lead 提供，直接使用）

### `lib/util.js`

```js
/** @returns {Promise<{code:number, stdout:string, stderr:string}>} */
export async function run(file, args = [], options = {}) // execFile 包装；不 throw，返回 code
export async function runShell(command, options = {})    // 仅供固定命令，内部 shell:true
export function existsSync(path)
export async function ensureDir(path)
export async function readJson(path, fallback = undefined) // 解析失败/不存在返回 fallback
export async function writeFileAtomic(path, text)
export async function httpJson(url, options = {}) // {method, body, headers, timeoutMs}
//  -> { ok, status, data, error }；4xx/5xx 不 throw
export function sha256Hex(text)
export function expandHome(path)
export async function findCommand(name) // which
export function maskToken(value) // 只保留前 4 位
export class RingLog {
  constructor(limit = 400)
  append(chunk) // string|Buffer，按行保存
  tail(n = 200) // string[]
  clear()
}
export function sleep(ms)
```

### `lib/platform.js`

```js
export const DEFAULT_SETTINGS = { projectDir, koishiPort: 5140, napcatPort: 6099, installerDir, ... }
export function resolveSettings(rawConfig) // 合并默认值、展开 ~、归一化端口
export function macInfo() // { isMac, arch, release }
export function detectQq() // { installed, path, version|null }
export function detectNapcat(settings) // { installed, installDir, configDir, version|null, accounts:[{uin, configPath}], webui:{port, token} }
export function detectKoishiProject(settings) // { projectDir, exists, hasPackageJson, hasNodeModules, hasKoishiYml, packageJson, scripts }
export function findProcess(pattern) // { running, pid } 使用 pgrep -fl（只读）
export function daemonInfo() // { isDsh:boolean } 保留
```

`detectNapcat` 不能抛异常；缺失的目录返回空值。
`resolveSettings` 默认值：
```js
{
  projectDir: '~/project/qq-bot',
  koishiPort: 5140,
  napcatPort: 6099,
  installerDir: '~/Library/Application Support/dsh-qqbot/napcat-installer',
  reversePath: '/onebot',
  napcatToken: '',          // Koishi 侧 token（可空）
  autoRestartKoishi: true,
  logLines: 200,
}
```

## 5. NapCat 模块（Teammate A）

`lib/napcat.js`：

```js
export class NapcatManager {
  /**
   * @param {object} options
   * @param {ReturnType<typeof resolveSettings>} options.settings
   * @param {{ info:Function, warn:Function, error:Function }} options.logger
   * @param {object} [options.deps] 测试注入：{ run, http, fs, platform, sleep, now }
   */
  constructor(options)

  /** @returns {Promise<NapcatStatus>} */
  async status()

  /** 下载官方 NapCat-Mac-Installer release 并打开安装器（GUI），返回本地路径。 */
  async install()

  /** 把 OneBot 反向 WS 客户端写入所有账号配置并热应用。 */
  async configure({ uin } = {})

  /** 启动 NapCat（open -a QQ.app），等待登录状态。 */
  async start({ timeoutMs = 30000 } = {})

  /** 停止 NapCat 进程（SIGTERM，超时后 SIGKILL）。 */
  async stop()

  /** 仅下载安装器 zip 到 installerDir，返回 { zipPath, appPath, version }。 */
  async downloadInstaller()

  /** 登录状态（缓存 credential）。 */
  async loginStatus()
}

/** 纯函数，便于测试 */
export function upsertWebsocketClient(onebotConfig, options) // -> { config, changed }
export function listWebsocketClients(onebotConfig) // -> [{ name, url, enable }]
export function maskOnebotConfig(onebotConfig) // 去掉 token 等敏感值，给 UI 用
```

`NapcatStatus` 结构：

```js
{
  installed: boolean,
  installDir: string|null,
  configDir: string|null,
  version: string|null,
  running: boolean,
  pid: number|null,
  loggedIn: boolean,
  qq: string|null,          // uin
  nickname: string|null,
  webui: { port: number, tokenMasked: string|null, reachable: boolean },
  accounts: [{ uin, configPath, wsClients: [{ name, url, enable }], applied: boolean }],
  configApplied: boolean,
  installer: { downloaded: boolean, appPath: string|null, version: string|null },
  error?: string
}
```

### 5.1 安装流程

1. `GET https://api.github.com/repos/NapNeko/NapCat-Mac-Installer/releases/latest`（User-Agent 必填）
2. 找到 `NapCatInstaller_*.zip`，下载到 `<installerDir>/<tag>/NapCatInstaller.zip`
3. 用 `ditto -x -k zip dir` 或 `unzip` 解压
4. `open <解压目录>/NapCatInstaller.app`
5. 返回 `{ ok:true, appPath, version, message:'安装器已打开，请按提示授权并切换入口' }`

失败返回 `{ ok:false, error }`。下载可注入 fetch/run 以便测试（测试不联网）。

### 5.2 配置流程

1. 找账号：`configDir/onebot11_<uin>.json`（没有则从 `napcat_protocol_<uin>.json` 推断；再没有则报错）
2. 读 JSON，`upsertWebsocketClient` 保证存在：
```js
{ name:'koishi', enable:true, url:`ws://127.0.0.1:${koishiPort}${reversePath}`,
  messagePostFormat:'array', reportSelfMessage:false, reconnectInterval:5000,
  token: settings.napcatToken, debug:false, heartInterval:30000 }
```
   同名 `name:'koishi'` 更新，不重复追加；其他客户端保留。
3. 调用 NapCat WebUI API 热应用：
   - 读 `webui.json` 得到 `{port, token}`
   - `POST /api/auth/login` → Credential
   - `POST /api/OB11Config/SetConfig` body `{config: JSON.stringify(onebotConfig)}`（带 Bearer）
   - 失败则直接写回文件，并返回 `applied:false, message:'已写入文件，重启 NapCat 生效'`
4. 返回 `{ ok, accounts:[{uin, path, changed, applied}], message }`

### 5.3 启动 / 停止

- 启动：`open -a /Applications/QQ.app`（保留 `open` 参数数组），轮询 `loginStatus()` 直到 `loggedIn` 或超时
- 停止：`findProcess('/Applications/QQ.app/Contents/MacOS/QQ')` → `process.kill(pid, 'SIGTERM')`，轮询消失，超时 SIGKILL
- 测试注入：deps 里给 fake `platform`, `run`, `processKill`, `sleep`

### 5.4 测试要求

- `upsertWebsocketClient`：保留其他客户端、更新同名、URL/token 正确
- `maskOnebotConfig` 不泄露 token
- `configure`：临时目录 + fake webui 服务器/注入 http，断言文件内容与 API 调用
- 不启动真实进程

## 6. Koishi 模块（Teammate B）

### `lib/koishi.js`

```js
export class KoishiManager {
  /** @param {{settings,logger,exec?:object}} options */
  constructor(options)

  /** @returns {Promise<KoishiStatus>} */
  async status()

  async installDeps()      // npm install --no-audit --no-fund（仅当无 node_modules 或强制）
  async start()            // spawn npm start（detached，日志进入 RingLog），轮询 health
  async stop()             // 优先按 PID，其次按端口找 PID；SIGTERM → SIGKILL
  async restart()
  async logs(n = 200)      // string[]，仅本插件启动的进程
  health()                 // GET /api/qqbot/health -> {ok,bots,stats}
  isPortListening(port)
}

export function findPidByPort(port) // lsof -nP -iTCP:<port> -sTCP:LISTEN，返回 pid|null
```

`KoishiStatus`：

```js
{
  projectDir: string,
  exists: boolean,
  hasPackageJson: boolean,
  depsInstalled: boolean,
  running: boolean,        // 健康检查通或端口被监听
  managed: boolean,        // 是否由本插件进程启动
  pid: number|null,
  port: number,
  online: boolean,         // health.ok
  selfId: string|null,
  platform: string|null,
  stats: object|null,
  logs: string[],          // 最近 30 行
  error?: string
}
```

要求：
- 项目不存在时 status 返回 `exists:false`，不抛错
- start 前若已在运行（health 通），直接返回 `{ ok:true, alreadyRunning:true }`
- 启动命令固定：`npm start`，cwd=projectDir，环境继承；`detached:true`
- stop：优先 `managedPid`；否则 `findPidByPort(port)`；不能用 `pkill koishi` 这种宽匹配
- 日志：stdout/stderr 都 append 到 RingLog；`logs()` 返回 tail
- 测试：临时目录 + 注入 exec/spawn/fetch，不启动真实服务

### `lib/koishi-plugins.js`

职责：只做**文本级** koishi.yml 编辑 + package.json 读取，不依赖第三方 YAML 库。

```js
/** 解析 koishi.yml 文本，返回扁平列表 */
export function parseKoishiYml(text) // -> { entries:[{key,group,enabled,indent,line,rawKey}], groups:[...] }

/** 返回 [{name, packageName, version, enabled, group, local, removable, description}] */
export function listKoishiPlugins({ ymlText, packageJson })

/** 切换 `~` 前缀；返回新文本。找不到 key 抛错。 */
export function setPluginEnabled(ymlText, key, enabled) // -> string

/** 在 group（默认 'plugins'，不存在则创建到 plugins: 末尾）下插入 `<key>: {}`；已存在则抛错 */
export function addPluginEntry(ymlText, key, { group = 'plugins' } = {}) // -> string

/** 删除条目及其缩进更深的配置行 */
export function removePluginEntry(ymlText, key) // -> string

/** npm 包名 → yml key 的常用形式（去 koishi-plugin-/@koishijs/plugin- 前缀） */
export function normalizePluginKey(name)

export class KoishiPluginsManager {
  /** @param {{koishi: KoishiManager, settings, logger, exec?:object}} options */
  constructor(options)
  async list()
  async toggle(key, enabled, { restart = false } = {})
  async install(spec, { restart = false } = {})   // npm install <spec>；成功后 addPluginEntry
  async uninstall(key, { restart = false } = {})  // npm uninstall；成功后在 yml 删除
}
```

关键规则：
- 文件位置：`<projectDir>/koishi.yml`、`<projectDir>/package.json`
- yml 结构示例（缩进 2 空格；插件 key 带实例 id）：
```yaml
prefix: ['/']
plugins:
  group:basic:
    help:ss74sj: {}
    ~market:jgwg4c:
      search: {}
  group:local:
    ./plugins/core:orq22s:
      logMessages: true
```
- 识别条目：位于 `plugins:` 下、缩进为 4 的行 `key: ...`，排除以 `$` 开头的特殊键；组行形如 `group:xxx:`（缩进 2）
- enabled=false ⇔ key 以 `~` 开头；显示名去掉实例 id（`:` 之后）
- 匹配 packageName：key 原样；`koishi-plugin-<key>`；`@koishijs/plugin-<key>`；`<key>` 若为 scoped；local 条目以 `./`/`../`/`/` 开头
- install 前校验 spec 非空；`npm install <spec> --no-audit --no-fund`（execFile，不拼 shell）；失败抛错并保留原文本
- 返回结构示例：
```js
{ ok:true, action:'install', key, packageName, textChanged:true, restarted:false, output:'...' }
```
- 测试：用 fixture yml 覆盖解析/切换/插入/删除；安装流程注入假 exec，断言参数与文件写入（临时目录）

## 7. Host 接口与工具（Lead）

### 7.1 路由（`ctx.inject(['webServer'])`，`kind:'exact'`）

所有响应 `application/json; charset=utf-8`；错误 `{ ok:false, error }`。

| Method | Path | Body | 返回 |
| --- | --- | --- | --- |
| GET | `/qqbot/status` | — | `{ ok:true, data: StatusSnapshot }` |
| GET | `/qqbot/logs?source=koishi&lines=200` | — | `{ ok:true, lines:string[] }` |
| GET/POST | `/qqbot/access` | AccessPolicy | `{ ok:true, data: AccessPolicy }` |
| GET | `/qqbot/contacts` | — | `{ ok, groups, friends, selfId?, fetchedAt?, error? }`（代理 Koishi `/api/qqbot/contacts`） |
| GET | `/qqbot/features` | — | `{ ok:true, data: FeatureDescriptor[] }` |
| GET | `/qqbot/koishi/plugins` | — | `{ ok:true, data: PluginInfo[] }` |
| POST | `/qqbot/napcat/install` | `{}` | `{ ok, appPath?, message?, error? }` |
| POST | `/qqbot/napcat/configure` | `{ uin? }` | `{ ok, accounts, message? }` |
| POST | `/qqbot/napcat/start` | `{}` | `{ ok, message }` |
| POST | `/qqbot/napcat/stop` | `{}` | `{ ok, message }` |
| POST | `/qqbot/koishi/install-deps` | `{}` | `{ ok, output }` |
| POST | `/qqbot/koishi/start` | `{}` | `{ ok, message }` |
| POST | `/qqbot/koishi/stop` | `{}` | `{ ok, message }` |
| POST | `/qqbot/koishi/restart` | `{}` | `{ ok, message }` |
| POST | `/qqbot/all/start` | `{}` | `{ ok, steps:[{name,ok,message}] }` |
| POST | `/qqbot/all/stop` | `{}` | `{ ok, steps }` |
| POST | `/qqbot/koishi/plugins/toggle` | `{ key, enabled, restart? }` | `{ ok, ... }` |
| POST | `/qqbot/koishi/plugins/install` | `{ spec, restart? }` | `{ ok, ... }` |
| POST | `/qqbot/koishi/plugins/uninstall` | `{ key, restart? }` | `{ ok, ... }` |
| POST | `/qqbot/features/run` | `{ feature, action, params? }` | `{ ok, data? }` |

StatusSnapshot：

```js
{
  platform: { isMac, arch, release, node },
  settings: { projectDir, koishiPort, napcatPort, reversePath },
  qq: { installed, path, version },
  napcat: NapcatStatus,
  koishi: KoishiStatus,
  bot: { online, selfId, platform, uptime },
  features: FeatureDescriptor[],
  updatedAt: string
}
```

### 7.2 Feature 框架（`lib/features.js`）

```js
/** @typedef {{
 *  id:string, title:{zh:string,en:string}, description:{zh:string,en:string},
 *  status?: (deps)=>Promise<object>|object,
 *  actions?: Array<{ id:string, title:{zh,en}, tone?:'primary'|'danger'|'normal',
 *                    run:(deps, params)=>Promise<{ok:boolean,message?:string,data?:any}> }>
 * }} Feature
 */
export class FeatureRegistry {
  constructor(deps) // deps: { settings, logger, napcat, koishi, plugins }
  register(feature)              // 重复 id 抛错
  list()                        // FeatureDescriptor[]（status 不在此执行）
  async statusAll()             // [{ id, status }]
  async run(id, actionId, params) // 找不到抛错
}
export async function loadBuiltinFeatures(registry) // 静态注册 lib/features/*.js
```

内置 Feature（Lead）：
- `overview`：环境/服务总览（无 action）
- `lifecycle`：`start-all`、`stop-all`、`start-koishi`、`stop-koishi`、`start-napcat`、`stop-napcat`
- `configuration`：`configure-napcat`、`install-napcat`、`install-koishi-deps`
- `koishi-plugins`：无 action（客户端直接调插件路由），status 返回插件数量摘要
- `access`：无 action（客户端直接调权限路由），status 返回收/发策略摘要

FeatureDescriptor：
```js
{ id, title, description, actions:[{id,title,tone}], status?: {...} }
```
语言选择：Host 返回 `{zh,en}` 双语文案，客户端按当前 locale 选择。

### 7.3 `qqbot` 服务（供其他 DSH 插件扩展）

`index.js` 中 `ctx.provide('qqbot'); ctx.set('qqbot', api)`，api：

```js
{
  settings,                       // 解析后的设置
  registerFeature(feature),       // 注册自定义 Feature（自动重名校验）
  getStatus(),                    // Promise<StatusSnapshot>
  status: { napcat, koishi, plugins }, // manager 实例
}
```
其他插件可：
```js
export const inject = ['qqbot']
export function apply(ctx) {
  ctx.qqbot.registerFeature({ id:'my-feature', title:{zh:'…',en:'…'}, description:{...},
    actions:[{ id:'do', title:{zh:'执行',en:'Run'}, run: async (deps) => ({ ok:true }) }] })
}
```

### 7.4 Agent 工具

| 工具 | 参数 | 作用 |
| --- | --- | --- |
| `qqbot_status` | — | 返回状态文本（NapCat/Koishi/机器人/插件数） |
| `qqbot_control` | `target: 'all'\|'napcat'\|'koishi'`, `action: 'start'\|'stop'\|'restart'` | 控制进程 |
| `qqbot_configure` | `uin?` | 写入并热应用 NapCat OneBot 配置 |
| `qqbot_plugin` | `action: 'list'\|'install'\|'uninstall'\|'enable'\|'disable'`, `name?`, `restart?` | Koishi 插件管理 |
| `qqbot_access` | `action: 'get'\|'set'`, `policy?` | 读取/替换收发权限策略 |
| `qqbot_logs` | `source: 'koishi'\|'napcat'`, `lines?` | 日志尾部 |

工具 `output.render` 返回 `[{type:'text',text}]`。

### 7.5 系统提示

`ctx.systemPrompt.section({ name:'tool:qqbot', order: 2380, text: '...' })`，简述工具用途。

## 8. 客户端（Teammate C）

### 8.1 注册

```js
window.__ModuleLoader__.load({
  id: 'dsh-qqbot',
  factory(require) {
    const React = require('react')
    ...
    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { en, zh }), 'dsh-qqbot: dictionaries')
        ctx.effect(() => ctx.slots.inject('main', () => ctx.slots.register({
          name: 'main', key: 'qqbot',
        }, Panel)), 'dsh-qqbot: main panel')
        ctx.effect(() => ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist', id: 'qqbot', order: 30, label: () => t('title'),
        }, QqbotIcon)), 'dsh-qqbot: sidebar row')
      },
    }
  },
})
```
参考：`~/project/dsh-github-trending/client.js`（slots/locale 用法）、`~/project/dsh-comfyui/client.js`（fetch、样式）。

### 8.2 UI

侧边栏图标 + 全宽主面板。顶部：标题、状态胶囊（NapCat / Koishi / 机器人）。主内容 4 个 Tab：

1. **概览**：两张状态卡（NapCat、Koishi）+ 一键启动全部/停止全部；未安装时显示安装向导按钮
2. **插件**：Koishi 插件表格（名称、版本、状态开关、卸载）；安装输入框；重启按钮
3. **功能**：Feature 卡片列表（标题/描述/操作按钮），底部提示“其他 DSH 插件可通过 inject: ['qqbot'] 扩展”
4. **日志**：来源切换（koishi/napcat）、刷新、等宽日志区

交互：
- 挂载时拉 `/qqbot/status`，之后每 4s 轮询；操作后立即刷新
- 所有 POST 用 JSON；按钮 loading 禁用；错误显示在顶部横幅
- 客户端不硬编码端口/路径，全部用 status 数据
- 样式：注入一份 `<style>`（前缀 `qqbot-`），使用 `--dsw-alias-*` 语义 token；支持深浅色；不引入第三方库
- 可访问性：按钮 aria-label；Tab 支持键盘切换（Enter/Space）

### 8.3 测试钩子（必须实现，供 smoke 测试）

- 面板根节点 `data-testid="qqbot-panel"`
- 状态胶囊：`data-testid="qqbot-pill-napcat" | "qqbot-pill-koishi" | "qqbot-pill-bot"`
- 操作按钮：`data-testid="qqbot-action-<action-id>"`（如 `qqbot-action-all-start`、`qqbot-action-all-stop`、`qqbot-action-napcat-install`、`qqbot-action-napcat-configure`、`qqbot-action-napcat-start`、`qqbot-action-koishi-start`、`qqbot-action-koishi-restart`）
- Tab：`data-testid="qqbot-tab-overview" | "qqbot-tab-plugins" | "qqbot-tab-features" | "qqbot-tab-logs"`
- 插件行：`data-testid="qqbot-plugin-row"` + `data-key`
- 日志：`data-testid="qqbot-logs"`

### 8.4 `scripts/smoke-client.mjs`

仿 `~/project/dsh-comfyui/scripts/smoke-panel.mjs`：
- React 替身（createElement/useState/useEffect/useMemo/useCallback/useRef）
- 假 `window.__ModuleLoader__` / `document` / `fetch`
- 加载 `../client.js`，执行 factory，得到 `{inject, apply}`
- 用假 ctx（effect 立即执行、slots.inject/register 记录）执行 apply
- 断言：注册了 `main` 与 `sidebar.panellist`；render 主面板后存在 `qqbot-panel`、状态胶囊、Tab
- 用假 status 数据渲染（mock fetch 返回 `/qqbot/status`）
- 输出 `client smoke: ok`

## 9. 测试与验收

- `node --test test/*.test.js`
- `node scripts/smoke-host.mjs`：假 ctx 收集路由/工具，真实 HTTP server 调 `GET /qqbot/status`、`GET /qqbot/features`、`GET /qqbot/koishi/plugins`，断言 200 + 结构
- `node scripts/smoke-client.mjs`
- 不触碰真实进程；只读取真实环境
- 全部通过后由 Lead 集成、类型检查（node --check）、写入 profile、更新文档

## 10. 交付约束

- ESM（`type: module`），Node 内置模块，无运行时依赖
- 代码风格：2 空格缩进、无分号、单引号；JSDoc 说明非显然契约
- 错误信息面向用户：中文优先，必要时中英并列
- 不引入 shell 注入风险；不记录 token 明文
- 提交前 Lead 会运行全部测试与 smoke
