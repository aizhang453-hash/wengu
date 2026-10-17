import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scopeCards, scopeSizes, defaultLearnScope, defaultTestScope, LEARN_SCOPES } from '../js/scope.js';
import { makeSet, makeCard } from '../js/store.js';
import { cleanPlan } from '../js/plan.js';

const DAY = 86400000;
const now = new Date(2026, 9, 17, 10).getTime();
const cardsOf = (n) => Array.from({ length: n }, (_, i) => makeCard(`w${i}`, `d${i}`));

test('学习「接着学 N 个」: 照顺序, 跳过已经背过 (排进复习) 和学习里掌握了的; 学完这批就是下一批', () => {
  const cards = cardsOf(30);
  const set = makeSet({ cards, stats: { [cards[0].id]: { right: 1, wrong: 0, due: now + DAY, at: now - DAY } }, learn: { [cards[1].id]: 2, [cards[2].id]: 1 } });
  assert.deepEqual(scopeCards(set, 'next', { count: 3, now }).map((c) => c.term), ['w2', 'w3', 'w4']);
  for (const c of cards.slice(2, 5)) set.learn[c.id] = 2; // 这批掌握了
  assert.deepEqual(scopeCards(set, 'next', { count: 3, now }).map((c) => c.term), ['w5', 'w6', 'w7']);
  // 随机顺序的计划: 也是那个顺序
  const random = { ...set, plan: cleanPlan({ order: 'random', seed: 'x' }) };
  assert.notDeepEqual(scopeCards(random, 'next', { count: 5, now }).map((c) => c.term), ['w5', 'w6', 'w7', 'w8', 'w9']);
});

test('今天的新词 / 今天背的 / 背过的 / 星标的 / 全部', () => {
  const cards = cardsOf(6);
  const set = makeSet({
    cards,
    stats: {
      [cards[0].id]: { right: 1, wrong: 0, due: now + DAY, at: now - 3600000, first: now - 3600000 }, // 今天学的新词
      [cards[1].id]: { right: 3, wrong: 0, due: now + DAY, at: now - 3600000, first: now - 30 * DAY }, // 今天复习的
      [cards[2].id]: { right: 3, wrong: 0, due: now - DAY, at: now - 9 * DAY, first: now - 30 * DAY }, // 以前背过
    },
    starred: [cards[5].id],
  });
  const fresh = [cards[3]]; // 今天复习里要出的新词
  assert.deepEqual(scopeCards(set, 'today', { fresh, now }).map((c) => c.term), ['w0', 'w3']);
  assert.deepEqual(scopeCards(set, 'reviewed', { fresh, now }).map((c) => c.term), ['w0', 'w1', 'w3']);
  assert.deepEqual(scopeCards(set, 'studied', { now }).map((c) => c.term), ['w0', 'w1', 'w2']);
  assert.deepEqual(scopeCards(set, 'starred', { now }).map((c) => c.term), ['w5']);
  assert.equal(scopeCards(set, 'all', { now }).length, 6);
  assert.deepEqual(scopeSizes(set, Object.keys(LEARN_SCOPES), { count: 20, fresh, now }), { next: 3, today: 2, starred: 1, all: 6 });
});

test('卡片多的卡片集默认只学一部分、只考背过的; 少的照旧全部', () => {
  assert.deepEqual(defaultLearnScope(makeSet({ cards: cardsOf(600) })), { kind: 'next', count: 20 });
  assert.equal(defaultLearnScope(makeSet({ cards: cardsOf(20) })).kind, 'all');
  assert.equal(defaultTestScope(makeSet({ cards: cardsOf(600) })), 'studied');
  assert.equal(defaultTestScope(makeSet({ cards: cardsOf(20) })), 'all');
});
