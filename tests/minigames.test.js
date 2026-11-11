import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as B from '../js/blocks.js';
import * as G from '../js/gems.js';
import { evaluate, mergeKeys, dayIndex, dailyWord, canGuess, addResult, emptyStats, TRIES, LEN } from '../js/wordle.js';
import { ANSWERS, ALLOWED } from '../js/words.js';
import { inflected, seededShuffle } from '../tools/words.mjs';

function seeded(seed = 1) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

// ---- 方块 ----
const shape = (cells) => B.SHAPES.find((s) => JSON.stringify(s.cells) === JSON.stringify(cells));

test('方块: 能不能放', () => {
  const board = B.emptyBoard();
  const square = shape([[0, 0], [0, 1], [1, 0], [1, 1]]);
  assert.ok(B.canPlace(board, square, 0, 0));
  assert.ok(B.canPlace(board, square, 6, 6));
  assert.ok(!B.canPlace(board, square, 7, 7)); // 出界
  board[1][1] = 1;
  assert.ok(!B.canPlace(board, square, 0, 0)); // 压到了
});

test('方块: 填满一行消掉, 行列一起满了一起消, 一次消得多分多', () => {
  let board = B.emptyBoard();
  const bar5 = shape([[0, 0], [0, 1], [0, 2], [0, 3], [0, 4]]);
  const bar3 = shape([[0, 0], [0, 1], [0, 2]]);
  let r = B.place(board, bar5, 0, 0);
  assert.equal(r.lines, 0);
  assert.equal(r.points, 5);
  r = B.place(r.board, bar3, 0, 5);
  assert.equal(r.lines, 1);
  assert.equal(r.points, 3 + 10);
  assert.ok(r.board[0].every((x) => x === 0));

  // 第 0 行和第 0 列差一格, 放一格两条一起消
  board = B.emptyBoard();
  for (let i = 1; i < B.SIZE; i++) board[0][i] = board[i][0] = 1;
  r = B.place(board, shape([[0, 0]]), 0, 0);
  assert.equal(r.lines, 2);
  assert.equal(r.points, 1 + 40);
  assert.equal(r.cleared.length, 15);
});

test('方块: 放不下了就结束', () => {
  const full = B.emptyBoard().map((row) => row.map(() => 1));
  full[3][3] = 0;
  assert.ok(B.fitsAnywhere(full, shape([[0, 0]])));
  assert.ok(!B.fitsAnywhere(full, shape([[0, 0], [0, 1]])));
  assert.equal(B.randomTray(seeded(2)).length, 3);
});

// ---- 宝石 ----
const gem = (color, extra = {}) => ({ color, ...extra });
// 用字符串画棋盘: 数字是颜色, B 是炸弹 (颜色 0), Q 是问题宝石 (颜色 1, 加 2 步)
function board(lines) {
  return lines.map((line) => Array.from(line).map((ch) => (ch === 'B' ? gem(0, { bomb: true }) : ch === 'Q' ? gem(1, { question: 2 }) : gem(Number(ch)))));
}
const fill = ['01230123', '12301230', '23012301', '30123012', '01230123', '12301230', '23012301', '30123012'];

test('宝石: 新棋盘没有现成的三连, 而且有路可走', () => {
  for (let seed = 1; seed < 20; seed++) {
    const b = G.makeBoard(seeded(seed));
    assert.equal(G.findMatches(b).length, 0);
    assert.ok(G.hasMove(b));
  }
});

test('宝石: 找横的竖的三连', () => {
  const b = board(fill);
  b[0][0] = b[0][1] = b[0][2] = gem(5); // 横着三颗
  b[5][7] = b[6][7] = b[7][7] = gem(4); // 竖着三颗
  const groups = G.findMatches(b);
  assert.ok(groups.some((g) => g.length === 3 && g.every(([r]) => r === 0)));
  assert.ok(groups.some((g) => g.length === 3 && g.every(([, c]) => c === 7)));
  assert.equal(groups.length, 2);
});

test('宝石: 不能消的不让换; 能消的消掉、掉下来、加分', () => {
  const b = board(fill);
  b[0][0] = gem(5);
  b[0][1] = gem(5);
  b[1][2] = gem(5); // 把 (1,2) 换到 (0,2) 就是三连
  assert.ok(G.swapMakesMatch(b, [1, 2], [0, 2]));
  assert.ok(!G.swapMakesMatch(b, [3, 3], [3, 4]));
  assert.ok(!G.swapMakesMatch(b, [0, 0], [2, 2])); // 不挨着
  const r = G.resolve(G.swap(b, [1, 2], [0, 2]), { rng: seeded(3), questionChance: 0 });
  assert.ok(r.points >= 30);
  assert.ok(r.board.flat().every(Boolean)); // 都补满了
  assert.equal(G.findMatches(r.board).length, 0); // 消到没得消
});

