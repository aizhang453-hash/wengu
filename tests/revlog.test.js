import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeReview, decodeReview, addReview, dropReview, cleanLog, mergeLogs, reviewCount, historyOf, pack, unpack, MAX_PER_ITEM, AGAIN, GOOD } from '../js/revlog.js';
import { Store, makeSet, makeCard, cleanData } from '../js/store.js';
import { mergeData } from '../js/merge.js';

function memoryStorage() {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k) };
}

const t0 = new Date(2026, 9, 17, 9, 30).getTime();
const MIN = 60 * 1000;
const DAYS = (n) => n * 24 * 60 * MIN;

test('一条记录压成一个数: 时间 (到秒) 和评分都能还原; v1.22 以前按分钟记的换成秒的', () => {
  const code = encodeReview(t0 + 42 * 1000 + 300, GOOD);
  assert.ok(Number.isSafeInteger(code));
  assert.deepEqual(decodeReview(code), { at: t0 + 42000, rating: GOOD });
  assert.deepEqual(decodeReview(encodeReview(t0, AGAIN)), { at: t0, rating: AGAIN });
  const legacy = Math.floor(t0 / MIN) * 4 + (GOOD - 1); // 老的: 分钟数 × 4
  assert.deepEqual(historyOf({ c: pack([legacy]) }, 'c'), [{ at: t0, rating: GOOD }]);
  assert.deepEqual(historyOf(cleanLog({ c: [legacy] }), 'c'), [{ at: t0, rating: GOOD }]);
  assert.deepEqual(historyOf(mergeLogs({ c: String(legacy.toString(36)) }, { c: pack([encodeReview(t0 + DAYS(1), AGAIN)]) }), 'c').map((r) => r.at), [t0, t0 + DAYS(1)]);
});

test('一分钟里忘了两次: 两次都记着, 先后不乱', () => {
  const log = {};
  addReview(log, 'c', t0 + 5000, true);
  addReview(log, 'c', t0 + 50000, false);
  addReview(log, 'c', t0 + 55000, false);
  assert.deepEqual(historyOf(log, 'c').map((r) => r.rating), [GOOD, AGAIN, AGAIN]);
});

test('记、撤销; 从早到晚排好, 每张最多留最近 200 次', () => {
  const log = {};
  addReview(log, 'c1', t0 + 10 * MIN, false);
  addReview(log, 'c1', t0, true);
  assert.deepEqual(historyOf(log, 'c1'), [{ at: t0, rating: GOOD }, { at: t0 + 10 * MIN, rating: AGAIN }]);
  const code = encodeReview(t0, GOOD);
  assert.equal(dropReview(log, 'c1', code), code); // 撤销指定的那一条
  assert.deepEqual(historyOf(log, 'c1'), [{ at: t0 + 10 * MIN, rating: AGAIN }]);
  assert.equal(dropReview(log, 'c1', code), null); // 已经没了
  dropReview(log, 'c1');
  assert.equal(log.c1, undefined);
  for (let i = 0; i < MAX_PER_ITEM + 50; i++) addReview(log, 'c2', t0 + i * MIN, true);
  assert.equal(historyOf(log, 'c2').length, MAX_PER_ITEM);
  assert.equal(historyOf(log, 'c2')[0].at, t0 + 50 * MIN);
});

test('坏的不要; 两台设备的记录合起来, 一样的只算一次', () => {
  assert.deepEqual(cleanLog(null), {});
  // v1.17 存的数字数组也认, 换成压缩的
  assert.deepEqual(historyOf(cleanLog({ a: [3, -1, 'x', 1.5, 3], b: 5, '': [5], c: [] }), 'a'), [{ at: 0, rating: 4 }]);
  assert.deepEqual(Object.keys(cleanLog({ a: [3, -1, 'x', 1.5, 3], b: 5, '': [5], c: [] })), ['a']);
  const a = cleanLog({ c1: [encodeReview(t0, GOOD)], c2: [encodeReview(t0, AGAIN)] });
  const b = cleanLog({ c1: [encodeReview(t0, GOOD), encodeReview(t0 + DAYS(2), GOOD)], c3: [encodeReview(t0, GOOD)] });
  const merged = mergeLogs(a, b);
  assert.equal(historyOf(merged, 'c1').length, 2);
  assert.equal(reviewCount(merged), 4);
});

