// 生成 js/library/lunar-days.js: 2000–2100 年每天是农历几月几日、哪天是节气 (邸报报头写「农历九月廿二」用, v1.81)。
// 资料跟 tools/festival-days.mjs 一样, 是香港天文台的「公历与农历日期对照表」(英文版, 一年一个文件 T<年>e.txt):
//   https://www.hko.gov.hk/en/gts/time/calendar/text/files/T2027e.txt
// 不用浏览器自带的农历 (Intl 的 chinese 历法): 有几年差一天 (见 festival-days.mjs)
//   node tools/lunar-days.mjs <放 T1999e.txt … T2100e.txt 的文件夹>

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [src] = process.argv.slice(2);
if (!src) {
  console.error('用法: node tools/lunar-days.mjs <放香港天文台对照表的文件夹>');
  process.exit(1);
}
const FIRST = 2000;
const LAST = 2100;
// 节气: 天文台的英文名 → 中文, 一年里的次序 (小寒在 1 月, 冬至在 12 月)
const TERMS = [
  ['Moderate Cold', '小寒'],
  ['Severe Cold', '大寒'],
  ['Spring Commences', '立春'],
  ['Spring Showers', '雨水'],
  ['Insects Waken', '惊蛰'],
  ['Vernal Equinox', '春分'],
  ['Bright & Clear', '清明'],
  ['Corn Rain', '谷雨'],
  ['Summer Commences', '立夏'],
  ['Corn Forms', '小满'],
  ['Corn on Ear', '芒种'],
  ['Summer Solstice', '夏至'],
  ['Moderate Heat', '小暑'],
  ['Great Heat', '大暑'],
  ['Autumn Commences', '立秋'],
  ['End of Heat', '处暑'],
  ['White Dew', '白露'],
  ['Autumnal Equinox', '秋分'],
  ['Cold Dew', '寒露'],
  ['Frost', '霜降'],
  ['Winter Commences', '立冬'],
  ['Light Snow', '小雪'],
  ['Heavy Snow', '大雪'],
  ['Winter Solstice', '冬至'],
];
const TERM_AT = new Map(TERMS.map(([en], i) => [en.toLowerCase(), i]));

const months = []; // 每个农历月: { start: 'YYYY-MM-DD', month, leap }
const terms = {}; // 年 → [24 个节气是几号]
let month = 0;
for (let y = FIRST - 1; y <= LAST; y++) {
  const lines = readFileSync(join(src, `T${y}e.txt`), 'latin1').split(/\r?\n/);
  let n = 0;
  for (const line of lines) {
    const m = /^(\d{4})\/(\d{1,2})\/(\d{1,2})\s+(\d+)(?:st|nd|rd|th)?( Lunar Month)?\s+\S+day\s*(.*)$/i.exec(line.trim());
    if (!m) continue;
    const [, yy, mm, dd, num, isMonth, term] = m;
    if (Number(yy) !== y) throw new Error(`T${y}e.txt 里有 ${yy} 年的日子`);
    n++;
    const day = `${yy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
    if (isMonth) {
      const k = Number(num);
      months.push({ start: day, month: k, leap: k === month }); // 同一个月又写一次: 闰月
      month = k;
    }
    const t = term.trim().toLowerCase();
    if (y >= FIRST && t) {
      const i = TERM_AT.get(t);
      if (i === undefined) throw new Error(`${day} 不认得的节气「${term.trim()}」`);
      if (Number(mm) !== Math.floor(i / 2) + 1) throw new Error(`${day} 的「${TERMS[i][1]}」不在该在的月份`);
      const row = (terms[y] ??= []);
      if (row[i]) throw new Error(`${y} 年有两个「${TERMS[i][1]}」`);
      row[i] = Number(dd);
    }
  }
  const days = (Date.UTC(y + 1, 0, 1) - Date.UTC(y, 0, 1)) / 86400000;
  if (n !== days) throw new Error(`T${y}e.txt 只认出 ${n} 天 (应该是 ${days} 天)`);
}

// 从 2000 年 1 月 1 日那天所在的农历月开始
const startAt = months.findLastIndex((x) => x.start <= `${FIRST}-01-01`);
const used = months.slice(startAt);
const DAY = 86400000;
const toUTC = (d) => Date.parse(`${d}T00:00:00Z`);
const end = `${LAST + 1}-01-01`;
let code = '';
for (let i = 0; i < used.length; i++) {
  const next = used[i + 1]?.start;
  if (!next) break; // 最后一个月不知道多长, 不写 (2100 年最后几天查不到)
  const len = (toUTC(next) - toUTC(used[i].start)) / DAY;
  if (len !== 29 && len !== 30) throw new Error(`${used[i].start} 那个月有 ${len} 天`);
  const prev = used[i - 1];
  if (prev && !used[i].leap && used[i].month !== (prev.month % 12) + 1) throw new Error(`${used[i].start}: ${prev.month} 月后面是 ${used[i].month} 月`);
  code += used[i].leap ? (len === 30 ? 'L' : 'S') : len === 30 ? 'l' : 's';
  if (next >= end) break;
}
const B = 'abcdefghijklmnopqrstuvwxyz';
const termRows = [];
for (let y = FIRST; y <= LAST; y++) {
  const row = terms[y] ?? [];
  if (row.filter(Boolean).length !== 24) throw new Error(`${y} 年只找到 ${row.filter(Boolean).length} 个节气`);
  termRows.push(`  '${row.map((d) => B[d - 1]).join('')}', // ${y}`);
}
const first = used[0];
writeFileSync(
  new URL('../js/library/lunar-days.js', import.meta.url),
  `// 每天是农历几月几日、节气是哪天: tools/lunar-days.mjs 从香港天文台的「公历与农历日期对照表」生成, 别手改。用法见 js/lunar.js\n` +
    `// MONTHS 一个字一个农历月, 从 START (那个月的初一, ${first.month} 月) 起接着排: s 小月 (29 天)、l 大月 (30 天), 大写的是闰月 (月份跟上一个月一样)\n` +
    `// TERMS 一年一行, 24 个节气 (小寒、大寒……冬至) 各是那个月的几号 (a 是 1 号, b 是 2 号……; 小寒、大寒在 1 月, 立春、雨水在 2 月……)\n` +
    `export const START = '${first.start}';\n` +
    `export const START_MONTH = ${first.month};\n` +
    `export const MONTHS =\n${code.match(/.{1,100}/g).map((s) => `  '${s}'`).join(' +\n')};\n` +
    `export const TERM_NAMES = ${JSON.stringify(TERMS.map((t) => t[1]))};\n` +
    `export const FIRST_YEAR = ${FIRST};\n` +
    `export const TERMS = [\n${termRows.join('\n')}\n];\n`,
);
console.log(`${code.length} 个农历月 (从 ${first.start} 起), ${termRows.length} 年的节气`);
