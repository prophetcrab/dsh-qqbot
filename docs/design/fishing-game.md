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
鱼名 + 重量 + pricePerKg 金币/kg + 本次估值
```

价格单位统一为：

```text
金币/kg
```

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
