// 一天里什么时候记得最牢、错题题型、考前清单
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeSet, makeCard } from '../js/store.js';
import { addReviews, AGAIN, GOOD } from '../js/revlog.js';
import { timeOfDay, bestTime, TIME_BLOCKS } from '../js/stats.js';
import { cleanMistake, guessKind, kindOf, kindStats, mergeMistake, tidyMistake, newMistake, MAX_KIND } from '../js/mistakes.js';
import { nearestExam } from '../js/plan.js';
import { examChecklist } from '../js/examlist.js';
import { tips, report } from '../js/pet.js';
import { DAY } from '../js/srs.js';

const now = new Date(2026, 9, 20, 22, 0).getTime();
const at = (daysAgo, hour, min = 0) => {
  const d = new Date(now - daysAgo * DAY);
  d.setHours(hour, min, 0, 0);
  return d.getTime();
};

test('什么时候记得最牢: 按复习的钟点分开数; 第一次学的、同一天又看的、半年以前的不算', () => {
  const set = makeSet({ cards: [makeCard('a', ''), makeCard('b', '')] });
  const [a, b] = set.cards.map((c) => c.id);
  const log = {};
  addReviews(log, a, [
    { at: at(30, 9), rating: GOOD }, // 第一次学: 不算
    { at: at(20, 9), rating: GOOD }, // 上午 记得
    { at: at(20, 9, 10), rating: AGAIN }, // 同一天又看: 不算
    { at: at(10, 22), rating: AGAIN }, // 晚上 忘了
    { at: at(3, 2), rating: GOOD }, // 深夜 记得
  ]);
  addReviews(log, b, [
    { at: at(300, 15), rating: GOOD },
    { at: at(200, 15), rating: GOOD }, // 半年以前: 不算
    { at: at(5, 15), rating: AGAIN }, // 下午 忘了
  ]);
  set.stats[a] = { at: at(3, 2), due: now + DAY, interval: 5 };
  set.stats[b] = { at: at(5, 15), due: now + DAY, interval: 5 };
  const blocks = Object.fromEntries(timeOfDay([set], log, now).map((x) => [x.key, [x.n, x.ok]]));
  assert.deepEqual(blocks, { dawn: [0, 0], morning: [1, 1], noon: [0, 0], afternoon: [1, 0], evening: [0, 0], night: [1, 0], late: [1, 1] });
  // 每个钟点都有一个时间段
  for (let hour = 0; hour < 24; hour++) assert.equal(TIME_BLOCKS.filter((x) => hour >= x.from && hour < x.to).length, 1, String(hour));
});

test('最好的时间: 记录不够不说; 最常学的就是最好的; 差得够多才建议换, 差一点说是碰巧', () => {
  const block = (key, n, ok) => ({ ...TIME_BLOCKS.find((x) => x.key === key), n, ok });
  assert.deepEqual(bestTime([block('morning', 60, 50), block('night', 50, 40)]), { enough: false, total: 110 });
  assert.equal(bestTime([block('morning', 300, 270), block('night', 30, 29)]).enough, false); // 晚上太少, 只剩一个时间段
  const same = bestTime([block('morning', 300, 280), block('night', 100, 80)]);
  assert.ok(same.same && same.best.key === 'morning');
  const sure = bestTime([block('morning', 200, 186), block('night', 600, 504)]); // 93% 对 84%
  assert.ok(sure.sure && sure.best.key === 'morning' && sure.usual.key === 'night');
  const close = bestTime([block('morning', 60, 53), block('night', 600, 510)]); // 88% 对 85%, 上午才 60 次
  assert.ok(close.enough && !close.sure && !close.same);
});

