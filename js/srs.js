// 间隔重复 (按遗忘的规律排复习), 用的是开源的 FSRS 算法 (vendor/fsrs.js, Anki 现在用的也是它)。
// 艾宾浩斯遗忘曲线说的是「记住的东西随时间忘掉」; FSRS 给每张卡片 (每道错题) 记两个数:
//   s  稳定性: 过多少天还有 90% 的把握记得 (越复习越大)
//   d  难度 1–10: 这张有多难记 (老答错就变大, 稳定性涨得慢)
// 按这两个数算「隔几天再复习, 到时候还有 90% 记得」, 比固定的 1 天、3 天、一周更准。
// 另外记: interval 下次隔几天, due 哪天该复习 (时间戳), at 最后答的时间。
// 答对: 隔 interval 天, 到那天一早就算该复习; 答错: 10 分钟后再来 (今天再练一下)。
// 以前 (v1.14 以前) 按 interval / ease 记的, 第一次换算成 FSRS 的稳定性、难度, 不用从头来。
// 参数默认是 FSRS 的 (很多 Anki 用户的平均); 按自己的复习记录优化过 (optimize.js) 就用自己的 (useParameters)。
// 「到该复习那天还记得的把握」默认 90%, 能调 (跟 Anki 的 desired retention 一样): 调高复习得勤, 调低每天背得少。
// 错题集一直用默认的 (做题跟背单词不一样, 记录也不算在一起)。
// 暂停了的 (stats.sus) 不排复习; 「明天再说」的 (stats.bury, 到那天 0 点) 今天不出。

import { FSRSAlgorithm, generatorParameters, get_fuzz_range, Rating } from './vendor/fsrs.js';

export const DAY = 24 * 60 * 60 * 1000;
const RETRY_MS = 10 * 60 * 1000;
export const DEFAULT_RETENTION = 0.9;
export const MIN_RETENTION = 0.7;
export const MAX_RETENTION = 0.97;
export const LEECH = 8; // 忘了几次算难记卡 (跟 Anki 一样), 以后每多忘一半 (4 次) 再提醒一次

// 想记住的把握: 0.70–0.97, 两位小数; 不对的用默认的
export function cleanRetention(r) {
  const n = Math.round(Number(r) * 100) / 100;
  return n >= MIN_RETENTION && n <= MAX_RETENTION ? n : DEFAULT_RETENTION;
}

const make = (w, retention = DEFAULT_RETENTION) => new FSRSAlgorithm(generatorParameters({ request_retention: retention, enable_fuzz: false, enable_short_term: true, w }));
const defaults = make();
let fsrs = defaults;

const goodParameters = (w) => Array.isArray(w) && w.length === 21 && w.every(Number.isFinite);

// 换成自己的参数 (21 个数; 不对的、null 就用默认的) 和想记住的把握
export function useParameters(w, retention = DEFAULT_RETENTION) {
  const own = goodParameters(w);
  const r = cleanRetention(retention);
  fsrs = own || r !== DEFAULT_RETENTION ? make(own ? w : undefined, r) : defaults;
}

// 现在用的参数、想记住的把握
export const currentParameters = () => [...fsrs.parameters.w];
export const currentRetention = () => fsrs.parameters.request_retention;

// 把握换成 r, 间隔大约是 90% 时的几倍 (按现在的参数: 遗忘曲线 R = (1 + factor·t/s)^-decay)
export function intervalRatio(r, w = currentParameters()) {
  const decay = -w[20];
  const days = (x) => Math.pow(x, 1 / decay) - 1;
  return days(r) / days(DEFAULT_RETENTION);
}

export function startOfDay(t) {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// 过 n 天的那天 0 点 (按日历算; 有夏令时的地方一天不一定 24 小时)
export function daysLater(t, n) {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + n);
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

// 一个数变成 0–1 之间的「随机」数, 同一个 seed 每次一样
function random(seed) {
  let x = 2166136261;
  for (let i = 0; i < seed.length; i++) x = Math.imul(x ^ seed.charCodeAt(i), 16777619);
  x = Math.imul(x ^ (x >>> 15), 0x2c1b3c6d);
  x = Math.imul(x ^ (x >>> 12), 0x297a2d39);
  return ((x ^ (x >>> 15)) >>> 0) / 4294967296;
}

// 到期日子错开 (跟 Anki 一样): 同一天背的一批卡片间隔一模一样, 就会同一天一起到期。隔 3 天以上的在前后几天里挑一天
// (范围照 Anki: ts-fsrs 的 get_fuzz_range, 隔得越久范围越大)。挑哪天由 seed 定 (每次一样: 按钮上写的跟点了以后排的一样);
// 给了 load (那几天已经有几张要复习) 就像 Anki 的负载均衡: 要复习的少的那天、隔得短一点的, 更容易挑中
export function spreadInterval(interval, elapsed, { seed = '', load = null, max = 36500 } = {}) {
  if (!seed || interval < 2.5) return interval;
  const { min_ivl: lo, max_ivl: hi } = get_fuzz_range(interval, elapsed, max);
  if (hi <= lo) return lo;
  const days = [];
  for (let d = lo; d <= hi; d++) days.push(d);
  const counts = load ? load(days) : null; // 给了 load 也可能是 null (比不出来): 就随机挑
  const weights = days.map((d, i) => (counts ? 1 / ((counts[i] + 1) ** 2 * d) : 1));
  let x = random(seed) * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < days.length; i++) {
    x -= weights[i];
    if (x < 0) return days[i];
  }
  return hi;
}

