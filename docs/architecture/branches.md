# 分支对比与同步状态

更新时间：2026-11-05。分支头以远端实际状态为准。

## 1. 总览

| 分支 | 角色 | 代码 | 平台 | 当前版本 / release |
|---|---|---|---|---|
| `main` | 导航与管理 | 无插件代码 | 无 | 只记录发布元数据 |
| `dshbot-mac` | macOS 功能开发主线 | 完整 macOS 代码 | `host/platform/mac`，Docker/Linux QQ | `v0.7.1` |
| `dshbot-win64` | Windows 代码分支 | 完整 Windows 代码 | `host/platform/win`，Docker/Linux QQ | `v0.7.0-win64` |

分支头会随提交变化，以 `git log` / GitHub 实际状态为准。

## 2. 能力对比

| 能力 | `dshbot-mac` | `dshbot-win64` |
|---|---|---|
| 平台实现 | `host/platform/mac` | `host/platform/win` |
| NapCat 后端 | Docker `mlikiowa/napcat-docker` | Docker `mlikiowa/napcat-docker` |
| QQ 安装 | 不修改本机 QQ | Linux QQ 在容器内，主机不装 QQ |
| 离线资源 | darwin 运行时包 | `node_modules-win32-x64.tar.gz` |
| 插件包资产 | `...-macos-arm64.tgz` | `...-windows-x64.tgz` |
| 面板平台提示 | macOS | Windows |
| CI | macOS runner | Windows runner |
| 文档状态 | 项目级文档已同步 main；保留 macOS 平台说明 | 项目级文档已同步 main；保留 Windows 运行文档 |

## 3. 当前同步状态

### 已对齐

- 共享代码基线来自同一个 v0.7.0 主历史；
- macOS 与 Windows 分支现在都使用 Docker NapCat 后端；macOS 不再修改本机 QQ.app；
- Windows 分支保留 `host/platform/common` 共享实现，平台差异收口到 `host/platform/win`；
- 两平台 release 说明采用相同结构，版本号独立。

### 尚未对齐

- `dshbot-mac` 包含 `host/platform/mac`、Docker NapCat 后端和 darwin runtime bundle；本机 QQ 不再被修改。
- macOS 已移植 Windows 分支的 Docker NapCat 管理模块并适配 OrbStack；两边都保留各自的平台层和运行时依赖，Docker 生命周期不再只属于 win 分支。
- 平台分支的 root README/SETUP/CONTRIBUTING 保留平台运行细节；项目级架构、决策和发布记录以 `main` 为权威，平台分支中的副本是同步快照。
- Windows 分支中 `f979045` 是 v0.7.0-win64 release tag，分支头还包含发布后的 CI 修复和导航/发布文档，不等于 release 资产内容。

## 4. 后续同步建议

1. 先把 Windows 分支的**共享修复** cherry-pick 回 `dshbot-mac`，不要带入 Windows 平台层；
2. 在 mac 上继续功能开发，按 0009 把平台无关 commit 单独整理；
3. win 分支只 cherry-pick 共享 commit，并保留 Windows 平台边界；
4. 两个分支各自发布，tag 和版本独立；
5. 不在平台分支之间整体 merge。

## 5. 服务器分支规划

未来服务器版预计新增长期 Linux 分支（例如 `dshbot-linux`），承载：

- 服务器版 A：全量 DSH Host + Koishi + NapCat；
- 服务器版 B2：同一套服务器运行时 + 桌面最小远程 UI 插件。

服务器分支的代码从 `dshbot-mac` 的共享功能派生，平台适配只落在 Linux/server 层；具体边界见 [0010](../decisions/0010-server-editions.md)。
