import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Store, makeSet, makeCard, cleanData } from '../js/store.js';
import { mergeData } from '../js/merge.js';
import { dayKey, DAY } from '../js/srs.js';
import { addReviews, AGAIN, GOOD } from '../js/revlog.js';
import { insight } from '../js/views/pet.js';
import {
  STAGES,
  stageOf,
  growth,
  xpOf,
  bankDays,
  cleanPet,
  mergePet,
  milestoneDue,
  cheered,
  newUnlocks,
  moodOf,
  tips,
  idleDays,
  QUOTES,
  STUDY_TIPS,
  pickNext,
  quoteTags,
  report,
  randomQuote,
  quoteSource,
  eventLine,
} from '../js/pet.js';

function memoryStorage() {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k) };
}

const now = new Date(2026, 9, 20, 15, 0).getTime();

test('温温长大: 学了几次决定是蛋、宝宝、小乌龟、大乌龟还是学霸龟', () => {
  assert.equal(stageOf(0), 0);
  assert.equal(stageOf(19), 0);
  assert.equal(stageOf(20), 1);
  assert.equal(stageOf(1500), 3);
  assert.equal(stageOf(99999), STAGES.length - 1);
  assert.deepEqual(growth(160), { stage: 1, from: 20, to: 300, progress: 0.5 });
  assert.equal(growth(10000).to, null);
  assert.equal(growth(10000).progress, 1);
});

test('吃了几口 = 打卡记录加起来 (以前学过的也算); 打卡记录去掉的一年多以前的记在 bank 里, 不少算', () => {
  const store = new Store(memoryStorage());
  assert.equal(store.data.pet, null);
  // 400 天每天 10 题, 再学一题: 最早那天从打卡记录里去掉
  for (let i = 400; i >= 1; i--) store.data.activity[dayKey(now - i * DAY)] = 10;
  assert.equal(xpOf(store.data.pet, store.data.activity), 4000);
  store.touchActivity(now);
  assert.equal(Object.keys(store.data.activity).length, 400);
  assert.equal(store.data.pet.bank, 10);
  assert.equal(xpOf(store.data.pet, store.data.activity), 4001);
  // 撤销一题也退回去
  store.untouchActivity(now);
  assert.equal(xpOf(store.data.pet, store.data.activity), 4000);
});

test('同步: 一台设备把旧的几天记进了 bank, 另一台还留着那几天: 合起来不重复算', () => {
  const days = Object.fromEntries(Array.from({ length: 401 }, (_, i) => [dayKey(now - (401 - i) * DAY), 5]));
  const a = new Store(memoryStorage());
  a.data.activity = { ...days };
  a.touchActivity(now); // 去掉最早一天 → bank 5
  const b = cleanData({ activity: { ...days } }); // 还留着那天, 没有温温
  const merged = cleanData(mergeData(a.data, b));
  assert.equal(Object.keys(merged.activity).length, 402); // 旧的那天又合回来了
  assert.equal(xpOf(merged.pet, merged.activity), 401 * 5 + 1); // 但不重复算
  // 合回来的那天下次又去掉: 已经算过, bank 不再加
  const again = new Store(memoryStorage());
  again.replaceData(merged);
  again.touchActivity(now);
  assert.equal(xpOf(again.data.pet, again.data.activity), 401 * 5 + 2);
});

test('同步合并温温: 解锁的装扮合起来, 名字和装扮听后改的, 长到哪了取大的', () => {
  const a = cleanPet({ name: '慢慢', wear: 'hat', at: 2000, unlocked: ['scarf', 'hat'], stageSeen: 2, cheer: { from: '2026-10-01', days: [3] } });
  const b = cleanPet({ name: '温温', wear: 'scarf', at: 1000, unlocked: ['scarf', 'glasses'], stageSeen: 3, cheer: { from: '2026-10-01', days: [3, 7] } });
  const m = mergePet(a, b);
  assert.equal(m.name, '慢慢');
  assert.equal(m.wear, 'hat');
  assert.deepEqual(m.unlocked.sort(), ['glasses', 'hat', 'scarf']);
  assert.equal(m.stageSeen, 3);
  assert.deepEqual(m.cheer, { from: '2026-10-01', days: [3, 7] });
  // 新的一段连续打卡听新的
  assert.deepEqual(mergePet(a, cleanPet({ cheer: { from: '2026-10-15', days: [3] } })).cheer, { from: '2026-10-15', days: [3] });
  assert.equal(mergePet(null, b), b);
  assert.equal(mergePet(a, null), a);
});

