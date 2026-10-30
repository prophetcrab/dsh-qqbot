# 本机安装与卸载（SETUP）

> 插件支持 macOS 与 Windows：面板会自动显示平台徽章，并按平台使用对应的 NapCat 安装器、启动方式与进程管理。Linux 可运行 Koishi，但暂不支持 NapCat 自动安装。

本文按当前这台 Mac 的实际环境编写：macOS（Apple Silicon）、DSH 桌面版 `desktop` profile、QQ + NapCat 已安装、Koishi 项目在 `~/project/qq-bot`。

> 当前状态：本插件已经写入 `desktop` profile（依赖 + bundles + patch，且已 `pnpm install`，并已热加载）。
> 如果侧边栏没有「QQ 机器人」，先刷新页面（Cmd+R）；仍没有则完全退出 DSH（Cmd+Q）再打开。
> 被修改的 profile 文件已自动备份为 `package.json.bak-*` / `cordis.patch.yml.bak-*`。

## 前置状态检查

```bash
# QQ.app 是否存在
ls -d /Applications/QQ.app

# NapCat 是否安装（版本号）
cat ~/Library/Containers/com.tencent.qq/Data/Documents/napcat/package.json | head -5

# Koishi 项目是否就绪
ls ~/project/qq-bot/package.json ~/project/qq-bot/koishi.yml

# 机器人是否已经在跑
curl -s http://127.0.0.1:5140/api/qqbot/health
```

## 安装插件

```bash
cd ~/project/dsh-qqbot

# 先看会改什么
node scripts/install-profile.mjs --profile desktop --dry-run

# 写入 profile 并安装依赖
node scripts/install-profile.mjs --profile desktop --install
```

脚本会修改并备份：

- `~/.dsh/profiles/desktop/package.json`（依赖 + `dsh.profile.bundles`）
- `~/.dsh/profiles/desktop/cordis.patch.yml`（`id: qqbot` 插件行）

然后 **退出并重新打开 DeepSeek Harness**。重启后左侧边栏出现「QQ 机器人」。

## 首次使用

1. 打开「QQ 机器人」面板
2. 总览里确认状态：
   - QQ：已安装
   - NapCat：已安装（v4.x）
   - Koishi：项目存在、依赖已安装
3. 如果 NapCat 未安装：插件会自动下载并**自动打开安装器**（10 分钟内不重复弹窗；可用 `autoOpenInstaller: false` 关闭），按提示授权「App 管理」并切换入口
4. 点「启动 NapCat」；概览页会直接显示**登录二维码**，用手机 QQ 扫码即可（二维码可刷新，不需要终端）
5. 回到面板点「写入 OneBot 配置」（自动写 `ws://127.0.0.1:5140/onebot` 并热应用）
6. 点「一键启动全部」
7. 状态应显示：NapCat 运行中、Koishi 运行中、机器人在线
8. 用另一个 QQ 账号在群里发 `/echo 你好` 验证
9. 打开「权限」页：会自动拉取机器人所在的群（群名/群号/人数）和好友列表
   - 接收 → 群聊：模式改为「白名单」，勾选常用群
   - 发送 → 群聊：同样勾选允许发送的群
   - 私聊段可勾选允许的好友
   - 需要降噪时打开「安静模式」，群里只有 `/` 指令或 @机器人 才处理
   - 列表可点「刷新列表」重新拉取；读取失败通常意味着 Koishi 未运行或机器人离线

> 如果之前已经手工配置过 NapCat（本机当前就是），插件检测到已有 `koishi` 客户端后会保持幂等，不会重复添加。

## AI 聊天

机器人上线后 AI 聊天默认已启用，直接复用 DSH 当前模型（无需再填 API Key）：

1. 在权限白名单里的目标群直接说话；被 @机器人 或回复机器人必定回复，其他消息按 `replyProbability` 概率回复；对同一人回复后 3 分钟内继续跟进；同一人连续多条消息会合并为一次回复；@别人/@全体不会被当成 @机器人，但仍可能按概率/跟进自然接话
2. AI 会读取本群最近最多 100 条消息作为背景（只回复当前消息）；不同人的消息并发处理，同一人连续消息静默排队
3. 触发方式/上下文：编辑 `qq-bot/koishi.yml` 的 `./plugins/ai-chat`（`replyProbability`、`followUpMinutes`、`historyLimit`、`batchWindowMs`、`batchMaxWaitMs`）
4. 人设：DSH 面板「AI」页 →「人设卡」，编辑角色/语气/性格/行为准则/few-shot 示例并保存；它作为系统提示词第一段，保存在 `qq-bot/data/persona.json`
   - 人设卡下方可把当前人设保存成命名预设，随时加载/删除；预设保存在 `qq-bot/data/persona-presets.json`
   - 「回复设置」可调概率、跟进分钟数、上下文条数、批量去抖窗口，保存后立即生效
   - 「人物画像」可查看/编辑/删除已保存的按 QQ 号画像
