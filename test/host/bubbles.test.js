import assert from 'node:assert/strict'
import { test } from 'node:test'
import { BUBBLE_MAX_CHARS, fitBubbleBudget, shapeBubbleParts } from '../../host/services/group-loop/bubbles.js'

test('splits multiple sentences in one model part into short bubbles', () => {
  const parts = shapeBubbleParts(['这个我真写不了，换点别的吧。倒是那只橘猫瘫在墙角的样子，我熟。年糕每天下班也这么躺着，一副我欠它三条小鱼干的样子。'])
  assert.equal(parts.length, 3)
  assert.ok(parts.every((part) => part.length <= BUBBLE_MAX_CHARS || part.length < 40))
  assert.match(parts[0], /真写不了/u)
  assert.match(parts[2], /年糕/u)
})

test('leaves a single short bubble unchanged', () => {
  assert.deepEqual(shapeBubbleParts(['鱼杂可以点，别把我这条算进去。']), ['鱼杂可以点，别把我这条算进去。'])
})

test('keeps hard maximum near the configured limit', () => {
  const parts = shapeBubbleParts(['这是一个没有任何标点但是非常非常长的句子需要被切开的测试文本，用来确认硬切逻辑不会把一大段塞进一个气泡里'])
  assert.ok(parts.length >= 1)
  assert.ok(parts.every((part) => part.length <= BUBBLE_MAX_CHARS + 2))
})

test('bubble budget never merges content into a long bubble', () => {
  const merged = fitBubbleBudget(['短句一。', '短句二。'], 1)
  assert.equal(merged.length, 1)
  const kept = fitBubbleBudget(['这是一条真的比较长的气泡内容，长度已经超过一半了。', '这也是一条真的比较长的气泡内容，长度也超过一半了。'], 1)
  assert.equal(kept.length, 2)
})

test('recent long model output is split into two or three bubbles', () => {
  const parts = shapeBubbleParts(['不是六角机牙哦。图里是寿屋的 Megalo Maria（メガロマリア），素体叫 ボーンA1，这个角色叫アッシュ（Ash）。六角机牙是那套 1/24 装甲骨架；这个主要卖“素体带脸”的可动模型，确实容易混。'])
  assert.ok(parts.length >= 2)
  assert.ok(parts.every((part) => part.length <= BUBBLE_MAX_CHARS + 8))
})
