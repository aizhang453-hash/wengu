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
