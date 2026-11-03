// 题目集 (错题集里放题的, 像卡片集): 以前没有题目集的题怎么自动分组 (几台设备分出来一样), 题目集里看的题型,
// 新建、改名、删除 (连里面的题)、把题挪到别的题目集, 同步、备份怎么合, 重做时只做一个题目集
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newMistake, cleanQset, mergeQset, autoGroup, autoQsetId, kindIn, kindStats, qsetCounts, firstReview, UNSORTED, QSET_PREFIX, PREFIX } from '../js/mistakes.js';
import { Store, cleanData } from '../js/store.js';
import { mergeData } from '../js/merge.js';
import { reviewScope } from '../js/views/mistakereview.js';

function memoryStorage() {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k) };
}

const NOW = 1_800_000_000_000;
// 一道题 (v1.49 以前记的: 没有 set)
const q = (id, kind, extra = {}) => ({ ...newMistake(id, NOW - 1000), question: `${kind} 的题 ${id}`, options: ['甲', '乙'], correct: 0, kind, review: { ...firstReview(NOW - 1000, true), due: 1 }, ...extra }); // due: 早就到期了
const old = () => ({
  version: 1,
  sets: [],
  mistakes: [q('a1', 'AP微积分·乘法法则'), q('a2', 'AP微积分·连续与可导'), q('p1', 'AP心理·经典条件反射'), q('f1', '电影·剧情细节'), q('s1', '词汇题'), q('c1', '化学'), q('n1', '', { question: '一道什么都看不出来的题' })],
});

test('自动分组: 题型带科目的按科目, SAT 的按考试, 别的用题型当名字, 什么都没有的放「未分类」', () => {
  const g = (kind, extra = {}) => autoGroup({ ...newMistake('x'), kind, ...extra });
  assert.equal(g('AP微积分·乘法法则'), 'AP微积分');
  assert.equal(g('电影・剧情细节'), '电影', '日文的中点也认');
  assert.equal(g('词汇题'), 'SAT 阅读写作');
  assert.equal(g('代数'), 'SAT 数学');
  assert.equal(g('Il Postino 电影题目'), 'Il Postino 电影题目', '旧题目集变来的: 题目集的名字');
  assert.equal(g('', { question: 'Which choice completes the text with the most logical transition?' }), 'SAT 阅读写作', '没写题型的按猜的');
  assert.equal(g(''), UNSORTED);
  // id 按名字算: 一样的名字一样的 id, 不一样的不一样
  assert.equal(autoQsetId('AP微积分'), autoQsetId('AP微积分'));
  assert.notEqual(autoQsetId('AP微积分'), autoQsetId('AP心理'));
  assert.match(autoQsetId('电影'), /^auto_[0-9a-z]+$/);
});

test('题目集里的题型: 跟题目集同名的科目去掉; 题型分布按短名字显示, 专项练习还按原来的题型筛', () => {
  const qset = { title: 'AP微积分' };
  assert.equal(kindIn({ ...newMistake('x'), kind: 'AP微积分·乘法法则' }, qset), '乘法法则');
  assert.equal(kindIn({ ...newMistake('x'), kind: 'AP心理·记忆' }, qset), 'AP心理·记忆', '别的科目不去');
  assert.equal(kindIn({ ...newMistake('x'), kind: '乘法法则' }, qset), '乘法法则');
  const stats = kindStats([q('a', 'AP微积分·乘法法则'), q('b', 'AP微积分·乘法法则'), q('c', 'AP微积分·除法法则')], (m) => kindIn(m, qset));
  assert.deepEqual(
    stats.map((k) => [k.kind, k.label, k.total]),
    [
      ['AP微积分·乘法法则', '乘法法则', 2],
      ['AP微积分·除法法则', '除法法则', 1],
    ],
  );
  assert.deepEqual(qsetCounts([q('a', 'x'), { ...q('b', 'x'), review: { ...firstReview(NOW), mastered: true } }], NOW), { total: 2, due: 1, left: 1, mastered: 1 });
});

