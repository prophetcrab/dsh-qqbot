# 钓鱼玩法：鱼种与计价

状态：已确认部分，待实现

## 范围

本文只记录已经确定的鱼种、等级和计价规则。

不包含：

- 掉落概率
- 价格数值
- 重量范围
- 特殊物品清单
- 资产画风与生成参数

## 鱼类

五个等级，每级四种，共二十种。

### Lv.1

```text
鲫鱼
白条
泥鳅
小鲤鱼
```

### Lv.2

```text
鲈鱼
鳊鱼
黄颡鱼
草鱼
```

### Lv.3

```text
鳜鱼
黑鱼
青鱼
锦鲤
```

### Lv.4

```text
金鳞鲤
月影鳜
赤鳍鲟
云纹鳗
```

### Lv.5

```text
龙鳞锦鲤
星河鳜
太虚鲲
琉璃龙鱼
```

## 鱼类计价

鱼按重量计价，不按条固定价格。

```text
value = round(weightKg * pricePerKg)
```

每条鱼获需要保存：

```text
kind
fishId
name
tier
weightKg
pricePerKg
value
```

展示格式：

```text
鱼名 + 重量 + pricePerKg 钓鱼币/kg + 本次估值
```

价格单位统一为：

```text
钓鱼币/kg
```

钓鱼产出的鱼和特殊物品进入本群玩家背包，卖出后获得钓鱼币。

## 双货币

每个群的玩家钱包有两个余额：

```text
金币      平台通用货币，签到等玩法产出
钓鱼币    钓鱼玩法货币，卖鱼和特殊物品产出
```

固定汇率：

```text
10 钓鱼币 = 1 金币
```

双向自由兑换，无手续费。

兑换命令：

```text
/兑换 金币 1      消耗 10 钓鱼币，获得 1 金币
/兑换 钓鱼币 10   消耗 1 金币，获得 10 钓鱼币
```

规则：

```text
数量必须是正整数
钓鱼币换金币时，钓鱼币数量必须是 10 的倍数
余额不能为负数
同一次兑换写入两条钱包流水
兑换操作必须幂等
```

钱包结构：

```text
wallet.gold
wallet.fishingCoins
```

所有兑换、卖鱼、签到、商店扣款都通过 Wallet 统一入账，不直接修改玩家字段。

## 鱼竿

鱼竿稀有度：

```text
Lv.1
Lv.2
Lv.3
Legendary
```

每根鱼竿有两类独立属性：

```text
fishingEffect     钓鱼效果
pricePerKgBonus   单价属性，单位：钓鱼币/kg
```

鱼竿的单价属性作用在鱼的单价上：

```text
effectivePricePerKg = fish.pricePerKg + equippedRod.pricePerKgBonus
value = round(weightKg * effectivePricePerKg)
```

特殊物品是固定价格，不受鱼竿单价属性影响。

玩家同一时间只装备一根鱼竿。

传奇鱼竿额外带有一个特殊效果；具体效果待定。

鱼竿名称、钓鱼效果数值、单价属性数值、获取方式和购买价格待定。

## 特殊品类

独立于五个鱼类等级。

```text
category: special
tier: null
priceType: fixed
```

规则：

```text
不是鱼
不参与等级
按固定价格计价
包含极低价值和极高价值两类
```

数据结构：

```json
{
  "kind": "special",
  "itemId": "example",
  "name": "示例物品",
  "fixedPrice": 0
}
```

展示格式：

```text
物品名 · 固定价格
```

具体特殊物品名称和价格待定。

## 玩家归属

钓鱼玩家数据按群隔离。

```text
同一个 QQ 在不同群拥有独立的玩家记录、背包和金币。
```

## 待定

```text
各鱼种 pricePerKg
各鱼种 weightKg 范围
特殊物品清单与固定价格
掉落概率
资产风格
钓鱼冷却与消耗
```