5. 调整模型/提示词：在 `cordis.patch.yml` 配 `aiProvider/aiModel/aiSystemPrompt`；DSH 面板「AI 聊天」卡片可点「测试 AI」验证链路
6. 如果 AI 未接入：先确认 DSH 已配置模型（`/qqbot/ai/status` 返回 available=true），再重启 Koishi（它会重新读取 `data/ai.json`）

## Windows 安装（概要）

1. 安装 QQNT（或使用 NapCat 一键包内置的 QQ）
2. 安装 DSH 插件并重启，面板概览会显示「Windows」平台徽章
   - 插件已内置 `node_modules-win32-x64` 离线包，Windows 上创建 Koishi 项目不需要 npm/网络
3. 「一键安装并配置」会下载 `NapCat.Shell.Windows.OneKey.zip` 并运行 `NapCatInstaller.exe`
4. 安装完成后，插件自动扫描 `NapCat*.Shell` 目录；如安装在非标准目录，在 `cordis.patch.yml` 设置：
   ```yaml
   - insert:
       - id: qqbot
         name: dsh-qqbot
         config:
           qqPath: C:\Program Files\Tencent\QQNT\QQ.exe
           napcatDir: D:\NapCat\NapCat.4.18.41.Shell
   ```
5. 点「启动 NapCat」，面板显示二维码，用手机 QQ 扫码
6. 写 OneBot 配置、启动 Koishi，流程与 macOS 相同

## 日常使用

- 启动/停止：总览页「一键启动全部 / 全部停止」，或分别操作 NapCat / Koishi
- 消息监控：「消息」页同时显示目标群收到的消息（接收）和机器人发出的消息（发送）；非白名单群不会显示
- 改 Koishi 插件：
  - 在「插件」页启用/禁用、卸载，或输入 npm 包名安装
  - 勾选「操作后重启 Koishi」即可生效
  - 也可以直接用面板外的 `npm start`，插件会检测到并识别为外部运行
- 权限管理：「权限」页把真实群/好友列表列出来，勾选即可
  - 接收白名单：只处理勾选群的消息；发送白名单：只向勾选群发消息
  - 私聊段可单独勾选好友；all 模式下列表禁用
  - 安静模式：群里只有 `/` 指令或 @机器人 才处理，适合群多、消息杂的场景
  - 策略文件：`~/project/qq-bot/data/access.json`，保存后 Koishi 插件 1 秒内热加载，无需重启
- 扫码登录：概览页二维码卡片；未登录时每 2 秒自动刷新登录状态
- 看消息：「消息」页实时显示收到的群聊/私聊消息，可按群聊/私聊筛选
- 看日志：「日志」页（Koishi 托管进程）；NapCat 日志在 NapCat WebUI
- 让 Agent 操作：直接说「看一下 QQ 机器人状态」「帮我重启 Koishi」「安装 koishi-plugin-pics」

## 卸载

```bash
cd ~/project/dsh-qqbot
node scripts/install-profile.mjs --uninstall
```

然后重启 DSH。这会移除 profile 依赖、bundles 条目与 patch 行，但不会删除本插件目录，也不会删除机器人项目/数据。

## 排错

| 现象 | 处理 |
| --- | --- |
| 重启后没有「QQ 机器人」 | 检查 profile `package.json` 是否含依赖、bundles 是否含 `dsh-qqbot`、`cordis.patch.yml` 是否有 `id: qqbot`；查看 DSH 启动日志 |
| DSH 启动异常 | 用备份恢复：`package.json.bak-*` / `cordis.patch.yml.bak-*`，再重启 |
| 面板显示 NapCat 未安装但系统里有 | 检查 `~/Library/Containers/com.tencent.qq/Data/Documents/napcat` 是否存在；可在 `cordis.patch.yml` 配置 `installerDir`（仅用于安装器下载目录） |
| 「写入 OneBot 配置」失败 | 确认 NapCat 正在运行、WebUI 端口可访问（默认 6099）；插件会退化为直接写文件，重启 NapCat 生效 |
| 一键启动后机器人不在线 | 看状态卡的 NapCat 是否已登录、Koishi 健康检查是否通；到「日志」页看 Koishi 报错 |
| 插件管理改完不生效 | 勾选重启，或手动重启 Koishi；`koishi.yml` 由 Koishi Loader 自动维护，插件的增删是文本级操作 |
| 权限策略不生效 | 确认 Koishi 已加载 `access-control` 插件（「插件」页可见）；策略保存后约 1 秒热加载，无需重启 |
| 端口冲突 | 在 `cordis.patch.yml` 修改 `koishiPort` / `napcatPort`，并让 NapCat 反向 WS 指向新端口 |

## 恢复/清理

- DSH profile 备份：`~/.dsh/profiles/desktop/*.bak-*`（安装脚本自动生成）
- 安装器下载目录：`~/Library/Application Support/dsh-qqbot/napcat-installer`（可删）
- 本插件不写入 Koishi 项目以外的地方（除上述安装器目录）
