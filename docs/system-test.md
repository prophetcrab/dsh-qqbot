# 功能性系统测试清单

自动化检查（`npm run check`）只验证模块、契约、构建和离线资产；CI 另外会跑
Koishi 模板测试（`npm run test:template`，67 个）和模板漂移检查。  
以下测试必须在真实 macOS / Apple Silicon 环境执行，不能只靠 CI。

## 1. 合并前最低门槛

每个改动按影响范围选择：

| 改动区域 | 最低功能验证 |
| --- | --- |
| Client / Panel | 刷新页面，所有 Tab 可打开，无控制台报错 |
| Lifecycle / 启动顺序 | 全部停止 → 全部启动，Koishi 先启动，NapCat 后启动 |
| NapCat / QR / 账号 | 登录状态正确；切换账号后 selfId 自动同步 |
| Koishi / 权限 | 白名单群能收到消息，非白名单不处理 |
| 群聊闭环 / 契约 | 真实群消息能触发一次 analyze/compose |
| data / 配置 | 重启后权限、人设、画像仍保留 |
| template / 安装 | 临时项目能从 template 创建并启动 |
| 离线包 | `offline:verify` + 干净目录解压测试 |

小改动可以只跑受影响项；生命周期、安装、群聊契约、数据路径改动必须跑真实环境。

## 2. 发布前完整清单

### A. DSH 插件

```text
[ ] 面板可打开，9 个 Tab 正常（overview/ai/messages/access/plugins/features/logs/games/tokens）
[ ] 刷新页面后 Client bundle 正常
[ ] 概览状态与进程实际状态一致
[ ] 全部停止：Koishi、NapCat、QQ 进程结束
[ ] 全部启动：Koishi 先就绪，再出现 NapCat 二维码
[ ] NapCat 安装/版本检测正常
[ ] QR 刷新按钮可用
[ ] 插件页读取 19 个 Koishi 插件，启停操作正常
[ ] 功能页 3 个 Feature 可见（overview/koishi-plugins/access）
[ ] 日志页能读到 Koishi 日志
[ ] 权限页读写 policy 正常
```

### B. NapCat / OneBot

```text
[ ] NapCat WebUI 可达（6099）
[ ] QQ 扫码登录成功
[ ] 登录账号与 Koishi selfId 一致
[ ] 反向 WS 连接 5140/onebot
[ ] 群消息能到达 Koishi health 接口
[ ] 机器人发出的消息能在 QQ 群看到
```

### C. Koishi

```text
[ ] /api/qqbot/health ok=true
[ ] bot online=true
[ ] 白名单群消息进入监控
[ ] @机器人 触发 analyze
[ ] 计数/时间触发可保持沉默
[ ] 连续消息只合并回复一次
[ ] 引用图片后 @机器人 能分析
```

### D. 群聊闭环

```text
[ ] /qqbot/group/analyze 对真实素材返回 speak
[ ] /qqbot/group/compose 返回 parts（可含工具调用）
[ ] /qqbot/group/state-update 写入 memory / 画像 / 情绪
[ ] 人设卡保存后下一条回复生效
[ ] /qqbot/group/dashboard 可见最近 loop
[ ] 模型错误不会向群里刷原始错误
```

### E. 数据

```text
[ ] data/config/ 有 access/persona
[ ] data/state/ 有 ai.json/koishi.db
[ ] data/assets/ 有 presets/profiles
[ ] 重启 Koishi 后数据仍能读
[ ] 迁移脚本在临时项目可重复执行且不覆盖新文件
```

### F. 离线/新装

```text
[ ] 临时目录能由 template 创建项目
[ ] 解压 darwin-arm64 node_modules
[ ] 不联网可启动 Koishi
[ ] NapCat 离线包 size/SHA-256 校验通过
[ ] npm pack 包含 host/template/vendor/client.js
```

## 3. 记录方式

每次发布在 Release 说明或 `docs/decisions/` 记录：

```text
日期：
机器/架构：
DSH 版本：
插件版本：
NapCat / Koishi 版本：
通过项：
未通过项：
备注：
```

## 4. 当前已知外部依赖

```text
NapCat: 4.18.41 实际安装 / 4.18.42 内置
Koishi: 4.18.11
QQ: 7.0.2
DSH: 0.2.1-rc.x
macOS: Apple Silicon only
```