test('温温跟着数据存、同步、备份; 老数据没有温温是 null; 乱七八糟的值洗掉', () => {
  assert.equal(cleanData({ sets: [] }).pet, null);
  const pet = cleanPet({ name: '  ', bank: -3, since: 'yesterday', unlocked: ['hat', 'rocket', 'hat'], wear: 'rocket', stageSeen: 99, cheer: { from: 'x', days: [7, 8, 3] } });
  assert.deepEqual(pet, { name: '温温', bank: 0, since: '', unlocked: ['hat'], wear: '', cheer: { from: '', days: [3, 7] }, stageSeen: 4, at: 0 });
  assert.equal(cleanPet({ name: '一二三四五六七八九十一二三' }).name.length, 12);

  const store = new Store(memoryStorage());
  const set = store.putSet(makeSet({ cards: [makeCard('a', 'b')] }));
  store.updatePet({ unlocked: ['scarf'] });
  store.updatePet({ name: '慢慢', wear: 'scarf' }, { stamp: true, now });
  assert.equal(store.data.pet.at, now);
  const backup = store.exportBackup();
  const other = new Store(memoryStorage());
  other.putSet(makeSet({ cards: [makeCard('x', 'y')] }));
  other.updatePet({ unlocked: ['hat'] });
  other.importBackup(backup, now + 1000);
  assert.equal(other.data.pet.name, '慢慢');
  assert.deepEqual(other.data.pet.unlocked.sort(), ['hat', 'scarf']);
  assert.ok(other.getSet(set.id));
  // 没有温温的老备份不会把这里的去掉
  other.importBackup(JSON.stringify({ app: 'wengu', sets: [] }), now + 2000);
  assert.equal(other.data.pet.name, '慢慢');
});

test('连续打卡放烟花: 到了几天放一次; 一下连到 30 天只放最大的; 断了重新连, 到了又放', () => {
  const none = cleanPet({}).cheer;
  assert.equal(milestoneDue(none, '2026-10-01', 2), 0);
  assert.equal(milestoneDue(none, '2026-10-01', 3), 3);
  assert.equal(milestoneDue(none, '2026-10-01', 31), 30);
  const after = cheered('2026-10-01', 31);
  assert.deepEqual(after.days, [3, 7, 14, 30]);
  assert.equal(milestoneDue(after, '2026-10-01', 31), 0);
  assert.equal(milestoneDue(after, '2026-10-01', 50), 50);
  assert.equal(milestoneDue(after, '2026-11-15', 3), 3); // 新的一段
});

test('装扮: 达到了就解锁, 解锁过的不再说', () => {
  const pet = cleanPet({ unlocked: ['scarf'] });
  assert.deepEqual(newUnlocks(pet, { streak: 7, xp: 10, cleared: false }).map((o) => o.key), ['hat']);
  assert.deepEqual(newUnlocks(pet, { streak: 0, xp: 1000, cleared: true }).map((o) => o.key), ['flower', 'glasses']);
  assert.deepEqual(newUnlocks(cleanPet({}), { streak: 0, xp: 0, cleared: false }), []);
});

test('心情: 很晚了困了 > 好几天没来想你了 > 好多没背着急 > 今天没学饿了 > 背完了开心', () => {
  const base = { hour: 15, today: 0, due: 10, streak: 2, idleDays: 1 };
  assert.equal(moodOf({ ...base, hour: 23 }), 'sleepy');
  assert.equal(moodOf({ ...base, hour: 4 }), 'sleepy');
  assert.equal(moodOf({ ...base, idleDays: 3 }), 'sad');
  assert.equal(moodOf({ ...base, due: 60 }), 'worried');
  assert.equal(moodOf(base), 'hungry');
  assert.equal(moodOf({ ...base, today: 12, due: 0 }), 'happy');
  assert.equal(moodOf({ ...base, today: 5, due: 3 }), 'normal');
  assert.equal(moodOf({ hour: 10, today: 0, due: 0, streak: 0, idleDays: 0 }), 'normal'); // 新用户
});

