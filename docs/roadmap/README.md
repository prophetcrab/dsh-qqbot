# 路线图

`main` 只记录方向，不记录具体代码实现；实现进度以平台分支为准。

## 当前状态

```text
macOS    v0.7.0          功能开发主线
Windows  v0.7.0-win64    Windows/Docker 分支，已发布首个 v0.7.0 包
main     guidance-only   导航、决策、发布元数据
```

## 近期方向

- 以 macOS 分支作为功能上游，持续开发群聊、AI、小游戏和工具能力；
- Windows 分支按需同步共享功能，并保持 Docker/NapCat 平台适配；
- 先行把 Windows v0.7.0 之后的共享修复 cherry-pick 回 macOS 分支，减少分叉（见 [0009](../decisions/0009-feature-flow-and-release-convention.md)）；
- 维持 Windows 分支不包含 macOS 平台代码、payload 和 darwin 运行时资源；
- 发布保持平台独立，版本号按各自节奏推进。

## 服务器版本

规划两个形态，共用一个服务器端运行时，详见 [0010-server-editions](../decisions/0010-server-editions.md)：

### A. 全量服务器版

```text
浏览器 → 服务器 DSH Host + 插件 + Koishi + NapCat + 数据
```

### B2. 远程 UI 版

```text
桌面 DSH → 最小远程插件 → 服务器全量运行时
```

B2 的安全边界：服务器不能反向操作桌面；桌面只做 outbound 连接和远程 UI。

## 暂缓 / 未承诺

以下 Windows 候选能力暂不排期：

- 扫码后后台自动写入 OneBot 配置和同步 selfId；
- NapCat Docker 镜像离线 tar 导入；
- 安装器自动安装/修复 Docker Desktop。

## 文档维护

- 新增架构决策：`docs/decisions/`，并更新决策索引；
- 更新路线图：本文件；
- 更新发布记录：`releases/`；
- 平台分支文档只保留平台运行说明，项目级架构以 `main` 为准。
