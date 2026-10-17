import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickDistinct, makeBoard, isPair, blastLevel, blastSpeed, blastPoints, formatTime, GAMES, GAME_KEYS, gameOf, whyNotPlayable, bestText, textSize, rockSlots } from '../js/games.js';

function seeded(seed = 1) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

const cards = Array.from({ length: 10 }, (_, i) => ({ id: `c${i}`, term: `t${i}`, def: `d${i}` }));

test('配对: 6 对 12 张, 每对一个词一个解释', () => {
  const tiles = makeBoard(cards, 6, seeded(2));
  assert.equal(tiles.length, 12);
  const byCard = new Map();
  for (const t of tiles) byCard.set(t.cardId, [...(byCard.get(t.cardId) ?? []), t.side]);
  assert.equal(byCard.size, 6);
  for (const sides of byCard.values()) assert.deepEqual(sides.sort(), ['def', 'term']);
});

test('配对: 卡片不够 6 张就有几张用几张', () => {
  assert.equal(makeBoard(cards.slice(0, 3), 6, seeded(1)).length, 6);
});

test('配对: 词或解释重复的、空的不拿来玩 (不然分不清)', () => {
  const tricky = [
    { id: 'a', term: 'big', def: '大' },
    { id: 'b', term: 'large', def: '大' },
    { id: 'c', term: 'Big', def: '巨大' },
    { id: 'd', term: '', def: '空' },
    { id: 'e', term: 'small', def: '小' },
  ];
  for (let seed = 1; seed <= 20; seed++) {
    const picked = pickDistinct(tricky, 6, seeded(seed));
    const terms = picked.map((c) => c.term.toLowerCase());
    const defs = picked.map((c) => c.def);
    assert.equal(new Set(terms).size, picked.length);
    assert.equal(new Set(defs).size, picked.length);
    assert.ok(!picked.some((c) => c.id === 'd'));
    assert.ok(defs.includes('小'));
    assert.ok(picked.length === 2 || picked.length === 3); // 大 只能有一张; big / Big 只能有一张
  }
});

test('配对: 同一张卡片的词和解释才算一对', () => {
  const [a, b] = [
    { cardId: 'x', side: 'term' },
    { cardId: 'x', side: 'def' },
  ];
  assert.ok(isPair(a, b));
  assert.ok(!isPair(a, a));
  assert.ok(!isPair(a, { cardId: 'y', side: 'def' }));
});

test('打陨石: 5 题升一关, 越来越快 (有上限), 分越来越多', () => {
  assert.equal(blastLevel(0), 1);
  assert.equal(blastLevel(4), 1);
  assert.equal(blastLevel(5), 2);
  assert.equal(blastLevel(12), 3);
  assert.ok(blastSpeed(2) > blastSpeed(1));
  assert.equal(blastSpeed(100), 0.2);
  assert.equal(blastPoints(3), 30);
  assert.equal(formatTime(12345), '12.3 秒');
});

// ---- 游戏板块 ----

test('游戏列表: 五个游戏, 都找得到', () => {
  assert.deepEqual(GAME_KEYS, ['match', 'blast', 'blocks', 'gems', 'wordle']);
  for (const g of GAMES) assert.equal(gameOf(g.key), g);
  assert.equal(gameOf('nope'), null);
  assert.equal(gameOf(null), null);
});

test('能不能玩: 卡片不够、缺一面、没有能猜的词时说为什么', () => {
  const two = { cards: [{ id: 'a', term: 'apple', def: '苹果' }, { id: 'b', term: 'pear', def: '梨' }] };
  for (const key of GAME_KEYS) assert.equal(whyNotPlayable(key, two), '', key);
  const one = { cards: [{ id: 'a', term: 'apple', def: '苹果' }] };
  assert.match(whyNotPlayable('blast', one), /两张/);
  // 方块、宝石出题要词和解释都有
  const halfEmpty = { cards: [{ id: 'a', term: 'apple', def: '' }, { id: 'b', term: 'pear', def: '梨' }, { id: 'c', term: '', def: '桃' }] };
  assert.notEqual(whyNotPlayable('blocks', halfEmpty), '');
  assert.notEqual(whyNotPlayable('gems', halfEmpty), '');
  // Wordle 要字母拼的词
  const chinese = { cards: [{ id: 'a', term: '苹果', def: '一种水果' }, { id: 'b', term: '梨', def: '另一种水果' }] };
  assert.match(whyNotPlayable('wordle', chinese), /字母/);
  assert.notEqual(whyNotPlayable('match', null), '');
});

test('最好成绩怎么写; 没玩过是空的', () => {
  assert.equal(bestText('match', { match: 12345 }), '最好 12.3 秒');
  assert.equal(bestText('blast', { blast: 320 }), '最高 320 分');
  assert.equal(bestText('wordle', { wordle: 4 }), '最长连胜 4');
  assert.equal(bestText('gems', {}), '');
  assert.equal(bestText('gems', undefined), '');
});

test('字多字少分档 (格式记号不算字)', () => {
  assert.equal(textSize('Tone'), '');
  assert.equal(textSize('Onomatopoeia rocks'), 'long');
  assert.equal(textSize("The author's attitude toward the subject."), 'longer');
  assert.equal(textSize('x'.repeat(71)), 'longest');
  assert.equal(textSize('**Tone**'), '');
  assert.equal(textSize(null), '');
});

test('打陨石的陨石: 宽屏一排, 手机两排; 编号从左到右、从上到下, 不出界', () => {
  const wide = rockSlots(4, false, seeded(3));
  assert.deepEqual(wide.map((s) => s.key), [1, 2, 3, 4]);
  assert.deepEqual(wide.map((s) => s.x), [0.125, 0.375, 0.625, 0.875]);
  for (const s of wide) assert.ok(s.y >= 0 && s.y < 0.15 && s.width === 0.25);

  const narrow = rockSlots(4, true, seeded(3));
  assert.deepEqual(narrow.map((s) => s.x), [0.25, 0.75, 0.25, 0.75]);
  assert.ok(narrow[2].y - narrow[0].y > 0.25, '第二排往下错开');
  for (const s of narrow) assert.equal(s.width, 0.5);

  // 三块: 第二排那一块放中间
  const three = rockSlots(3, true, seeded(1));
  assert.deepEqual(three.map((s) => s.x), [0.25, 0.75, 0.5]);
  assert.deepEqual(rockSlots(2, true, seeded(1)).map((s) => s.x), [0.25, 0.75]);
});
