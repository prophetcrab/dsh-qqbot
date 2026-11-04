# 0010 - 服务器版本的两种形态

## Status

Proposed（尚未实现，仅作为后续服务器分支的设计边界）。

## Decision

未来提供两种服务器形态，共用同一套服务器端运行时：

```text
版本 A：全量服务器版
浏览器 → 服务器 DSH Host + dsh-qqbot + Koishi + NapCat + 数据

版本 B2：远程 UI 版（选定）
桌面 DSH → 最小远程插件 → 服务器（DSH Host + 全量机器人运行时）
```

版本 B2 明确选择“服务器运行全部机器人逻辑，桌面只做远程 UI”，不采用桌面保留 AI/业务逻辑、服务器反连桌面的 B1 方案。

## 服务器端职责

版本 A 和 B2 共用：

- DSH Host 与完整 `dsh-qqbot` Host 插件；
- AI、人设、记忆、工具编排；
- 机器人数据：消息归档、Token 统计、群状态、玩家/游戏数据、配置；
- Koishi 运行时；
- NapCat Docker/Linux QQ；
- 数据备份、升级和服务生命周期（systemd/compose）。

B2 额外提供面向桌面的 scoped remote API：

- 机器人状态、启停、日志、二维码、OneBot 配置、Koishi 插件管理；
- 数据查询/订阅（SSE/WebSocket）；
- 设备配对、token、权限和审计。

## 桌面端职责（B2）

桌面 DSH 运行最小 `dsh-qqbot` 远程插件：

- 远程连接配置（服务器地址、token/配对码）；
- 只做 outbound HTTPS/SSE 请求和本地 `/qqbot/remote/*` 代理；
- 复用现有 Client UI；
- 不运行本地 Koishi/NapCat；
- 不保存机器人权威数据；
- 不暴露桌面文件、Shell、进程、MCP 或 DSH Host 通用 API。

## 安全边界

必须保证：

```text
服务器 → 桌面：无反向控制通道、无任意命令、无文件访问
桌面 → 服务器：HTTPS/WSS + 最小权限 token
服务器对外：只暴露 bot API，不暴露 DSH 通用 Host RPC
桌面插件：不监听公网端口，只发起 outbound 连接
```

服务器端不得：

- 向桌面下发任意命令或可执行插件代码；
- 调用桌面 DSH 的 AI/工具/文件接口；
- 要求桌面开放入站端口或安装远程控制 agent。

## 数据边界

服务器是机器人运行数据的权威源：

| 数据 | 权威位置 |
|---|---|
| 消息归档、Token 统计、群状态 | 服务器 |
| 玩家、金币、游戏数据 | 服务器 |
| Koishi/OneBot 配置 | 服务器 |
| 人设、AI 设置、模型密钥 | 服务器（B2 也全部在服务器） |
| 桌面 UI 缓存 | 桌面，可丢弃 |

桌面离线时，服务器机器人继续运行；桌面重连后拉取最新状态。

## 发布形态

- `dsh-qqbot-server`：服务器版（A，浏览器访问），包含 DSH host 部署和服务器运行时；
- `dsh-qqbot-remote`：桌面最小插件（B2）；
- B2 的服务器端复用 A 的运行时，只多一层 remote API/授权。

Tag 示例：

```text
v0.8.0-server
v0.8.0-remote
```

具体版本号按平台独立发布，不必同步。

## 实施顺序

1. Linux 平台层 + 全量服务器运行时（版本 A）；
2. 服务器 DSH Web 验证；
3. remote API / 授权 / SSE；
4. 桌面最小插件和远程 manager；
5. 安全验收：服务器无法访问桌面、桌面无入站监听、token 权限最小化；
6. 发布 server + remote 两个包。

## Open Questions

- 服务器部署形态：Docker Compose 还是 systemd + 二进制/Node；
- Remote API 是否只支持单机器人实例，还是多实例；
- 桌面是否需要缓存离线操作队列；
- 是否把 DSH Web 也作为 B2 的可选 fallback 前端。
