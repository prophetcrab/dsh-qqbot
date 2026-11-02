# dsh-qqbot 长期开发约定

> 这份文档约束未来的分支、目录、插件、配置、契约、测试和发布流程。  
> 目标：长期加功能后，仍然能一眼看懂代码归属，不重新变成单体项目。

## 1. 开发主线和目录

当前只有两个需要长期维护的目录：

```text
/Users/crab/project/dsh-qqbot       DSH 插件（主开发）
  branch: dshbot-mac
  version: 0.4.4

/Users/crab/project/qq-bot          Koishi 实际运行时（模板来源）
  branch: main
  version: 0.1.0
```

旧 worktree 不再开发：

```text
/Users/crab/project/dsh-qqbot-v2   refactor/v2，历史重构分支
/Users/crab/project/qq-bot-v2      refactor/v2，历史重构分支
```

规则：

- 新功能只改 `dsh-qqbot` 和 `qq-bot`。
- 不再在 `*-v2` worktree 里开发。
- `dshbot-mac` 当前是 macOS 开发主线；`refactor/v2` 不再接收新提交。
- `qq-bot/main` 是 Koishi 运行时的唯一主线。
- 不允许把 `~/.dsh/profiles/*` 当源码修改；Profile 只通过安装脚本管理。

## 2. 分支约定

### dsh-qqbot

```text
dshbot-mac          当前开发主线
feat/<topic>        新功能
fix/<topic>         修复
chore/<topic>       构建/文档/依赖
refactor/<topic>    结构性重构
```

- 功能分支从 `dshbot-mac` 开。
- 合并前必须 fast-forward 或 squash 到 `dshbot-mac`。
- 禁止在 `dshbot-mac` 上直接做大范围重构。
- 一个分支只做一件事；不要同时重构 + 加玩法 + 换 UI。

### qq-bot

```text
main                唯一运行时主线
feat/<topic>
fix/<topic>
```

- Koishi 插件改动必须先进入 `qq-bot/main` 并跑测试。
- 然后通过模板同步流程更新 `dsh-qqbot/template`。

## 3. 三端边界

| 端 | 只负责 | 禁止 |
| --- | --- | --- |
| NapCat | QQ 登录、协议、OneBot、WebUI | 业务逻辑、AI、权限 |
| Koishi | 消息、权限、触发、上下文、业务插件、发送 | QQ 协议、QQ 注入、模型调用 |
| DSH | 安装/启停、控制面、AI 网关、人设/画像、面板 | QQ 消息循环、权限执行 |

具体规则：

- `host/services/napcat` 之外的代码不得直接操作 QQ 进程、QQ 容器、WebUI。
- `host/services/koishi` 之外的代码不得直接 spawn Koishi 或解析 Koishi 进程。
- Koishi 插件不得直接调用 DSH LLM；只能调用 `/qqbot/ai/chat` 契约。
- DSH 不得直接解析 OneBot 消息；消息来自 Koishi health API。
- AI 触发、上下文、图片、引用留在 Koishi；模型、人设、画像、自检留在 DSH。

## 4. DSH 目录规则

```text
index.js                 只组装，<=80 行
host/kernel/             插件注册和贡献点
host/contracts/          HTTP/插件契约
host/platform/mac/       平台路径/进程/端口/能力
host/services/           业务服务，不得依赖 plugins/client
host/plugins/            能力插件，index.js <=80 行
client/                  Client 源码
scripts/                 构建/校验/安装/冒烟
test/                    测试
template/                生成物，不手工改
vendor/napcat/           离线二进制资产
```

依赖方向：

```text
contracts ← platform ← services ← plugins ← kernel ← index.js
client/runtime ← client/components ← client/plugins ← client/index.js
```

硬规则：

- 禁止 `index.js` 被任何模块 import。
- 禁止 `host/plugins/a` import `host/plugins/b`。
- 禁止 `host/services` import `host/plugins`。
- 禁止 `client` import `host`。
- 禁止 `process.platform` 出现在 `host/platform/` 之外。
- 普通源码文件 <=500 行；入口 <=80 行。
- 有循环依赖直接拒绝合并。

## 5. 新增 DSH 能力

新增能力必须是一个 host plugin：

```text
host/plugins/<name>/
├── index.js       # manifest + apply，<=80 行
├── routes.js      # HTTP 输入/输出
├── tools.js       # Agent 工具
├── feature.js     # Feature 卡片
└── service.js     # 可选，复杂逻辑
```

manifest 至少声明：

```js
export const name
export const version
export default {
  id: 'qqbot-<name>',
  name,
  version,
  inject: [...],
  provides: [...],
  apply(api) { ... },
}
```

要求：

- 只通过 `api.registerRoute/tool/feature/statusProvider/clientTab/provide` 暴露能力。
- 卸载插件时，所有贡献必须一起消失。
- 不允许在插件里直接读 `~/project/qq-bot/data`；通过对应 service。
- 页面不新增硬编码 Tab；通过 clientTab 注册。

## 6. Koishi 插件规则

每个插件：

```text
plugins/<name>/
├── index.ts       # 编排
├── config.ts      # Schema
├── types.ts
└── 可选子模块
```

规则：

- 插件必须有 `name`、`Config`、`apply`。
- 通过 `inject` 声明依赖。
- 插件之间只通过 `ctx.qqbot.*` 服务通信。
- 禁止 `plugins/ai/trigger.ts` import 另一个插件的内部文件。
- 新玩法只新增 `plugins/games/<name>`，不修改 `ai-chat`。
- 业务插件不得直接操作 DSH 文件系统；通过 HTTP 契约。
- AI 触发/上下文/批量/图片属于 Koishi；不要移到 Host。

