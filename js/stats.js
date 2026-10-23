// 统计 (像 Anki 的「统计」): 今天背了多少、以后每天要复习几张、每天背了多少 (日历)、记住率、卡片都背到哪了。
// 都只看给的这几个卡片集 (所有的, 或者一个卡片集 / 文件夹里的); 复习记录是翻卡自评的 (revlog.js, 连从 Anki 搬来的)

import { DAY, startOfDay, daysLater, dayKey, retrievability, isSuspended, isBuried, LEECH } from './srs.js';
import { unpack, decodeReview, AGAIN } from './revlog.js';

export const MATURE = 21; // 隔 21 天以上算记牢了 (跟 Anki 一样)

function* cardsOf(sets) {
  for (const set of sets) for (const card of set.cards) yield [set, card, set.stats[card.id]];
}

// 以后每天要复习几张: [今天 (连已经到日子的), 明天, ……] 一共 days 天; 暂停的不算, 今天「明天再说」的算明天
export function forecast(sets, days = 30, now = Date.now()) {
  const out = new Array(days).fill(0);
  const today0 = startOfDay(now);
  const tomorrow0 = daysLater(now, 1);
  for (const [, , stat] of cardsOf(sets)) {
    if (!(stat?.due > 0) || isSuspended(stat)) continue;
    // 离今天 0 点几天 (今天以内的算今天; 以后的四舍五入: 不用一张张换算日期, 夏令时差一小时也还是那天)
    let k = stat.due < tomorrow0 ? 0 : Math.round((stat.due - today0) / DAY);
    if (k === 0 && isBuried(stat, now)) k = 1;
    if (k < days) out[k]++;
  }
  return out;
}

// 卡片都背到哪了: 新词 (没背过) / 学习中 (忘了、当天还要再来) / 还嫩 (隔不到 21 天) / 记牢了 / 暂停的; 难记卡另外数
export function cardStates(sets) {
  const out = { total: 0, new: 0, learning: 0, young: 0, mature: 0, suspended: 0, leech: 0 };
  for (const [, , stat] of cardsOf(sets)) {
    out.total++;
    if (stat?.lapses >= LEECH) out.leech++;
    if (isSuspended(stat)) out.suspended++;
    else if (!(stat?.due > 0)) out.new++;
    else if (!(stat.interval >= 1)) out.learning++;
    else if (stat.interval < MATURE) out.young++;
    else out.mature++;
  }
  return out;
}

// 估计现在记得几张: 背过的卡片 (暂停的不算) 现在还记得的把握加起来 (Anki 的「估计记住的」)
export function knowledge(sets, now = Date.now()) {
  let sum = 0;
  let count = 0;
  for (const [, , stat] of cardsOf(sets)) {
    if (!(stat?.due > 0) || isSuspended(stat)) continue;
    sum += retrievability(stat, now);
    count++;
  }
  return { sum, count, avg: count ? sum / count : 0 };
}

// 这几个卡片集的复习记录: 每张卡片 [{ at, rating }], 从早到晚
function logsOf(sets, log) {
  const out = [];
  for (const [, card] of cardsOf(sets)) {
    const text = log?.[card.id];
    if (text) out.push(unpack(text).map(decodeReview));
  }
  return out;
}

// 每天翻卡自评了几次: Map('YYYY-MM-DD' → 次数)
export function reviewsByDay(sets, log) {
  const out = new Map();
  for (const list of logsOf(sets, log)) {
    for (const { at } of list) {
      const key = dayKey(at);
      out.set(key, (out.get(key) ?? 0) + 1);
    }
  }
  return out;
}

// 记住率 (Anki 的 True Retention): 隔了一天以上来复习时还记得的比例; 当天又练的、新词第一次的不算。
// 最近 1 天 (今天)、7 天、30 天、一年: [{ days, n 复习了几次, ok 记得几次 }]
export function retentionStats(sets, log, now = Date.now(), periods = [1, 7, 30, 365]) {
  const today0 = startOfDay(now);
  const from = periods.map((d) => daysLater(now, -(d - 1))); // 按日历往前数 (换夏令时那天不是 24 小时)
  const out = periods.map((days) => ({ days, n: 0, ok: 0 }));
  for (const list of logsOf(sets, log)) {
    for (let i = 1; i < list.length; i++) {
      const { at, rating } = list[i];
      if (at < from.at(-1) || startOfDay(at) === startOfDay(list[i - 1].at)) continue;
      out.forEach((p, k) => {
        if (at >= from[k]) {
          p.n++;
          if (rating !== AGAIN) p.ok++;
        }
      });
    }
  }
  return out;
}

const GAP = 60 * 1000; // 两次之间隔太久的 (走开了) 只算一分钟

