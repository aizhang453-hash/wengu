import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickDistinct, makeBoard, isPair, blastLevel, blastSpeed, blastPoints, formatTime } from '../js/games.js';

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