## 7. 配置与数据归属

| 数据 | Owner | 规则 |
| --- | --- | --- |
| 端口、路径、安装、离线包 | DSH Host | 只写在 cordis 配置 |
| Koishi 插件树 | Koishi Loader | 只通过插件管理 API 修改 |
| 权限策略 | Koishi access-control | DSH 写文件，Koishi 执行 |
| AI 触发/批量 | Koishi ai-chat | 面板可编辑，单一文件 |
| 模型/人设/画像 | DSH | 只通过 Host API |
| NapCat OneBot 配置 | DSH NapCat Adapter | 通过 WebUI/配置文件 |
| 游戏状态 | 对应 Koishi 游戏插件 | 插件自己管理 |

禁止：

- 同一个设置同时在 `koishi.yml`、`data/*.json`、面板里各写一份。
- 在代码里硬编码第二个默认值。
- 把 secrets、token 写进日志或状态响应。
- 把 `data/` 当源码提交。

未来 `data/` 目标：

```text
data/
├── config/
├── state/
├── assets/
└── logs/
```

迁移完成前继续兼容旧路径，但新代码不再新增散落文件。

## 8. 契约规则

所有跨端请求/响应必须经过 `host/contracts/`：

```text
ai-chat.schema.json
status.schema.json
panel.schema.json
config.schema.json
plugin-manifest.schema.json
```

修改契约必须同时：

1. 更新 schema
2. 更新 normalize/validate
3. 增加契约测试
4. 保持旧版本兼容，或提升 `apiVersion`
5. 更新文档

禁止：

- 只改 Host 不改 Koishi
- 只改 Koishi 不改 Host
- 悄悄增加字段并假设对方会读
- 把内部字段透传给客户端

## 9. 测试门槛

### dsh-qqbot

```bash
npm run check
```

等价于：

```text
npm test
build:client
smoke:host
smoke:client
check:architecture
offline:verify
```

### qq-bot

```bash
npm test
npx tsc --noEmit
```

### 涉及 UI

- `client.js` 必须由 `client/` 生成，禁止手改产物。
- 保留全部 data-testid、路由、中文/英文 key。
- Client smoke 必须通过。

### 涉及 AI

- 契约测试必须覆盖成功、skip、BUSY、旧请求（如 `quote:null`）。
- 不能把模型错误原文直接发群；使用结构化错误码。

### 涉及安装/离线

- `offline:verify` 必须通过。
- `npm pack --dry-run` 必须包含 `vendor/`、`template/`、`host/`。
- 不能引入在线下载 NapCat。

## 10. 模板同步

`dsh-qqbot/template` 是 `qq-bot` 的副本，不手工改。

流程：

1. 在 `qq-bot/main` 完成插件改动并测试。
2. 同步到 `dsh-qqbot/template`：

```bash
cd ~/project/qq-bot
rsync -a --delete \
  --exclude node_modules --exclude data --exclude logs \
  --exclude runtime --exclude runtime-bundles --exclude .git \
  ./ ~/project/dsh-qqbot/template/
```

3. 确认 `diff -rq` 无差异。
4. 在 dsh 仓库跑 `npm run check`。
5. 一起提交，不单独提交 template。

未来必须补 CI 漂移检查；当前先人工对比。

## 11. 发布流程

只从稳定分支发布。

1. 工作区干净，分支 fast-forward 到最新。
2. bump `package.json` 版本。
3. 跑 `npm run check`。
4. `npm pack`。
5. 打 tag：

```text
vX.Y.Z
```

6. GitHub Release 标题：

```text
dsh-qqbot vX.Y.Z (macOS Apple Silicon)
```

7. 资产名：

```text
dsh-qqbot-X.Y.Z-macos-arm64.tgz
```

8. 触发商店索引刷新。
9. Release 说明写清：

```text
- macOS Apple Silicon only
- 需要 DSH 版本范围
- 需要 QQ.app 与管理员授权
- 首次扫码
```

禁止：

- 复用已发布 tag
- 改已发布资产内容
- prerelease 当 stable 发
- 未跑测试就发布

## 12. 安全约定

- 新安装默认权限必须失败关闭：白名单 + 空名单。
- 任何 token 不得出现在日志、状态、错误、Release 说明。
- 外部命令必须使用 argv 数组，不拼 shell。
- 安装/升级 NapCat 必须校验 size + SHA-256。
- 模型服务繁忙不得把原始上游错误发群。
- 不自动执行用户未确认的管理员级操作。

## 13. Definition of Done

一个改动只有同时满足以下条件才算完成：

```text
[ ] 改动范围单一
[ ] 目录/分层符合本约定
[ ] 没有跨层/跨插件 import
[ ] 没有新增硬编码配置来源
[ ] 契约同步更新
[ ] 测试/类型检查通过
[ ] Host/Client 冒烟通过
[ ] 离线校验通过（涉及安装时）
[ ] 模板同步（涉及 qq-bot 时）
[ ] 文档/Release 说明更新
[ ] 工作区干净
```

## 14. 结构变更

涉及以下内容时必须先写 ADR/文档，再改代码：

- 新分层
- 新契约
- 新配置来源
- 新仓库或拆包
- 数据格式迁移
- 平台支持范围变化

ADR 放：

```text
docs/decisions/NNNN-<title>.md
```

## 15. 当前已知技术债

```text
[ ] client Tab 仍是静态注册，外部动态 Tab 未实现
[ ] data/ 尚未迁移到 config/state/assets
[ ] template 同步尚未 CI 化
[ ] 新安装权限默认仍是 all，需要改为 whitelist 空名单
[ ] 仅支持 Apple Silicon macOS
```

这些不阻塞当前开发，但新功能不应扩大这些债务。
