# QQ 接入指南

项目提供两条 QQ 接入路线，业务插件完全兼容：

| 方案 | 适用场景 | 能力 | 依赖 |
| --- | --- | --- | --- |
| **OneBot 11**（NapCat / Lagrange / LLOneBot） | 个人 QQ、群聊/私聊/群管理 | 群聊、私聊、图片、文件、撤回、禁言等完整能力 | 一个已登录的 QQ 账号 + OneBot 实现 |
| **QQ 官方机器人** | 合规运营、频道/群/C2C | 官方开放平台能力，受平台规则限制（如主动消息窗口） | q.qq.com 机器人 AppID + Secret |

默认配置使用 **OneBot 11 反向 WebSocket**，因为它在本地和公网服务器上都最容易打通。

---

## 一、OneBot 11（以 NapCat 为例）

### 1. 安装并登录 NapCat

参考 <https://napneko.github.io/> 安装 NapCat，登录机器人 QQ 账号。下文假设 NapCat 与 Koishi 在同一台机器上。

#### Windows / Docker（推荐）

Windows 分支由 dsh-qqbot 管理 NapCat 容器，不要在宿主机安装/登录 QQ：

1. 安装并启动 Docker Desktop（WSL2 后端）
2. 在 dsh-qqbot 面板点「安装/启动 NapCat」；插件会自动拉取 `mlikiowa/napcat-docker` 并生成 compose
3. 打开 `http://127.0.0.1:6099/webui`（或面板概览的二维码）扫码登录机器人 QQ
4. 容器内 OneBot 反向 WS 地址是 `ws://host.docker.internal:5140/onebot`，插件会自动写入 NapCat 配置

> 若 NapCat 跑在另一台机器/容器，下文 URL 中的 `127.0.0.1` 换成 Koishi 所在机器的内网/公网 IP，并保证双方网络互通。

### 2. 配置 NapCat 与 Koishi 的连接

项目默认监听反向 WS：宿主机 Koishi 为 `ws://127.0.0.1:5140/onebot`，Docker 内的 NapCat 使用 `ws://host.docker.internal:5140/onebot`。

在 NapCat 的「网络配置」中：

1. 新建 → **WebSocket 客户端**（反向 WS）
2. URL：`ws://127.0.0.1:5140/onebot`
3. 消息格式：`array`
4. Token：留空；如果填写，需要同时写进 `koishi.yml` 的 `adapter-onebot.token`
5. 启用并保存

然后回到项目目录，把 `selfId` 改成机器人 QQ 号（两种方式任选）：

```bash
# 方式一：一行命令修改
npm run set:self-id 你的QQ号
```

```yaml
# 方式二：手动编辑 koishi.yml（koishi.yml 由 Loader 维护，建议只改值，不要改结构）
group:adapter:
  adapter-onebot:rwzua8:
    selfId: '你的机器人QQ号'
    protocol: ws-reverse
    path: /onebot
```

> `selfId` 必须与 NapCat 登录的 QQ 号一致。OneBot 反向 WS 会带上 `X-Self-ID` 请求头，不匹配时 Koishi 会拒绝连接。

先启动 `npm start`，再让 NapCat 保存连接配置（顺序反了也没关系，NapCat 会自动重连）。看到 Koishi 日志里出现 `bot online` 后，私聊或群里发送 `/echo 你好` 验证。

### 3. 另一种接法：正向 WebSocket

由 Koishi 主动连接 NapCat 的 WS 服务端（NapCat「WebSocket 服务器」）：

NapCat 侧：新建「WebSocket 服务器」，端口如 `3001`，消息格式 `array`。

`koishi.yml`：

```yaml
group:adapter:
  adapter-onebot:rwzua8:
    selfId: '你的机器人QQ号'
    protocol: ws
    endpoint: ws://127.0.0.1:3001
    # token: ''   # 若 NapCat 设置了 access_token
```

重启后适配器会自动重连，NapCat 未启动时会在后台按间隔重试。

### 4. HTTP 方式（可选）

```yaml
group:adapter:
  adapter-onebot:rwzua8:
    selfId: '你的机器人QQ号'
    protocol: http
    endpoint: http://127.0.0.1:3001   # NapCat 的 HTTP API 地址
    path: /onebot                     # 接收 NapCat 事件上报的路径
```

NapCat 侧需要开启 HTTP 服务端，并把事件上报地址配置为 `http://127.0.0.1:5140/onebot`。

### 5. Lagrange / LLOneBot

配置语义与 NapCat 相同：

