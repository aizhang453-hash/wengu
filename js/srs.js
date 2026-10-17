// 间隔重复 (按遗忘的规律排复习), 用的是开源的 FSRS 算法 (vendor/fsrs.js, Anki 现在用的也是它)。
// 艾宾浩斯遗忘曲线说的是「记住的东西随时间忘掉」; FSRS 给每张卡片 (每道错题) 记两个数:
//   s  稳定性: 过多少天还有 90% 的把握记得 (越复习越大)
//   d  难度 1–10: 这张有多难记 (老答错就变大, 稳定性涨得慢)
// 按这两个数算「隔几天再复习, 到时候还有 90% 记得」, 比固定的 1 天、3 天、一周更准。
// 另外记: interval 下次隔几天, due 哪天该复习 (时间戳), at 最后答的时间。
// 答对: 隔 interval 天, 到那天一早就算该复习; 答错: 10 分钟后再来 (今天再练一下)。
// 以前 (v1.14 以前) 按 interval / ease 记的, 第一次换算成 FSRS 的稳定性、难度, 不用从头来。
// 参数默认是 FSRS 的 (很多 Anki 用户的平均); 按自己的复习记录优化过 (optimize.js) 就用自己的 (useParameters)。
// 错题集一直用默认的 (做题跟背单词不一样, 记录也不算在一起)。

import { FSRSAlgorithm, generatorParameters, Rating } from './vendor/fsrs.js';

export const DAY = 24 * 60 * 60 * 1000;
const RETRY_MS = 10 * 60 * 1000;
export const RETENTION = 0.9; // 到该复习那天还记得的把握

const make = (w) => new FSRSAlgorithm(generatorParameters({ request_retention: RETENTION, enable_fuzz: false, enable_short_term: true, w }));
const defaults = make();
let fsrs = defaults;

const goodParameters = (w) => Array.isArray(w) && w.length === 21 && w.every(Number.isFinite);

// 换成自己的参数 (21 个数); 不对的、null 就用默认的
export function useParameters(w) {
  fsrs = goodParameters(w) ? make(w) : defaults;
}

// 现在用的参数
export const currentParameters = () => [...fsrs.parameters.w];

export function startOfDay(t) {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

const round = (x) => Math.round(x * 10000) / 10000;
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

// 记忆状态: 有 FSRS 的用它; 老记录 (interval, ease) 换算: 稳定性 ≈ 上次排的间隔, ease 越小越难
function memoryOf(prev) {
  if (Number(prev?.s) > 0 && Number(prev?.d) >= 1) return { stability: Number(prev.s), difficulty: Number(prev.d) };
  if (Number(prev?.interval) >= 1) return { stability: Number(prev.interval), difficulty: clamp(10 - ((Number(prev.ease) || 2.5) - 1.3) * 4.2, 1, 10) };
  return null; // 第一次答
}

// FSRS 走一步: 上次在 last 复习过 (记忆状态 memory), 现在 now 又复习了, 评分 rating (1 忘了 … 4 简单)
function step(algo, memory, last, now, rating) {
  // 隔了几天 (按日子算)
  const elapsed = memory && last ? Math.max(0, Math.round((startOfDay(now) - startOfDay(last)) / DAY)) : 0;
  return { memory: algo.next_state(memory, elapsed, rating), elapsed };
}

// 走完这一步, 下次哪天复习: 忘了的 10 分钟后再来; 记得的隔几天, 到那天一早就算该复习
function nextDue(algo, { memory, elapsed }, rating, now) {
  const s = round(memory.stability);
  const d = round(memory.difficulty);
  if (rating === Rating.Again) return { interval: 0, s, d, due: now + RETRY_MS };
  const interval = algo.next_interval(memory.stability, elapsed);
  return { interval, s, d, due: startOfDay(now) + interval * DAY };
}

// 答了一次 (翻卡自评, 只有记得 / 忘了): 返回 { interval, s, d, due } (调的地方再记上 at)。
// own: false 用默认参数 (错题集)
export function schedule(prev, correct, now = Date.now(), { own = true } = {}) {
  const algo = own ? fsrs : defaults;
  const rating = correct ? Rating.Good : Rating.Again;
  // 老记录没有 at 的, 当成是按时复习的
  const last = Number(prev?.at) || (Number(prev?.due) && Number(prev?.interval) ? Number(prev.due) - Number(prev.interval) * DAY : 0);
  return nextDue(algo, step(algo, memoryOf(prev), last, now, rating), rating, now);
}

// 从头按一遍复习记录 (从 Anki 搬来的, 四个键都有: 1 重来 2 困难 3 良好 4 简单), 算出现在的复习状态:
// { right, wrong, interval, s, d, due, at }; 没有记录返回 null。隔了好几个月没背的, 多半已经该复习了
export function replay(reviews) {
  let memory = null;
  let last = 0;
  let lastStep = null;
  let lastRating = 0;
  let right = 0;
  let wrong = 0;
  for (const { at, rating } of reviews) {
    lastStep = step(fsrs, memory, last, at, rating);
    memory = lastStep.memory;
    last = at;
    lastRating = rating;
    if (rating === Rating.Again) wrong++;
    else right++;
  }
  if (!lastStep) return null;
  return { right, wrong, ...nextDue(fsrs, lastStep, lastRating, last), at: last };
}

// 现在还记得的把握 (0–1): 稳定性越大、隔得越短越高。今天的复习先来最可能忘的
export function retrievability(stat, now = Date.now()) {
  const s = Number(stat?.s) || Number(stat?.interval) || 0;
  const last = Number(stat?.at) || (Number(stat?.due) && Number(stat?.interval) ? Number(stat.due) - Number(stat.interval) * DAY : 0);
  if (!(s > 0) || !last) return 0;
  return fsrs.forgetting_curve(Math.max(0, (now - last) / DAY), s);
}

export function isDue(stat, now = Date.now()) {
  return Boolean(stat?.due) && stat.due <= now;
}

// 所有该复习的卡片: [{ set, card, due }], 越早该复习的越前
export function dueCards(sets, now = Date.now()) {
  const out = [];
  for (const set of sets) {
    for (const card of set.cards) {
      const stat = set.stats[card.id];
      if (isDue(stat, now)) out.push({ set, card, due: stat.due });
    }
  }
  return out.sort((a, b) => a.due - b.due);
}

// 明天 (到明天晚上为止) 要复习几张, 不算今天已经该复习的
export function dueTomorrow(sets, now = Date.now()) {
  const end = startOfDay(now) + 2 * DAY;
  let n = 0;
  for (const set of sets) {
    for (const card of set.cards) {
      const due = set.stats[card.id]?.due;
      if (due && due > now && due < end) n++;
    }
  }
  return n;
}

// ---- 连续打卡 ----

export function dayKey(t = Date.now()) {
  const d = new Date(t);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// 连续学了几天: 从今天 (今天还没学就从昨天) 往前数
export function streak(activity, now = Date.now()) {
  let t = startOfDay(now);
  if (!activity[dayKey(t)]) t -= DAY;
  let n = 0;
  // (换夏令时那天一天不是 24 小时, 用中午算日子就不会错)
  while (activity[dayKey(t + DAY / 2)]) {
    n++;
    t -= DAY;
  }
  return n;
}

// 最近几天每天答了几题 (从早到晚)
export function lastDays(activity, days = 7, now = Date.now()) {
  const out = [];
  const today = startOfDay(now);
  for (let i = days - 1; i >= 0; i--) {
    const t = today - i * DAY + DAY / 2;
    out.push({ key: dayKey(t), count: activity[dayKey(t)] ?? 0, date: new Date(t) });
  }
  return out;
}
