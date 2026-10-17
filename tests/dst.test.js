import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.TZ = 'America/New_York'; // 有夏令时的地方 (11 月 1 日那天 25 小时)
const { schedule } = await import('../js/srs.js');

test('复习的日子按日历算: 跨过夏令时也是那天 0 点, 不会早一个钟头', () => {
  const now = new Date(2026, 9, 31, 10).getTime(); // 10 月 31 日
  const r = schedule({ s: 2, d: 5, at: now - 2 * 86400000, due: now, interval: 2 }, true, now);
  const due = new Date(r.due);
  assert.deepEqual([due.getHours(), due.getMinutes()], [0, 0]);
  assert.equal(due.getDate() - 31 + 31 * (due.getMonth() - 9), r.interval);
});
