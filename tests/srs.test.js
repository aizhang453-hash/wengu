import { test } from 'node:test';
import assert from 'node:assert/strict';
import { schedule, isDue, dueCards, dueTomorrow, streak, lastDays, dayKey, DAY } from '../js/srs.js';

const noon = new Date(2026, 9, 12, 12, 0, 0).getTime(); // 2026-10-12 中午
const morning = (daysLater) => new Date(2026, 9, 12 + daysLater, 0, 0, 0).getTime();

// 按时复习 (到那天就答): 答完记上时间, 跟 store.recordAnswer 一样
const answer = (prev, correct, now) => ({ ...prev, ...schedule(prev, correct, now), at: now });

test('FSRS 答对: 间隔越来越久 (2 天 → 十来天 → 一个多月), 到那天一早就该复习', () => {
  let s = answer(null, true, noon);
  assert.equal(s.interval, 2);
  assert.equal(s.due, morning(2));
  const gaps = [s.interval];
  for (let k = 0; k < 3; k++) {
    s = answer(s, true, s.due + 9 * 60 * 60 * 1000);
    gaps.push(s.interval);
  }
  for (let k = 1; k < gaps.length; k++) assert.ok(gaps[k] > gaps[k - 1] * 2, `${gaps}`);
  assert.ok(gaps[2] >= 30, `${gaps}`);
  assert.ok(s.s > 0 && s.d >= 1 && s.d <= 10);
});

test('FSRS 答错: 10 分钟后再来, 变难; 今天再答对隔一天, 以后涨得比没错过的慢', () => {
  const wrong = answer(null, false, noon);
  assert.equal(wrong.interval, 0);
  assert.equal(wrong.due, noon + 10 * 60 * 1000);
  const fixed = answer(wrong, true, noon + 15 * 60 * 1000);
  assert.equal(fixed.interval, 1);
  const easy = answer(null, true, noon);
  assert.ok(fixed.d > easy.d, '错过的更难');
  // 记得很牢的忘了: 稳定性掉下来, 也是 10 分钟后再来
  const strong = { s: 60, d: 5, at: noon - 50 * DAY, interval: 60, due: noon - DAY };
  const lapse = answer(strong, false, noon);
  assert.ok(lapse.s < 60 && lapse.due === noon + 10 * 60 * 1000);
});

test('以前按 interval / ease 记的: 换算成 FSRS 接着排, 不从头来', () => {
  const old = { right: 4, wrong: 0, interval: 20, ease: 2.6, due: morning(0) }; // 没有 at, 当成按时复习
  const s = answer(old, true, noon);
  assert.ok(s.interval > 20, `${s.interval}`);
  const hard = answer({ ...old, ease: 1.3 }, true, noon);
  assert.ok(hard.interval < s.interval, '以前老答错的 (ease 小) 涨得慢');
});

test('该复习的卡片', () => {
  const sets = [
    {
      id: 'a',
      cards: [{ id: '1' }, { id: '2' }, { id: '3' }, { id: '4' }, { id: '5' }],
      // 3: 今天晚些时候到 (是今天的, 不算明天的); 5: 明天中午
      stats: { 1: { due: noon - 5 }, 2: { due: noon - 100 }, 3: { due: noon + DAY / 4 }, 4: { right: 1, wrong: 0 }, 5: { due: noon + DAY } },
    },
  ];
  assert.deepEqual(
    dueCards(sets, noon).map((x) => x.card.id),
    ['2', '1'],
  );
  assert.equal(dueTomorrow(sets, noon), 1);
  assert.ok(!isDue(undefined, noon));
});

test('连续打卡', () => {
  const act = { [dayKey(noon)]: 3, [dayKey(noon - DAY)]: 5, [dayKey(noon - 2 * DAY)]: 1, [dayKey(noon - 4 * DAY)]: 9 };
  assert.equal(streak(act, noon), 3);
  // 今天还没学: 从昨天往前数, 断了也不归零
  const noToday = { ...act };
  delete noToday[dayKey(noon)];
  assert.equal(streak(noToday, noon), 2);
  assert.equal(streak({}, noon), 0);
  const days = lastDays(act, 7, noon);
  assert.equal(days.length, 7);
  assert.equal(days.at(-1).count, 3);
  assert.equal(days[2].count, 9);
});
