import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FESTIVALS, festivalOn, upcoming, dateOf, addDays, daysBetween } from '../js/festival.js';
import { FIRST_YEAR, COLUMNS, DAYS } from '../js/library/festival-days.js';
import { bookOf, loadBook } from '../js/reading.js';

const LAST_YEAR = FIRST_YEAR + DAYS.length - 1;

test('节日: 每年是哪天 (对照香港天文台的对照表); 浏览器自带农历算错的 2027、2030 年春节也对', () => {
  const y2026 = { chuxi: '2026-02-16', chunjie: '2026-02-17', yuanxiao: '2026-03-03', qingming: '2026-04-05', duanwu: '2026-06-19', qixi: '2026-08-19', zhongqiu: '2026-09-25', chongyang: '2026-10-18', dongzhi: '2026-12-22' };
  for (const [id, day] of Object.entries(y2026)) {
    assert.equal(dateOf(id, 2026), day, id);
    assert.equal(festivalOn(day)?.id, id, day);
  }
  // 2027 年春节是 2 月 6 日 (那天的新月在北京时间半夜前几分钟; Chrome、Safari 的农历都算成 2 月 7 日)
  assert.equal(dateOf('chunjie', 2027), '2027-02-06');
  assert.equal(dateOf('chuxi', 2027), '2027-02-05');
  assert.equal(dateOf('yuanxiao', 2027), '2027-02-20');
  assert.equal(festivalOn('2027-02-07'), null);
  assert.equal(dateOf('chunjie', 2030), '2030-02-03');
  // 2025 年有闰六月: 七夕在闰六月后面那个七月
  assert.equal(dateOf('qixi', 2025), '2025-08-29');
  assert.equal(festivalOn('2025-07-31'), null);
  // 平常的日子不是节日
  assert.equal(festivalOn('2026-11-06'), null);
  // 表外的年份: 没有
  assert.equal(dateOf('chunjie', 1999), null);
  assert.equal(dateOf('chunjie', LAST_YEAR + 1), null);
  assert.equal(festivalOn('2101-01-29'), null);
});

test('节日: 表里每年都齐, 日子在说得通的范围里; 清明、冬至跟节气通式对得上', () => {
  assert.equal(FIRST_YEAR, 2000);
  assert.equal(LAST_YEAR, 2100);
  const range = { chunjie: ['01-21', '02-20'], yuanxiao: ['02-04', '03-06'], qingming: ['04-04', '04-05'], duanwu: ['05-27', '06-25'], qixi: ['07-31', '08-29'], zhongqiu: ['09-07', '10-07'], chongyang: ['09-28', '10-31'], dongzhi: ['12-21', '12-22'] };
  let last = null;
  for (let y = FIRST_YEAR; y <= LAST_YEAR; y++) {
    const row = DAYS[y - FIRST_YEAR].split(' ');
    assert.equal(row.length, COLUMNS.length, String(y));
    for (const id of COLUMNS) {
      const day = dateOf(id, y);
      assert.match(day, /^\d{4}-\d{2}-\d{2}$/, `${y} ${id}`);
      const md = day.slice(5);
      assert.ok(md >= range[id][0] && md <= range[id][1], `${y} ${id} ${day}`);
    }
    // 农历节日之间隔几天是定的 (元宵是春节后 14 天), 跟农历年的长短也对得上
    assert.equal(daysBetween(dateOf('chunjie', y), dateOf('yuanxiao', y)), 14, String(y));
    const cj = dateOf('chunjie', y);
    if (last) assert.ok([353, 354, 355, 383, 384, 385].includes(daysBetween(last, cj)), `${y} 跟上一年的春节隔了 ${daysBetween(last, cj)} 天`);
    last = cj;
    // 清明、冬至: 寿星通式 (2021 年冬至是例外, 少一天); 两边来的地方不一样, 对得上就说明表没读错
    if (y <= 2099) {
      const Y = y % 100;
      const term = (C) => Math.floor(Y * 0.2422 + C) - Math.floor(Y / 4);
      assert.equal(Number(dateOf('qingming', y).slice(8)), term(4.81), `${y} 清明`);
      assert.equal(Number(dateOf('dongzhi', y).slice(8)), term(21.94) - (y === 2021 ? 1 : 0), `${y} 冬至`);
    }
  }
});