test('以前的题读进来自动分好题目集; 再读一遍不变; 两台设备各自分组, 同步后不会有两个一样的题目集', () => {
  const data = cleanData(old());
  const titles = Object.fromEntries(data.qsets.map((x) => [x.title, x.id]));
  assert.deepEqual(Object.keys(titles).sort(), ['AP微积分', 'AP心理', 'SAT 阅读写作', '化学', '未分类', '电影'].sort());
  const setOf = (id) => data.qsets.find((x) => x.id === data.mistakes.find((m) => m.id === id).set).title;
  assert.equal(setOf('a1'), 'AP微积分');
  assert.equal(setOf('a2'), 'AP微积分');
  assert.equal(setOf('n1'), '未分类');
  assert.deepEqual(cleanData(JSON.parse(JSON.stringify(data))), data, '再读一遍一样');
  // 分组不改题的修改时间 (不然会盖过别的设备真改过的)
  assert.equal(data.mistakes.find((m) => m.id === 'a1').updatedAt, NOW - 1000);
  // 两台设备
  const a = cleanData(old());
  const b = cleanData(old());
  const merged = cleanData(mergeData(a, b));
  assert.equal(merged.qsets.length, 6);
  assert.equal(new Set(merged.qsets.map((x) => x.title)).size, 6);
  // 旧版本 (还没有题目集) 的设备同步过来: 还是同样的分组
  const fromOld = cleanData(mergeData(a, { ...old(), deleted: {} }));
  assert.deepEqual(
    fromOld.qsets.map((x) => x.id).sort(),
    a.qsets.map((x) => x.id).sort(),
  );
});

test('题目集: 新建、改名; 记题时放进去 (写错了题目集的按题型放); 加了题的题目集排到前面', () => {
  const store = new Store(memoryStorage());
  const calc = store.addQset('  AP微积分  ', NOW);
  assert.equal(calc.title, 'AP微积分');
  const movie = store.addQset('Il Postino', NOW + 1);
  assert.deepEqual(store.allQsets().map((x) => x.title), ['Il Postino', 'AP微积分']);
  store.putMistake({ ...q('m1', '乘法法则'), set: calc.id }, NOW + 10);
  assert.equal(store.getMistake('m1').set, calc.id);
  assert.deepEqual(store.allQsets().map((x) => x.title), ['AP微积分', 'Il Postino'], '刚加了题的在前面');
  store.putMistake({ ...q('m2', '电影·人物'), set: 'nope' }, NOW + 20);
  assert.equal(store.getQset(store.getMistake('m2').set).title, '电影', '题目集不对: 按题型放');
  store.renameQset(movie.id, '邮差', NOW + 30);
  assert.equal(store.getQset(movie.id).title, '邮差');
  assert.deepEqual(store.mistakesIn(calc.id).map((m) => m.id), ['m1']);
});

test('把题挪到别的题目集: 题算改过了 (同步时听这边的), 另一台设备也跟着挪', () => {
  const a = new Store(memoryStorage());
  a.data = cleanData(old());
  const b = new Store(memoryStorage());
  b.data = cleanData(old());
  const target = a.addQset('期末复习', NOW + 100);
  assert.equal(a.moveMistakes(['a1', 'p1', 'missing'], target.id, NOW + 200), 2);
  assert.equal(a.moveMistakes(['a1'], target.id, NOW + 300), 0, '已经在里面的不算');
  assert.equal(a.getMistake('a1').set, target.id);
  assert.ok(a.getMistake('a1').updatedAt >= NOW + 200);
  const merged = cleanData(mergeData(b.data, a.data));
  assert.deepEqual(
    merged.mistakes.filter((m) => m.set === target.id).map((m) => m.id).sort(),
    ['a1', 'p1'],
  );
  assert.ok(merged.qsets.some((x) => x.title === '期末复习'));
  assert.equal(a.moveMistakes(['a2'], 'nope'), 0, '没有的题目集不挪');
});

test('删掉题目集连里面的题一起删; 同步后另一台设备也删掉, 不会又回来', () => {
  const a = new Store(memoryStorage());
  a.data = cleanData(old());
  const b = new Store(memoryStorage());
  b.data = cleanData(old());
  const calc = a.data.qsets.find((x) => x.title === 'AP微积分');
  assert.equal(a.deleteQset(calc.id, NOW + 500), 2);
  assert.ok(!a.getQset(calc.id));
  assert.equal(a.data.deleted[QSET_PREFIX + calc.id], NOW + 500);
  assert.equal(a.data.deleted[`${PREFIX}a1`], NOW + 500);
  const merged = cleanData(mergeData(b.data, a.data));
  assert.ok(!merged.qsets.some((x) => x.id === calc.id));
  assert.ok(!merged.mistakes.some((m) => m.id === 'a1' || m.id === 'a2'));
  // 删了以后, 另一台设备 (还没同步) 往这个题目集里加了新题: 题留着, 题目集也回来
  const late = cleanData({ ...a.data, mistakes: [...a.data.mistakes, { ...q('a9', 'AP微积分·新题', { createdAt: NOW + 600, updatedAt: NOW + 600 }), set: calc.id }] });
  const back = late.qsets.find((x) => x.id === calc.id);
  assert.ok(back && back.updatedAt > NOW + 500);
  assert.equal(late.mistakes.find((m) => m.id === 'a9').set, calc.id);
  assert.ok(cleanData(mergeData(late, a.data)).qsets.some((x) => x.id === calc.id), '同步时不会被删除记录去掉');
});

