import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanPlan, planOf, newCards, newToday, todayQueue, reviewedToday, mixIn, isNew, examTime, DEFAULT_PER_DAY } from '../js/plan.js';
import { DAY, retrievability } from '../js/srs.js';
import { Store, makeSet, makeCard, cleanData } from '../js/store.js';
import { mergeData } from '../js/merge.js';

function memoryStorage() {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k) };
}

const now = new Date(2026, 9, 17, 9, 0).getTime();
const today0 = new Date(2026, 9, 17).getTime();
const dateKey = (t) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const cardsOf = (n) => Array.from({ length: n }, (_, i) => makeCard(`w${i}`, `d${i}`));
// 学过的卡片: 上次 at 复习, 稳定性 s 天, due 到日子
const learned = (at, s = 3, due = at + s * DAY, first = at) => ({ right: 1, wrong: 0, interval: s, ease: 2.5, s, d: 5, due, at, first });

test('计划: 坏的、超出范围的改好; 没定过按默认 (没开)', () => {
  assert.equal(cleanPlan(null), null);
  assert.equal(cleanPlan([1]), null);
  assert.deepEqual(cleanPlan({ on: 1, perDay: 9999, exam: '2026-13', rest: -2, order: 'x', at: 'no' }), { on: true, perDay: 500, exam: '', rest: 0, order: 'set', seed: '', at: 0 });
  assert.equal(cleanPlan({ perDay: 'abc' }).perDay, DEFAULT_PER_DAY);
  assert.equal(cleanPlan({ exam: '2026-12-05' }).exam, '2026-12-05');
  assert.deepEqual([planOf(makeSet()).on, planOf(makeSet()).perDay], [false, DEFAULT_PER_DAY]);
  assert.equal(examTime('2026-12-05'), new Date(2026, 11, 5).getTime());
});

test('新词: 没排过复习的; 默认按卡片集里的顺序, 随机的每次一样, 换种子换顺序', () => {
  const cards = cardsOf(30);
  const set = makeSet({ cards, stats: { [cards[0].id]: learned(now - DAY), [cards[1].id]: { right: 2, wrong: 0 } } });
  assert.ok(isNew(set.stats[cards[1].id])); // 只在游戏 / 选择题里答过, 还算新词
  assert.deepEqual(newCards(set).map((c) => c.term).slice(0, 3), ['w1', 'w2', 'w3']);
  const a = newCards({ ...set, plan: cleanPlan({ order: 'random', seed: 'abc' }) }).map((c) => c.id);
  const b = newCards({ ...set, plan: cleanPlan({ order: 'random', seed: 'abc' }) }).map((c) => c.id);
  const c = newCards({ ...set, plan: cleanPlan({ order: 'random', seed: 'xyz' }) }).map((c) => c.id);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
  assert.notDeepEqual(a, newCards(set).map((c) => c.id));
  assert.equal(a.length, 29);
  assert.deepEqual([...a].sort(), newCards(set).map((c) => c.id).sort());
});

test('每天固定几个: 今天学了的扣掉; 没开计划不给; 算哪天学完', () => {
  const cards = cardsOf(100);
  const stats = {};
  for (const c of cards.slice(0, 3)) stats[c.id] = learned(now - 60 * 1000, 0.5, now + 9 * 60 * 1000, now - 60 * 1000); // 今天学的
  stats[cards[3].id] = learned(now - 5 * DAY); // 以前学的
  const set = makeSet({ cards, stats, plan: cleanPlan({ on: true, perDay: 20 }) });
  const info = newToday(set, now);
  assert.deepEqual([info.mode, info.perDay, info.learned, info.today, info.left], ['fixed', 20, 3, 17, 96]);
  // 今天学完 17 个还剩 79 个, 每天 20 个: 再 4 天
  assert.equal(dateKey(info.finish), dateKey(today0 + 4 * DAY));
  assert.equal(newToday({ ...set, plan: cleanPlan({ on: false, perDay: 20 }) }, now).today, 0);
  // 剩的比每天的少
  assert.equal(newToday({ ...set, plan: cleanPlan({ on: true, perDay: 200 }) }, now).today, 96);
  // 都背过了
  const all = Object.fromEntries(cards.map((c) => [c.id, learned(now - 5 * DAY)]));
  const done = newToday({ ...set, stats: all }, now);
  assert.deepEqual([done.today, done.left, done.finish], [0, 0, 0]);
});

test('按考试日期: 剩的平分到考前 (留几天只复习); 今天学的不让数字变; 快考试只复习; 考过了按固定的', () => {
  const cards = cardsOf(70);
  const exam = dateKey(today0 + 10 * DAY + DAY / 2); // 10 天后考试, 考前 3 天只复习: 还能学 7 天
  const set = makeSet({ cards, plan: cleanPlan({ on: true, perDay: 5, exam, rest: 3 }) });
  let info = newToday(set, now);
  assert.deepEqual([info.mode, info.daysLeft, info.perDay, info.today], ['exam', 10, 10, 10]);
  assert.equal(dateKey(info.finish), dateKey(today0 + 6 * DAY)); // 第 7 天学完
  // 今天学了 4 个: 每天还是 10 个, 今天还有 6 个
  const stats = Object.fromEntries(cards.slice(0, 4).map((c) => [c.id, learned(now, 0.5, now + 600000)]));
  info = newToday({ ...set, stats }, now);
  assert.deepEqual([info.perDay, info.learned, info.today, info.left], [10, 4, 6, 66]);
  // 考前 3 天
  info = newToday(set, today0 + 8 * DAY + 3600000);
  assert.deepEqual([info.mode, info.today], ['rest', 0]);
  // 考试那天
  assert.equal(newToday(set, today0 + 10 * DAY + 3600000).mode, 'rest');
  // 考过了
  info = newToday(set, today0 + 12 * DAY + 3600000);
  assert.deepEqual([info.mode, info.perDay, info.today], ['passed', 5, 5]);
});

