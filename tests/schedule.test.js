import { test } from 'node:test';
import assert from 'node:assert/strict';
import { get_fuzz_range } from '../js/vendor/fsrs.js';
import { DAY, schedule, replay, spreadInterval, intervalRatio, cleanRetention, currentRetention, isLapse, leechAlert, isDue, dueTomorrow, startOfDay, daysLater, useParameters } from '../js/srs.js';
import { newCards, newToday, todayQueue } from '../js/plan.js';
import { Store, makeSet, makeCard, cleanData, cleanSettings } from '../js/store.js';
import { mergeData, mergeSettings } from '../js/merge.js';
import { historyOf } from '../js/revlog.js';

function memoryStorage() {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k) };
}

const now = new Date(2026, 9, 17, 9, 0).getTime();
const cardsOf = (n) => Array.from({ length: n }, (_, i) => makeCard(`w${i}`, `d${i}`));
const dayOf = (t) => Math.round((startOfDay(t) - startOfDay(now)) / DAY);
// 学过的: 上次 at 复习, 稳定性 s 天
const learned = (at, s = 10, due = daysLater(at, s)) => ({ right: 1, wrong: 0, interval: s, ease: 2.5, s, d: 5, due, at, first: at, n: 1 });

function storeWith(cards, stats = {}) {
  const store = new Store(memoryStorage());
  const set = store.putSet(makeSet({ title: 'A', cards, stats }));
  return { store, set: store.getSet(set.id) };
}

test('到期日子错开: 隔 3 天以上的在 Anki 的范围里挑一天, 同一个 seed 每次一样; 短的、没给 seed 的不动', () => {
  assert.equal(spreadInterval(2, 0, { seed: 'a' }), 2);
  assert.equal(spreadInterval(30, 0), 30);
  const { min_ivl, max_ivl } = get_fuzz_range(30, 0, 36500);
  const seen = new Set();
  for (let i = 0; i < 200; i++) {
    const d = spreadInterval(30, 0, { seed: `card${i}` });
    assert.ok(d >= min_ivl && d <= max_ivl, `${d}`);
    seen.add(d);
  }
  assert.ok(seen.size >= max_ivl - min_ivl); // 范围里的日子差不多都用上了
  assert.equal(spreadInterval(30, 0, { seed: 'x' }), spreadInterval(30, 0, { seed: 'x' }));
  // 负载均衡: 别的日子都堆满了, 空着的那天最容易挑中
  const load = (days) => days.map((d) => (d === 29 ? 0 : 50));
  const picks = Array.from({ length: 100 }, (_, i) => spreadInterval(30, 0, { seed: `c${i}`, load }));
  assert.ok(picks.filter((d) => d === 29).length > 90);
});

test('同一天学的一批新词, 第二次以后不会全挤在同一天再来; 按钮上写的跟点了以后排的一样', () => {
  const cards = cardsOf(60);
  const { store, set } = storeWith(cards);
  const preview = store.previewAnswer(set.id, cards[0].id, now);
  assert.ok(preview.again.due - now < DAY);
  for (const c of cards) store.recordAnswer(set.id, c.id, true, { selfRated: true, now });
  assert.equal(set.stats[cards[0].id].due, preview.good.due);
  // 第一次隔两天 (不到 2.5 天, 跟 Anki 一样不错开); 到日子又记得, 往后的就错开了
  // (按钮上的是点之前那一刻算的: 别的卡片排好了, 那几天的张数变了, 挑的日子也会变)
  const later = set.stats[cards[0].id].due + 9 * 3600e3;
  for (const c of cards) {
    const p = store.previewAnswer(set.id, c.id, later);
    store.recordAnswer(set.id, c.id, true, { selfRated: true, now: later });
    assert.equal(set.stats[c.id].due, p.good.due);
  }
  const days = new Map();
  for (const c of cards) days.set(dayOf(set.stats[c.id].due), (days.get(dayOf(set.stats[c.id].due)) ?? 0) + 1);
  assert.ok(days.size >= 3, JSON.stringify([...days]));
  assert.ok(Math.max(...days.values()) < 40, JSON.stringify([...days]));
});

test('每天几张的数: 答一张改一下, 跟从头数的一样; 暂停、撤销以后重数', () => {
  const cards = cardsOf(30);
  const stats = Object.fromEntries(cards.map((c, i) => [c.id, learned(now - 20 * DAY, 20, daysLater(now, i % 3 ? 5 + i : 0))]));
  const { store, set } = storeWith(cards, stats);
  const fresh = () => {
    store.counts = null;
    return [...store.dayCounts(now).map].filter(([, n]) => n).sort((a, b) => a[0] - b[0]);
  };
  store.dayCounts(now);
  for (const c of cards.slice(0, 20)) store.recordAnswer(set.id, c.id, c.term !== 'w3', { selfRated: true, now });
  const kept = [...store.dayCounts(now).map].filter(([, n]) => n).sort((a, b) => a[0] - b[0]);
  assert.deepEqual(kept, fresh());
  store.dayCounts(now);
  store.suspend(set.id, [cards[25].id], true, now);
  assert.equal(store.counts, null);
});