test('点它说的有用的话: 重要的在前, 带直接去的按钮', () => {
  const c = { sets: 2, hour: 15, today: 0, due: 14, reviews: 10, fresh: 4, held: 0, streak: 5, mistakes: 3, leeches: 2, examDays: 137, tomorrow: 40 };
  const list = tips(c);
  assert.match(list[0].text, /今天还有 14 张要背 \(复习 10 张、新词 4 个\)/);
  assert.deepEqual(list[0].action, { label: '去背', href: '#/review' });
  assert.ok(list.some((t) => /错题集里有 3 道/.test(t.text) && t.action.href === '#/mistakes/review'));
  assert.ok(list.some((t) => /离考试还有 137 天/.test(t.text) && !t.action));
  assert.ok(list.some((t) => /2 张老是忘的难记卡/.test(t.text)));
  // 晚上了还没学: 先提醒连续打卡要断了; 很晚了: 先叫你睡觉
  assert.match(tips({ ...c, hour: 20 })[0].text, /连续 5 天就断了/);
  assert.match(tips({ ...c, hour: 23 })[0].text, /早点睡/);
  // 背完了: 说明天的, 能提前复习一点
  const done = tips({ ...c, today: 30, due: 0, mistakes: 0, leeches: 0, examDays: null });
  assert.match(done[0].text, /今天的都背完了, 真棒! 明天有 40 张/);
  assert.equal(done[0].action.label, '提前复习一点');
  // 还没有卡片集
  assert.deepEqual(tips({ ...c, sets: 0 }).map((t) => t.action?.href), ['#/new']);
});

test('《论语》100 句: 每句都有出处、白话、话题; 随机的不跟上一句一样; 说的人默认是孔子', () => {
  const chapters = new Set(['学而', '为政', '八佾', '里仁', '公冶长', '雍也', '述而', '泰伯', '子罕', '乡党', '先进', '颜渊', '子路', '宪问', '卫灵公', '季氏', '阳货', '微子', '子张', '尧曰']);
  assert.equal(QUOTES.length, 100);
  const TAGS = new Set(['review', 'think', 'humble', 'joy', 'persist', 'mistake', 'steady', 'time', 'self', 'start']);
  for (const q of QUOTES) {
    assert.ok(chapters.has(q.from), q.from);
    assert.ok(q.plain.length > 4, q.text);
    assert.ok(q.tags.every((t) => TAGS.has(t)), q.text);
    assert.match(q.text, /[。？！]$/, q.text);
  }
  for (const t of TAGS) assert.ok(QUOTES.filter((q) => q.tags.includes(t)).length >= 5, t);
  assert.equal(new Set(QUOTES.map((q) => q.text)).size, QUOTES.length);
  assert.equal(quoteSource(QUOTES[0]), '孔子《论语·学而》');
  assert.equal(quoteSource(QUOTES.find((q) => q.who === '曾子')), '曾子《论语·学而》');
  assert.ok(QUOTES.some((q) => q.text.startsWith('温故而知新')));
  let last = null;
  for (let i = 0; i < 200; i++) {
    const q = randomQuote(last);
    assert.notEqual(q, last);
    last = q;
  }
});