test('题型: SAT 阅读写作按问法猜, 语法题看选项只差标点没有; 数学看关键词; 猜不出来是「其他」; 自己写的为准', () => {
  const m = (question, options = [], passage = '') => cleanMistake({ id: 'x', question, options, passage });
  const cases = [
    ['Which choice completes the text with the most logical and precise word or phrase?', '词汇题'],
    ['As used in the text, what does the word "check" most nearly mean?', '词汇题'],
    ['Which choice completes the text with the most logical transition?', '过渡词'],
    ['The student wants to emphasize a similarity. Which choice most effectively uses relevant information from the notes to accomplish this goal?', '笔记整合'],
    ['Based on the texts, how would the author of Text 2 most likely respond?', '双篇对比'],
    ['Which choice best describes the function of the underlined sentence in the text as a whole?', '目的和结构'],
    ['Which choice best describes data from the graph that support the hypothesis?', '图表证据'],
    ['Which quotation from the poem most effectively illustrates the claim?', '文本证据'],
    ['Which finding, if true, would most directly support the researchers\' claim?', '文本证据'],
    ['Which choice most logically completes the text?', '推理题'],
    ['According to the text, why did the team move?', '主旨细节'],
    ['A circle has a radius of 4. What is its area?', '几何三角'],
    ['What is the median of the data set?', '数据分析'],
    ['The function f is defined by f(x) = 3x^2 + 1.', '高级数学'],
    ['If 2x + 7 = 15, what is the value of x?', '代数'],
    ['什么是光合作用?', ''],
  ];
  for (const [q, kind] of cases) assert.equal(guessKind(m(q)), kind, q);
  const grammar = 'Which choice completes the text so that it conforms to the conventions of Standard English?';
  assert.equal(guessKind(m(grammar, ['species, which', 'species; which', 'species which', 'species. Which'])), '语法·标点');
  assert.equal(guessKind(m(grammar, ['was', 'were', 'is being', 'have been'])), '语法·词形');
  assert.equal(kindOf(m('什么是光合作用?')), '其他');
  assert.equal(kindOf(cleanMistake({ id: 'y', question: 'Which choice most logically completes the text?', kind: ' 我的分类 ' })), '我的分类');
});

test('题型跟着错题存、同步; 老错题没有题型是空的; 太长的截掉', () => {
  assert.equal(cleanMistake({ id: 'a' }).kind, '');
  assert.equal(newMistake('n').kind, '');
  assert.equal(cleanMistake({ id: 'a', kind: 'x'.repeat(50) }).kind.length, MAX_KIND);
  assert.equal(tidyMistake({ ...newMistake('n'), kind: '  语法  ' }).kind, '语法');
  const old = cleanMistake({ id: 'a', question: 'q', kind: '', updatedAt: 1 });
  const edited = cleanMistake({ id: 'a', question: 'q', kind: '代数', updatedAt: 2 });
  assert.equal(mergeMistake(old, edited).kind, '代数');
  assert.equal(mergeMistake(edited, old).kind, '代数');
});

test('按题型数: 多的在前, 还有几道没掌握, 重做对了几次', () => {
  const m = (kind, mastered, right = 0, wrong = 0) => cleanMistake({ id: Math.random().toString(36), question: 'q', kind, review: { due: now, right, wrong, mastered } });
  const list = [m('语法', false, 1, 2), m('语法', true, 3, 0), m('语法', false), m('代数', false, 0, 1), m('几何', true)];
  const stats = kindStats(list);
  assert.deepEqual(stats.map((k) => [k.kind, k.total, k.left]), [['语法', 3, 2], ['代数', 1, 1], ['几何', 1, 0]]);
  assert.deepEqual([stats[0].right, stats[0].wrong], [4, 2]);
});

test('最近的考试: 定了计划、写了日期的; 考过了的不算; 文件夹的也算', () => {
  const plan = (exam, on = true) => ({ on, exam });
  const list = [
    { title: 'SAT', plan: plan('2027-03-06') },
    { title: '考过了', plan: plan('2026-10-01') },
    { title: '关着的', plan: plan('2026-10-21', false) },
    { name: '期中', plan: plan('2026-10-21') },
  ];
  assert.deepEqual(nearestExam(list, now), { days: 1, exam: '2026-10-21', title: '期中' });
  assert.deepEqual(nearestExam([{ title: 'a', plan: plan('2026-10-20') }], now), { days: 0, exam: '2026-10-20', title: 'a' });
  assert.equal(nearestExam([{ plan: null }], now), null);
});