test('负载均衡: 已经有很多张排在某天, 新排的少挑那天', () => {
  const crowd = cardsOf(40);
  const fresh = cardsOf(40);
  // 前 40 张都排在第 30 天
  const stats = Object.fromEntries(crowd.map((c) => [c.id, learned(now - DAY, 30, daysLater(now, 30))]));
  // 后 40 张上次隔了 30 天 (s 30), 今天到日子
  for (const c of fresh) stats[c.id] = learned(now - 30 * DAY, 30, startOfDay(now));
  const { store, set } = storeWith([...crowd, ...fresh], stats);
  for (const c of fresh) store.recordAnswer(set.id, c.id, true, { selfRated: true, now });
  const due = fresh.map((c) => dayOf(set.stats[c.id].due));
  const spread = new Set(due);
  assert.ok(spread.size >= 3);
  const onCrowded = due.filter((d) => d === 30).length;
  assert.ok(onCrowded <= 2, `${onCrowded} 张挤在第 30 天`);
});

test('想记住的把握: 调高隔得短, 调低隔得长; 存着、同步听后改的', () => {
  assert.equal(cleanRetention(0.5), 0.9);
  assert.equal(cleanRetention('0.85'), 0.85);
  assert.equal(cleanRetention(0.999), 0.9);
  assert.equal(intervalRatio(0.9), 1);
  assert.ok(intervalRatio(0.8) > 1.5 && intervalRatio(0.95) < 0.6);
  const prev = learned(now - 20 * DAY, 20, startOfDay(now));
  const at90 = schedule(prev, true, now).interval;
  useParameters(null, 0.95);
  assert.equal(currentRetention(), 0.95);
  const at95 = schedule(prev, true, now).interval;
  useParameters(null, 0.8);
  const at80 = schedule(prev, true, now).interval;
  useParameters(null);
  assert.ok(at95 < at90 && at90 < at80, `${at95} ${at90} ${at80}`);
  // 错题集一直用默认的
  useParameters(null, 0.8);
  assert.equal(schedule(prev, true, now, { own: false }).interval, at90);
  useParameters(null);

  const storage = memoryStorage();
  const store = new Store(storage);
  assert.equal(store.retention, 0.9);
  store.setRetention(0.85, now);
  assert.equal(currentRetention(), 0.85);
  assert.equal(new Store(storage).retention, 0.85);
  const older = cleanSettings({ retention: 0.95, at: now - 1000 });
  assert.equal(mergeSettings(store.data.settings, older).retention, 0.85);
  assert.equal(mergeSettings(older, store.data.settings).retention, 0.85);
  useParameters(null);
});

test('忘了几次 (lapses): 背过、隔了一天以上又忘了才算; 8 次是难记卡, 以后每 4 次再提醒', () => {
  assert.equal(isLapse(undefined, false, now), false); // 新词第一次不会
  const graduated = learned(now - 3 * DAY, 3, startOfDay(now));
  assert.equal(isLapse(graduated, false, now), true);
  assert.equal(isLapse(graduated, true, now), false);
  assert.equal(isLapse({ ...graduated, at: now - 3600e3 }, false, now), false); // 同一天再翻
  assert.equal(isLapse({ ...graduated, interval: 0 }, false, now), false); // 忘了以后当天再练
  assert.deepEqual([7, 8, 9, 12, 16].map(leechAlert), [false, true, false, true, true]);

  const cards = cardsOf(1);
  const { store, set } = storeWith(cards, { [cards[0].id]: graduated });
  store.recordAnswer(set.id, cards[0].id, false, { selfRated: true, now });
  store.recordAnswer(set.id, cards[0].id, false, { selfRated: true, now: now + 600e3 }); // 十分钟后又忘了
  assert.equal(set.stats[cards[0].id].lapses, 1);
  store.recordAnswer(set.id, cards[0].id, false, { now: now + 700e3 }); // 选择题答错不算
  assert.equal(set.stats[cards[0].id].lapses, 1);

  // Anki 的记录: 当天学习步骤里的重来不算, 隔天忘了算
  const r = replay([
    { at: now - 30 * DAY, rating: 1 },
    { at: now - 30 * DAY + 60e3, rating: 3 },
    { at: now - 27 * DAY, rating: 1 },
    { at: now - 27 * DAY + 600e3, rating: 3 },
    { at: now - 20 * DAY, rating: 3 },
    { at: now - 5 * DAY, rating: 1 },
  ]);
  assert.equal(r.lapses, 2);
});

