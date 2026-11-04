# 安装与运行（Windows）

> 当前分支 `dshbot-win64`，只包含 Windows 代码与资源。NapCat/QQ 运行在 Docker 容器里；
> Koishi 运行在宿主机。macOS 代码在 `dshbot-mac`。

## 0. 前置条件

- Windows 10/11 x64
- Docker Desktop（含 WSL2 后端）已安装
- DeepSeek Harness 已安装并能正常启动 Web 面板
- Node.js 22.19+ 或 24+

首次拉取 `mlikiowa/napcat-docker` 需要网络；国内网络请在 Docker Desktop 配置代理或镜像源。

## 1. 安装插件

```powershell
cd $HOME\project\dsh-qqbot
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
- 解压内置 Koishi 依赖 `node_modules-win32-x64.tar.gz`（无需 npm/网络）
- 确保 Docker Desktop/Engine 就绪，拉取并启动 NapCat 容器
- 写入 OneBot 反向 WS 配置（容器通过 `host.docker.internal` 连回 Koishi）

不需要在 Windows 主机上安装 QQ 或 NapCat，也不需要管理员授权。

## 3. 登录

1. 打开面板「概览」
2. 点「启动全部」或分别启动 NapCat / Koishi
3. 用手机 QQ 扫描面板二维码（或容器 WebUI）
4. 登录后机器人状态变为在线

## 4. 配置

### 权限

面板「权限」页：

- 接收群聊：白名单 / 黑名单 / 全部
- 发送群聊：同上
- 静默模式：只有 `/` 指令或 @机器人 才处理

写入：

```text
~/project/qq-bot/data/config/access.json
```

Koishi `access-control` 立即读取。

### AI

面板「AI」页：

- 回复概率、跟进分钟数、上下文条数、批量窗口
- 人设卡 / 预设卡
- 人物画像
- 完整提示词预览

写入 `data/config/ai-settings.json`、`data/config/persona*.json`、`data/assets/profiles.json`。

### Koishi 插件

面板「插件」页读取/修改：

```text
~/project/qq-bot/koishi.yml
```

支持启用/禁用、npm 安装、卸载。

## 5. 故障排查

| 现象 | 检查 |
| --- | --- |
| Docker 未运行 | 启动 Docker Desktop；确认 `docker info` 可用；WSL2 正常 |
| NapCat 容器未启动 | `docker compose -f <dataDir>/compose.yaml logs`；端口 6099 |
| 二维码不显示 | NapCat 容器是否运行；`127.0.0.1:6099` WebUI |
| 机器人离线 | Koishi 5140、OneBot 反向 WS `/onebot` |
| 权限不生效 | `data/config/access.json` 是否写入；Koishi access-control 是否启用 |
| AI 不可用 | DSH 是否运行；`data/state/ai.json` endpoint |
| 面板不更新 | 刷新 DSH 页面；检查插件是否重载 |

## 6. 开发校验

```powershell
npm test
npm run build:client
npm run smoke:host
npm run smoke:client
npm run check:architecture
npm ci --prefix template
npm run test:template
```