test('宝石: 连四颗出炸弹, 炸弹被消时炸周围一圈; 问题宝石给步数', () => {
  const b = board(fill);
  for (let c = 0; c < 4; c++) b[4][c] = gem(5);
  const r = G.resolve(b, { focus: [4, 1], rng: seeded(1), questionChance: 0 });
  assert.deepEqual(r.steps[0].bombs, [[4, 1]]);
  assert.ok(r.steps[0].board[4][1].bomb);

  const b2 = board(fill);
  b2[2][2] = gem(0, { bomb: true });
  b2[2][3] = gem(0);
  b2[2][4] = gem(0);
  b2[1][1] = gem(1, { question: 3 }); // 在炸弹旁边
  const r2 = G.resolve(b2, { rng: seeded(1), questionChance: 0 });
  assert.ok(r2.steps[0].cleared.length >= 9);
  assert.ok(r2.steps[0].exploded.length >= 1);
  assert.ok(r2.questions.includes(3));
});

// ---- 每日猜词 (v1.75 以前是学习游戏里的 Wordle) ----
test('每日猜词: 2026-11-10 是第一天, 按这台设备的日子换词; 词表轮完从头再来', () => {
  assert.equal(dayIndex(new Date(2026, 10, 10, 0, 1)), 0);
  assert.equal(dayIndex(new Date(2026, 10, 10, 23, 59)), 0);
  assert.equal(dayIndex(new Date(2026, 10, 11, 0, 0)), 1);
  assert.equal(dayIndex(new Date(2027, 2, 15, 12)), 125); // 跨过夏令时也是整天
  assert.equal(dayIndex(new Date(2026, 10, 9)), -1);
  const list = ['aaaaa', 'bbbbb', 'ccccc'];
  assert.equal(dailyWord(0, list), 'aaaaa');
  assert.equal(dailyWord(4, list), 'bbbbb');
  assert.equal(dailyWord(-1, list), 'ccccc');
  assert.equal(TRIES, 6);
  assert.equal(LEN, 5);
});

test('每日猜词的词表: 答案都是五个字母、不重复、都能猜; 复数过去式这种去掉; 次序是固定打乱过的', () => {
  const allowed = new Set(ALLOWED.split(' '));
  assert.ok(ANSWERS.length > 1500, `答案 ${ANSWERS.length} 个`);
  assert.equal(new Set(ANSWERS).size, ANSWERS.length);
  for (const w of ANSWERS) {
    assert.match(w, /^[a-z]{5}$/);
    assert.ok(allowed.has(w), w);
  }
  assert.ok(allowed.size > 8000);
  for (const w of ['apple', 'crane', 'about']) assert.ok(canGuess(w, allowed), w);
  assert.equal(canGuess('abcde', allowed), false);
  assert.equal(canGuess('apples', allowed), false);
  // 头几天的词定死了 (以后重新生成词表也不能变)
  assert.deepEqual(ANSWERS.slice(0, 3), ['flute', 'arose', 'knock']);
  const known = new Set(['book', 'bake', 'go', 'box', 'aim', 'class']);
  assert.equal(inflected('books', known), true);
  assert.equal(inflected('boxes', known), true);
  assert.equal(inflected('baked', known), true);
  assert.equal(inflected('aimed', known), true);
  assert.equal(inflected('going', known), true);
  assert.equal(inflected('class', known), false);
  assert.equal(inflected('naked', known), false);
  assert.deepEqual(seededShuffle([1, 2, 3, 4, 5], 7), seededShuffle([1, 2, 3, 4, 5], 7));
  assert.deepEqual([...seededShuffle([1, 2, 3, 4, 5], 7)].sort(), [1, 2, 3, 4, 5]);
});

test('每日猜词的成绩: 一天只记一次; 连胜要天天猜中', () => {
  let s = addResult(emptyStats(), 0, true, 3);
  assert.deepEqual([s.played, s.won, s.streak, s.maxStreak, s.dist[2]], [1, 1, 1, 1, 1]);
  assert.equal(addResult(s, 0, true, 2).played, 1); // 同一天不再记
  s = addResult(s, 1, true, 4);
  assert.deepEqual([s.streak, s.maxStreak], [2, 2]);
  s = addResult(s, 3, true, 5); // 第 2 天没玩: 连胜从 1 算起
  assert.deepEqual([s.streak, s.maxStreak, s.played], [1, 2, 3]);
  s = addResult(s, 4, false, 6);
  assert.deepEqual([s.streak, s.won, s.played], [0, 3, 4]);
});

test('每日猜词: 判色, 重复字母照规矩算', () => {
  assert.deepEqual(evaluate('apple', 'apple'), ['correct', 'correct', 'correct', 'correct', 'correct']);
  assert.deepEqual(evaluate('crane', 'apple'), ['absent', 'absent', 'present', 'absent', 'correct']);
  // 猜了两个 l, 答案只有一个: 第一个黄, 第二个灰; 两个 a 也一样
  assert.deepEqual(evaluate('llama', 'apple'), ['present', 'absent', 'present', 'absent', 'absent']);
  // 位置对的那个 l 先算绿, 另一个 l 就没得配了, 是灰
  assert.deepEqual(evaluate('hello', 'world'), ['absent', 'absent', 'absent', 'correct', 'present']);
  const keys = mergeKeys(mergeKeys({}, 'crane', evaluate('crane', 'apple')), 'apply', evaluate('apply', 'apple'));
  assert.equal(keys.a, 'correct');
  assert.equal(keys.c, 'absent');
  assert.equal(keys.e, 'correct');
});