test('暂停: 不排复习、不当新词出, 不算还没背过的; 恢复了照常', () => {
  const cards = cardsOf(4);
  const due = learned(now - 10 * DAY, 10, startOfDay(now));
  const { store, set } = storeWith(cards, { [cards[0].id]: due });
  store.setPlan(set.id, { on: true, perDay: 2 });
  assert.equal(store.suspend(set.id, [cards[0].id, cards[1].id], true, now), 2);
  assert.equal(isDue(set.stats[cards[0].id], now), false);
  assert.deepEqual(newCards(set, now).map((c) => c.term), ['w2', 'w3']);
  assert.equal(newToday(store.getSet(set.id), now).left, 2);
  const q = todayQueue([store.getSet(set.id)], { now });
  assert.deepEqual([q.reviews.length, q.fresh.map((x) => x.card.term)], [0, ['w2', 'w3']]);
  assert.equal(dueTomorrow([set], now - DAY), 0);
  assert.equal(store.suspend(set.id, [cards[0].id], true, now), 0); // 已经暂停了
  store.suspend(set.id, [cards[0].id, cards[1].id], false, now + 1000);
  assert.equal(isDue(set.stats[cards[0].id], now + 2000), true);
  assert.equal(newToday(set, now).left, 3);
});

test('明天再说: 今天不出, 新词后面的补上; 明天照常; 算明天要复习的', () => {
  const cards = cardsOf(4);
  const { store, set } = storeWith(cards, { [cards[0].id]: learned(now - 10 * DAY, 10, startOfDay(now)) });
  store.setPlan(set.id, { on: true, perDay: 2 });
  store.bury(set.id, cards[0].id, now);
  store.bury(set.id, cards[1].id, now);
  const q = todayQueue([set], { now });
  assert.deepEqual([q.reviews.length, q.fresh.map((x) => x.card.term)], [0, ['w2', 'w3']]);
  assert.equal(dueTomorrow([set], now), 1);
  const tomorrow = daysLater(now, 1) + 8 * 3600e3;
  assert.equal(isDue(set.stats[cards[0].id], tomorrow), true);
  // 读回来: 还没过那天的留着, 过了那天的 (上面那张是按 2026 年 10 月 17 日说的) 不留了
  store.bury(set.id, cards[2].id, Date.now());
  const back = cleanData(JSON.parse(JSON.stringify(store.data)));
  assert.ok(back.sets[0].stats[cards[2].id].bury > Date.now());
  assert.equal(back.sets[0].stats[cards[0].id].bury, undefined);
});

test('同步: 暂停、明天再说比以前答的新就听这边的; 读回来都留着; 撤销暂停不动复习记录', () => {
  const cards = cardsOf(2);
  const { store, set } = storeWith(cards);
  store.recordAnswer(set.id, cards[0].id, true, { selfRated: true, now });
  const other = structuredClone(store.data);
  const before = structuredClone(set.stats[cards[0].id]);
  store.suspend(set.id, [cards[0].id], true, now + 5000);
  const merged = cleanData(mergeData(other, store.data));
  assert.ok(merged.sets[0].stats[cards[0].id].sus > 0);
  assert.ok(cleanData(mergeData(store.data, other)).sets[0].stats[cards[0].id].sus > 0);
  store.putStat(set.id, cards[0].id, before, now + 6000);
  assert.equal(set.stats[cards[0].id].sus, undefined);
  assert.equal(historyOf(store.data.revlog, cards[0].id).length, 1);
  set.stats[cards[1].id] = { right: 0, wrong: 3, lapses: 9, sus: now, rev: now };
  const clean = cleanData(JSON.parse(JSON.stringify(store.data)));
  assert.deepEqual(clean.sets[0].stats[cards[1].id], { right: 0, wrong: 3, lapses: 9, sus: now, rev: now });
});

test('导入 Anki 的记录: 日子错开, 暂停了的也暂停, 数忘了几次', () => {
  const cards = cardsOf(30);
  const { store, set } = storeWith(cards);
  // 30 张一样的记录 (前天学的, 一模一样), 不错开就全在同一天
  const reviews = [
    { at: now - 40 * DAY, rating: 3 },
    { at: now - 37 * DAY, rating: 3 },
    { at: now - 25 * DAY, rating: 3 },
  ];
  const n = store.importReviews(set.id, cards.map((c, i) => [c.id, reviews, i === 0]), now);
  assert.equal(n, 30);
  assert.ok(set.stats[cards[0].id].sus > 0);
  assert.equal(set.stats[cards[1].id].sus, undefined);
  assert.equal(set.stats[cards[1].id].lapses, undefined);
  const days = new Set(cards.map((c) => dayOf(set.stats[c.id].due)));
  assert.ok(days.size >= 2, [...days].join());
  // 只说暂停、没有记录的也行
  const more = cardsOf(1);
  const s2 = store.putSet(makeSet({ cards: more }));
  assert.equal(store.importReviews(s2.id, [[more[0].id, undefined, true]], now), 0);
  assert.ok(store.getSet(s2.id).stats[more[0].id].sus > 0);
});
