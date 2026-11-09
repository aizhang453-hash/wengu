import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../js/store.js';
import { bookOf, loadBook, loadYizhu, wholeBookPlan } from '../js/reading.js';
import { makeBookFolder } from '../js/views/read.js';

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}
const count = (plan) => plan.groups.reduce((n, g) => n + g.sets.length, 0);
const cards = (plan) => plan.groups.reduce((n, g) => n + g.sets.reduce((k, x) => k + x.cards.length, 0), 0);

test('整本做卡片 (v1.73): 书名文件夹 + 按分类的小文件夹 + 每篇一个卡片集; 没卡片的篇跳过', async () => {
  const book = bookOf('tangshi');
  const data = await loadBook('tangshi');
  const yizhu = await loadYizhu('tangshi');
  const next = wholeBookPlan(book, data, 'next', yizhu);
  assert.equal(next.folder, '唐诗三百首');
  assert.deepEqual(next.groups.map((g) => g.name), ['五言绝句', '七言绝句', '五言律诗', '七言律诗', '五言古诗', '七言古诗', '乐府']);
  assert.equal(count(next), 320);
  assert.equal(next.groups[0].sets.find((x) => x.piece.t === '静夜思').title, '静夜思（李白）');
  assert.ok(next.groups.every((g) => g.sets.every((x) => x.cards.length > 0)));
  // 字词、成语: 只做有注释 / 有成语的
  const zhu = wholeBookPlan(book, data, 'zhu', yizhu);
  assert.equal(zhu.folder, '唐诗三百首 · 字词');
  assert.equal(zhu.groups[0].sets[0].title.endsWith(' · 字词'), true);
  const cy = wholeBookPlan(book, data, 'cy', yizhu);
  assert.equal(count(cy), data.pieces.filter((p) => yizhu[`${p.t}|${p.a}`]?.cy?.length || yizhu[`${p.t}|${p.p[0].slice(0, 4)}`]?.cy?.length || yizhu[p.t]?.cy?.length).length);
  assert.ok(count(cy) < 320);
  // 整首: 一篇一张卡太碎, 一个分类一个卡片集, 直接放在书名文件夹里
  const whole = wholeBookPlan(book, data, 'whole', yizhu);
  assert.equal(whole.folder, '唐诗三百首 · 整首');
  assert.ok(whole.groups.every((g) => g.name === null && g.sets.length === 1));
  assert.deepEqual(whole.groups.map((g) => g.sets[0].title).slice(0, 2), ['唐诗三百首 · 五言绝句', '唐诗三百首 · 七言绝句']);
  // 没有分类的书: 卡片集直接放在书名文件夹里; 「整段」跟以前一样一个卡片集
  const szj = await loadBook('sanzijing');
  const plain = wholeBookPlan(bookOf('sanzijing'), szj, 'next');
  assert.deepEqual(plain.groups.map((g) => g.name), [null]);
  assert.equal(count(plain), szj.pieces.length);
  assert.ok(wholeBookPlan(bookOf('sanzijing'), szj, 'whole').single.cards.length > 0);
  // 宋词三百首的分类是作者
  const ci = await loadBook('songci');
  const songci = wholeBookPlan(bookOf('songci'), ci, 'next');
  assert.equal(songci.groups.length, new Set(ci.pieces.map((p) => p.g)).size);
  assert.equal(count(songci), ci.pieces.length);
});

test('整本做卡片: 建好的文件夹 —— 首页只多一个书名文件夹, 小文件夹按书里的次序, 合起来学是整本的卡片; 存一次', async () => {
  const storage = memoryStorage();
  let saves = 0;
  const setItem = storage.setItem;
  storage.setItem = (k, v) => (saves++, setItem(k, v));
  const store = new Store(storage);
  const book = bookOf('tangshi');
  const data = await loadBook('tangshi');
  const plan = wholeBookPlan(book, data, 'next');
  saves = 0;
  const made = makeBookFolder(store, book, plan, '接下句');
  assert.ok(saves <= 2);
  assert.equal(made.sets, 320);
  assert.equal(made.cards, cards(plan));
  assert.deepEqual(store.childFolders('').map((f) => f.name), ['唐诗三百首']);
  assert.deepEqual(store.childFolders(made.folder.id).map((f) => f.name), plan.groups.map((g) => g.name));
  assert.equal(store.treeSetIds(made.folder.id).length, 320);
  assert.equal(store.getSet(`folder:${made.folder.id}`).cards.length, made.cards);
  const first = store.getSet(store.childFolders(made.folder.id)[0].setIds[0]);
  assert.match(first.description, /^从温故书库做的：《唐诗三百首》「.+」，接下句。$/);
  // 存了再读还在
  const again = new Store(store.storage);
  assert.equal(again.treeSetIds(made.folder.id).length, 320);
  // 「整首」: 卡片集直接放在书名文件夹里, 没有小文件夹
  const whole = makeBookFolder(store, book, wholeBookPlan(book, data, 'whole'), '整首');
  assert.equal(store.childFolders(whole.folder.id).length, 0);
  assert.equal(store.getFolder(whole.folder.id).setIds.length, 7);
});