test('几天没学了; 发生的事说什么', () => {
  assert.equal(idleDays({}, now), null);
  assert.equal(idleDays({ [dayKey(now)]: 3 }, now), 0);
  assert.equal(idleDays({ [dayKey(now - 4 * DAY)]: 3, [dayKey(now - 9 * DAY)]: 1 }, now), 4);
  assert.ok(eventLine({ kind: 'milestone', days: 7 }).fireworks);
  assert.match(eventLine({ kind: 'stage', stage: 1 }).text, /我出来啦/);
  assert.match(eventLine({ kind: 'stage', stage: 3 }).text, /大乌龟/);
  assert.equal(eventLine({ kind: 'cleared', tomorrow: 0 }).text, '今天的都背完了, 吃得好饱!');
  assert.equal(eventLine({ kind: 'leech', n: 1 }).action.href, '#/stats');
});

test('温温说的话里不写别的网站、软件的名字', () => {
  for (const f of ['js/pet.js', 'js/views/pet.js']) {
    const text = readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
    assert.doesNotMatch(text, /Anki|Quizlet|Kahoot|Duolingo|多邻国|Tamagotchi/i, f);
  }
});

test('不重复: 100 句都念一遍才从头来, 从头来的第一句不跟最后一句一样; 一半的时候挑合适的话题', () => {
  let heard = [];
  const seen = new Set();
  for (let i = 0; i < QUOTES.length; i++) {
    const r = pickNext(QUOTES, heard);
    assert.ok(!seen.has(r.index));
    seen.add(r.index);
    heard = r.heard;
  }
  assert.equal(seen.size, 100);
  for (let i = 0; i < 20; i++) {
    const next = pickNext(QUOTES, heard);
    assert.notEqual(next.index, heard.at(-1));
    assert.equal(next.heard.length, 1);
  }
  const fit = pickNext(QUOTES, [], { tags: ['mistake'], rand: () => 0.1 });
  assert.ok(QUOTES[fit.index].tags.includes('mistake'));
  // 存着的乱七八糟的数不管
  assert.equal(pickNext(STUDY_TIPS, [-1, 999, 'x']).heard.length, 1);
  assert.ok(STUDY_TIPS.length >= 25);
  assert.deepEqual(quoteTags({ mistakes: 2, idleDays: 3, mood: 'sad', examDays: null, leeches: 0, today: 1, hour: 15 }), ['mistake', 'persist']);
});

test('细算的有用的话: 计划跟不上、考前只复习还有新词、考前一星期、记住率低、点名最难记的那张 (能直接改)、很久没碰的、大概几分钟、好几天没来', () => {
  const c = { sets: 2, hour: 15, today: 0, due: 20, reviews: 14, fresh: 6, held: 0, streak: 0, idleDays: 0, mistakes: 0, leeches: 3, examDays: 5, tomorrow: 10 };
  const list = tips({
    ...c,
    minutes: 7,
    pace: { href: '#/set/a', title: 'SAT 单词', learned7: 10, need7: 98, perDay: 16 },
    rest: { href: '#/set/b', title: '托福', left: 40 },
    retention: { n: 100, ok: 70, target: 0.9 },
    leech: { term: 'ubiquitous', lapses: 9, setId: 'a', cardId: 'x' },
    neglect: { href: '#/set/c', title: 'GRE', fresh: 300, days: 20 },
  });
  const by = Object.fromEntries(list.map((t) => [t.id, t]));
  assert.match(by.due.text, /大概 7 分钟/);
  assert.match(by.pace.text, /学了 10 个新词, 按计划该学 98 个左右.*每天要学 16 个/);
  assert.match(by.rest.text, /「托福」还有 40 个新词没学/);
  assert.match(by.exam.text, /离考试只有 5 天了/);
  assert.equal(by.exam.action.href, '#/mistakes/review/all');
  assert.match(by.retention.text, /记住了 70%, 比你定的 90% 低不少/);
  assert.match(by.leech.text, /「ubiquitous」已经忘了 9 次了 \(一共 3 张难记卡\)/);
  assert.deepEqual(by.leech.action, { label: '改这张', edit: { setId: 'a', cardId: 'x' } });
  assert.match(by.neglect.text, /「GRE」还有 300 个新词没学, 已经 20 天没碰了/);
  // 要紧的在前
  assert.deepEqual(list.map((t) => t.id).slice(0, 3), ['due', 'pace', 'rest']);
  // 记住率还行就不说
  assert.ok(!tips({ ...c, retention: { n: 100, ok: 88, target: 0.9 } }).some((t) => t.id === 'retention'));
  // 好几天没来: 先说想你了
  assert.match(tips({ ...c, idleDays: 4 })[0].text, /4 天没来了, 好想你/);
});