test('压缩: 存成跟上一次差多少, 还原一样; 比直接存数字省四成以上', () => {
  const codes = Array.from({ length: 30 }, (_, i) => encodeReview(t0 + DAYS(i * 7) + i * MIN, 1 + (i % 4)));
  assert.deepEqual(unpack(pack(codes)), codes);
  assert.deepEqual(unpack(pack([...codes].reverse())), codes); // 顺序乱的也排好
  assert.ok(pack(codes).length < JSON.stringify(codes).length * 0.6, `${pack(codes).length} vs ${JSON.stringify(codes).length}`);
  assert.equal(pack([]), '');
  assert.deepEqual(unpack(''), []);
});

test('只记翻卡自评: 选择题、游戏、重做错题都不记; 撤销去掉; 存了再读还在', () => {
  const storage = memoryStorage();
  const store = new Store(storage);
  const set = store.putSet(makeSet({ cards: [makeCard('apple', '苹果'), makeCard('pear', '梨')] }));
  const [apple, pear] = set.cards;
  store.recordAnswer(set.id, apple.id, true, { now: t0, selfRated: true });
  store.recordAnswer(set.id, apple.id, false, { now: t0 + DAYS(2), selfRated: true });
  store.restoreStat(set.id, apple.id, null); // 单词卡里撤销刚才那次
  store.recordAnswer(set.id, pear.id, true, { now: t0 }); // 选择题 / 游戏
  store.amendAnswer(set.id, pear.id);
  store.putMistake({ id: 'm1', type: 'input', question: 'x?', answer: '3' }, t0);
  store.recordMistake('m1', false, t0 + DAYS(1));
  const log = new Store(storage).data.revlog;
  assert.deepEqual(Object.keys(log), [apple.id]);
  assert.deepEqual(historyOf(log, apple.id), [{ at: t0, rating: GOOD }]);
});

test('同步、老数据: 记录两边合起来; 撤销了的不会又合回来; 删掉的卡片的不要; v1.16 混着各种答法的 log 不要了', () => {
  const sets = [{ id: 's', cards: [{ id: 'c1', term: 'a', def: 'b' }] }];
  const a = cleanData({ sets, revlog: { c1: [encodeReview(t0, GOOD)] } });
  const b = cleanData({ sets, revlog: { c1: [encodeReview(t0 + DAYS(3), AGAIN)] } });
  assert.equal(historyOf(mergeData(a, b).revlog, 'c1').length, 2);
  assert.deepEqual(cleanData({ sets: [], revlog: { c1: [encodeReview(t0, GOOD)] } }).revlog, {});
  // b 那边撤销了刚才那次, a 这边早同步过去了: 合起来不要
  const undone = cleanData({ sets, revlog: {}, undone: { c1: pack([encodeReview(t0 + DAYS(3), AGAIN)]) } });
  undone.undone = { c1: pack([encodeReview(Date.now(), AGAIN)]) };
  const withRecent = cleanData({ sets, revlog: { c1: pack([encodeReview(t0, GOOD), encodeReview(Date.now(), AGAIN)]) } });
  assert.deepEqual(historyOf(mergeData(withRecent, undone).revlog, 'c1').map((r) => r.rating), [GOOD]);
  const old = cleanData({ log: { c1: [encodeReview(t0, GOOD)] } });
  assert.deepEqual(old.revlog, {});
  assert.equal('log' in old, false);
  assert.deepEqual(mergeData(cleanData({}), { sets: [] }).revlog, {});
});
