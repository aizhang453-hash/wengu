import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Store, makeSet, makeCard, cleanData } from '../js/store.js';

// 假的 localStorage
function memoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

function sampleSet() {
  return makeSet({ title: '水果', cards: [makeCard('apple', '苹果'), makeCard('pear', '梨')] });
}

test('存了以后重新打开还在', () => {
  const storage = memoryStorage();
  const a = new Store(storage);
  const set = a.putSet(sampleSet());
  const b = new Store(storage);
  assert.equal(b.allSets().length, 1);
  assert.equal(b.getSet(set.id).title, '水果');
  assert.deepEqual(
    b.getSet(set.id).cards.map((c) => c.term),
    ['apple', 'pear'],
  );
});

test('存的东西坏了就当空的, 不会打不开', () => {
  const storage = memoryStorage();
  storage.setItem('wengu:v1', '{这不是 JSON');
  assert.deepEqual(new Store(storage).allSets(), []);
});

test('会了 / 星标; 删了卡片它们也跟着去掉', () => {
  const store = new Store(memoryStorage());
  const set = store.putSet(sampleSet());
  const [apple, pear] = set.cards;
  store.setKnown(set.id, apple.id, true);
  store.setKnown(set.id, apple.id, true);
  store.setKnown(set.id, pear.id, true);
  store.setKnown(set.id, pear.id, false);
  assert.deepEqual(store.getSet(set.id).known, [apple.id]);
  assert.equal(store.toggleStar(set.id, pear.id), true);
  assert.deepEqual(store.getSet(set.id).starred, [pear.id]);

  // 编辑时把 apple 删了
  const edited = { ...store.getSet(set.id), cards: [pear] };
  store.putSet(edited);
  assert.deepEqual(store.getSet(set.id).known, []);
  assert.deepEqual(store.getSet(set.id).starred, [pear.id]);
});

test('记进度不算改了卡片集', () => {
  const store = new Store(memoryStorage());
  const set = store.putSet(sampleSet());
  const before = store.getSet(set.id).updatedAt;
  store.setKnown(set.id, set.cards[0].id, true);
  assert.equal(store.getSet(set.id).updatedAt, before);
});

test('最近改过的排前面', () => {
  const store = new Store(memoryStorage());
  const old = store.putSet({ ...sampleSet(), title: '旧的' });
  store.putSet({ ...sampleSet(), title: '新的' });
  store.data.sets.find((s) => s.id === old.id).updatedAt -= 10000;
  assert.deepEqual(
    store.allSets().map((s) => s.title),
    ['新的', '旧的'],
  );
});

test('删除', () => {
  const store = new Store(memoryStorage());
  const set = store.putSet(sampleSet());
  store.deleteSet(set.id);
  assert.equal(store.getSet(set.id), null);
});

test('备份导出再导入: 新的加进来, 一样的替换', () => {
  const from = new Store(memoryStorage());
  const shared = from.putSet(sampleSet());
  from.putSet({ ...sampleSet(), title: '只在备份里' });
  const backup = from.exportBackup();

  const to = new Store(memoryStorage());
  to.putSet({ ...structuredClone(shared), title: '旧标题' });
  to.putSet({ ...sampleSet(), title: '只在这边' });
  const result = to.importBackup(backup);
  assert.deepEqual(result, { added: 1, replaced: 1 });
  assert.deepEqual(to.allSets().map((s) => s.title).sort(), ['只在备份里', '只在这边', '水果'].sort());
});

test('备份文件不对: 读不了的抛错, 没有卡片集的什么也不加', () => {
  const store = new Store(memoryStorage());
  assert.throws(() => store.importBackup('不是 JSON'));
  assert.deepEqual(store.importBackup('{"hello": 1}'), { added: 0, replaced: 0 });
});

test('缺字段的老数据补齐, 乱七八糟的丢掉', () => {
  const data = cleanData({
    sets: [null, 5, { title: 3, cards: [{ term: 'a' }, null, 'x'], known: ['nope'] }],
  });
  assert.equal(data.sets.length, 1);
  const [set] = data.sets;
  assert.equal(set.title, '3');
  assert.equal(set.cards.length, 1);
  assert.equal(set.cards[0].def, '');
  assert.ok(set.cards[0].id);
  assert.deepEqual(set.known, []);
  assert.equal(set.termLang, 'auto');
});