test('考前清单: 前一天按自己的数据列要过的 (背完了的打上勾, 没有的不列), 加上要带的、今晚早点睡; 考试那天是出门前、考的时候', () => {
  const base = { days: 1, exam: '2027-03-06', title: 'SAT 单词', due: 12, mistakes: 20, mistakesLeft: 8, topKind: { kind: '语法·标点', left: 5 }, leeches: 3, starred: 0 };
  const eve = examChecklist(base);
  assert.match(eve.intro, /明天 \(3月6日\) 就考试了 \(SAT 单词\)/);
  assert.deepEqual(eve.groups.map((g) => g.name), ['今天过一遍', '准备好东西', '今晚']);
  const study = eve.groups[0].items;
  assert.deepEqual(study.map((i) => i.id), ['due', 'mistakes', 'notes', 'leech']);
  assert.equal(study[0].href, '#/review');
  assert.match(study[1].text, /8 道\); 「语法·标点」最多, 先做这类/);
  assert.equal(study[1].href, `#/mistakes/review/kind:${encodeURIComponent('语法·标点')}`);
  assert.equal(study[3].href, '#/review/practice:leech');
  assert.ok(eve.groups[1].items.some((i) => /准考证/.test(i.text)));
  assert.ok(eve.groups[2].items.some((i) => /11 点前睡觉/.test(i.text)));
  // 都背完了、没有错题、没有难记卡
  const done = examChecklist({ ...base, due: 0, mistakes: 0, mistakesLeft: 0, topKind: null, leeches: 0, starred: 4 });
  assert.deepEqual(done.groups[0].items.map((i) => [i.id, Boolean(i.done)]), [['due', true], ['starred', false]]);
  const day = examChecklist({ ...base, days: 0 });
  assert.deepEqual(day.groups.map((g) => g.name), ['出门前', '考的时候']);
  assert.match(day.intro, /今天考试 \(SAT 单词\)!/);
  const ids = [...eve.groups, ...day.groups].flatMap((g) => g.items.map((i) => i.id));
  assert.equal(new Set(eve.groups.flatMap((g) => g.items.map((i) => i.id))).size, eve.groups.flatMap((g) => g.items).length);
  assert.ok(ids.length > 10);
});

test('温温: 考试前一天先说考前清单; 错得最多的题型 (能单练这类); 记得最牢的时间; 学得怎么样里也写上', () => {
  const c = { sets: 1, hour: 15, today: 5, due: 10, reviews: 10, fresh: 0, held: 0, streak: 3, idleDays: 0, mistakes: 2, leeches: 0, examDays: 1, tomorrow: 0 };
  const block = (key, n, ok) => ({ ...TIME_BLOCKS.find((x) => x.key === key), n, ok });
  const bt = bestTime([block('morning', 200, 186), block('night', 600, 504)]);
  const list = tips({ ...c, topKind: { kind: '语法·标点', total: 8, left: 6, share: 0.4 }, bestTime: bt });
  assert.equal(list[0].id, 'exam');
  assert.deepEqual(list[0].action, { label: '看考前清单', list: true });
  const kind = list.find((t) => t.id === 'kind');
  assert.match(kind.text, /错题里「语法·标点」最多: 8 道 \(占 40%\), 还有 6 道没掌握/);
  assert.equal(kind.action.href, `#/mistakes/review/kind:${encodeURIComponent('语法·标点')}`);
  const time = list.find((t) => t.id === 'time');
  assert.match(time.text, /上午 \(8–12 点\) 复习时记住了 93%, 你最常学的晚上是 84%/);
  // 差得不多: 不说
  assert.ok(!tips({ ...c, bestTime: { ...bt, sure: false } }).some((t) => t.id === 'time'));
  assert.equal(tips({ ...c, examDays: 0 })[0].action.label, '看清单');
  const r = report({ days7: 5, answers7: 100, answersPrev: 90, fresh7: 0, mature: 0, studied: 10, streak: 3, mastered: 1, mistakesLeft: 6, examDays: 1, topKind: { kind: '语法·标点', total: 8 }, bestTime: bt });
  assert.ok(r.list.includes('错题集: 掌握了 1 道, 还在重做 6 道, 「语法·标点」错得最多 (8 道)'));
  assert.ok(r.list.includes('上午 (8–12 点) 记得最牢: 复习时记住了 93%'));
});
