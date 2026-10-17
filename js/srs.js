// 间隔重复 (按遗忘的规律排复习), 用的是开源的 FSRS 算法 (vendor/fsrs.js, Anki 现在用的也是它)。
// 艾宾浩斯遗忘曲线说的是「记住的东西随时间忘掉」; FSRS 给每张卡片 (每道错题) 记两个数:
//   s  稳定性: 过多少天还有 90% 的把握记得 (越复习越大)
//   d  难度 1–10: 这张有多难记 (老答错就变大, 稳定性涨得慢)
// 按这两个数算「隔几天再复习, 到时候还有 90% 记得」, 比固定的 1 天、3 天、一周更准。
// 另外记: interval 下次隔几天, due 哪天该复习 (时间戳), at 最后答的时间。
// 答对: 隔 interval 天, 到那天一早就算该复习; 答错: 10 分钟后再来 (今天再练一下)。
// 以前 (v1.14 以前) 按 interval / ease 记的, 第一次换算成 FSRS 的稳定性、难度, 不用从头来。

import { FSRSAlgorithm, generatorParameters, Rating } from './vendor/fsrs.js';

export const DAY = 24 * 60 * 60 * 1000;
const RETRY_MS = 10 * 60 * 1000;
export const RETENTION = 0.9; // 到该复习那天还记得的把握

const fsrs = new FSRSAlgorithm(generatorParameters({ request_retention: RETENTION, enable_fuzz: false, enable_short_term: true }));

function startOfDay(t) {
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

// 答了一次: 返回 { interval, s, d, due } (调的地方再记上 at)
export function schedule(prev, correct, now = Date.now()) {
  const memory = memoryOf(prev);
  // 隔了几天 (按日子算; 老记录没有 at 的, 当成是按时复习的)
  const last = Number(prev?.at) || (Number(prev?.due) && Number(prev?.interval) ? Number(prev.due) - Number(prev.interval) * DAY : 0);
  const elapsed = memory && last ? Math.max(0, Math.round((startOfDay(now) - startOfDay(last)) / DAY)) : 0;
  const next = fsrs.next_state(memory, elapsed, correct ? Rating.Good : Rating.Again);
  const s = round(next.stability);
  const d = round(next.difficulty);
  if (!correct) return { interval: 0, s, d, due: now + RETRY_MS };
  const interval = fsrs.next_interval(next.stability, elapsed);
  return { interval, s, d, due: startOfDay(now) + interval * DAY };
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
