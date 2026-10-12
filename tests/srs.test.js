import { test } from 'node:test';
import assert from 'node:assert/strict';
import { schedule, isDue, dueCards, dueTomorrow, streak, lastDays, dayKey, DAY } from '../js/srs.js';

const noon = new Date(2026, 9, 12, 12, 0, 0).getTime(); // 2026-10-12 中午
const morning = (daysLater) => new Date(2026, 9, 12 + daysLater, 0, 0, 0).getTime();

test('答对: 1 天 → 3 天 → 越来越久, 到那天一早就该复习', () => {
  let s = schedule(null, true, noon);
  assert.equal(s.interval, 1);
  assert.equal(s.due, morning(1));
  s = schedule(s, true, s.due + 1000);
  assert.equal(s.interval, 3);
  s = schedule(s, true, s.due + 1000);
  assert.ok(s.interval >= 7 && s.interval <= 9, `${s.interval}`);
  assert.ok(s.ease > 2.5);
});

test('答错: 10 分钟后再来, 变难一点, 间隔从头算', () => {
  const s = schedule({ interval: 20, ease: 2.5, due: 0 }, false, noon);
  assert.equal(s.interval, 0);
  assert.equal(s.due, noon + 10 * 60 * 1000);
  assert.equal(s.ease, 2.3);
  assert.equal(schedule(s, true, noon).interval, 1);
  assert.equal(schedule({ ease: 1.3 }, false, noon).ease, 1.3); // 不会低于 1.3
});

test('该复习的卡片', () => {
  const sets = [
    {
      id: 'a',
      cards: [{ id: '1' }, { id: '2' }, { id: '3' }, { id: '4' }],
      stats: { 1: { due: noon - 5 }, 2: { due: noon - 100 }, 3: { due: noon + DAY / 4 }, 4: { right: 1, wrong: 0 } },
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
