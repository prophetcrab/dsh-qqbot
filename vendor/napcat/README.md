# 离线 NapCat 包（macOS）

此目录随仓库提交。`dshbot-mac` 分支只支持 macOS，安装 NapCat 时**只使用这里的离线包，不会访问网络下载安装器**。

## 内容

| 文件 | 版本 | 字节 | 来源 |
|---|---|---|---|
| `payload/NapCat.Shell-4.18.42.zip` | 4.18.42 | 35,967,555 | [NapCatQQ v4.18.42](https://github.com/NapNeko/NapCatQQ/releases/tag/v4.18.42) 的 `NapCat.Shell.zip` |

`lib/offline.js` 会校验 `manifest.json` 中的字节数和 SHA-256，解压后复制到 QQ 容器、写入 `loadNapCat.js`，并修补 QQ 入口与热更新包。需要一次 macOS 管理员授权。

## 校验

```bash
npm run offline:verify
```
