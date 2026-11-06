// 生成 js/library/festival-days.js: 2000–2100 年每年的节日是公历哪天。
// 资料是香港天文台的「公历与农历日期对照表」(英文版, 一年一个文件 T<年>e.txt):
//   https://www.hko.gov.hk/en/gts/time/calendar/text/files/T2027e.txt
// 为什么不用浏览器自带的农历 (Intl 的 chinese 历法): 它把 2027 年春节算成 2 月 7 日 (其实是 2 月 6 日, 那天的新月在北京时间半夜前几分钟), Chrome、Safari 都这样。
//   node tools/festival-days.mjs <放 T1999e.txt … T2100e.txt 的文件夹>
// 表里每个农历月的初一写成「6th Lunar Month」, 别的日子写几号; 闰月是同一个月写两次 (2025 年的六月)。节气在最后一栏 (清明 Bright & Clear, 冬至 Winter Solstice)

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [src] = process.argv.slice(2);
if (!src) {
  console.error('用法: node tools/festival-days.mjs <放香港天文台对照表的文件夹>');
  process.exit(1);
}
const FIRST = 2000;
const LAST = 2100;
// 跟 js/festival.js 的 COLUMNS 一样的次序
const LUNAR = { chunjie: [1, 1], yuanxiao: [1, 15], duanwu: [5, 5], qixi: [7, 7], zhongqiu: [8, 15], chongyang: [9, 9] };
const TERMS = { qingming: 'Bright & Clear', dongzhi: 'Winter Solstice' };
const COLUMNS = ['chunjie', 'yuanxiao', 'qingming', 'duanwu', 'qixi', 'zhongqiu', 'chongyang', 'dongzhi'];

const found = {}; // 年 → { 节日: 'MMDD' }
let month = 0;
let leap = false;
for (let y = FIRST - 1; y <= LAST; y++) {
  const lines = readFileSync(join(src, `T${y}e.txt`), 'latin1').split(/\r?\n/); // 早几年的标题里有一个不是 UTF-8 的字符 (日期这几栏都是英文)
  let n = 0;
  for (const line of lines) {
    const m = /^(\d{4})\/(\d{1,2})\/(\d{1,2})\s+(\d+)(?:st|nd|rd|th)?( Lunar Month)?\s+\S+day\s*(.*)$/i.exec(line.trim()); // 早几年的写「Lunar month」
    if (!m) continue;
    const [, yy, mm, dd, num, isMonth, term] = m;
    if (Number(yy) !== y) throw new Error(`T${y}e.txt 里有 ${yy} 年的日子`);
    n++;
    let day;
    if (isMonth) {
      const n = Number(num);
      leap = n === month; // 同一个月又写一次: 闰月
      month = n;
      day = 1;
    } else day = Number(num);
    if (y < FIRST || !month) continue;
    const md = `${mm.padStart(2, '0')}${dd.padStart(2, '0')}`;
    const at = (found[y] ??= {});
    const put = (id) => {
      if (at[id]) throw new Error(`${y} 年有两个「${id}」`);
      at[id] = md;
    };
    for (const [id, [lm, ld]] of Object.entries(LUNAR)) if (!leap && month === lm && day === ld) put(id);
    for (const [id, name] of Object.entries(TERMS)) if (term.trim() === name) put(id);
  }
  const days = (Date.UTC(y + 1, 0, 1) - Date.UTC(y, 0, 1)) / 86400000;
  if (n !== days) throw new Error(`T${y}e.txt 只认出 ${n} 天 (应该是 ${days} 天)`);
}

const rows = [];
for (let y = FIRST; y <= LAST; y++) {
  const at = found[y] ?? {};
  for (const id of COLUMNS) if (!at[id]) throw new Error(`${y} 年没找到「${id}」`);
  rows.push(`  '${COLUMNS.map((id) => at[id]).join(' ')}', // ${y}`);
}
writeFileSync(
  new URL('../js/library/festival-days.js', import.meta.url),
  `// 每年的节日是公历哪天: tools/festival-days.mjs 从香港天文台的「公历与农历日期对照表」生成, 别手改。\n` +
    `// 一年一行, 几月几日 (MMDD), 次序是 ${COLUMNS.join(' ')} (见 js/festival.js); 除夕是春节的前一天, 不另写\n` +
    `export const FIRST_YEAR = ${FIRST};\n` +
    `export const COLUMNS = ${JSON.stringify(COLUMNS)};\n` +
    `export const DAYS = [\n${rows.join('\n')}\n];\n`,
);
console.log(`${FIRST}–${LAST} 年, ${rows.length} 年`);
