import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeData } from '../js/merge.js';
import { cleanData, makeSet, makeCard } from '../js/store.js';

const T = 1_800_000_000_000;
const card = (id, term) => ({ ...makeCard(term, `${term}的意思`), id });
const set = (fields) => makeSet({ cards: [card('a', 'apple'), card('b', 'banana')], updatedAt: T, progressAt: 0, ...fields });
const data = (fields) => cleanData({ version: 1, sets: [], folders: [], activity: {}, deleted: {}, ...fields });
const merge = (a, b) => cleanData(mergeData(data(a), data(b)));

test('两边各有的卡片集都留下', () => {
  const m = merge({ sets: [set({ id: 'x', title: 'X' })] }, { sets: [set({ id: 'y', title: 'Y' })] });
  assert.deepEqual(m.sets.map((s) => s.title).sort(), ['X', 'Y']);
});

test('同一个卡片集: 内容听最后改过的那边', () => {
  const old = set({ id: 's', title: '旧标题', updatedAt: T });
  const nu = set({ id: 's', title: '新标题', updatedAt: T + 5000, cards: [card('a', 'APPLE')] });
  for (const [a, b] of [
    [old, nu],
    [nu, old],
  ]) {
    const m = merge({ sets: [a] }, { sets: [b] });
    assert.equal(m.sets[0].title, '新标题');
    assert.deepEqual(m.sets[0].cards.map((c) => c.term), ['APPLE']);
  }
});

test('进度听最后学过的那边, 但改卡片那边的内容不丢', () => {
  const edited = set({ id: 's', title: '改过', updatedAt: T + 100, progressAt: T, starred: ['a'] });
  const studied = set({ id: 's', title: '没改', updatedAt: T, progressAt: T + 200, starred: ['b'], known: ['a', 'b'], learn: { a: 2 } });
  const m = merge({ sets: [edited] }, { sets: [studied] });
  assert.equal(m.sets[0].title, '改过');
  assert.deepEqual(m.sets[0].starred, ['b']);
  assert.deepEqual(m.sets[0].known, ['a', 'b']);
  assert.deepEqual(m.sets[0].learn, { a: 2 });
});

test('答题记录一张一张比, 取最近答过的', () => {
  const a = set({ id: 's', stats: { a: { right: 5, wrong: 0, at: T + 10, due: T + 99, interval: 3, ease: 2.6 }, b: { right: 1, wrong: 0, at: T } } });
  const b = set({ id: 's', stats: { a: { right: 1, wrong: 1, at: T }, b: { right: 1, wrong: 1, at: T + 50, due: T + 1, interval: 0, ease: 2.3 } } });
  const m = merge({ sets: [a] }, { sets: [b] });
  assert.equal(m.sets[0].stats.a.right, 5);
  assert.equal(m.sets[0].stats.b.wrong, 1);
  assert.equal(m.sets[0].stats.b.ease, 2.3);
});

test('游戏成绩取更好的: 配对越快越好, 别的越高越好', () => {
  const m = merge({ sets: [set({ id: 's', best: { match: 9000, blast: 100 } })] }, { sets: [set({ id: 's', best: { match: 7000, blast: 50, wordle: 3 } })] });
  assert.deepEqual(m.sets[0].best, { match: 7000, blast: 100, wordle: 3 });
});

test('一边删了另一边也删; 删了以后另一边又改过的留下', () => {
  const s = set({ id: 's', updatedAt: T });
  const m1 = merge({ sets: [], deleted: { s: T + 1000 } }, { sets: [s] });
  assert.equal(m1.sets.length, 0);
  assert.equal(m1.deleted.s, T + 1000);
  const editedLater = set({ id: 's', updatedAt: T + 2000, title: '后来又改了' });
  const m2 = merge({ sets: [], deleted: { s: T + 1000 } }, { sets: [editedLater] });
  assert.equal(m2.sets[0].title, '后来又改了');
});

test('文件夹: 听最后改过的那边; 删了的不要', () => {
  const f = (fields) => ({ id: 'f', name: 'F', setIds: [], best: {}, createdAt: T, updatedAt: T, ...fields });
  const s1 = set({ id: 's1' });
  const s2 = set({ id: 's2' });
  const m = merge({ sets: [s1, s2], folders: [f({ setIds: ['s1'], updatedAt: T })] }, { sets: [s1, s2], folders: [f({ setIds: ['s1', 's2'], updatedAt: T + 1 })] });
  assert.deepEqual(m.folders[0].setIds, ['s1', 's2']);
  const gone = merge({ sets: [s1], folders: [f({})], deleted: {} }, { sets: [s1], folders: [], deleted: { 'folder:f': T + 5 } });
  assert.equal(gone.folders.length, 0);
});

test('打卡同一天取多的; 合并两次结果一样', () => {
  const a = { sets: [set({ id: 's' })], activity: { '2026-10-10': 3, '2026-10-11': 1 } };
  const b = { sets: [set({ id: 's', title: 'B', updatedAt: T + 1 })], activity: { '2026-10-11': 4 } };
  const m = merge(a, b);
  assert.deepEqual(m.activity, { '2026-10-10': 3, '2026-10-11': 4 });
  const again = cleanData(mergeData(m, data(b)));
  assert.deepEqual(JSON.stringify(again.sets.map((s) => [s.id, s.title])), JSON.stringify(m.sets.map((s) => [s.id, s.title])));
  assert.deepEqual(again.activity, m.activity);
});

test('卡片一张一张合: 一边新加的、另一边后来改了别的, 都留下; 删掉的不回来; 同一张听后改的', () => {
  const base = set({ id: 's', cards: [card('a', 'apple'), card('b', 'banana')], updatedAt: T });
  // 平板上 (没联网) 加了一张 c、把 a 改成 APPLE
  const ipad = { ...base, cards: [{ ...card('a', 'APPLE'), edited: T + 10 }, card('b', 'banana'), { ...card('c', 'cherry'), edited: T + 20 }], updatedAt: T + 20 };
  // 电脑上后来删了 b, 改了标题
  const pc = { ...base, title: '电脑改的', cards: [card('a', 'apple')], updatedAt: T + 50 };
  for (const [x, y] of [
    [ipad, pc],
    [pc, ipad],
  ]) {
    const m = merge({ sets: [x], deleted: { 'card:b': T + 50 } }, { sets: [y] });
    assert.equal(m.sets[0].title, '电脑改的');
    assert.deepEqual(m.sets[0].cards.map((c) => c.term), ['APPLE', 'cherry']); // a 平板后改的, c 平板新加的; b 电脑删了
  }
  // 删了以后又改过的 (那边改的时候还不知道删了): 留下
  const m = merge({ sets: [pc], deleted: { 'card:c': T + 15 } }, { sets: [ipad] });
  assert.ok(m.sets[0].cards.some((c) => c.term === 'cherry'));
});
