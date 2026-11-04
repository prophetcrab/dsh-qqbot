# 小游戏管理台

## 页面结构

```text
QQ 机器人面板
└─ 小游戏 Tab
   ├─ 一级：群列表
   │  └─ 群卡片：群号、注册用户数、金币、钓鱼币、游戏入口数
   └─ 二级：群详情
      ├─ 本群注册用户
      └─ 小游戏入口
         └─ 三级：该群小游戏管理
            ├─ 游戏概况
            ├─ 按玩家的游戏状态
            └─ 当期 UP 切换
```

## 当前游戏

```text
fishing
```

后续新增小游戏时，在对应游戏包的 `admin.js` 中增加描述和玩家状态快照，并由游戏门面装配到管理台。当前实现位于 `host/services/game-core/games/fishing/admin.js`。

## Host API

```text
GET  /qqbot/game/admin/groups
GET  /qqbot/game/admin/group?groupId=...
GET  /qqbot/game/admin/game?groupId=...&gameId=...
POST /qqbot/game/admin/up
```

UP 请求体：

```json
{
  "groupId": "1026855069",
  "gameId": "fishing",
  "rodId": "taigong",
  "baitId": "rapala_floater"
}
```

只允许选择传奇鱼竿和传奇鱼饵。

## UP 持久化

```text
data/config/games/up.json
```

按群保存：

```json
{
  "version": 1,
  "groups": {
    "1026855069": {
      "rod": "ziling",
      "bait": "mepps_aglia",
      "updatedAt": "..."
    }
  }
}
```

未配置的群使用默认 UP：

```text
太公竿
拉帕拉原版浮水米诺
```

抽卡与 `/钓鱼 卡池` 都读取当前群配置，所以控制台切换后立即生效。

## Client

```text
client/plugins/games/index.js
client/plugins/games/GamesTab.js
```

Tab 由 Host 的 `clientTabs` 列表控制，id 为 `games`。