test('题目集同步: 名字听后改的; 合并、清理都不会把乱的留下', () => {
  assert.equal(cleanQset(null), null);
  assert.equal(cleanQset({ title: 'x' }), null);
  assert.deepEqual(cleanQset({ id: 'q1', title: '  名字  ', createdAt: 5 }), { id: 'q1', title: '名字', createdAt: 5, updatedAt: 5 });
  assert.equal(cleanQset({ id: 'q1', title: 'x'.repeat(100), createdAt: 1 }).title.length, 60);
  const m = mergeQset({ id: 'q', title: '旧', createdAt: 5, updatedAt: 10 }, { id: 'q', title: '新', createdAt: 3, updatedAt: 20 });
  assert.deepEqual(m, { id: 'q', title: '新', createdAt: 3, updatedAt: 20 });
  // 同步: 一边改了名
  const a = cleanData(old());
  const b = structuredClone(a);
  const id = b.qsets.find((x) => x.title === '电影').id;
  Object.assign(b.qsets.find((x) => x.id === id), { title: 'Il Postino', updatedAt: NOW + 1 });
  assert.equal(cleanData(mergeData(a, b)).qsets.find((x) => x.id === id).title, 'Il Postino');
  assert.equal(cleanData(mergeData(b, a)).qsets.find((x) => x.id === id).title, 'Il Postino');
});

test('备份: 题目集跟题一起恢复, 删掉了的也回来', () => {
  const store = new Store(memoryStorage());
  store.data = cleanData(old());
  const backup = store.exportBackup();
  const id = store.data.qsets.find((x) => x.title === '化学').id;
  store.deleteQset(id, NOW + 1);
  store.renameQset(store.data.qsets.find((x) => x.title === '电影').id, '电影题', NOW + 2);
  store.importBackup(backup, NOW + 3);
  assert.equal(store.getQset(id)?.title, '化学');
  assert.equal(store.mistakesIn(id).length, 1);
  assert.ok(!store.data.deleted[QSET_PREFIX + id]);
  assert.ok(store.data.qsets.some((x) => x.title === '电影题'), '这边后改的名字留着');
});

test('旧的题目集 (v1.42 以前的卡片集) 变成的题: 放进跟旧题目集同名的题目集', () => {
  const data = cleanData({ sets: [{ id: 'quiz1', kind: 'quiz', title: 'Il Postino 电影题', createdAt: NOW - 5000, updatedAt: NOW - 5000, cards: [{ id: 'c1', term: 'Who is Mario?', q: { type: 'choice', options: ['a', 'b'], correct: [1] } }] }] });
  assert.equal(data.qsets.length, 1);
  assert.equal(data.qsets[0].title, 'Il Postino 电影题');
  assert.equal(data.mistakes[0].set, data.qsets[0].id);
});

test('重做: 只做一个题目集的 (今天该做的 / 还没掌握的 / 一类的), 做完回那个题目集', () => {
  const store = new Store(memoryStorage());
  store.data = cleanData(old());
  const calc = store.data.qsets.find((x) => x.title === 'AP微积分');
  const ids = (s) => s.list.map((m) => m.id).sort();
  const due = reviewScope(store, `set:${calc.id}`);
  assert.deepEqual(ids(due), ['a1', 'a2']);
  assert.equal(due.back, `#/mistakes/set/${calc.id}`);
  assert.equal(due.backText, 'AP微积分');
  assert.deepEqual(ids(reviewScope(store, `set:${calc.id}`, 'all')), ['a1', 'a2']);
  const kind = reviewScope(store, `set:${calc.id}`, 'kind:AP微积分·乘法法则');
  assert.deepEqual(ids(kind), ['a1']);
  // 全掌握了: 题型用短名字说
  store.getMistake('a1').review.mastered = true;
  assert.equal(reviewScope(store, `set:${calc.id}`, 'kind:AP微积分·乘法法则').none, '「乘法法则」已全部掌握');
  // 不在题目集里的: 跟以前一样
  assert.equal(reviewScope(store).list.length, 6);
  assert.equal(reviewScope(store).back, '#/mistakes');
  // 只做一道: 回它的题目集
  assert.equal(reviewScope(store, 'p1').back, `#/mistakes/set/${store.getMistake('p1').set}`);
  assert.equal(reviewScope(store, 'set:nope').list.length, 0);
});
