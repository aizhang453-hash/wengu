import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newMistake, cleanMistake, mistakeProblem, tidyMistake, parseNumber, answerChoices, checkInput, checkMistake, answerLabel, mineLabel, firstReview, reviewAfter, mistakeStatus, dueMistakes, matchesSearch, mergeMistake, attempted, scheduleNote, MASTER_STREAK } from '../js/mistakes.js';
import { Store, cleanData } from '../js/store.js';
import { mergeData } from '../js/merge.js';
import { DAY } from '../js/srs.js';
import { usedMediaIds } from '../js/media.js';

function memoryStorage() {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k) };
}

const sat = (extra = {}) => ({
  ...newMistake('m1', 1000),
  passage: 'The following text is adapted from a 1913 novel.',
  question: 'Which choice best states the main idea of the text?',
  options: ['It argues.', 'It describes.', 'It compares.', 'It warns.'],
  correct: 1,
  mine: 3,
  note: '没看清问的是 main idea',
  ...extra,
});

test('错题: 坏的、怪的补齐或者不要', () => {
  assert.equal(cleanMistake(null), null);
  assert.equal(cleanMistake({ question: '没有 id' }), null);
  const m = cleanMistake({ id: 'x', type: 'weird', options: ['a', 'b', 7], correct: 9, mine: '1', review: { due: 0 } });
  assert.equal(m.type, 'choice');
  assert.deepEqual(m.options, ['a', 'b', '7']);
  assert.equal(m.correct, -1);
  assert.equal(m.mine, 1);
  assert.equal(m.review, null);
  assert.equal(m.passage, '');
  assert.deepEqual(m.images, []);
  // 图片: 只要 media 的 id, 去重, 最多 6 张
  const withImages = cleanMistake({ id: 'y', images: ['m_a', 'm_a', 'http://evil', 5, 'm_b', 'm_c', 'm_d', 'm_e', 'm_f', 'm_g'] });
  assert.deepEqual(withImages.images, ['m_a', 'm_b', 'm_c', 'm_d', 'm_e', 'm_f']);
});

test('错题的图片也算「用到的」: 同步、备份会带上, 清理不会删', () => {
  const data = cleanData({ sets: [{ id: 's', cards: [{ id: 'c', term: 'a', def: 'b', image: 'm_card' }] }], mistakes: [{ ...sat(), images: ['m_graph', 'm_passage'] }] });
  assert.deepEqual(usedMediaIds(data).sort(), ['m_card', 'm_graph', 'm_passage']);
});

test('错题: 没写完的说差什么', () => {
  assert.equal(mistakeProblem(sat()), '');
  assert.match(mistakeProblem(sat({ question: '  ' })), /请填写题目/);
  assert.equal(mistakeProblem(sat({ question: '', images: ['m_shot'] })), ''); // 题目截图了就不用打字
  assert.match(mistakeProblem(sat({ options: ['only one', '', '', ''] })), /至少需要 2 个/);
  assert.match(mistakeProblem(sat({ options: ['a', '', 'c', ''] })), /选项 B 为空/);
  assert.match(mistakeProblem(sat({ correct: -1 })), /请标出正确答案/);
  assert.match(mistakeProblem(sat({ options: ['a', 'b', '', ''], correct: 3 })), /请标出正确答案/);
  assert.equal(mistakeProblem({ ...newMistake('i'), type: 'input', question: 'x = ?', answer: '' }), '请填写正确答案');
  assert.equal(mistakeProblem({ ...newMistake('i'), type: 'input', question: 'x = ?', answer: '3/4' }), '');
});

test('错题: 保存前最后面空着的选项去掉, 中间的字母不动; 填空题不留选项', () => {
  const t = tidyMistake(sat({ options: [' a ', 'b', '', ''], correct: 0, mine: 3, question: ' Q ' }));
  assert.deepEqual(t.options, ['a', 'b']);
  assert.equal(t.mine, -1); // 选的那个被去掉了
  assert.equal(t.question, 'Q');
  const i = tidyMistake({ ...sat(), type: 'input', answer: ' 12 ' });
  assert.deepEqual([i.options, i.correct, i.mine, i.answer], [[], -1, -1, '12']);
});

