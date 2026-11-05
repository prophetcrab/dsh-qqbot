# 发布记录（macOS 分支）

平台分支各自打包、独立发布，版本号不要求同步（见
[0009](../docs/decisions/0009-feature-flow-and-release-convention.md)）。
`main` 保存项目级 release 索引与元数据，二进制资产挂在 GitHub Releases。

本分支（`dshbot-mac`）的发布：

| 版本 | Tag | 资产 |
| --- | --- | --- |
| 0.7.1 | `v0.7.1` | `dsh-qqbot-0.7.1-macos-arm64.tgz` |
| 0.7.0 | `v0.7.0` | `dsh-qqbot-0.7.0-macos-arm64.tgz` |

- 要求：macOS Apple Silicon；DSH `>=0.2.1-rc.2 <0.3.0`；`QQ.app` 与一次管理员授权；首次手机扫码登录
- Windows 发布记录见 `dshbot-win64` 分支与 `main` 的 `releases/` 目录

完整发布说明与校验和以 GitHub Releases 为准：
<https://github.com/prophetcrab/dsh-qqbot/releases>
