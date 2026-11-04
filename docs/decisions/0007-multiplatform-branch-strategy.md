# 0007 - Multi-platform Branch Strategy

> **Superseded in part by [0008](0008-main-guidance-only.md).** `main` will become
> a guidance-only branch; platform branches no longer merge `main` wholesale.
> The branch names and platform-isolation principles below remain valid.

## Decision

`main` 是唯一的稳定/发布分支。平台开发放在长期平台分支：

```text
main              稳定集成、发布、打 tag
dshbot-mac        macOS 开发
dshbot-win64      Windows 开发
feature/*          临时功能分支
```

## Branch Rules

- 新平台分支从 `main` 创建，不从另一个平台分支创建。
- 平台功能先在对应平台分支开发。
- 平台分支定期合并 `main`，保持同步。
- `main` 只接收通过对应平台验证的合并。
- 正式 tag 只从 `main` 创建。
- 发布版本号在 `main` bump，发布后同步回各平台分支。
- 不创建 `main-mac`、`main-win64` 这类长期平台主线。

## Release Shape

一个正式 tag，挂多个平台资产：

```text
v0.7.0
  ├─ dsh-qqbot-0.7.0-macos-arm64.tgz
  └─ dsh-qqbot-0.7.0-windows-x64.zip
```

Windows 首版未稳定时可以使用独立 prerelease tag，但最终收敛到统一正式 tag。

## Platform Isolation

Windows 适配前先把平台差异收口到：

```text
host/platform/
  index.js
  macos.js
  win32.js
```

平台差异包括：

```text
路径
NapCat 安装位置
QQ 进程管理
离线 payload
打包格式
```

业务代码不直接散落 `process.platform` 判断。

## Flow

```text
dshbot-mac   → main
dshbot-win64 → main
main         → tag / release
main         → merge back to platform branches
```
