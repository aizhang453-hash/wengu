// 农历 (v1.81, 邸报报头的「农历丙午年十月初三」): 查 library/lunar-days.js (tools/lunar-days.mjs 从香港天文台的对照表生成, 2000–2100 年)。
//   不用浏览器自带的农历 (Intl 的 chinese 历法): 有几年差一天 (见 festival.js)。日子都是 'YYYY-MM-DD' (这台设备上的日期)

import { START, START_MONTH, MONTHS, TERM_NAMES, FIRST_YEAR, TERMS } from './library/lunar-days.js';

const DAY = 86400000;
const toUTC = (day) => {
  const [y, m, d] = String(day).split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};
const START_YEAR = Number(START.slice(0, 4)); // START 那个月 (十一月) 属于哪个农历年

// 这天是农历哪年几月几日: { year (那个农历年正月初一在公历哪年), month 1–12, leap 闰月, day 1–30 }; 表外的日子是 null
export function lunarOf(day) {
  let left = Math.round((toUTC(day) - toUTC(START)) / DAY);
  if (!(left >= 0)) return null;
  let month = START_MONTH;
  let year = START_YEAR;
  for (let i = 0; i < MONTHS.length; i++) {
    const c = MONTHS[i];
    const leap = c === 'S' || c === 'L';
    if (i > 0 && !leap) {
      month = (month % 12) + 1;
      if (month === 1) year++;
    }
    const len = c === 'l' || c === 'L' ? 30 : 29;
    if (left < len) return { year, month, leap, day: left + 1 };
    left -= len;
  }
  return null;
}

const NUM = '一二三四五六七八九十';
const MONTH_NAMES = ['正', '二', '三', '四', '五', '六', '七', '八', '九', '十', '冬', '腊'];
export const monthName = (m, leap = false) => `${leap ? '闰' : ''}${MONTH_NAMES[m - 1]}月`;
export function dayName(d) {
  if (d <= 10) return `初${NUM[d - 1]}`;
  if (d < 20) return `十${NUM[d - 11]}`;
  if (d === 20) return '二十';
  if (d < 30) return `廿${NUM[d - 21]}`;
  return '三十';
}
// 干支纪年: 2026 → 丙午
export function ganzhi(year) {
  const i = (((year - 4) % 60) + 60) % 60;
  return '甲乙丙丁戊己庚辛壬癸'[i % 10] + '子丑寅卯辰巳午未申酉戌亥'[i % 12];
}

// 「丙午年十月初三」; 表外的日子是空的
export function lunarText(day) {
  const l = lunarOf(day);
  return l ? `${ganzhi(l.year)}年${monthName(l.month, l.leap)}${dayName(l.day)}` : '';
}

// 这天是不是节气: 「立冬」或者 null
export function solarTermOn(day) {
  const [y, m, d] = String(day).split('-').map(Number);
  const row = TERMS[y - FIRST_YEAR];
  if (!row) return null;
  for (const i of [(m - 1) * 2, (m - 1) * 2 + 1]) if (row.charCodeAt(i) - 96 === d) return TERM_NAMES[i];
  return null;
}
