import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FSRSAlgorithm, generatorParameters } from '../js/vendor/fsrs.js';
import { cardsOf, lossAndGrad, smoothAndFill, splitOutliers, optimize, evaluate, usable, DEFAULT_W } from '../js/optimize.js';
import { schedule, currentParameters, useParameters, DAY } from '../js/srs.js';
import { fullHistory, fullHistories, encodeReview, pack } from '../js/revlog.js';
import { Store, makeSet, makeCard, cleanData, cleanSettings } from '../js/store.js';
import { mergeData } from '../js/merge.js';
import { reviewAfter, firstReview } from '../js/mistakes.js';

function memoryStorage() {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k) };
}

function random(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 照一套「真的」参数模拟复习: 按稳定性隔几天来, 按遗忘曲线的把握记得 / 忘了 (忘了当天再来一次)
const T0 = new Date(2025, 0, 1, 9).getTime();
function simulate(w, { cards = 300, days = 200, seed = 1 } = {}) {
  const algo = new FSRSAlgorithm(generatorParameters({ w, enable_fuzz: false, enable_short_term: true }));
  const rand = random(seed);
  const out = [];
  for (let c = 0; c < cards; c++) {
    let day = Math.floor(rand() * 30);
    let g = rand() < 0.3 ? 1 : 3;
    const list = [{ at: T0 + day * DAY, rating: g }];
    let mem = algo.next_state(null, 0, g);
    if (g === 1) (list.push({ at: T0 + day * DAY + 600000, rating: 3 }), (mem = algo.next_state(mem, 0, 3)));
    for (;;) {
      const gap = Math.max(1, Math.round(mem.stability * (0.7 + rand() * 0.6)));
      if (day + gap > days) break;
      day += gap;
      g = rand() < algo.forgetting_curve(gap, mem.stability) ? 3 : 1;
      list.push({ at: T0 + day * DAY + 3600000, rating: g });
      mem = algo.next_state(mem, gap, g);
      if (g === 1) (list.push({ at: T0 + day * DAY + 4200000, rating: 3 }), (mem = algo.next_state(mem, 0, 3)));
    }
    out.push(list);
  }
  return out;
}

// 记得的更久、忘了的忘得更狠的人
const TRUE_W = [0.6, 1.3, 5.5, 8.3, 6.8, 0.83, 2.6, 0.02, 1.4, 0.2, 1.1, 1.9, 0.06, 0.3, 1.3, 0.6, 1.87, 0.45, 0.15, 0.07, 0.3];

test('自己求的导数跟数值差分一样 (21 个参数)', () => {
  const cards = cardsOf(simulate(DEFAULT_W, { cards: 40, days: 120, seed: 3 }));
  for (const c of cards) c.weights = new Float64Array(c.ratings.length).fill(1);
  const w = DEFAULT_W.map((x, i) => (i === 7 ? 0.05 : x * 1.07)); // 离开夹住的边
  const grad = new Float64Array(21);
  lossAndGrad(w, cards, grad);
  for (let k = 0; k < 21; k++) {
    const e = 1e-5 * Math.max(1, Math.abs(w[k]));
    const up = [...w];
    const down = [...w];
    up[k] += e;
    down[k] -= e;
    const fd = (lossAndGrad(up, cards) - lossAndGrad(down, cards)) / (2 * e);
    assert.ok(Math.abs(fd - grad[k]) <= 1e-6 * Math.max(1, Math.abs(fd)), `w${k}: ${grad[k]} vs ${fd}`);
  }
});

test('记录变成每次隔几天 (按日子算); 同一天的隔 0 天; 没有隔天复习的卡片不要', () => {
  const at = (d, h) => new Date(2025, 0, 1 + d, h).getTime();
  const [card] = cardsOf([
    [
      { at: at(0, 9), rating: 1 },
      { at: at(0, 23), rating: 3 },
      { at: at(1, 1), rating: 3 },
      { at: at(5, 20), rating: 2 },
    ],
  ]);
  assert.deepEqual(card.deltas, [0, 0, 1, 4]);
  assert.deepEqual(card.ratings, [1, 3, 3, 2]);
  assert.equal(cardsOf([[{ at: at(0, 9), rating: 3 }, { at: at(0, 10), rating: 3 }], [{ at: at(0, 9), rating: 3 }]]).length, 0);
  assert.deepEqual(usable([[{ at: at(0, 9), rating: 3 }, { at: at(2, 9), rating: 3 }, { at: at(2, 10), rating: 1 }]]), { cards: 1, reviews: 3, items: 1 });
});

test('第一次以后的稳定性: 评分高的不能比低的小, 没数据的推出来, 都没有就算不了', () => {
  assert.deepEqual(smoothAndFill({ 1: 0.5, 2: 1, 3: 3, 4: 9 }, { 1: 5, 2: 5, 3: 5, 4: 5 }), [0.5, 1, 3, 9]);
  const fixed = smoothAndFill({ 1: 2, 3: 1 }, { 1: 10, 3: 100 }); // 1 比 3 大, 3 的张数多: 1 改成 3 的
  assert.equal(fixed[0], fixed[2]);
  const filled = smoothAndFill({ 3: 5 }, { 3: 50 });
  assert.ok(Math.abs(filled[2] / filled[0] - DEFAULT_W[2] / DEFAULT_W[0]) < 1e-9); // 只有一个: 按默认的比例放大
  const two = smoothAndFill({ 1: 0.4, 3: 4 }, { 1: 20, 3: 80 });
  assert.ok(two[0] < two[1] && two[1] < two[2] && two[2] < two[3], two.join());
  assert.equal(smoothAndFill({}, {}), null);
});

test('去掉怪的: 第一次评分 + 隔几天 的组合太少的不要', () => {
  const at = (d) => T0 + d * DAY;
  const card = (first, gap) => [{ at: at(0), rating: first }, { at: at(gap), rating: 3 }, { at: at(gap * 3), rating: 3 }];
  const histories = [...Array.from({ length: 200 }, () => card(3, 2)), ...Array.from({ length: 30 }, () => card(3, 4)), ...Array.from({ length: 3 }, () => card(3, 40))];
  const { init, train } = splitOutliers(cardsOf(histories));
  assert.equal(train.length, 230); // 隔 40 天的那 3 张去掉
  assert.equal(init.length, 230);
});

test('按记录优化: 比默认参数准, 往真的参数那边走; 记录太少用默认的', () => {
  const histories = simulate(TRUE_W, { cards: 600, days: 250, seed: 5 });
  const r = optimize(histories);
  assert.equal(r.status, 'trained');
  assert.ok(r.better);
  assert.ok(r.after.logLoss < r.before.logLoss, `${r.after.logLoss} vs ${r.before.logLoss}`);
  assert.ok(r.after.rmse < r.before.rmse);
  assert.ok(r.w[2] > DEFAULT_W[2] * 1.3, `第一次记得的稳定性 ${r.w[2]}`);
  assert.ok(Math.abs(evaluate(TRUE_W, cardsOf(histories)).logLoss - r.after.logLoss) < 0.01);
  assert.ok(r.w.every(Number.isFinite) && r.w.length === 21);
  // 已经是对的参数: 新算的不比它准就不换
  const same = optimize(histories, { current: r.w });
  assert.equal(same.better, same.after.logLoss < same.current.logLoss - 1e-6);
  // 太少
  const few = optimize(simulate(TRUE_W, { cards: 2, days: 30, seed: 1 }));
  assert.equal(few.status, 'default');
  assert.deepEqual(few.w, DEFAULT_W);
  assert.equal(few.better, false);
});

test('完整的记录才拿来优化: 第一次和最后一次都对得上', () => {
  const log = { a: pack([encodeReview(T0, 3), encodeReview(T0 + 2 * DAY, 3)]) };
  assert.equal(fullHistory({ first: T0 + 30000, at: T0 + 2 * DAY }, log, 'a').length, 2);
  assert.equal(fullHistory({ right: 3, wrong: 0, at: T0 + 2 * DAY }, log, 'a'), null); // 没记哪天开始背, 答过的比记录多 (有记录以前就背过)
  assert.equal(fullHistory({ right: 1, wrong: 1, at: T0 + 2 * DAY }, log, 'a').length, 2); // 没记哪天开始背, 但每次都在记录里 (v1.18 从 Anki 搬来的)
  assert.equal(fullHistory({ first: T0 - DAY, at: T0 + 2 * DAY }, log, 'a'), null); // 开始背比记录早
  assert.equal(fullHistory({ first: T0, at: T0 + 5 * DAY }, log, 'a'), null); // 后来又背过, 记录没跟上
  assert.equal(fullHistory({ first: T0, at: T0 }, {}, 'a'), null);
});

test('用自己的参数: 排复习跟着变, 记得多牢按新参数重算; 错题一直用默认的; 换回默认; 存着、同步听后换的', () => {
  const storage = memoryStorage();
  const store = new Store(storage);
  const set = store.putSet(makeSet({ cards: [makeCard('a', '1'), makeCard('b', '2')] }));
  const [a, b] = set.cards;
  store.recordAnswer(set.id, a.id, true, { now: T0, selfRated: true });
  store.recordAnswer(set.id, a.id, true, { now: T0 + 3 * DAY, selfRated: true });
  // b: 以前背过的 (没有 first), 不重算
  store.getSet(set.id).stats[b.id] = { right: 1, wrong: 0, interval: 3, ease: 2.5, s: 3, d: 5, due: T0 + 3 * DAY, at: T0 };
  const before = structuredClone(store.getSet(set.id).stats);
  const firstDefault = schedule(null, true, T0).interval;

  const w = [...DEFAULT_W];
  w[2] = 10; // 第一次就会: 稳定性 10 天
  const n = store.setParameters({ w, items: 500, logLoss: [0.4, 0.35], rmse: [0.08, 0.04] }, T0 + 4 * DAY);
  assert.equal(n, 1);
  assert.deepEqual(currentParameters().slice(0, 4), w.slice(0, 4));
  assert.ok(schedule(null, true, T0).interval > firstDefault);
  const after = store.getSet(set.id).stats;
  assert.ok(after[a.id].s > before[a.id].s);
  assert.equal(after[a.id].due, before[a.id].due); // 排好的日子不动
  assert.deepEqual(after[b.id], before[b.id]);
  // 错题照旧
  const m = reviewAfter(firstReview(T0), true, T0 + DAY);
  useParameters(null);
  assert.deepEqual(reviewAfter(firstReview(T0), true, T0 + DAY), m);
  // 存着: 重新打开还用自己的
  const again = new Store(storage);
  assert.equal(again.data.settings.fsrs.w[2], 10);
  assert.equal(currentParameters()[2], 10);
  assert.equal(fullHistories(again.allSets(), again.data.revlog).length, 1);
  // 同步: 参数听后换的, 复习上限另外算
  const local = cleanData(JSON.parse(storage.getItem('wengu:v1')));
  const remote = cleanData({ ...structuredClone(local), settings: { reviewsPerDay: 50, at: T0 + 9 * DAY } });
  const merged = mergeData(local, remote);
  assert.equal(merged.settings.reviewsPerDay, 50);
  assert.equal(merged.settings.fsrs.w[2], 10);
  // 换回默认 (比优化晚): 同步时也换回去
  again.setParameters(null, T0 + 10 * DAY);
  assert.deepEqual(currentParameters(), DEFAULT_W);
  const back = mergeData(cleanData(JSON.parse(storage.getItem('wengu:v1'))), local);
  assert.equal(back.settings.fsrs, null);
  // 坏的参数不要
  assert.equal(cleanSettings({ fsrs: { w: [1, 2, 3] } }).fsrs, null);
  assert.equal(cleanSettings({ fsrs: { w: DEFAULT_W.map(() => NaN) } }).fsrs, null);
  new Store(memoryStorage()); // 别的测试用默认的
});