test('节日: 从今天起最近的排前面, 还有几天; 当天是 0 天', () => {
  const list = upcoming('2026-11-06');
  assert.equal(list.length, FESTIVALS.length);
  assert.deepEqual(
    list.map((x) => [x.festival.id, x.day, x.days]),
    [
      ['dongzhi', '2026-12-22', 46],
      ['chuxi', '2027-02-05', 91],
      ['chunjie', '2027-02-06', 92],
      ['yuanxiao', '2027-02-20', 106],
      ['qingming', '2027-04-05', 150],
      ['duanwu', '2027-06-09', 215],
      ['qixi', '2027-08-08', 275],
      ['zhongqiu', '2027-09-15', 313],
      ['chongyang', '2027-10-08', 336],
    ],
  );
  const onDay = upcoming('2026-09-25');
  assert.deepEqual([onDay[0].festival.id, onDay[0].days], ['zhongqiu', 0]);
  // 表的最后一年: 明年的查不到, 就不列
  assert.ok(upcoming('2100-12-23').length < FESTIVALS.length);
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(daysBetween('2026-02-28', '2026-03-01'), 1);
});

test('节日的诗: 每个节日都有诗, 每首都在书库里、第一句对得上, 不重复', async () => {
  const ids = FESTIVALS.map((f) => f.id);
  assert.deepEqual(ids, ['chunjie', 'yuanxiao', 'qingming', 'duanwu', 'qixi', 'zhongqiu', 'chongyang', 'dongzhi', 'chuxi']);
  for (const f of FESTIVALS) {
    assert.ok(f.name && f.when && f.about, f.id);
    assert.ok(dateOf(f.id, 2026), `${f.id} 在表里查得到`);
    assert.ok(f.poems.length >= 1, f.id);
    const seen = new Set();
    for (const [id, n, first, note] of f.poems) {
      const book = bookOf(id);
      assert.ok(book, `${f.name}: 没有「${id}」这本书`);
      assert.ok(Number.isInteger(n) && n >= 1 && n <= book.count, `${f.name}: ${id} 第 ${n} 首`);
      const p = (await loadBook(id)).pieces[n - 1];
      assert.ok(p.p[0].startsWith(first), `${f.name}: ${id} 第 ${n} 首是「${p.t}」(${p.p[0]}), 不是「${first}」`);
      assert.ok(!seen.has(`${id}:${n}`), `${f.name}: ${id} 第 ${n} 首写了两次`);
      seen.add(`${id}:${n}`);
      if (note !== undefined) assert.ok(typeof note === 'string' && note.length > 0, `${f.name}: ${p.t} 的说明`);
    }
  }
  // 节日那天放在「每日一首」的是最有名的那首
  const first = async (fid) => {
    const [id, n] = FESTIVALS.find((f) => f.id === fid).poems[0];
    return (await loadBook(id)).pieces[n - 1].t;
  };
  assert.equal(await first('zhongqiu'), '水调歌头·明月几时有');
  assert.equal(await first('chongyang'), '九月九日忆山东兄弟');
  assert.equal(await first('qingming'), '清明');
  assert.equal(await first('chunjie'), '元日');
});

test('千家诗: 资料写错的作者、题目改过来 (对照维基文库)', async () => {
  for (const hant of [false, true]) {
    const qj = await loadBook('qianjiashi', { hant });
    const moon = qj.pieces.find((p) => p.p[0].startsWith(hant ? '暮雲收盡' : '暮云收尽'));
    assert.equal(moon.t, '中秋月');
    assert.deepEqual([moon.a, moon.e], hant ? ['蘇軾', '宋'] : ['苏轼', '宋']);
    const lantian = qj.pieces.find((p) => p.p[0].startsWith(hant ? '老去悲秋' : '老去悲秋'));
    assert.equal(lantian.t, hant ? '九日藍田會飲' : '九日蓝田会饮');
  }
});
