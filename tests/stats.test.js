import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DAY, startOfDay, daysLater, dayKey } from '../js/srs.js';
import { forecast, cardStates, knowledge, reviewsByDay, retentionStats, todayStats, leeches, suspendedCards } from '../js/stats.js';
import { aheadCards, forgotToday, leechCards, starredCards, customCards, PRACTICE } from '../js/custom.js';
import { makeSet, makeCard } from '../js/store.js';
import { addReviews } from '../js/revlog.js';

const now = new Date(2026, 9, 17, 15, 0).getTime();
const today0 = startOfDay(now);
const cardsOf = (n) => Array.from({ length: n }, (_, i) => makeCard(`w${i}`, `d${i}`));
const stat = (fields) => ({ right: 1, wrong: 0, interval: 5, s: 5, d: 5, at: now - 5 * DAY, due: today0, ...fields });

test('统计: 以后每天几张 (到日子的算今天、明天再说的算明天、暂停的不算)、卡片背到哪了、估计记得几张', () => {
  const c = cardsOf(8);
  const set = makeSet({
    cards: c,
    stats: {
      [c[0].id]: stat({ due: today0 - 3 * DAY }), // 早就到日子了
      [c[1].id]: stat({ due: now + 600e3, interval: 0 }), // 忘了, 十分钟后
      [c[2].id]: stat({ due: daysLater(now, 1) }),
      [c[3].id]: stat({ due: daysLater(now, 40), interval: 40, s: 40 }),
      [c[4].id]: stat({ due: today0, bury: daysLater(now, 1) }),
      [c[5].id]: stat({ sus: now, lapses: 9 }),
      [c[6].id]: { right: 0, wrong: 2 }, // 只在选择题里答过: 还是新词
    },
  });
  const f = forecast([set], 30, now);
  assert.deepEqual(f.slice(0, 3), [2, 2, 0]);
  assert.equal(f.reduce((a, b) => a + b, 0), 4); // 隔 40 天的不在一个月里
  assert.equal(forecast([set], 60, now)[40], 1);
  assert.deepEqual(cardStates([set]), { total: 8, new: 2, learning: 1, young: 3, mature: 1, suspended: 1, leech: 1 });
  const k = knowledge([set], now);
  assert.equal(k.count, 5);
  assert.ok(k.avg > 0.5 && k.avg < 1);
  assert.deepEqual(leeches([set]).map((x) => x.lapses), [9]);
  assert.deepEqual(suspendedCards([set]).map((x) => x.card.term), ['w5']);
});

test('统计: 每天背了几次、记住率 (只算隔天以后的那次)、今天用了多久', () => {
  const c = cardsOf(3);
  const set = makeSet({ cards: c });
  const log = {};
  addReviews(log, c[0].id, [
    { at: now - 10 * DAY, rating: 3 }, // 新词第一次: 不算记住率
    { at: now - 10 * DAY + 600e3, rating: 3 }, // 当天又练: 不算
    { at: now - 7 * DAY, rating: 1 }, // 到日子忘了
    { at: now - 7 * DAY + 600e3, rating: 3 },
    { at: now - 60e3, rating: 3 }, // 今天记得
  ]);
  addReviews(log, c[1].id, [
    { at: now - 3 * DAY, rating: 3 },
    { at: now - 30e3, rating: 1 }, // 今天忘了
    { at: now - 20e3, rating: 3 },
  ]);
  addReviews(log, 'other-card', [{ at: now, rating: 3 }]); // 别的卡片集的不算
  const byDay = reviewsByDay([set], log);
  assert.equal(byDay.get(dayKey(now)), 3);
  assert.equal(byDay.get(dayKey(now - 7 * DAY)), 2);
  const [today, week, month] = retentionStats([set], log, now);
  assert.deepEqual([today.n, today.ok], [2, 1]);
  assert.deepEqual([week.n, week.ok], [2, 1]); // 7 天前的那次在第 8 天, 不算; 3 天前是第一次, 不算
  assert.deepEqual([month.n, month.ok], [3, 1]); // 加上 7 天前忘了的那次
  const t = todayStats([set], log, now);
  assert.deepEqual([t.reviews, t.again], [3, 1]);
  assert.ok(t.minutes >= 0 && t.minutes <= 2);
});

test('自定义学习: 提前复习最可能忘的先来; 今天忘了的; 难记卡忘得多的先; 星标的; 暂停的都不要', () => {
  const c = cardsOf(6);
  const set = makeSet({
    cards: c,
    starred: [c[0].id, c[5].id],
    stats: {
      [c[0].id]: stat({ due: daysLater(now, 2), at: now - 20 * DAY, s: 10, interval: 22 }), // 隔得久, 快忘了
      [c[1].id]: stat({ due: daysLater(now, 20), at: now - DAY, s: 30, interval: 21 }),
      [c[2].id]: stat({ due: today0, lapses: 8 }), // 已经到日子: 不算提前
      [c[3].id]: stat({ due: daysLater(now, 3), lapses: 12 }),
      [c[4].id]: stat({ due: daysLater(now, 3), lapses: 15, sus: now }),
      [c[5].id]: { right: 0, wrong: 0, sus: now },
    },
  });
  assert.deepEqual(aheadCards([set], now).map((x) => x.card.term), ['w0', 'w3', 'w1']);
  assert.deepEqual(leechCards([set]).map((x) => x.card.term), ['w3', 'w2']);
  assert.deepEqual(starredCards([set]).map((x) => x.card.term), ['w0']);
  const log = {};
  addReviews(log, c[1].id, [{ at: now - 3600e3, rating: 1 }]);
  addReviews(log, c[3].id, [{ at: now - DAY, rating: 1 }]); // 昨天忘的不算
  addReviews(log, c[2].id, [{ at: now - 7200e3, rating: 1 }]);
  assert.deepEqual(forgotToday([set], log, now).map((x) => x.card.term), ['w2', 'w1']);
  assert.deepEqual(customCards('forgot', [set], log, now).map((x) => x.card.term), ['w2', 'w1']);
  assert.ok(PRACTICE.has('leech') && !PRACTICE.has('ahead'));
});