test('填空题: 分数、小数一样算对 (像 SAT 的填空), 文字照打字题判', () => {
  assert.equal(parseNumber('3/4'), 0.75);
  assert.equal(parseNumber('.75'), 0.75);
  assert.equal(parseNumber('-2'), -2);
  assert.equal(parseNumber('1/0'), null);
  assert.equal(parseNumber('abc'), null);
  assert.deepEqual(answerChoices('3/4, 0.75；.75 或 6/8'), ['3/4', '0.75', '.75', '6/8']);
  assert.equal(checkInput('0.75', '3/4'), true);
  assert.equal(checkInput('6/8', '3/4'), true);
  assert.equal(checkInput('.7500', '3/4'), true);
  assert.equal(checkInput('0.7', '3/4'), false);
  assert.equal(checkInput('.6667', '2/3'), true); // 四舍五入的也算
  assert.equal(checkInput('.6', '2/3'), false);
  assert.equal(checkInput('16', '15'), false); // 数字不算「打错一个字」
  assert.equal(checkInput('', '15'), false);
  assert.equal(checkInput('Photosynthesis', 'photosynthesis'), true);
  assert.equal(checkInput('5', '4, 5'), true);
});

test('判对错和显示: 选择题比序号; 对的、我选的写成「C. 文字」', () => {
  const m = sat();
  assert.equal(checkMistake(m, 1), true);
  assert.equal(checkMistake(m, 3), false);
  assert.equal(answerLabel(m), 'B. It describes.');
  assert.equal(mineLabel(m), 'D. It warns.');
  assert.equal(mineLabel(sat({ mine: -1 })), '');
  const input = { ...newMistake('i'), type: 'input', answer: '3/4', mineText: '4/3' };
  assert.equal(checkMistake(input, '0.75'), true);
  assert.equal(answerLabel(input), '3/4');
  assert.equal(mineLabel(input), '4/3');
});

test('复习: 新记的明天开始; 做对隔得越来越久, 连对 3 次掌握; 错了马上排回来', () => {
  const now = new Date(2026, 9, 17, 15).getTime();
  const first = firstReview(now);
  assert.equal(first.due, new Date(2026, 9, 18).getTime());
  assert.equal(mistakeStatus({ review: first }, now), 'later');
  assert.equal(mistakeStatus({ review: first }, first.due), 'due');
  let r = first;
  for (let k = 1; k <= MASTER_STREAK; k++) {
    r = reviewAfter(r, true, now + k * 30 * DAY);
    assert.equal(r.streak, k);
  }
  assert.equal(r.mastered, true);
  assert.equal(mistakeStatus({ review: r }, now + 999 * DAY), 'mastered');
  const again = reviewAfter(r, false, now + 100 * DAY);
  assert.deepEqual([again.mastered, again.streak, again.right, again.wrong], [false, 0, 3, 1]);
  assert.ok(again.due - (now + 100 * DAY) < DAY);
});

test('今天该重做的: 早该做的在前; 掌握了的不算', () => {
  const now = 10 * DAY;
  const m = (id, due, mastered = false) => ({ id, review: { due, mastered } });
  assert.deepEqual(dueMistakes([m('a', 9 * DAY), m('b', 2 * DAY), m('c', 11 * DAY), m('d', 1, true)], now).map((x) => x.id), ['b', 'a']);
});

test('搜索: 文章、题目、选项、笔记里都找, 几个词都要有', () => {
  const m = sat();
  assert.equal(matchesSearch(m, ''), true);
  assert.equal(matchesSearch(m, '1913'), true);
  assert.equal(matchesSearch(m, 'MAIN idea'), true);
  assert.equal(matchesSearch(m, 'warns 没看清'), true);
  assert.equal(matchesSearch(m, 'geometry'), false);
});

