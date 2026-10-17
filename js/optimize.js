// 按自己的复习记录优化 FSRS 的 21 个参数 (跟 Anki 的「优化」一样)。
// 照 fsrs-rs 6.6 (Open Spaced Repetition, BSD-3-Clause, https://github.com/open-spaced-repetition/fsrs-rs)
// 的 compute_parameters 写的 JS 版, 步骤一样:
//   1. 每张卡片的记录变成「第几次、隔了几天、按的哪个键」; 隔天以后的每一次复习都是一道题: 用之前的记录预测「这次还记得的把握」,
//      看实际记没记得 (同一天里的重复只当历史, 不拿来考)
//   2. 去掉怪的 (第一次评分 + 第一次隔几天 这种组合太少的那 5%)
//   3. 先按「第一次评分、过几天还记不记得」估出第一次以后的稳定性 (w0–w3)
//   4. 再从默认参数出发, Adam 梯度下降 5 轮 (每批 512 题, 学习率 0.04 按余弦降, 越近的复习越算数, 别离默认参数太远)
// 梯度是自己一步步求导算的 (正向带着导数走), 跟 fsrs-rs 的 analytic.rs 对得上。
// 同一份记录在浏览器里跑 (Web Worker), 几万次复习一两秒。
// 这个文件是照 fsrs-rs 改写的, 按它的 BSD-3-Clause 许可 (原文在文件最后)。

export const DEFAULT_W = [0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666, 0.796, 1.4835, 0.0614, 0.2629, 1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658, 0.1542];
const N = 21;
const S_MIN = 0.001;
const S_MAX = 36500;
const D_MIN = 1;
const D_MAX = 10;
const INIT_S_MAX = 100;
const MIN_PROB = 1e-7;
const MAX_PROB = 1 - 1e-7;
const STDDEV = [6.43, 9.66, 17.58, 27.85, 0.57, 0.28, 0.6, 0.12, 0.39, 0.18, 0.33, 0.3, 0.09, 0.16, 0.57, 0.25, 1.03, 0.31, 0.32, 0.14, 0.27];
const CLAMPS = [
  [S_MIN, INIT_S_MAX],
  [S_MIN, INIT_S_MAX],
  [S_MIN, INIT_S_MAX],
  [S_MIN, INIT_S_MAX],
  [D_MIN, D_MAX],
  [0.001, 4],
  [0.001, 4],
  [0.001, 0.75],
  [0, 4.5],
  [0, 0.8],
  [0.001, 3.5],
  [0.001, 5],
  [0.001, 0.25],
  [0.001, 0.9],
  [0, 4],
  [0, 1],
  [1, 6],
  [0, 2],
  [0, 2],
  [0.01, 0.8],
  [0.1, 0.8],
];
const CONFIG = { epochs: 5, batchSize: 512, lr: 4e-2, gamma: 1, seed: 2023, maxSeqLen: 256 };
export const MIN_ITEMS = 8; // 少于这么多道「题」: 用默认参数
export const MIN_TRAIN = 64; // 少于这么多: 只估第一次以后的稳定性

const DAY = 24 * 60 * 60 * 1000;
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const inside = (x, lo, hi) => (x >= lo && x <= hi ? 1 : 0); // 跟 PyTorch / Burn 一样: 正好在边上的导数照样传
const clip = (w) => w.map((x, i) => clamp(x, CLAMPS[i][0], CLAMPS[i][1]));

