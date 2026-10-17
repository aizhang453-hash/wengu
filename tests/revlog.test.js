import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeReview, decodeReview, addReview, amendLastReview, dropLastReview, cleanLog, mergeLogs, reviewCount, historyOf, mistakeKey, MAX_PER_ITEM, AGAIN, GOOD } from '../js/revlog.js';
import { Store, makeSet, makeCard, cleanData } from '../js/store.js';
import { mergeData } from '../js/merge.js';

function memoryStorage() {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k) };
}

const t0 = new Date(2026, 9, 17, 9, 30).getTime();
const MIN = 60 * 1000;

test('一条记录压成一个数: 时间 (到分钟) 和评分都能还原', () => {
  const code = encodeReview(t0 + 42 * 1000, GOOD);
  assert.ok(Number.isSafeInteger(code));
  assert.deepEqual(decodeReview(code), { at: t0, rating: GOOD });
  assert.deepEqual(decodeReview(encodeReview(t0, AGAIN)), { at: t0, rating: AGAIN });
});

test('记、改成记得、撤销; 从早到晚排好, 每张最多留最近 200 次', () => {
  const log = {};
  addReview(log, 'c1', t0 + 10 * MIN, false);
  addReview(log, 'c1', t0, true);
  assert.deepEqual(historyOf(log, 'c1'), [{ at: t0, rating: GOOD }, { at: t0 + 10 * MIN, rating: AGAIN }]);
  amendLastReview(log, 'c1');
  assert.equal(historyOf(log, 'c1').at(-1).rating, GOOD);
  dropLastReview(log, 'c1');
  dropLastReview(log, 'c1');
  assert.equal(log.c1, undefined);
  for (let i = 0; i < MAX_PER_ITEM + 50; i++) addReview(log, 'c2', t0 + i * MIN, true);
  assert.equal(log.c2.length, MAX_PER_ITEM);
  assert.equal(historyOf(log, 'c2')[0].at, t0 + 50 * MIN);
});

test('坏的不要; 两台设备的记录合起来, 一样的只算一次', () => {
  assert.deepEqual(cleanLog(null), {});
  assert.deepEqual(cleanLog({ a: [3, -1, 'x', 1.5, 3], b: 'nope', '': [5] }), { a: [3] });
  const a = { c1: [encodeReview(t0, GOOD)], c2: [encodeReview(t0, AGAIN)] };
  const b = { c1: [encodeReview(t0, GOOD), encodeReview(t0 + DAYS(2), GOOD)], c3: [encodeReview(t0, GOOD)] };
  const merged = mergeLogs(a, b);
  assert.equal(merged.c1.length, 2);
  assert.equal(reviewCount(merged), 4);
});

function DAYS(n) {
  return n * 24 * 60 * MIN;
}

test('答题、撤销、「我答对了」、重做错题都记进复习记录; 存了再读还在', () => {
  const storage = memoryStorage();
  const store = new Store(storage);
  const set = store.putSet(makeSet({ cards: [makeCard('apple', '苹果'), makeCard('pear', '梨')] }));
  const [apple, pear] = set.cards;
  store.recordAnswer(set.id, apple.id, true, { now: t0 });
  store.recordAnswer(set.id, pear.id, false, { now: t0 });
  store.amendAnswer(set.id, pear.id);
  store.recordAnswer(set.id, apple.id, false, { now: t0 + DAYS(2) });
  store.restoreStat(set.id, apple.id, null); // 单词卡里撤销刚才那次
  store.putMistake({ id: 'm1', type: 'input', question: 'x?', answer: '3' }, t0);
  store.recordMistake('m1', false, t0 + DAYS(1));
  const log = new Store(storage).data.log;
  assert.deepEqual(historyOf(log, apple.id).map((r) => r.rating), [GOOD]);
  assert.deepEqual(historyOf(log, pear.id).map((r) => r.rating), [GOOD]);
  assert.deepEqual(historyOf(log, mistakeKey('m1')), [{ at: t0 + DAYS(1), rating: AGAIN }]);
  assert.equal(reviewCount(log), 3);
});

test('同步、老数据: 记录两边合起来; 没有记录的老数据照常', () => {
  const a = cleanData({ log: { c1: [encodeReview(t0, GOOD)] } });
  const b = cleanData({ log: { c1: [encodeReview(t0 + DAYS(3), AGAIN)] } });
  assert.equal(mergeData(a, b).log.c1.length, 2);
  assert.deepEqual(cleanData({ sets: [] }).log, {});
  assert.deepEqual(mergeData(cleanData({}), { sets: [] }).log, {});
});