test('今天的: 复习有上限, 最可能忘的先来; 今天忘了又到时候的不算上限; 新词只从开了计划的来', () => {
  const cards = cardsOf(8);
  const stats = {};
  // 5 张到日子的, 稳定性越小越容易忘
  [10, 2, 30, 1, 5].forEach((s, i) => (stats[cards[i].id] = learned(now - 40 * DAY, s, now - DAY)));
  stats[cards[5].id] = learned(now - 30 * 60 * 1000, 0.3, now - 20 * 60 * 1000, now - 3 * DAY); // 今天忘了, 10 分钟后再来, 已经到了
  const a = makeSet({ cards, stats, plan: cleanPlan({ on: true, perDay: 1 }) });
  const b = makeSet({ cards: cardsOf(5) }); // 没开计划
  const q = todayQueue([a, b], { now, cap: 4, reviewed: 1 });
  assert.equal(q.reviews[0].card.id, cards[5].id);
  assert.deepEqual(q.reviews.slice(1).map((x) => x.card.term), ['w3', 'w1', 'w4']); // 上限 4, 今天已经复习了 1 张: 还能 3 张
  assert.equal(q.held, 2);
  assert.deepEqual(q.fresh.map((x) => x.card.term), ['w6']);
  assert.ok(q.fresh[0].fresh);
  assert.ok(retrievability(stats[cards[3].id], now) < retrievability(stats[cards[2].id], now));
  // 上限是 0 也照样有新词、今天忘了的
  const none = todayQueue([a], { now, cap: 3, reviewed: 10 });
  assert.deepEqual([none.reviews.length, none.fresh.length, none.held], [1, 1, 5]);
});

test('新词均匀插进复习里', () => {
  const r = [1, 2, 3, 4, 5, 6];
  assert.deepEqual(mixIn(r, ['a', 'b']), [1, 2, 'a', 3, 4, 5, 'b', 6]);
  assert.deepEqual(mixIn([], ['a', 'b']), ['a', 'b']);
  assert.deepEqual(mixIn(r, []), r);
  assert.equal(mixIn(r, ['a', 'b', 'c', 'd', 'e', 'f', 'g']).length, 13);
});

test('记住哪天开始背的; 今天复习了几张不算新词; 撤销又变回新词; 计划和上限存着、同步听后改的', () => {
  const storage = memoryStorage();
  const store = new Store(storage);
  const set = store.putSet(makeSet({ cards: cardsOf(3) }));
  const [c0, c1, c2] = set.cards;
  store.recordAnswer(set.id, c0.id, true, { now: now - 3 * DAY, selfRated: true });
  store.recordAnswer(set.id, c0.id, true, { now, selfRated: true }); // 复习
  store.recordAnswer(set.id, c1.id, false, { now, selfRated: true }); // 新词
  store.recordAnswer(set.id, c2.id, true, { now }); // 游戏: 还是新词
  const stats = store.getSet(set.id).stats;
  assert.equal(stats[c0.id].first, now - 3 * DAY);
  assert.equal(stats[c1.id].first, now);
  assert.equal(stats[c2.id].first, undefined);
  assert.equal(reviewedToday(store.allSets(), now), 1);
  assert.equal(newToday(store.getSet(set.id), now).learned, 1);
  store.restoreStat(set.id, c1.id, null);
  assert.ok(isNew(store.getSet(set.id).stats[c1.id]));

  store.setPlan(set.id, { on: true, perDay: 15 }, now);
  store.setReviewCap(120, now);
  const again = new Store(storage);
  assert.deepEqual([again.getSet(set.id).plan.on, again.getSet(set.id).plan.perDay, again.reviewCap], [true, 15, 120]);
  assert.equal(again.getSet(set.id).stats[c0.id].first, now - 3 * DAY);
  assert.equal(new Store(memoryStorage()).reviewCap, 200);
  assert.equal(cleanData({ settings: { reviewsPerDay: -5 } }).settings.reviewsPerDay, 200);

  // 同步: 计划、上限听后改的那边
  const local = cleanData(JSON.parse(storage.getItem('wengu:v1')));
  const remote = structuredClone(local);
  remote.sets[0].plan = { ...remote.sets[0].plan, perDay: 40, at: now + 1000 };
  remote.settings = { reviewsPerDay: 80, at: now - 1000 };
  const merged = mergeData(local, remote);
  assert.equal(merged.sets[0].plan.perDay, 40);
  assert.equal(merged.settings.reviewsPerDay, 120);
});

test('题目集没有每天新词的计划', () => {
  const store = new Store(memoryStorage());
  const quiz = store.putSet(makeSet({ kind: 'quiz', cards: [makeCard('q', '')] }));
  assert.equal(store.setPlan(quiz.id, { on: true }), null);
  assert.equal(newToday({ ...quiz, plan: cleanPlan({ on: true }) }, now).today, 0);
});
