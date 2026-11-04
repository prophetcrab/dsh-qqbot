# 0009 - Feature Flow and Release Convention

## Status

Accepted. Complements [0008](0008-main-guidance-only.md) and
[0007](0007-multiplatform-branch-strategy.md).

## Decision

功能开发以 macOS 分支为主线；Windows 分支主要做功能同步和平台适配；两个平台独立发布，版本号不要求同步；`main` 只做开发导航和管理。

```text
main          导航 / 决策 / 路线图 / release metadata，不放插件代码
dshbot-mac    功能开发主线（upstream feature branch）
dshbot-win64  同步 mac 功能 + Windows 平台适配（downstream platform branch）
feature/*     从对应平台分支拉出的短期功能分支
```

## Feature Flow

1. 新功能先在 `dshbot-mac` 开发；平台无关的改动尽量独立成 commit。
2. `dshbot-win64` 从 mac 同步功能，只做 Windows 平台适配，不反向在 win 分支独立开发跨平台功能。
3. 同步方式：
   - 平台无关的 commit 使用 `git cherry-pick -x`；
   - 涉及多个文件的 feature 可以先在 mac 上整理成干净 commit，再 cherry-pick；
   - 不直接整分支 merge `dshbot-mac`，避免把 macOS 平台代码、payload 和本地 NapCat 后端带回 win 分支。
4. 共享 bug 优先在 mac 修复，再同步到 win；Windows 专属 bug 在 win 修复。
5. `main` 只接收文档、决策、路线图和 release metadata，不接收代码变更；也不把 `main` 整体 merge 回平台分支。

## Windows Synchronization Rules

`dshbot-win64` 在同步 mac 功能时必须保留 Windows 分支边界：

```text
不重新引入 host/platform/mac/
不重新引入 macOS 本地 NapCat 后端/离线安装器
不重新引入 vendor/napcat/
不重新引入 node_modules-darwin-*.tar.gz
Windows 默认 NapCat 后端保持 docker
```

如果 mac 分支的 feature commit 同时包含共享代码和 macOS 专属改动，应先拆分或只 cherry-pick 共享部分；无法拆分时，在 win 分支合并后删除 macOS 专属文件/资源再提交。

## Release Convention

两个平台独立打包、独立发布，版本号可以不同步。

```text
dshbot-mac    tag: vX.Y.Z          asset: dsh-qqbot-X.Y.Z-macos-arm64.tgz
dshbot-win64  tag: vX.Y.Z-win64    asset: dsh-qqbot-X.Y.Z-windows-x64.tgz
```

- 每个平台分支的 `package.json` 版本以本分支发布版本为准；
- release notes 采用相同结构：Highlights / Fixes / Requirements / Validation / Upgrade Notes / Asset / Docker or Runtime details；
- 版本号可以独立递增，例如 mac `v0.7.0`、win `v0.7.0-win64` 或后续各自 `v0.8.0` / `v0.8.0-win64`；
- `main` 只记录 release 索引、资产链接和校验和，不保存二进制。

## Release Quality

发布的包必须保证安装简洁、可用：

- 平台运行时依赖随包提供（win: `node_modules-win32-x64.tar.gz`；mac: darwin bundle）；
- 不包含开发测试、临时数据、`node_modules`、macOS 资源混入 Windows 包；
- release 前必须在干净 profile 上验证：安装插件 → 一键安装并配置 → 启动 Koishi/NapCat → 扫码登录；
- Windows release 需验证 Docker Desktop/WSL2 前置、镜像拉取、容器重建后登录态保留；
- release notes 必须写清资产名、sha256、平台要求和外部依赖（Docker 镜像/网络/QQ 扫码）；
- 未通过平台验证的包不发布正式 release。

## CI

- `main`: 文档/链接/decision 检查；
- `dshbot-mac`: macOS runner + mac tests；
- `dshbot-win64`: Windows runner + win tests；
- 平台分支保留自己的 CI workflow；`main` 不跑插件代码测试。
