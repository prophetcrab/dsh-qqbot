# 发布记录

`main` 只保存发布索引和校验信息，不保存二进制资产。资产在对应平台的 GitHub Release 中。

| 平台 | 版本 | Tag | 资产 | SHA-256 |
|---|---|---|---|---|
| macOS Apple Silicon | 0.7.0 | [`v0.7.0`](https://github.com/prophetcrab/dsh-qqbot/releases/tag/v0.7.0) | `dsh-qqbot-0.7.0-macos-arm64.tgz` | `baef335d5c8d2bd17f20dad9916532cea78aeea991d8760321ec88da1cef0819` |
| Windows x64 | 0.7.0-win64 | [`v0.7.0-win64`](https://github.com/prophetcrab/dsh-qqbot/releases/tag/v0.7.0-win64) | `dsh-qqbot-0.7.0-windows-x64.tgz` | `0193ed788b02dae1d70c3f3d9ccea69f2544380cb9a1fb52b7799d9ee13e2c04` |

## Windows v0.7.0-win64

- Release page: <https://github.com/prophetcrab/dsh-qqbot/releases/tag/v0.7.0-win64>
- 平台：Windows 10/11 x64
- 外部依赖：Docker Desktop + WSL2，NapCat 镜像 `mlikiowa/napcat-docker:latest`
- 详细说明：[v0.7.0-win64.md](v0.7.0-win64.md)

## 发布规则

- 平台分支独立打 tag；Windows tag 带 `-win64` 后缀；
- 版本号不要求与 macOS 同步；
- 每个 release 记录资产名、sha256 和平台前置条件；
- 资产不提交到 `main`。
