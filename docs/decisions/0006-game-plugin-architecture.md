# 0006 - Per-Game Plugin Architecture

## Decision

每个小游戏由一对插件组成：

```text
DSH 插件：权威状态、规则、资产、管理接口
Koishi 插件：QQ 命令入口、身份/群上下文、回复发送
```

Koishi 插件不持久化游戏资产。

## Ownership

共享账号模块拥有：

```text
玩家身份映射
账号背包
金币
```

游戏插件拥有：

```text
游戏专属仓库
游戏专属道具库
游戏货币
抽卡/保底状态
游戏冷却与进度
游戏图鉴
```

钓鱼示例：

```text
账号背包      共享账号模块
鱼仓          fishing 插件
钓鱼道具库    fishing 插件
钓鱼币        fishing 插件
抽卡/保底     fishing 插件
鱼竿/鱼饵     fishing 插件
```

## Plugin Pair

```text
DSH:
  qqbot-game-fishing
    provides gameFishing
    routes /qqbot/games/fishing/command
    routes /qqbot/game/admin/*
    owns fishing state

Koishi:
  game-fishing
    commands /钓鱼 ...
    commands /兑换钓鱼币 ...
    sends commands to DSH
    no persistent state
```

## Implementation Layout

```text
DSH:
  host/plugins/game-core
  host/plugins/game-fishing
  host/services/game-core
  host/services/game-fishing

Koishi:
  plugins/group-listener        shared account/help commands
  plugins/game-fishing          fishing commands
  plugins/shared                DSH transport and result sender
```

## Command Flow

```text
QQ message
  → Koishi fishing plugin
  → POST /qqbot/games/fishing/command
  → DSH fishing plugin
  → game state transaction
  → replies
  → Koishi sends
```

## Rules

- 每个游戏独立插件，不把游戏状态塞进共享账号背包。
- `/账号背包` 只读共享账号资产，不展示游戏专属鱼仓、道具库或游戏货币。
- 游戏插件只能通过账号模块接口读写金币。
- 管理页面按游戏插件分入口。
