# 开发与发布约定

> 本文件属于 `main` 分支，只描述协作规则；插件代码、测试和构建命令在平台分支中。

## 分支职责

```text
main          导航 / 决策 / 路线图 / release metadata
dshbot-mac    功能开发主线（upstream）
dshbot-win64  同步功能 + Windows 平台适配（downstream）
feature/*     短期功能分支，从所属平台分支创建
fix/*         短期修复分支
```

## 功能流

1. 新功能先在 `dshbot-mac` 开发。
2. `dshbot-win64` 从 mac 同步共享功能；Windows 专属部分只做平台适配。
3. 平台无关的 commit 使用 `git cherry-pick -x`；不直接整分支 merge `dshbot-mac`。
4. 共享 bug 先在 mac 修复再同步；Windows 专属 bug 在 win 修复。
5. 不向 `main` 提交代码；`main` 的 PR 只改文档、决策、路线图和发布记录。
6. 不把 `main` 整体 merge 回平台分支；需要导航文档时按路径同步：

   ```bash
   git checkout main -- docs/ README.md CONTRIBUTING.md releases/
   ```

## Windows 同步边界

`dshbot-win64` 在同步 mac 功能时保留：

```text
host/platform/win/
Docker 后端
win32-x64 运行时依赖
```

不得重新引入：

```text
host/platform/mac/
macOS 本地 NapCat 后端/离线安装器
vendor/napcat/
node_modules-darwin-*.tar.gz
```

如果 mac commit 混合了共享代码和 macOS 专属改动，先拆分或只 cherry-pick 共享部分；无法拆分时，在 win 分支合并后移除 macOS 专属文件再提交。

## 发布

两个平台独立发布，版本号不要求同步：

```text
dshbot-mac    tag: vX.Y.Z          asset: dsh-qqbot-X.Y.Z-macos-arm64.tgz
dshbot-win64  tag: vX.Y.Z-win64    asset: dsh-qqbot-X.Y.Z-windows-x64.tgz
```

发布包必须安装简洁、可用，并满足：

- 平台运行时依赖随包提供；
- 不混入其他平台资源；
- 干净 profile 验证「安装插件 → 一键安装并配置 → 启动 → 扫码登录」；
- release notes 写清资产名、sha256、平台要求、Docker/运行时依赖；
- 未通过平台验证不发正式 release。

发布后把版本、tag、资产名、sha256 和链接记录到 `releases/`。

## 文档变更

- 架构决策新增为 `docs/decisions/NNNN-<title>.md`；
- 路线图更新写入 `docs/roadmap/README.md`；
- 发布记录写入 `releases/`；
- `main` 不添加代码、构建产物或二进制资产。
