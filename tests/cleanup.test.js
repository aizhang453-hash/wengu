import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Store, makeCard, makeFolder, cleanData, COLLAPSED_KEY } from '../js/store.js';
import { mergeData } from '../js/merge.js';
import { addReview } from '../js/revlog.js';

// 像浏览器的 localStorage (能一个一个列出来)
function storage() {
  const map = new Map();
  return {
    map,
    get length() {
      return map.size;
    },
    key: (i) => [...map.keys()][i] ?? null,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

test('删卡片集: 浏览器里另外记的 (背到哪了、学习目标、学哪些、Wordle) 都删掉', () => {
  const s = storage();
  const store = new Store(s);
  const set = store.putSet({ title: 'A', cards: [makeCard('a', 'b')] });
  for (const kind of ['cards-session', 'learn-goal', 'learn-scope', 'wordle']) s.setItem(`wengu:${kind}:${set.id}`, '{}');
  s.setItem('wengu:review-prefs', '{}');
  store.deleteSet(set.id);
  assert.deepEqual([...s.map.keys()].filter((k) => k !== 'wengu:v1'), ['wengu:review-prefs']);
});

test('别的设备删的 (同步过来的): 打开时把这台设备上另外记的也清掉; 首页收起的文件夹也是', () => {
  const s = storage();
  const store = new Store(s);
  const keep = store.putSet({ title: '留着', cards: [makeCard('a', 'b')] });
  const folder = store.putFolder({ ...makeFolder('文件夹'), setIds: [keep.id] });
  s.setItem(`wengu:learn-scope:${keep.id}`, '{}');
  s.setItem(`wengu:cards-session:folder:${folder.id}`, '{}');
  s.setItem('wengu:learn-scope:gone-set', '{}');
  s.setItem('wengu:wordle:gone-set', '{}');
  s.setItem('wengu:cards-session:folder:gone-folder', '{}');
  s.setItem(COLLAPSED_KEY, JSON.stringify([folder.id, 'gone-folder']));
  assert.equal(store.pruneLocal(), 3);
  assert.ok(s.getItem(`wengu:learn-scope:${keep.id}`));
  assert.ok(s.getItem(`wengu:cards-session:folder:${folder.id}`));
  assert.equal(s.getItem('wengu:wordle:gone-set'), null);
  assert.deepEqual(JSON.parse(s.getItem(COLLAPSED_KEY)), [folder.id]);
  assert.equal(new Store({ getItem: () => null, setItem() {}, removeItem() {} }).pruneLocal(), 0); // 列不出来的就不管
});

test('删卡片、删卡片集: 答题记录、复习记录、进度都不留 (另一台设备同步以后也是)', () => {
  const a = new Store(storage());
  const set = a.putSet({ title: 'A', cards: [makeCard('x', '1'), makeCard('y', '2')] });
  const [x, y] = set.cards;
  for (const c of [x, y]) {
    a.recordAnswer(set.id, c.id, true, { selfRated: true });
    a.toggleStar(set.id, c.id);
  }
  const other = cleanData(structuredClone(a.data)); // 另一台设备: 同步过一次
  // 删掉一张卡片
  a.putSet({ ...a.getSet(set.id), cards: [x] });
  let merged = cleanData(mergeData(other, a.data));
  assert.deepEqual(Object.keys(merged.sets[0].stats), [x.id]);
  assert.deepEqual(merged.sets[0].starred, [x.id]);
  assert.deepEqual(Object.keys(merged.revlog), [x.id]);
  // 删掉整个卡片集; 另一台设备上还答过 (没改卡片), 也删
  a.deleteSet(set.id);
  addReview(other.revlog, x.id, Date.now(), true);
  merged = cleanData(mergeData(other, a.data));
  assert.deepEqual([merged.sets.length, Object.keys(merged.revlog).length], [0, 0]);
  // 删除记录只留 120 天
  const old = cleanData({ ...merged, deleted: { [set.id]: Date.now() - 121 * 864e5 } });
  assert.deepEqual(old.deleted, {});
});