test('存: 记一道明天开始排, 改题目不动重做记录; 删了记下来 (同步用)', () => {
  const store = new Store(memoryStorage());
  const now = new Date(2026, 9, 17, 9).getTime();
  const saved = store.putMistake(sat(), now);
  assert.equal(saved.review.due, new Date(2026, 9, 18).getTime());
  store.recordMistake('m1', true, now + 2 * DAY);
  const edited = store.putMistake({ ...sat(), note: '新笔记' }, now + 3 * DAY);
  assert.equal(edited.note, '新笔记');
  assert.equal(edited.review.right, 1);
  assert.equal(edited.createdAt, now);
  assert.equal(store.allMistakes().length, 1);
  store.deleteMistake('m1');
  assert.equal(store.allMistakes().length, 0);
  assert.ok(store.data.deleted['mistake:m1'] > 0);
});

test('还没做过的练习题 (没记我的答案): 今天就排上; 做错的明天开始', () => {
  const store = new Store(memoryStorage());
  const now = new Date(2026, 9, 17, 9).getTime();
  const practice = store.putMistake(sat({ id: 'p1', mine: -1 }), now);
  assert.equal(practice.review.due, now);
  assert.equal(mistakeStatus(practice, now), 'due');
  const blank = store.putMistake({ ...newMistake('p2'), type: 'input', question: '2+2=?', answer: '4' }, now);
  assert.equal(blank.review.due, now);
  const wrong = store.putMistake(sat({ id: 'w1' }), now);
  assert.equal(wrong.review.due, new Date(2026, 9, 18).getTime());
  assert.deepEqual(
    dueMistakes(store.allMistakes(), now).map((m) => m.id),
    ['p1', 'p2'],
  );
  assert.equal(attempted(sat()), true);
  assert.equal(attempted({ ...blank, mineText: ' 5 ' }), true);
  assert.equal(scheduleNote([wrong]), '明日开始安排重做');
  assert.equal(scheduleNote([practice, blank]), '今日即可练习');
  assert.equal(scheduleNote([practice, wrong]), '其中 1 道未作答，今日即可练习');
});

test('一下删好几道: 存一次, 都记下删除时间; 同步回来不会再出现', () => {
  const store = new Store(memoryStorage());
  for (const id of ['a', 'b', 'c', 'd']) store.putMistake({ ...sat(), id });
  let saves = 0;
  store.onChange = () => saves++;
  assert.equal(store.deleteMistakes(['a', 'c', 'nope']), 2);
  assert.equal(saves, 1);
  assert.deepEqual(
    store.allMistakes().map((m) => m.id).sort(),
    ['b', 'd'],
  );
  assert.ok(store.data.deleted['mistake:a'] > 0 && store.data.deleted['mistake:c'] > 0);
  // 别的设备还有这几道: 合起来以后还是删掉的
  const other = cleanData({ mistakes: ['a', 'b', 'c', 'd'].map((id) => ({ ...sat(), id })) });
  assert.deepEqual(
    mergeData(store.data, other).mistakes.map((m) => m.id).sort(),
    ['b', 'd'],
  );
});

test('同步: 两台设备各记的都留; 同一道内容听最后改的, 重做记录听最后做的; 删了的不回来', () => {
  const a = cleanData({ mistakes: [{ ...sat(), id: 'shared', updatedAt: 100, review: { due: 5, at: 900, right: 2, wrong: 0, streak: 2 } }, { ...sat(), id: 'onlyA' }] });
  const b = cleanData({ mistakes: [{ ...sat(), id: 'shared', note: 'B 改过', updatedAt: 200, review: { due: 5, at: 500, right: 1, wrong: 0, streak: 1 } }, { ...sat(), id: 'onlyB', updatedAt: 50 }], deleted: { 'mistake:onlyB': Date.now() } });
  const merged = mergeData(a, b).mistakes;
  assert.deepEqual(merged.map((m) => m.id).sort(), ['onlyA', 'shared']);
  const shared = merged.find((m) => m.id === 'shared');
  assert.equal(shared.note, 'B 改过');
  assert.equal(shared.review.right, 2);
  assert.equal(mergeMistake(cleanMistake({ ...sat(), id: 'x' }), cleanMistake({ ...sat(), id: 'x', review: { due: 1, at: 5 } })).review.at, 5);
});

test('老数据没有错题集: 照常', () => {
  assert.deepEqual(cleanData({ sets: [] }).mistakes, []);
  assert.deepEqual(mergeData(cleanData({}), { sets: [], folders: [] }).mistakes, []);
});
