import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Store, makeSet, makeCard, makeFolder } from '../js/store.js';
import { historyOf } from '../js/revlog.js';

function memoryStorage() {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k) };
}

test('答题攒着一起存: 过一会儿存, flush 马上存; 别的标签页这时候存了, 两边的都不丢', async () => {
  const storage = memoryStorage();
  const a = new Store(storage, { batch: true });
  const set = a.putSet(makeSet({ cards: [makeCard('apple', '苹果'), makeCard('pear', '梨')] }));
  const [apple, pear] = set.cards;
  a.recordAnswer(set.id, apple.id, true, { selfRated: true });
  assert.equal(new Store(storage).getSet(set.id).stats[apple.id], undefined); // 还没存
  a.flush();
  assert.equal(new Store(storage).getSet(set.id).stats[apple.id].right, 1);

  // 这边刚答了 pear (还没存), 别的标签页存了一个新卡片集
  a.recordAnswer(set.id, pear.id, false, { selfRated: true });
  const b = new Store(storage);
  b.putSet(makeSet({ title: '别的标签页建的' }));
  a.reload(); // storage 事件
  assert.equal(a.data.sets.length, 2);
  assert.equal(a.getSet(set.id).stats[pear.id].wrong, 1);
  assert.equal(historyOf(a.data.revlog, pear.id).length, 1);
  const saved = new Store(storage);
  assert.equal(saved.data.sets.length, 2);
  assert.equal(saved.getSet(set.id).stats[pear.id].wrong, 1);

  // 没有攒着的: 直接听那边的
  b.reload();
  b.deleteSet(set.id);
  a.reload();
  assert.equal(a.getSet(set.id), null);

  // 计时到了自己存
  const c = new Store(memoryStorage(), { batch: true });
  const s2 = c.putSet(makeSet({ cards: [makeCard('x', 'y')] }));
  c.recordAnswer(s2.id, s2.cards[0].id, true);
  await new Promise((r) => setTimeout(r, 450));
  assert.equal(new Store(c.storage).getSet(s2.id).stats[s2.cards[0].id].right, 1);
});

test('文件夹里的卡片集挪顺序', () => {
  const store = new Store(memoryStorage());
  const ids = ['1', '2', '3'].map((t) => store.putSet(makeSet({ title: t })).id);
  const folder = store.putFolder({ ...makeFolder('f'), setIds: ids });
  store.moveInFolder(folder.id, ids[2], -1);
  assert.deepEqual(store.getFolder(folder.id).setIds, [ids[0], ids[2], ids[1]]);
  store.moveInFolder(folder.id, ids[0], -1); // 已经在最前
  store.moveInFolder(folder.id, ids[1], 1); // 已经在最后
  assert.deepEqual(store.getFolder(folder.id).setIds, [ids[0], ids[2], ids[1]]);
});

test('撤销以后同步: 撤销以前已经同步出去的那次, 不会又合回来', async () => {
  const { mergeData } = await import('../js/merge.js');
  const { cleanData } = await import('../js/store.js');
  const store = new Store(memoryStorage());
  const set = store.putSet(makeSet({ cards: [makeCard('apple', '苹果')] }));
  const [apple] = set.cards;
  const before = null;
  const code = store.recordAnswer(set.id, apple.id, true, { selfRated: true, now: Date.now() - 60000 });
  const pushed = structuredClone(store.data); // 已经同步到另一台设备
  store.restoreStat(set.id, apple.id, before, code);
  const merged = cleanData(mergeData(store.data, pushed));
  assert.equal(merged.sets[0].stats[apple.id].due, undefined); // 还是新词
  assert.deepEqual(historyOf(merged.revlog, apple.id), []);
  // 另一台设备那边合了以后也一样
  const there = cleanData(mergeData(pushed, store.data));
  assert.equal(there.sets[0].stats[apple.id].due, undefined);
  assert.deepEqual(historyOf(there.revlog, apple.id), []);
});
