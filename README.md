# dsh-qqbot

DeepSeek Harness 的 QQ 机器人插件项目。仓库按平台拆分：**此分支只做开发导航、架构决策、路线图和发布记录，不包含插件代码。**

## 分支模型

| 分支 | 职责 |
|---|---|
| [`dshbot-mac`](https://github.com/prophetcrab/dsh-qqbot/tree/dshbot-mac) | macOS 功能开发主线（upstream feature branch），包含完整 macOS 代码与资源 |
| [`dshbot-win64`](https://github.com/prophetcrab/dsh-qqbot/tree/dshbot-win64) | Windows 代码分支（downstream platform branch），负责同步 mac 功能并做 Windows/Docker 适配 |
| `main`（本分支） | 导航、决策、路线图、release metadata；不挂插件本体代码 |
| `feature/*` / `fix/*` | 从所属平台分支拉出的短期分支 |

## 约定

1. **功能开发在 `dshbot-mac` 进行。**
2. `dshbot-win64` 只同步功能并做平台适配，不独立开发跨平台功能。
3. 平台无关的 commit 用 `git cherry-pick -x` 从 mac 同步到 win；不整分支 merge，避免把 macOS 平台代码/资源带回 Windows 分支。
4. macOS 和 Windows 独立打包、独立发布，版本号不要求同步。
5. `main` 只接收文档、决策、路线图和发布元数据，不接收代码；也不把 `main` 整体 merge 回平台分支。

详细规则见 [0009 - Feature Flow and Release Convention](docs/decisions/0009-feature-flow-and-release-convention.md) 和 [0008 - main as Guidance-Only Branch](docs/decisions/0008-main-guidance-only.md)。

## 从这里开始

- [开发与发布约定](CONTRIBUTING.md)
- [架构决策记录](docs/decisions/)
- [路线图](docs/roadmap/README.md)
- [发布记录](releases/README.md)
- [事件运行时架构计划](docs/decisions/0001-event-runtime-plan.md)
- [群聊监听状态机图](docs/design/group-listener-state-machine.html)

## 发布

| 平台 | 版本 | Tag | 资产 |
|---|---|---|---|
| macOS Apple Silicon | v0.7.0 | [`v0.7.0`](https://github.com/prophetcrab/dsh-qqbot/releases/tag/v0.7.0) | `dsh-qqbot-0.7.0-macos-arm64.tgz` |
| Windows x64 | v0.7.0-win64 | [`v0.7.0-win64`](https://github.com/prophetcrab/dsh-qqbot/releases/tag/v0.7.0-win64) | `dsh-qqbot-0.7.0-windows-x64.tgz` |

发布资产、校验和与平台要求见 [releases/README.md](releases/README.md)。