// 今天: 翻卡几次、学了几个新词、忘了几次、大约用了几分钟 (按两次之间隔多久算, 记录里没有每次用了多久)
export function todayStats(sets, log, now = Date.now()) {
  const today0 = startOfDay(now);
  const times = [];
  let again = 0;
  for (const list of logsOf(sets, log)) {
    for (const { at, rating } of list) {
      if (at < today0 || at > now) continue;
      times.push(at);
      if (rating === AGAIN) again++;
    }
  }
  times.sort((a, b) => a - b);
  let ms = times.length ? 8000 : 0; // 第一张也看了一会儿
  for (let i = 1; i < times.length; i++) ms += Math.min(GAP, times[i] - times[i - 1]);
  let fresh = 0;
  for (const [, , stat] of cardsOf(sets)) if (stat?.first >= today0) fresh++;
  return { reviews: times.length, fresh, again, minutes: Math.round(ms / 60000) };
}

// 难记卡 (忘了 8 次以上的), 忘得多的先: [{ set, card, lapses }]
export function leeches(sets) {
  const out = [];
  for (const [set, card, stat] of cardsOf(sets)) if (stat?.lapses >= LEECH) out.push({ set, card, lapses: stat.lapses });
  return out.sort((a, b) => b.lapses - a.lapses);
}

// 暂停的: [{ set, card }], 最近暂停的先
export function suspendedCards(sets) {
  const out = [];
  for (const [set, card, stat] of cardsOf(sets)) if (isSuspended(stat)) out.push({ set, card, at: stat.sus });
  return out.sort((a, b) => b.at - a.at);
}

// ---- 一天里什么时候记得最牢 ----
// 看复习的时候 (不算第一次学、同一天又看的) 记住了几成, 按时间段分开算。
// 卡片难不难、隔得久不久也有影响, 所以记录少的时间段不算, 差得不多的说「差不多」
export const TIME_BLOCKS = [
  { key: 'dawn', name: '清早', from: 5, to: 8 },
  { key: 'morning', name: '上午', from: 8, to: 12 },
  { key: 'noon', name: '中午', from: 12, to: 14 },
  { key: 'afternoon', name: '下午', from: 14, to: 18 },
  { key: 'evening', name: '傍晚', from: 18, to: 21 },
  { key: 'night', name: '晚上', from: 21, to: 24 },
  { key: 'late', name: '深夜', from: 0, to: 5 },
];
export const MIN_BLOCK = 40; // 一个时间段至少复习了几次才算
export const MIN_TIME_TOTAL = 150; // 一共至少几次才看
const BLOCK_OF_HOUR = Array.from({ length: 24 }, (_, hour) => TIME_BLOCKS.findIndex((b) => hour >= b.from && hour < b.to));

// 最近 days 天每个时间段复习了几次、记住了几次: [{ ...时间段, n, ok }]
export function timeOfDay(sets, log, now = Date.now(), days = 180) {
  const from = daysLater(now, -(days - 1));
  const out = TIME_BLOCKS.map((b) => ({ ...b, n: 0, ok: 0 }));
  for (const [, card, stat] of cardsOf(sets)) {
    if (!(stat?.at >= from) || !log?.[card.id]) continue; // 这么久没答过的, 记录里也没有最近的
    const list = unpack(log[card.id]).map(decodeReview);
    for (let i = 1; i < list.length; i++) {
      const { at, rating } = list[i];
      if (at < from || at > now || startOfDay(at) === startOfDay(list[i - 1].at)) continue;
      const block = out[BLOCK_OF_HOUR[new Date(at).getHours()]];
      block.n++;
      if (rating !== AGAIN) block.ok++;
    }
  }
  return out;
}

// 哪个时间段最好: { enough: false, total } 记录还不够 |
//   { enough: true, best 记住得最多的, usual 最常学的, same 最常学的就是最好的, sure 最好的比最常学的确实高 (不是碰巧), diff }
export function bestTime(blocks) {
  const total = blocks.reduce((n, b) => n + b.n, 0);
  const counted = blocks.filter((b) => b.n >= MIN_BLOCK);
  if (total < MIN_TIME_TOTAL || counted.length < 2) return { enough: false, total };
  const rate = (b) => b.ok / b.n;
  const usual = counted.reduce((a, b) => (b.n > a.n ? b : a));
  const best = counted.reduce((a, b) => (rate(b) > rate(a) || (rate(b) === rate(a) && b.n > a.n) ? b : a));
  if (best === usual) return { enough: true, best, usual, same: true, sure: false, diff: 0 };
  // 两个比例差得够不够多 (差得少、次数少可能只是碰巧): 差 3 个百分点以上, 而且 z ≥ 1.96
  const diff = rate(best) - rate(usual);
  const p = (best.ok + usual.ok) / (best.n + usual.n);
  const se = Math.sqrt(p * (1 - p) * (1 / best.n + 1 / usual.n));
  return { enough: true, best, usual, same: false, sure: diff >= 0.03 && se > 0 && diff / se >= 1.96, diff };
}