function startOfDay(t) {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// ---- 数据 ----

// histories: [[{ at, rating }]] 每张卡片从第一次背起的记录 (从早到晚) →
// cards: [{ ratings, deltas (隔了几天, 第一次是 0), times }], 只要至少有一次隔天复习的
export function cardsOf(histories) {
  const out = [];
  for (const h of histories) {
    const list = h.filter((r) => r.rating >= 1 && r.rating <= 4).slice(0, CONFIG.maxSeqLen);
    if (list.length < 2) continue;
    const deltas = list.map((r, i) => (i ? Math.max(0, Math.round((startOfDay(r.at) - startOfDay(list[i - 1].at)) / DAY)) : 0));
    if (!deltas.some((d, i) => i && d > 0)) continue;
    out.push({ ratings: list.map((r) => r.rating), deltas, times: list.map((r) => r.at) });
  }
  return out;
}

// 第一次隔天复习是第几次
const firstLong = (card) => card.deltas.findIndex((d, i) => i && d > 0);

// 去掉怪的: 按「第一次评分 → 第一次隔几天」分组, 每种评分里最小的那些组 (加起来 5%, 至少 20 张) 不要;
// 剩下的组里够 6 张、隔得不太久 (100 天, 简单 365 天) 的拿来估第一次以后的稳定性。返回 { init, train }
export function splitOutliers(cards) {
  const groups = new Map(); // 评分 → (隔几天 → [第几张])
  cards.forEach((card, i) => {
    const r = card.ratings[0];
    const dt = card.deltas[firstLong(card)];
    if (!groups.has(r)) groups.set(r, new Map());
    const g = groups.get(r);
    if (!g.has(dt)) g.set(dt, []);
    g.get(dt).push(i);
  });
  const removed = new Set(); // 'r:dt'
  const init = [];
  for (const [r, byDelta] of [...groups].sort((a, b) => a[0] - b[0])) {
    // 小的组、隔得近的先去掉
    const sub = [...byDelta].sort((a, b) => a[1].length - b[1].length || a[0] - b[0]);
    const total = sub.reduce((n, [, list]) => n + list.length, 0);
    const limit = Math.max(20, Math.floor(total / 20));
    let dropped = 0;
    for (const [dt, list] of sub) {
      if (dropped + list.length >= limit) {
        if (list.length >= 6 && dt <= (r !== 4 ? 100 : 365)) init.push(...list);
        else removed.add(`${r}:${dt}`);
      } else {
        dropped += list.length;
        removed.add(`${r}:${dt}`);
      }
    }
  }
  const train = cards.filter((card) => !removed.has(`${card.ratings[0]}:${card.deltas[firstLong(card)]}`));
  return { init: init.map((i) => cards[i]), train };
}

// 要考的: 每张卡片里隔天以后的每一次 → [{ card, i, time }], 按时间排, 越近的越算数 (0.25 → 1)
function weightedItems(cards) {
  const items = [];
  for (const card of cards) {
    card.weights = new Float64Array(card.ratings.length);
    for (let i = 1; i < card.ratings.length; i++) if (card.deltas[i] > 0) items.push({ card, i, time: card.times[i] });
  }
  items.sort((a, b) => a.time - b.time);
  const len = Math.max(1, items.length - 1);
  items.forEach((item, k) => (item.card.weights[item.i] = 0.25 + 0.75 * (k / len) ** 3));
  return items;
}

const countItems = (cards) => cards.reduce((n, c) => n + c.deltas.filter((d, i) => i && d > 0).length, 0);

// 能拿来优化的有多少: { cards 几张卡片, reviews 一共几次复习, items 几道题 (隔天以后的复习) }
export function usable(histories) {
  const cards = cardsOf(histories);
  return { cards: cards.length, reviews: cards.reduce((n, c) => n + c.ratings.length, 0), items: countItems(cards) };
}

// ---- 第一次以后的稳定性 (w0–w3) ----

function curve(t, s, w20 = DEFAULT_W[20]) {
  const decay = -w20;
  const factor = 0.9 ** (1 / decay) - 1;
  return (1 + (Math.max(t, 0) / s) * factor) ** decay;
}

// 按第一次的评分分组, 每组按「过几天、记得的比例」三分搜索出最合适的稳定性。返回 { stability: {评分: s}, count: {评分: 几张} }
export function initialStability(initCards, averageRecall) {
  const groups = new Map();
  for (const card of initCards) {
    const j = firstLong(card);
    const r = card.ratings[0];
    if (!groups.has(r)) groups.set(r, new Map());
    const g = groups.get(r);
    const dt = card.deltas[j];
    if (!g.has(dt)) g.set(dt, []);
    g.get(dt).push(card.ratings[j] > 1 ? 1 : 0);
  }
  const stability = {};
  const count = {};
  for (const [r, byDelta] of groups) {
    const data = [...byDelta].map(([dt, labels]) => {
      const n = labels.length;
      const recall = labels.reduce((a, b) => a + b, 0) / n;
      return { dt, n, recall: (recall * n + averageRecall) / (n + 1) }; // 拉普拉斯平滑
    });
    count[r] = data.reduce((a, d) => a + d.n, 0);
    const def = DEFAULT_W[r - 1];
    const loss = (s) => {
      let sum = 0;
      for (const { dt, n, recall } of data) {
        const p = curve(dt, s);
        sum -= (recall * Math.log(p) + (1 - recall) * Math.log(1 - p)) * n;
      }
      return sum + Math.abs(s - def) / 16;
    };
    let low = S_MIN;
    let high = INIT_S_MAX;
    let best = def;
    for (let k = 0; k < 1000 && high - low > Number.EPSILON; k++) {
      const m1 = low + (high - low) / 3;
      const m2 = high - (high - low) / 3;
      if (loss(m1) < loss(m2)) high = m2;
      else low = m1;
      best = (high + low) / 2;
    }
    stability[r] = best;
  }
  return { stability, count };
}

// 评分越高稳定性应该越大: 反了的按张数多的那个改; 没数据的评分按有的推出来。没有任何数据返回 null
export function smoothAndFill(stability, count) {
  const s = {};
  for (const r of [1, 2, 3, 4]) if (count[r] !== undefined && stability[r] !== undefined) s[r] = stability[r];
  for (const [a, b] of [[1, 2], [2, 3], [3, 4], [1, 3], [2, 4], [1, 4]]) {
    if (s[a] !== undefined && s[b] !== undefined && s[a] > s[b]) {
      if (count[a] > count[b]) s[b] = s[a];
      else s[a] = s[b];
    }
  }
  const w1 = 0.41;
  const w2 = 0.54;
  const has = [1, 2, 3, 4].filter((r) => s[r] !== undefined);
  let out;
  if (!has.length) return null;
  if (has.length === 1) {
    const factor = s[has[0]] / DEFAULT_W[has[0] - 1];
    out = DEFAULT_W.slice(0, 4).map((x) => x * factor).sort((a, b) => a - b);
  } else {
    let [r1, r2, r3, r4] = [s[1], s[2], s[3], s[4]];
    const key = [r1, r2, r3, r4].map((x) => (x === undefined ? '_' : 'x')).join('');
    if (has.length === 2) {
      const k = w1 - w1 * w2 + w2;
      if (key === '__xx') {
        r2 = r3 ** (1 / (1 - w2)) * r4 ** (1 - 1 / (1 - w2));
        r1 = r2 ** (1 / w1) * r3 ** (1 - 1 / w1);
      } else if (key === '_x_x') {
        r3 = r2 ** (1 - w2) * r4 ** w2;
        r1 = r2 ** (1 / w1) * r3 ** (1 - 1 / w1);
      } else if (key === '_xx_') {
        r4 = r2 ** (1 - 1 / w2) * r3 ** (1 / w2);
        r1 = r2 ** (1 / w1) * r3 ** (1 - 1 / w1);
      } else if (key === 'x__x') {
        r2 = r1 ** (w1 / k) * r4 ** (1 - w1 / k);
        r3 = r1 ** (1 - w2 / k) * r4 ** (w2 / k);
      } else if (key === 'x_x_') {
        r2 = r1 ** w1 * r3 ** (1 - w1);
        r4 = r2 ** (1 - 1 / w2) * r3 ** (1 / w2);
      } else if (key === 'xx__') {
        r3 = r1 ** (1 - 1 / (1 - w1)) * r2 ** (1 / (1 - w1));
        r4 = r2 ** (1 - 1 / w2) * r3 ** (1 / w2);
      }
    } else if (has.length === 3) {
      if (key === '_xxx') r1 = r2 ** (1 / w1) * r3 ** (1 - 1 / w1);
      else if (key === 'x_xx') r2 = r1 ** w1 * r3 ** (1 - w1);
      else if (key === 'xx_x') r3 = r2 ** (1 - w2) * r4 ** w2;
      else if (key === 'xxx_') r4 = r2 ** (1 - 1 / w2) * r3 ** (1 / w2);
    }
    out = [r1, r2, r3, r4];
  }
  return out.map((x) => clamp(x, S_MIN, INIT_S_MAX));
}

// ---- 模型: 一张卡片从头走一遍, 每次隔天复习预测还记得的把握; 要导数时带着对 21 个参数的导数一起走 ----

function runtime(w) {
  const decay = -w[20];
  const c = Math.log(0.9);
  return {
    decay,
    factor: Math.exp(c / decay) - 1,
    dFactorDDecay: Math.exp(c / decay) * (-c / (decay * decay)),
    expW8: Math.exp(w[8]),
    floorDiv: Math.exp(w[17] * w[18]),
    easyD: w[4] - Math.exp(3 * w[5]) + 1,
    exp3w5: Math.exp(3 * w[5]),
  };
}

function bce(r, y, weight) {
  const p = clamp(r, MIN_PROB, MAX_PROB);
  const loss = -(y * Math.log(p) + (1 - y) * Math.log(1 - p)) * weight;
  const g = r > MIN_PROB && r < MAX_PROB ? -weight * (y / p - (1 - y) / (1 - p)) : 0;
  return [loss, g];
}

// 算导数用的地方, 一直用这几块 (不每一步都新开)
const buf = Array.from({ length: 7 }, () => new Float64Array(N));

// 一张卡片的损失 (加权的对数损失之和), grad 不是 null 时把导数加进去; onPredict(i, 预测) 看每一次的预测
function cardLoss(w, rt, card, grad, onPredict = null) {
  const { ratings, deltas, weights } = card;
  const g = grad !== null;
  let s = 0;
  let d = 0;
  // gs, gd 稳定性、难度对 21 个参数的导数; gls, gld 夹在范围里以后的; gr 这次预测的把握的; ngs, ngd 下一步的
  let [gs, gd, ngs, ngd] = buf;
  const [, , , , gls, gld, gr] = buf;
  if (g) for (const b of buf) b.fill(0);
  let total = 0;
  for (let t = 0; t < ratings.length; t++) {
    const rating = ratings[t];
    const dt = deltas[t];
    if (t === 0) {
      // 第一次: 稳定性 w[评分-1], 难度 w4 - e^(w5 (评分-1)) + 1
      const ns = w[rating - 1];
      const off = rating - 1;
      const rawD = w[4] - Math.exp(w[5] * off) + 1;
      s = clamp(ns, S_MIN, S_MAX);
      d = clamp(rawD, D_MIN, D_MAX);
      if (g) {
        gs[rating - 1] = inside(ns, S_MIN, S_MAX);
        const k = inside(rawD, D_MIN, D_MAX);
        gd[4] = k;
        gd[5] = k * -off * Math.exp(off * w[5]);
      }
      continue;
    }
    const lastS = clamp(s, S_MIN, S_MAX);
    const lastD = clamp(d, D_MIN, D_MAX);
    // 遗忘曲线: R = (1 + t/S · factor)^decay
    const tt = Math.max(dt, 0);
    const base = (tt / lastS) * rt.factor + 1;
    const r = base ** rt.decay;
    const dRdS = ((r * rt.decay) / base) * ((-tt * rt.factor) / (lastS * lastS));
    const dRdW20 = -(r * (Math.log(base) + (rt.decay / base) * (tt / lastS) * rt.dFactorDDecay));
    if (g) {
      const ks = inside(s, S_MIN, S_MAX);
      const kd = inside(d, D_MIN, D_MAX);
      for (let k = 0; k < N; k++) {
        gls[k] = gs[k] * ks;
        gld[k] = gd[k] * kd;
        gr[k] = dRdS * gls[k];
      }
      gr[20] += dRdW20;
    }
    // 隔天的才考
    if (dt > 0 && weights[t] > 0) {
      const [loss, gl] = bce(r, ratings[t] > 1 ? 1 : 0, weights[t]);
      total += loss;
      if (g && gl) for (let k = 0; k < N; k++) grad[k] += gl * gr[k];
    }
    onPredict?.(t, r);

    // 新的稳定性
    let ns;
    if (dt === 0) {
      // 同一天又复习: 短期的
      const raw = Math.exp(w[17] * (rating - 3 + w[18])) * lastS ** -w[19];
      const active = !(rating >= 2 && raw < 1);
      const value = rating >= 2 ? Math.max(raw, 1) : raw;
      ns = lastS * value;
      if (g) {
        for (let k = 0; k < N; k++) ngs[k] = value * gls[k];
        if (active) {
          const m = lastS * raw;
          ngs[17] += m * (rating - 3 + w[18]);
          ngs[18] += m * w[17];
          ngs[19] += m * -Math.log(lastS);
          for (let k = 0; k < N; k++) ngs[k] += m * (-w[19] / lastS) * gls[k];
        }
      }
    } else if (rating === 1) {
      // 忘了
      const er = Math.exp((1 - r) * w[14]);
      const sb = lastS + 1;
      const p = sb ** w[13];
      const dp = lastD ** -w[12];
      const raw = w[11] * dp * (p - 1) * er;
      const floor = lastS / rt.floorDiv;
      if (floor < raw) {
        ns = floor;
        if (g) {
          for (let k = 0; k < N; k++) ngs[k] = (floor / lastS) * gls[k];
          ngs[17] += floor * -w[18];
          ngs[18] += floor * -w[17];
        }
      } else {
        ns = raw;
        if (g) {
          const dS = w[11] * dp * er * w[13] * (p / sb);
          const dD = raw * (-w[12] / lastD);
          const dR = raw * -w[14];
          for (let k = 0; k < N; k++) ngs[k] = dS * gls[k] + dD * gld[k] + dR * gr[k];
          ngs[11] += raw / w[11];
          ngs[12] += raw * -Math.log(lastD);
          ngs[13] += w[11] * dp * er * p * Math.log(sb);
          ngs[14] += raw * (1 - r);
        }
      }
    } else {
      // 记得: 稳定性涨 (困难涨得少, 简单涨得多)
      const hp = rating === 2 ? w[15] : 1;
      const eb = rating === 4 ? w[16] : 1;
      const b = 11 - lastD;
      const c = lastS ** -w[9];
      const ee = Math.exp((1 - r) * w[10]);
      const e = ee - 1;
      const inc = rt.expW8 * b * c * e * hp * eb;
      ns = lastS * (inc + 1);
      if (g) {
        const a = rt.expW8;
        const dS = inc + 1 + lastS * inc * (-w[9] / lastS);
        const dD = -lastS * a * c * e * hp * eb;
        const dR = lastS * a * b * c * hp * eb * (-w[10] * ee);
        for (let k = 0; k < N; k++) ngs[k] = dS * gls[k] + dD * gld[k] + dR * gr[k];
        ngs[8] += lastS * inc;
        ngs[9] += lastS * inc * -Math.log(lastS);
        ngs[10] += lastS * a * b * c * hp * eb * ((1 - r) * ee);
        if (rating === 2) ngs[15] += lastS * a * b * c * e * eb;
        if (rating === 4) ngs[16] += lastS * a * b * c * e * hp;
      }
    }
    // 新的难度: 按评分挪一点, 再往「简单」的初始难度拉回一点
    const deltaD = -w[6] * (rating - 3);
    const nextD = lastD + ((10 - lastD) * deltaD) / 9;
    const meanD = w[7] * (rt.easyD - nextD) + nextD;
    if (g) {
      const kd = inside(meanD, D_MIN, D_MAX);
      ngd.fill(0);
      if (kd) {
        const dNext = 1 - deltaD / 9;
        for (let k = 0; k < N; k++) ngd[k] = (1 - w[7]) * dNext * gld[k];
        ngd[6] += (1 - w[7]) * ((10 - lastD) * -(rating - 3)) / 9;
        ngd[7] += rt.easyD - nextD;
        ngd[4] += w[7];
        ngd[5] += w[7] * -3 * rt.exp3w5;
      }
      const ks = inside(ns, S_MIN, S_MAX);
      for (let k = 0; k < N; k++) ngs[k] *= ks;
      [gs, ngs] = [ngs, gs];
      [gd, ngd] = [ngd, gd];
    }
    s = clamp(ns, S_MIN, S_MAX);
    d = clamp(meanD, D_MIN, D_MAX);
  }
  return total;
}

// 一批卡片的损失和导数 (导数加进 grad)
export function lossAndGrad(w, cards, grad = null) {
  const rt = runtime(w);
  let loss = 0;
  for (const card of cards) loss += cardLoss(w, rt, card, grad);
  return loss;
}

// ---- 评估: 对数损失、RMSE (按「隔几天、第几次、忘过几次」分箱以后预测的和实际的差) ----

const bin = (x, a, b) => Math.round(a * b ** Math.floor(Math.log(x) / Math.log(b)));

export function evaluate(w, cards) {
  const rt = runtime(w);
  weightedItems(cards);
  const bins = new Map();
  let loss = 0;
  let weightSum = 0;
  let n = 0;
  for (const card of cards) {
    let long = 0; // 之前隔天复习过几次
    let lapses = 0;
    cardLoss(w, rt, card, null, (t, r) => {
      if (card.deltas[t] > 0) {
        const y = card.ratings[t] > 1 ? 1 : 0;
        const weight = card.weights[t];
        const p = clamp(r, MIN_PROB, MAX_PROB);
        loss -= (y * Math.log(p) + (1 - y) * Math.log(1 - p)) * weight;
        weightSum += weight;
        n++;
        const key = `${Math.round(2.48 * 3.62 ** Math.floor(Math.log(card.deltas[t]) / Math.log(3.62)) * 100)}:${bin(long + 1 + 1, 1.99, 1.89)}:${lapses ? bin(lapses, 1.65, 1.73) : 0}`;
        const b = bins.get(key) ?? { p: 0, y: 0, n: 0, w: 0 };
        b.p += r;
        b.y += y;
        b.n++;
        b.w += weight;
        bins.set(key, b);
        long++;
        if (card.ratings[t] === 1) lapses++;
      }
    });
  }
  if (!n) return null;
  let se = 0;
  let ws = 0;
  for (const b of bins.values()) {
    se += (b.p / b.n - b.y / b.n) ** 2 * b.w;
    ws += b.w;
  }
  return { logLoss: loss / weightSum, rmse: Math.sqrt(se / ws), n };
}

// ---- 训练 ----

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 一张一张卡片装进批里, 每批最多 512 道题 (一张卡片的题不拆开)
function batchesOf(cards) {
  const sorted = [...cards].sort((a, b) => a.ratings.length - b.ratings.length);
  const out = [];
  let cur = [];
  let n = 0;
  for (const card of sorted) {
    const k = card.deltas.filter((d, i) => i && d > 0).length;
    if (cur.length && n + k > CONFIG.batchSize) {
      out.push({ cards: cur, n });
      cur = [];
      n = 0;
    }
    cur.push(card);
    n += k;
  }
  if (cur.length) out.push({ cards: cur, n });
  return out;
}

function train(cards, init, onProgress) {
  const total = weightedItems(cards).length;
  const batches = batchesOf(cards);
  const iterations = (Math.floor(total / CONFIG.batchSize) + 1) * CONFIG.epochs;
  const w = [...init];
  const m = new Float64Array(N);
  const v = new Float64Array(N);
  const rand = mulberry32(CONFIG.seed);
  let step = 0;
  for (let epoch = 0; epoch < CONFIG.epochs; epoch++) {
    const order = batches.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    for (const bi of order) {
      const batch = batches[bi];
      const lr = (CONFIG.lr * (1 + Math.cos((Math.PI * step) / iterations))) / 2; // 余弦退火
      const grad = new Float64Array(N);
      lossAndGrad(w, batch.cards, grad);
      // 别离一开始的参数太远 (按每个参数平常的差别大小算)
      const scale = (CONFIG.gamma * batch.n) / total;
      for (let k = 0; k < N; k++) grad[k] += ((2 * (w[k] - init[k])) / (STDDEV[k] * STDDEV[k])) * scale;
      // Adam
      step++;
      const b1 = 1 - 0.9 ** step;
      const b2 = 1 - 0.999 ** step;
      for (let k = 0; k < N; k++) {
        m[k] = 0.9 * m[k] + 0.1 * grad[k];
        v[k] = 0.999 * v[k] + 0.001 * grad[k] * grad[k];
        w[k] -= (lr * (m[k] / b1)) / (Math.sqrt(v[k] / b2) + 1e-8);
      }
      const clipped = clip(w);
      for (let k = 0; k < N; k++) w[k] = clipped[k];
      onProgress?.(step / (batches.length * CONFIG.epochs));
    }
  }
  return w;
}

// 优化: histories 见 cardsOf; current 现在用的参数 (比较用)。返回
//   { status: 'default' 记录太少 | 'initial' 只估了第一次以后的 | 'trained', w, items 用了几道题, cards 几张卡片,
//     before { logLoss, rmse, n } (默认参数), current (现在的参数), after (新的), better 新的比现在的准 }
export function optimize(histories, { current = null, onProgress = null } = {}) {
  const all = cardsOf(histories);
  const { init, train: trainCards } = splitOutliers(all);
  const items = countItems(trainCards);
  const result = { status: 'default', w: [...DEFAULT_W], items, cards: trainCards.length, before: null, current: null, after: null };
  const finish = () => {
    // 评估用全部的记录 (不去掉怪的)
    result.before = evaluate(DEFAULT_W, all);
    result.current = current ? evaluate(current, all) : result.before;
    result.after = evaluate(result.w, all);
    // 跟 Anki 一样: 新算的不比现在用的准 (对数损失没变小), 就别换
    result.better = result.status !== 'default' && Boolean(result.after && result.current) && result.after.logLoss < result.current.logLoss - 1e-6;
    onProgress?.(1);
    return result;
  };
  if (items < MIN_ITEMS) return finish();
  const labels = trainCards.flatMap((c) => c.ratings.filter((_, i) => i && c.deltas[i] > 0).map((r) => (r > 1 ? 1 : 0)));
  const averageRecall = labels.reduce((a, b) => a + b, 0) / labels.length;
  const { stability, count } = initialStability(init, averageRecall);
  const s0 = smoothAndFill(stability, count);
  if (!s0) return finish();
  const start = [...s0, ...DEFAULT_W.slice(4)];
  result.w = start;
  result.status = 'initial';
  if (items === init.length || items < MIN_TRAIN) return finish();
  const w = train(trainCards, start, (p) => onProgress?.(p * 0.95));
  if (!w.every(Number.isFinite)) return finish();
  // 第一次以后的稳定性再理一遍 (评分越高越大, 没数据的推出来)
  const fixed = smoothAndFill({ 1: w[0], 2: w[1], 3: w[2], 4: w[3] }, count) ?? w.slice(0, 4);
  result.w = clip([...fixed, ...w.slice(4)]).map((x) => Math.round(x * 10000) / 10000);
  result.status = 'trained';
  return finish();
}

/*
fsrs-rs 的许可 (这个文件照它改写):

BSD 3-Clause License

Copyright (c) 2023, Open Spaced Repetition

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this
   list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

3. Neither the name of the copyright holder nor the names of its
   contributors may be used to endorse or promote products derived from
   this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
*/
