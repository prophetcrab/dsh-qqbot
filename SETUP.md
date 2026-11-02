# 安装与运行

> 当前分支 `refactor/v2` 仅支持 macOS（Apple Silicon）。

## 1. 安装插件

```bash
cd ~/project/dsh-qqbot
node scripts/install-profile.mjs --profile desktop --install
```

脚本会：

1. 把 `dsh-qqbot` link 到 DSH profile
2. 加入 `dsh.profile.bundles`
3. 写入 `cordis.patch.yml` 插件行
4. 执行 `pnpm install`

重启/热加载 DSH 后，侧边栏出现 **QQ 机器人**。

## 2. 首次启动

插件会自动：

- 从 `template/` 创建 `~/project/qq-bot`
- 解压 Koishi 离线依赖
- 从 `vendor/napcat/payload/NapCat.Shell-4.18.42.zip` 离线安装 NapCat
- 写入 OneBot 反向 WS 配置

NapCat 安装需要一次 macOS 管理员授权。

## 3. 登录

1. 打开面板「概览」
2. 点「启动全部」或分别启动 NapCat / Koishi
3. 用手机 QQ 扫描面板二维码
4. 登录后机器人状态变为在线

## 4. 配置

### 权限

面板「权限」页：

- 接收群聊：白名单 / 黑名单 / 全部
- 发送群聊：同上
- 静默模式：只有 `/` 指令或 @机器人 才处理

写入：

```text
~/project/qq-bot/data/access.json
```

Koishi `access-control` 立即读取。

### AI

面板「AI」页：

- 回复概率、跟进分钟数、上下文条数、批量窗口
- 人设卡 / 预设卡
- 人物画像
- 完整提示词预览

写入 `data/ai-settings.json`、`data/persona*.json`、`data/profiles.json`。

### Koishi 插件

面板「插件」页读取/修改：

```text
~/project/qq-bot/koishi.yml
```

支持启用/禁用、npm 安装、卸载。

## 5. 故障排查

| 现象 | 检查 |
| --- | --- |
| NapCat 未安装 | 看 `vendor/napcat/payload` 是否存在；看 macOS 管理员授权 |
| 二维码不显示 | NapCat 是否运行；端口 6099 |
| 机器人离线 | Koishi 5140、OneBot 反向 WS `/onebot` |
| 权限不生效 | `data/access.json` 是否写入；Koishi access-control 是否启用 |
| AI 不可用 | DSH 是否运行；`ai.json` endpoint |
| 面板不更新 | 刷新 DSH 页面；检查插件是否重载 |

## 6. 开发校验

```bash
npm test
npm run build:client
npm run smoke:host
npm run smoke:client
npm run check:architecture
npm run offline:verify
```