- 反向 WS：客户端连接到 `ws://127.0.0.1:5140/onebot`，Koishi 侧保持 `protocol: ws-reverse`
- 正向 WS：Koishi `protocol: ws` + `endpoint` 指向它们的 WS 服务端
- Token / access_token 与 `adapter-onebot.token` 保持一致

---

## 二、QQ 官方机器人

### 1. 创建机器人

1. 前往 <https://q.qq.com/>，创建机器人应用，完成主体认证
2. 在「开发设置」中获取 **AppID** 与 **AppSecret**
3. 开发阶段使用**沙箱环境**，把测试群/测试用户加入沙箱

### 2. 配置 Koishi

去掉 `adapter-qq` 前的 `~` 表示启用，并填入：

```yaml
group:adapter:
  adapter-qq:opsrjg:
    id: 你的AppID
    secret: 你的AppSecret
    type: private          # public | private
    sandbox: true          # 沙箱环境为 true
    protocol: websocket    # websocket（推荐）| webhook
```

`npm start` 后控制台会显示 QQ 适配器的连接状态。

### 3. 事件订阅 Intents

QQ 官方机器人通过 Intents 位图订阅事件，不填则使用适配器默认值。常用组合：

| 场景 | Intents 值 | 组成 |
| --- | --- | --- |
| QQ 群 / C2C 私聊 | `50331648` | `GROUP_MEMBERS(16777216)` + `USER_MESSAGE(33554432)` |
| 频道（Guild） | `1073746435` | `GUILDS(1)` + `GUILD_MEMBERS(2)` + `GUILD_MESSAGES(512)` + `DIRECT_MESSAGES(4096)` + `PUBLIC_GUILD_MESSAGES(1073741824)` |
| 群 + 频道 + 私聊 | `1124078083` | 以上全部相加 |

```yaml
adapter-qq:opsrjg:
  id: ...
  secret: ...
  type: private
  sandbox: true
  protocol: websocket
  intents: 50331648
```

> 平台只推送你订阅的事件；如果收不到群消息，先确认 Intents 是否包含所需事件。

### 4. Webhook 模式（需要公网 HTTPS）

```yaml
adapter-qq:opsrjg:
  id: ...
  secret: ...
  type: private
  protocol: webhook
  path: /qq
```

同时：

- 将 Koishi 暴露到公网 HTTPS（反向代理 / 内网穿透）
- 在 QQ 开放平台「开发设置 → 回调地址」中填写 `https://你的域名/qq`
- 平台校验与事件回调由适配器处理

Webhook 模式需要公网可达，本地开发更推荐默认的 WebSocket 模式。

### 5. 平台限制

- 群聊与 C2C 消息通常要求**被动回复**（携带收到的 `message_id`，且有时间窗口），主动推送受平台规则限制
- 媒体消息需要先上传素材，适配器会处理上传流程
- 平台能力以官方文档与当前适配器实现为准

---

## 三、多账号 / 多协议并存

在 `group:adapter` 下写多个实例即可，Koishi 会自动补全实例 id：

```yaml
group:adapter:
  adapter-onebot:rwzua8:
    selfId: '111111'
    protocol: ws-reverse
    path: /onebot
  adapter-onebot:k3m8xq:
    selfId: '222222'
    protocol: ws-reverse
    path: /onebot2
  adapter-qq:opsrjg:
    id: ...
    secret: ...
    type: private
    sandbox: true
```

反向 WS 的 `path` 需要区分开，NapCat 端分别连接对应的路径。

---

## 四、验证与排错

### 不接 QQ 的验证方式

```bash
npm start            # 终端 1：启动机器人
npm run mock:qq      # 终端 2：假 QQ，自动演示连接/收消息/发消息
```

或使用控制台沙盒：<http://localhost:5140> → 沙盒。

### 常见问题

| 现象 | 排查 |
| --- | --- |
| 启动正常但机器人不上线 | NapCat 是否已连接？`selfId` 是否与登录 QQ 一致？反向 WS 路径是否为 `/onebot`？ |
| 连接被 1008 拒绝 | `X-Self-ID` 不匹配（`selfId` 填错），或 `X-Client-Role` 不是 `Universal` |
| 指令无响应 | `prefix` 是否为 `['/']`；QQ 群里是否需要 @机器人 才触发（OneBot 默认不需要） |
| 收不到群消息 | 官方机器人检查 Intents；OneBot 检查 NapCat 是否开启了消息事件上报 |
| 端口被占用 | 控制台会自动顺延端口，查看启动日志中的实际地址；或修改 `server.port` |
| token 报错 | NapCat / Lagrange 的 token 与 `adapter-onebot.token` 必须一致 |
