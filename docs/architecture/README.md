# 当前架构总览

本文描述 `main` 记录的项目级架构；具体平台实现以 `dshbot-mac` / `dshbot-win64` / 未来的 server 分支代码为准。

## 1. 产品形态

| 形态 | 状态 | 进程拓扑 |
|---|---|---|
| macOS 桌面版 | 已发布 v0.7.0 | DSH Host + 本地 Koishi + macOS QQ/NapCat |
| Windows 桌面版 | 已发布 v0.7.0-win64 | DSH Host + 本地 Koishi + Docker Linux QQ/NapCat |
| 服务器版 A：全量 DSH | 规划中 | 浏览器 → 服务器 DSH Host + 插件 + Koishi + NapCat |
| 服务器版 B2：远程 UI | 规划中 | 桌面最小插件 → 服务器 DSH Host + 机器人全量运行时 |

服务器版细节见 [0010-server-editions](../decisions/0010-server-editions.md)。

## 2. 运行链路

```text
QQ
  ↕
NapCat / Linux QQ（本地或 Docker）
  ↕  OneBot 11 反向 WebSocket
Koishi / group-listener / game-core
  ↕  /qqbot/group/*、游戏/工具契约
DSH Host（kernel / services / plugins）
  ↕
DSH Client（面板）
```

当前 AI、人设、记忆、工具编排和权威业务数据在 DSH Host 侧；Koishi 负责 QQ 接入、群消息监听、命令触发和发送。服务器版 A/B2 都保持这个职责划分，只是把整套运行时搬到服务器。

## 3. Host 分层

| 层 | 职责 |
|---|---|
| `index.js` | 入口，只做组装 |
| `host/kernel` | 插件注册、贡献点、路由/工具/Feature/Tab、状态聚合 |
| `host/contracts` | status/config/panel/plugin-manifest 契约与 schema |
| `host/platform` | 路径、进程、端口、HTTP、数据布局；平台差异只在这一层 |
| `host/services` | napcat、koishi、setup、persona、profiles、access、game-core、group-loop 等业务服务 |
| `host/plugins` | 把服务暴露为 DSH 能力：路由、工具、状态 provider、Client Tab |
| `template/` | 创建 Koishi 运行时的模板，包含平台离线依赖包 |
| `client/` | 面板 UI，构建成单个 `client.js` |

依赖方向：

```text
contracts ← platform ← services ← plugins ← kernel ← index.js
client/runtime ← client/components ← client/plugins ← client/index.js
```

平台层规则：

- `process.platform` 只允许出现在 `host/platform/`；
- macOS 使用 `host/platform/mac` + 本地 QQ/NapCat；
- Windows 使用 `host/platform/win` + Docker/Linux QQ；
- 平台分支不得把另一平台的平台层、payload 或运行时依赖带回本分支。

## 4. 生命周期与数据

- `lifecycleGuard`：桌面版在 DSH 退出时停止 Koishi 和 NapCat 容器；服务器版将改为 systemd/compose 管理，DSH 重启不影响机器人。
- 数据目录：`<projectDir>/data/{config,state,assets}` 与 Docker 数据目录分离；QQ 登录态和容器数据通过 bind mount 持久化。
- 桌面版数据在本地；服务器版会把消息归档、Token 统计、群状态、玩家/游戏数据等运行时数据放到服务器，桌面远程 UI 只读/远程控制。

## 5. 发布与分支

- `main`：导航、决策、路线图、release metadata，无插件代码；
- `dshbot-mac`：macOS 功能开发主线；
- `dshbot-win64`：同步 mac 功能 + Windows/Docker 适配；
- 平台独立打包、独立版本、独立 tag。

详见 [分支对比](branches.md) 和 [0009](../decisions/0009-feature-flow-and-release-convention.md)。

## 6. 当前验证基线

- DSH Host 测试：291 个（Windows 分支当前基线）；
- Koishi 模板测试：67 个；
- Client build、host smoke、client smoke、architecture guard；
- Windows CI：`.github/workflows/checks.yml`，Windows runner；
- macOS CI：平台分支的 macOS workflow。

验证结果随平台分支和 release 更新，不在 `main` 重复记录具体运行日志。
