# 离线 NapCat 包

此目录随仓库提交，供 `lib/offline.js` 在没有网络时安装 NapCat。安装前会校验
`manifest.json` 里的字节数与 SHA-256，任一不符就拒绝使用并回退到在线流程。

## 内容与来源

| 文件 | 版本 | 字节 | 来源 |
|---|---|---|---|
| `payload/NapCat.Shell-4.18.42.zip` | 4.18.42 | 35,967,555 | [NapCatQQ v4.18.42](https://github.com/NapNeko/NapCatQQ/releases/tag/v4.18.42) 的 `NapCat.Shell.zip` |
| `macos/NapCatInstaller_arm64.amd64-1.7.zip` | 1.7 | 1,101,125 | [NapCat-Mac-Installer v1.7](https://github.com/NapNeko/NapCat-Mac-Installer/releases/tag/v1.7) 的 `NapCatInstaller_arm64.amd64.zip` |

`NapCat.Shell.zip` 是跨平台包：Windows 直接解压成 `NapCat.<version>.Shell`
目录；macOS 由 `lib/offline.js` 按官方安装器的步骤复制进 QQ 容器并修补入口。

## 校验

```bash
npm run offline:verify
```

## 更新

1. 从对应 release 下载新的 zip；
2. 替换本目录下的文件，并同步修改 `manifest.json` 的 `version`、`bytes`、`sha256`；
3. 运行 `npm run offline:verify`；
4. 提交（二进制随仓库一起走，不使用 Git LFS）。

## 说明

- macOS 原生离线安装需要一次管理员授权：它会改写
  `/Applications/QQ.app/Contents/Resources/app/package.json` 的 `main`，指向
  QQ 容器里的 `loadNapCat.js`，并同步 `QQUpdate.app` 热更新包的入口。改动前会
  把原文件备份为 `package.json.bak`。
- `macos/` 下的官方安装器只在原生安装失败（例如拒绝授权）时兜底；它自身仍会
  联网下载 NapCat，因此不是严格离线。
- 这里只收录官方 release 的原始二进制，不做任何修改。