// 走完这一步, 下次哪天复习: 忘了的 10 分钟后再来; 记得的隔几天, 到那天一早就算该复习。
// spread: { seed, load } 到期日子错开 (load 拿那几天的 0 点问有几张: load([时间]) → [张数])
function nextDue(algo, { memory, elapsed }, rating, now, spread = {}) {
  const s = round(memory.stability);
  const d = round(memory.difficulty);
  if (rating === Rating.Again) return { interval: 0, s, d, due: now + RETRY_MS };
  const load = spread.load ? (days) => spread.load(days.map((n) => daysLater(now, n))) : null;
  const interval = spreadInterval(algo.next_interval(memory.stability, elapsed), elapsed, { seed: spread.seed, load, max: algo.parameters.maximum_interval });
  return { interval, s, d, due: daysLater(now, interval) };
}

// 老记录没有 at 的, 当成是按时复习的
const lastReview = (prev) => Number(prev?.at) || (Number(prev?.due) && Number(prev?.interval) ? Number(prev.due) - Number(prev.interval) * DAY : 0);
const daysBetween = (a, b) => Math.round((startOfDay(b) - startOfDay(a)) / DAY);

// 答了一次 (翻卡自评, 只有记得 / 忘了): 返回 { interval, s, d, due } (调的地方再记上 at)。
// own: false 用默认参数 (错题集); seed、load: 到期日子错开 (不给就不错开)
export function schedule(prev, correct, now = Date.now(), { own = true, seed = '', load = null } = {}) {
  const algo = own ? fsrs : defaults;
  const rating = correct ? Rating.Good : Rating.Again;
  return nextDue(algo, step(algo, memoryOf(prev), lastReview(prev), now, rating), rating, now, { seed, load });
}

// 这次忘了算不算「忘了一次」(Anki 的 lapse): 已经排到以后某一天、隔了至少一天来复习, 想不起来了。
// 新词第一次不会、忘了以后当天再练又忘了的不算
export function isLapse(prev, correct, now = Date.now()) {
  return !correct && Number(prev?.due) > 0 && Number(prev?.interval) >= 1 && daysBetween(lastReview(prev), now) >= 1;
}

// 忘了 lapses 次: 该不该提醒「难记卡」(第 8 次、12 次、16 次……)
export const leechAlert = (lapses) => lapses >= LEECH && (lapses - LEECH) % (LEECH / 2) === 0;

// 从头按一遍复习记录 (从 Anki 搬来的, 四个键都有: 1 重来 2 困难 3 良好 4 简单), 算出现在的复习状态:
// { right, wrong, lapses, interval, s, d, due, at }; 没有记录返回 null。隔了好几个月没背的, 多半已经该复习了。
// spread: 最后排的日子错开 (seed、load, 见 schedule)
export function replay(reviews, spread = {}) {
  let memory = null;
  let last = 0;
  let lastStep = null;
  let lastRating = 0;
  let right = 0;
  let wrong = 0;
  let lapses = 0;
  for (const { at, rating, type } of reviews) {
    lastStep = step(fsrs, memory, last, at, rating);
    // 忘了一次: Anki 的记录有类型的, 复习 (type 1) 时按重来才算 (学习、重学步骤里的不算, 跟 Anki 一样);
    // 没有类型的: 隔了一天以上来复习、上次记得的, 这次忘了才算
    if (rating === Rating.Again && (type !== undefined ? type === 1 : memory && lastRating !== Rating.Again && lastStep.elapsed >= 1)) lapses++;
    memory = lastStep.memory;
    last = at;
    lastRating = rating;
    if (rating === Rating.Again) wrong++;
    else right++;
  }
  if (!lastStep) return null;
  return { right, wrong, lapses, ...nextDue(fsrs, lastStep, lastRating, last, spread), at: last };
}

// 现在还记得的把握 (0–1): 稳定性越大、隔得越短越高。今天的复习先来最可能忘的
export function retrievability(stat, now = Date.now()) {
  const s = Number(stat?.s) || Number(stat?.interval) || 0;
  const last = Number(stat?.at) || (Number(stat?.due) && Number(stat?.interval) ? Number(stat.due) - Number(stat.interval) * DAY : 0);
  if (!(s > 0) || !last) return 0;
  return fsrs.forgetting_curve(Math.max(0, (now - last) / DAY), s);
}

export const isSuspended = (stat) => Number(stat?.sus) > 0;
export const isBuried = (stat, now = Date.now()) => Number(stat?.bury) > now;

// 该复习了 (暂停的、今天先不背的不算)
export function isDue(stat, now = Date.now()) {
  return Boolean(stat?.due) && stat.due <= now && !isSuspended(stat) && !isBuried(stat, now);
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

// 明天 (到明天晚上为止) 要复习几张, 不算今天已经该复习的 (今天说了「明天再说」的算明天的)
export function dueTomorrow(sets, now = Date.now()) {
  const end = daysLater(now, 2);
  const tomorrow = daysLater(now, 1);
  let n = 0;
  for (const set of sets) {
    for (const card of set.cards) {
      const stat = set.stats[card.id];
      const due = stat?.due;
      if (!due || isSuspended(stat)) continue;
      // (今天晚些时候到的, 比如十分钟后再来的, 是今天的)
      if ((due >= tomorrow && due < end) || (due <= now && isBuried(stat, now))) n++;
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
