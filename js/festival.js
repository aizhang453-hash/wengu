// 节日: 今天是不是节日、下一次是哪天 (节日的诗写在 library/festivals.js, 画在 views/read.js)。日子都是 'YYYY-MM-DD' (这台设备上的日期, srs.js 的 dayKey)
//   每年哪天查 library/festival-days.js (tools/festival-days.mjs 从香港天文台的公历农历对照表生成, 2000–2100 年)。
//   不用浏览器自带的农历: 它有几年差一天 (2027、2030 年的春节和元宵), Chrome、Safari 都一样

import { FESTIVALS } from './library/festivals.js';
import { FIRST_YEAR, COLUMNS, DAYS } from './library/festival-days.js';

export { FESTIVALS };

const DAY = 86400000;
const toUTC = (day) => {
  const [y, m, d] = String(day).split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};
export const addDays = (day, n) => new Date(toUTC(day) + n * DAY).toISOString().slice(0, 10);
export const daysBetween = (a, b) => Math.round((toUTC(b) - toUTC(a)) / DAY);

// 这个节日在这一年 (公历) 是哪天; 表里没有这一年是 null。除夕是春节的前一天
export function dateOf(id, year) {
  const row = DAYS[year - FIRST_YEAR];
  if (!row) return null;
  if (id === 'chuxi') return addDays(dateOf('chunjie', year), -1);
  const md = row.split(' ')[COLUMNS.indexOf(id)];
  return md ? `${year}-${md.slice(0, 2)}-${md.slice(2)}` : null;
}

// 这天是什么节日 (没有是 null)
export function festivalOn(day, list = FESTIVALS) {
  const year = Number(String(day).slice(0, 4));
  return list.find((f) => dateOf(f.id, year) === day) ?? null;
}

// 从这天起 (含这天), 每个节日下一次是哪天: [{ festival, day, days 还有几天 }], 近的在前; 表里没有的年份不列
// (原来书斋的「节日的诗」一栏用, v1.60.2 那一栏去掉了, 现在页面上没用到)
export function upcoming(from, list = FESTIVALS) {
  const year = Number(String(from).slice(0, 4));
  const out = [];
  for (const f of list) {
    const now = dateOf(f.id, year);
    const day = now && now >= from ? now : dateOf(f.id, year + 1);
    if (day) out.push({ festival: f, day, days: daysBetween(from, day) });
  }
  return out.sort((a, b) => a.days - b.days);
}
