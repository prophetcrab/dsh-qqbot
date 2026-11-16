# 安装与运行

> 当前分支 `dshbot-mac`，仅支持 macOS（Apple Silicon）。NapCat 通过 OrbStack/Docker 运行，本机 QQ 不会被修改。

## 0. 前置依赖

安装 OrbStack：

```bash
brew install --cask orbstack
```

打开一次 OrbStack 完成初始化。

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
- 启动 OrbStack 并拉取 NapCat Docker 镜像
- 写入 OneBot 反向 WS 配置

首次使用需要安装 OrbStack（`brew install --cask orbstack`）。本机 QQ 不被修改。

生命周期：DSH 正常退出/重载插件时会停止 Koishi 与 NapCat 容器；
DSH 崩溃/被杀时由独立 watchdog 结束本项目 Koishi 进程。
若不希望崩溃时自动结束 Koishi，可设置 `lifecycleGuard: false`；正常退出/卸载
仍会停止服务。

## 3. 登录

1. 打开面板「概览」
2. 点「启动全部」或分别启动 NapCat / Koishi
3. 用手机 QQ 扫描面板二维码（Docker 内的 Linux QQ）
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

### AI / 群聊闭环

面板「AI」页：

- 群聊监听器状态、群列表与每轮 loop 摘要
- 人设卡 / 预设卡；NAME LOAD 与 SETTING LOAD 可直接编辑保存
- 人物画像、记忆和群状态

写入 `data/config/persona*.json`、`data/assets/profiles.json`、`data/state/group-loop/*`。
DSH 的 HTTP endpoint 由 `data/state/ai.json` 发布给 Koishi 插件。

### Koishi 插件

面板「插件」页读取/修改：

```text
~/project/qq-bot/koishi.yml
```

支持启用/禁用、npm 安装、卸载。

## 5. 故障排查

| 现象 | 检查 |
| --- | --- |
| NapCat 未安装 | 看 OrbStack 是否运行；看 Docker 镜像是否拉取成功 |
| 镜像拉取失败 | 检查 OrbStack Docker registry mirror（例如 `https://docker.m.daocloud.io`），确认能访问 Docker Hub |
| 二维码不显示 | NapCat 容器是否运行；端口 6099；查看容器日志 |
| 机器人离线 | Koishi 5140、OneBot 反向 WS `/onebot` |
| 权限不生效 | `data/config/access.json` 是否写入；Koishi access-control 是否启用 |
| Koishi 连不上 DSH | DSH 是否运行；`data/state/ai.json` 的 endpoint/端口 |
| 面板不更新 | 刷新 DSH 页面；检查插件是否重载 |

## 6. 开发校验

```bash
npm test
npm run test:template     # Koishi 模板测试（需先 npm ci --prefix template）
npm run build:client
npm run smoke:host
npm run smoke:client
npm run check:architecture
npm run check:template
```
