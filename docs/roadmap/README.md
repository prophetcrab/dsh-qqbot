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
- 维持 Windows 分支不包含 macOS 平台代码、payload 和 darwin 运行时资源；
- 发布保持平台独立，版本号按各自节奏推进。

## Windows 后续可选项

以下能力尚未实现，属于候选方向，不是当前发布的承诺：

- 扫码后后台自动写入 OneBot 配置和同步 selfId，减少第二次点击；
- NapCat Docker 镜像离线 tar 导入，支持完全离线安装；
- 安装器预检 Docker Desktop/WSL2，并给出明确修复提示。

## 文档维护

- 新增架构决策：`docs/decisions/`
- 更新路线图：本文件
- 更新发布记录：`releases/`
