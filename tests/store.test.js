import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Store, makeSet, makeCard, makeFolder, cleanData } from '../js/store.js';

// 假的 localStorage
function memoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

// 只看答对答错几次 (不看复习日期)
function counts(stats) {
  return Object.fromEntries(Object.entries(stats).map(([id, s]) => [id, { right: s.right, wrong: s.wrong }]));
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

test('学习程度、答对答错、游戏成绩; 删了卡片跟着去掉', () => {
  const store = new Store(memoryStorage());
  const set = store.putSet(sampleSet());
  const [apple, pear] = set.cards;
  store.setLevels(set.id, { [apple.id]: 2, [pear.id]: 1, nope: 2 });
  store.setLevels(set.id, { [pear.id]: 7 }); // 不认识的程度不存
  assert.deepEqual(store.getSet(set.id).learn, { [apple.id]: 2, [pear.id]: 1 });

  store.recordAnswer(set.id, apple.id, true);
  store.recordAnswer(set.id, apple.id, false);
  store.recordAnswer(set.id, apple.id, true);
  store.recordAnswer(set.id, 'nope', true);
  assert.deepEqual(counts(store.getSet(set.id).stats), { [apple.id]: { right: 2, wrong: 1 } });

  // 配对越快越好, 打陨石越高越好
  assert.equal(store.recordBest(set.id, 'match', 12000), true);
  assert.equal(store.recordBest(set.id, 'match', 15000), false);
  assert.equal(store.recordBest(set.id, 'match', 9000), true);
  assert.equal(store.recordBest(set.id, 'blast', 300), true);
  assert.equal(store.recordBest(set.id, 'blast', 200), false);
  assert.deepEqual(store.getSet(set.id).best, { match: 9000, blast: 300 });

  store.putSet({ ...store.getSet(set.id), cards: [pear] });
  assert.deepEqual(store.getSet(set.id).learn, { [pear.id]: 1 });
  assert.deepEqual(store.getSet(set.id).stats, {});
  assert.deepEqual(store.getSet(set.id).best, { match: 9000, blast: 300 });

  store.resetLearn(set.id);
  assert.deepEqual(store.getSet(set.id).learn, {});
});

test('别的标签页存了, reload 读到新的', () => {
  const storage = memoryStorage();
  const a = new Store(storage);
  const b = new Store(storage);
  a.putSet(sampleSet());
  assert.equal(b.allSets().length, 0);
  b.reload();
  assert.equal(b.allSets().length, 1);
});

test('文件夹: 放进去、拿出来、删卡片集时也从文件夹里拿掉', () => {
  const store = new Store(memoryStorage());
  const a = store.putSet({ ...sampleSet(), title: 'A' });
  const b = store.putSet({ ...sampleSet(), title: 'B' });
  const f = store.putFolder({ ...makeFolder('期末'), setIds: [a.id, 'nope'] });
  assert.deepEqual(store.getFolder(f.id).setIds, [a.id]);
  store.setInFolder(f.id, b.id, true);
  store.setInFolder(f.id, b.id, true);
  assert.deepEqual(store.getFolder(f.id).setIds, [a.id, b.id]);
  assert.deepEqual(store.foldersOf(b.id).map((x) => x.name), ['期末']);
  store.setInFolder(f.id, a.id, false);
  assert.deepEqual(store.getFolder(f.id).setIds, [b.id]);
  store.deleteSet(b.id);
  assert.deepEqual(store.getFolder(f.id).setIds, []);
  store.deleteFolder(f.id);
  assert.equal(store.getFolder(f.id), null);
});

test('合起来学: 卡片是各卡片集的, 进度记回原来的卡片集', () => {
  const store = new Store(memoryStorage());
  const a = store.putSet({ ...sampleSet(), title: 'A', termLang: 'en-US' });
  const b = store.putSet({ ...sampleSet(), title: 'B', termLang: 'en-US' });
  const f = store.putFolder({ ...makeFolder('期末'), setIds: [a.id, b.id] });
  const combo = store.getSet(`folder:${f.id}`);
  assert.equal(combo.title, '期末');
  assert.equal(combo.cards.length, 4);
  assert.equal(combo.termLang, 'en-US');

  const [a1] = a.cards;
  const [, b2] = b.cards;
  store.setKnown(combo.id, a1.id, true);
  store.toggleStar(combo.id, b2.id);
  store.setLevels(combo.id, { [a1.id]: 2, [b2.id]: 1 });
  store.recordAnswer(combo.id, b2.id, false);
  assert.deepEqual(store.getSet(a.id).known, [a1.id]);
  assert.deepEqual(store.getSet(b.id).starred, [b2.id]);
  assert.deepEqual(store.getSet(a.id).learn, { [a1.id]: 2 });
  assert.deepEqual(counts(store.getSet(b.id).stats), { [b2.id]: { right: 0, wrong: 1 } });
  // 合起来的那个每次读都是最新的
  assert.deepEqual(combo.known, [a1.id]);
  assert.deepEqual(combo.starred, [b2.id]);
  assert.deepEqual(combo.learn, { [a1.id]: 2, [b2.id]: 1 });

  // 清掉进度: 文件夹里的每个都清
  store.resetLearn(combo.id);
  store.resetKnown(combo.id);
  assert.deepEqual(combo.learn, {});
  assert.deepEqual(combo.known, []);

  // 游戏成绩记在文件夹上
  assert.equal(store.recordBest(combo.id, 'match', 5000), true);
  assert.deepEqual(store.getFolder(f.id).best, { match: 5000 });
  assert.deepEqual(combo.best, { match: 5000 });

  assert.equal(store.getSet('folder:nope'), null);
});

test('备份带上文件夹', () => {
  const from = new Store(memoryStorage());
  const a = from.putSet(sampleSet());
  from.putFolder({ ...makeFolder('F'), setIds: [a.id] });
  const to = new Store(memoryStorage());
  to.importBackup(from.exportBackup());
  assert.equal(to.allFolders().length, 1);
  assert.deepEqual(to.allFolders()[0].setIds, [a.id]);
});

test('答题时排好下次复习, 记今天学过; 存了再读还在', () => {
  const storage = memoryStorage();
  const store = new Store(storage);
  const set = store.putSet(sampleSet());
  const [apple, pear] = set.cards;
  const noon = new Date(2026, 9, 12, 12).getTime();
  store.recordAnswer(set.id, apple.id, true, { now: noon });
  store.recordAnswer(set.id, pear.id, false, { now: noon });
  const stats = new Store(storage).getSet(set.id).stats;
  assert.equal(stats[apple.id].interval, 1);
  assert.equal(stats[apple.id].due, new Date(2026, 9, 13).getTime());
  assert.equal(stats[pear.id].due, noon + 10 * 60 * 1000);
  assert.deepEqual(new Store(storage).data.activity, { '2026-10-12': 2 });

  // 判错了改成对: 复习也按答对排
  store.amendAnswer(set.id, pear.id);
  assert.equal(store.getSet(set.id).stats[pear.id].interval, 1);
});

test('存不进去 (空间满了): 不抛错, 告诉 onSaveError; 编辑保存 (putSet) 才抛错', () => {
  const storage = memoryStorage();
  const store = new Store(storage);
  const set = store.putSet(sampleSet());
  let told = 0;
  store.onSaveError = () => told++;
  storage.setItem = () => {
    throw new Error('QuotaExceededError');
  };
  store.setKnown(set.id, set.cards[0].id, true);
  store.recordAnswer(set.id, set.cards[0].id, true);
  assert.equal(told, 2);
  assert.throws(() => store.putSet(sampleSet()));
});

test('撤销时恢复统计; 删卡片集时清掉它另外记的东西', () => {
  const storage = memoryStorage();
  const store = new Store(storage);
  const set = store.putSet(sampleSet());
  const [apple] = set.cards;
  store.recordAnswer(set.id, apple.id, true);
  const before = structuredClone(store.getSet(set.id).stats[apple.id]);
  store.recordAnswer(set.id, apple.id, false);
  store.restoreStat(set.id, apple.id, before);
  assert.deepEqual(store.getSet(set.id).stats[apple.id], before);
  store.restoreStat(set.id, apple.id, null);
  assert.equal(store.getSet(set.id).stats[apple.id], undefined);

  storage.setItem(`wengu:cards-session:${set.id}`, '{}');
  storage.setItem(`wengu:learn-goal:${set.id}`, '"cram"');
  store.deleteSet(set.id);
  assert.equal(storage.getItem(`wengu:cards-session:${set.id}`), null);
  assert.equal(storage.getItem(`wengu:learn-goal:${set.id}`), null);
});

test('导入备份时合并打卡记录 (同一天取多的)', () => {
  const from = new Store(memoryStorage());
  from.putSet(sampleSet());
  from.data.activity = { '2026-10-10': 5, '2026-10-11': 2 };
  const to = new Store(memoryStorage());
  to.data.activity = { '2026-10-11': 7, '2026-10-12': 1 };
  to.importBackup(from.exportBackup());
  assert.deepEqual(to.data.activity, { '2026-10-10': 5, '2026-10-11': 7, '2026-10-12': 1 });
});