test('学得怎么样: 跟上一个 7 天比, 一条一条说', () => {
  const base = { days7: 5, answers7: 420, answersPrev: 300, fresh7: 64, retention: { n: 200, ok: 176, target: 0.9 }, mature: 320, studied: 900, streak: 9, mastered: 12, mistakesLeft: 30, examDays: 137 };
  const r = report(base);
  assert.match(r.text, /用功多了/);
  assert.deepEqual(r.list, [
    '学了 5 天, 答了 420 题 (上一个 7 天 300 题)',
    '学了 64 个新词',
    '复习时记住了 88% (你定的是 90%)',
    '记牢了 320 张 (隔 21 天以上才复习的), 一共背过 900 张',
    '错题集: 掌握了 12 道, 还在重做 30 道',
    '已经连续打卡 9 天',
    '离考试还有 137 天',
  ]);
  assert.match(report({ ...base, answers7: 100 }).text, /学得少了一点/);
  assert.match(report({ ...base, answers7: 310 }).text, /很稳/);
  assert.match(report({ ...base, answers7: 0 }).text, /还没学呢/);
  assert.match(report({ ...base, answersPrev: 0 }).text, /开了个好头/);
  assert.match(report({ ...base, retention: { n: 100, ok: 70, target: 0.9 } }).list[2], /有点低/);
});

test('细算 (insight): 从卡片和复习记录里看出计划跟不上了、很久没碰的卡片集、忘得最多的那张、记住了几成、答一题多久', () => {
  const a = makeSet({ title: 'SAT 单词', cards: Array.from({ length: 200 }, (_, i) => makeCard(`w${i}`, `意思${i}`)) });
  a.plan = { on: true, perDay: 5, exam: dayKey(now + 100 * DAY), rest: 10, order: 'set', seed: 'x', at: now - 30 * DAY };
  const log = {};
  a.cards.slice(0, 62).forEach((card, i) => {
    const recent = i >= 60; // 最近 7 天才学的两个
    a.stats[card.id] = { right: 1, wrong: 0, interval: 10, s: 10, d: 5, due: now + 5 * DAY, at: now - 2 * DAY + i * 20e3, first: recent ? now - 3 * DAY : now - 20 * DAY, n: 2, lapses: i === 0 ? 9 : 0 };
    if (!recent) addReviews(log, card.id, [{ at: now - 20 * DAY, rating: GOOD }, { at: now - 2 * DAY + i * 20e3, rating: i < 15 ? AGAIN : GOOD }]);
  });
  const b = makeSet({ title: '托福', cards: Array.from({ length: 30 }, (_, i) => makeCard(`t${i}`, '')) });
  b.createdAt = now - 30 * DAY;
  const store = new Store(memoryStorage());
  store.replaceData({ sets: [a, b], revlog: log, settings: { retention: 0.9 } });
  const x = insight(store, now);
  assert.equal(x.pace.title, 'SAT 单词');
  assert.equal(x.pace.learned7, 2);
  assert.equal(x.pace.need7, x.pace.perDay * 7);
  assert.deepEqual(x.neglect, { href: `#/set/${b.id}`, title: '托福', fresh: 30, days: 0 });
  assert.deepEqual(x.leech, { term: 'w0', lapses: 9, setId: a.id, cardId: a.cards[0].id });
  assert.deepEqual([x.retention.n, x.retention.ok], [60, 45]);
  assert.ok(x.perCard > 19000 && x.perCard < 21000, String(x.perCard));
  assert.equal(x.week.studied, 62);
  assert.equal(x.week.fresh7, 2);
  // 刚定的计划先不说跟不上
  a.plan.at = now - DAY;
  store.replaceData({ sets: [a, b], revlog: log });
  assert.equal(insight(store, now).pace, null);
});
