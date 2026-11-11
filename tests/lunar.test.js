import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lunarOf, lunarText, solarTermOn, monthName, dayName, ganzhi } from '../js/lunar.js';
import { dateOf, addDays } from '../js/festival.js';
import { MONTHS, TERMS, FIRST_YEAR } from '../js/library/lunar-days.js';

test('农历: 几月几日 (对照香港天文台的对照表); 闰月、大小月、年份的干支', () => {
  assert.equal(lunarText('2026-11-11'), '丙午年十月初三');
  assert.equal(lunarText('2026-11-08'), '丙午年九月三十');
  assert.equal(lunarText('2026-02-17'), '丙午年正月初一');
  assert.equal(lunarText('2026-02-16'), '乙巳年腊月廿九'); // 除夕 (那年腊月是小月)
  assert.equal(lunarText('2025-07-25'), '乙巳年闰六月初一');
  assert.equal(lunarText('2025-07-24'), '乙巳年六月三十');
  assert.equal(lunarText('2027-02-06'), '丁未年正月初一'); // 浏览器自带的农历算成 2 月 7 日
  assert.equal(lunarText('2000-01-01'), '己卯年冬月廿五');
  assert.deepEqual(lunarOf('2025-07-26'), { year: 2025, month: 6, leap: true, day: 2 });
  // 表外的日子
  assert.equal(lunarOf('1999-01-01'), null);
  assert.equal(lunarText('2101-06-01'), '');
  assert.deepEqual([1, 10, 11, 19, 20, 21, 29, 30].map(dayName), ['初一', '初十', '十一', '十九', '二十', '廿一', '廿九', '三十']);
  assert.equal(monthName(11), '冬月');
  assert.equal(monthName(12), '腊月');
  assert.equal(monthName(6, true), '闰六月');
  assert.equal(ganzhi(1984), '甲子');
  assert.equal(ganzhi(2026), '丙午');
  assert.equal(ganzhi(2043), '癸亥');
});

test('农历: 2000–2100 年每年的春节、中秋、重阳跟节日表 (festival-days.js) 对得上; 清明、冬至是节气', () => {
  for (let y = 2000; y <= 2100; y++) {
    assert.deepEqual(lunarOf(dateOf('chunjie', y)), { year: y, month: 1, leap: false, day: 1 }, `${y} 春节`);
    assert.equal(lunarOf(dateOf('chuxi', y)).year, y - 1);
    assert.deepEqual(lunarOf(dateOf('zhongqiu', y)), { year: y, month: 8, leap: false, day: 15 }, `${y} 中秋`);
    assert.deepEqual(lunarOf(dateOf('chongyang', y)), { year: y, month: 9, leap: false, day: 9 }, `${y} 重阳`);
    assert.equal(solarTermOn(dateOf('qingming', y)), '清明', `${y} 清明`);
    assert.equal(solarTermOn(dateOf('dongzhi', y)), '冬至', `${y} 冬至`);
    assert.equal(solarTermOn(addDays(dateOf('dongzhi', y), 1)), null);
  }
  // 一年 12 或 13 个月, 每个月 29 或 30 天: 表里的字都认得
  assert.match(MONTHS, /^[slSL]+$/);
  assert.equal(TERMS.length, 2100 - FIRST_YEAR + 1);
  for (const row of TERMS) assert.match(row, /^[a-z]{24}$/);
});

test('节气: 那天才有', () => {
  assert.equal(solarTermOn('2026-11-07'), '立冬');
  assert.equal(solarTermOn('2026-11-22'), '小雪');
  assert.equal(solarTermOn('2026-11-11'), null);
  assert.equal(solarTermOn('2101-01-05'), null);
});
