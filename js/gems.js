// 宝石 (照 Quizlet 的 Charms): 交换相邻的两颗, 三颗以上同色连成一线就消掉, 上面的掉下来补上。
// 一次连成四颗以上, 留下一颗同色的炸弹, 炸弹再被消掉时连周围一圈一起炸掉。
// 问题宝石: 被消掉时出一道题, 答对加上面写的步数。步数用完游戏结束。
// 一颗宝石: { color: 0..COLORS-1, bomb?: true, question?: 加几步 }

export const ROWS = 8;
export const COLS = 8;
export const COLORS = 6;
export const QUESTION_CHANCE = 0.06;

const key = (r, c) => `${r},${c}`;
const unkey = (k) => k.split(',').map(Number);
const clone = (board) => board.map((row) => row.map((g) => (g ? { ...g } : null)));

function randomGem(rng, questionChance) {
  const gem = { color: Math.floor(rng() * COLORS) };
  if (rng() < questionChance) gem.question = 1 + Math.floor(rng() * 3);
  return gem;
}

// 新棋盘: 一开始没有现成的三连, 而且至少有一步能走
export function makeBoard(rng = Math.random, questionChance = QUESTION_CHANCE) {
  for (;;) {
    const board = [];
    for (let r = 0; r < ROWS; r++) {
      const row = [];
      for (let c = 0; c < COLS; c++) {
        let gem;
        do {
          gem = randomGem(rng, questionChance);
        } while (
          (c >= 2 && row[c - 1].color === gem.color && row[c - 2].color === gem.color) ||
          (r >= 2 && board[r - 1][c].color === gem.color && board[r - 2][c].color === gem.color)
        );
        row.push(gem);
      }
      board.push(row);
    }
    if (hasMove(board)) return board;
  }
}

// 所有连成三颗以上的, 每条一组: [[[r, c]...]...]
export function findMatches(board) {
  const groups = [];
  const same = (a, b) => a && b && a.color === b.color;
  for (let r = 0; r < ROWS; r++) {
    let start = 0;
    for (let c = 1; c <= COLS; c++) {
      if (c < COLS && same(board[r][c], board[r][start])) continue;
      if (c - start >= 3 && board[r][start]) groups.push(Array.from({ length: c - start }, (_, k) => [r, start + k]));
      start = c;
    }
  }
  for (let c = 0; c < COLS; c++) {
    let start = 0;
    for (let r = 1; r <= ROWS; r++) {
      if (r < ROWS && same(board[r][c], board[start][c])) continue;
      if (r - start >= 3 && board[start][c]) groups.push(Array.from({ length: r - start }, (_, k) => [start + k, c]));
      start = r;
    }
  }
  return groups;
}

export function adjacent([r1, c1], [r2, c2]) {
  return Math.abs(r1 - r2) + Math.abs(c1 - c2) === 1;
}

export function swap(board, [r1, c1], [r2, c2]) {
  const next = clone(board);
  [next[r1][c1], next[r2][c2]] = [next[r2][c2], next[r1][c1]];
  return next;
}

// 换了以后能不能消 (不能消的不让换)
export function swapMakesMatch(board, a, b) {
  return adjacent(a, b) && findMatches(swap(board, a, b)).length > 0;
}

export function hasMove(board) {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (c + 1 < COLS && swapMakesMatch(board, [r, c], [r, c + 1])) return true;
      if (r + 1 < ROWS && swapMakesMatch(board, [r, c], [r + 1, c])) return true;
    }
  }
  return false;
}

// 掉下来补上: 每列有空的, 上面的往下掉, 最上面补新的
export function collapse(board, rng = Math.random, questionChance = QUESTION_CHANCE) {
  const next = clone(board);
  for (let c = 0; c < COLS; c++) {
    const stack = [];
    for (let r = ROWS - 1; r >= 0; r--) if (next[r][c]) stack.push(next[r][c]);
    for (let r = ROWS - 1; r >= 0; r--) next[r][c] = stack[ROWS - 1 - r] ?? randomGem(rng, questionChance);
  }
  return next;
}

// 换完以后一直消到没得消。focus 是刚换过去的那格 (连四颗时炸弹放这儿)。
// 返回 { board, steps: [{ cleared, bombs, board: 消完还没掉下来的样子, after: 掉下来以后 }], points, questions: [加几步...] }
// 得分: 每颗 10 分 × 第几连 (一步连着消好几次, 后面的分更多)
export function resolve(board, { focus = null, rng = Math.random, questionChance = QUESTION_CHANCE } = {}) {
  let b = clone(board);
  const steps = [];
  const questions = [];
  let points = 0;
  let chain = 0;
  for (;;) {
    const groups = findMatches(b);
    if (!groups.length) break;
    chain++;
    const clear = new Set();
    const newBombs = [];
    for (const g of groups) {
      for (const [r, c] of g) clear.add(key(r, c));
      if (g.length >= 4) {
        const at = (focus && g.find(([r, c]) => r === focus[0] && c === focus[1])) || g[Math.floor(g.length / 2)];
        newBombs.push({ r: at[0], c: at[1], color: b[at[0]][at[1]].color });
      }
    }
    // 炸弹: 连周围一圈一起消 (炸到别的炸弹也接着炸)
    const exploded = new Set();
    let grew = true;
    while (grew) {
      grew = false;
      for (const k of [...clear]) {
        const [r, c] = unkey(k);
        if (!b[r][c]?.bomb || exploded.has(k)) continue;
        exploded.add(k);
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            const rr = r + dr;
            const cc = c + dc;
            if (rr < 0 || cc < 0 || rr >= ROWS || cc >= COLS || clear.has(key(rr, cc))) continue;
            clear.add(key(rr, cc));
            grew = true;
          }
        }
      }
    }
    for (const k of clear) {
      const [r, c] = unkey(k);
      if (b[r][c]?.question) questions.push(b[r][c].question);
      b[r][c] = null;
    }
    const bombs = [];
    for (const nb of newBombs) {
      if (b[nb.r][nb.c]) continue;
      b[nb.r][nb.c] = { color: nb.color, bomb: true };
      bombs.push([nb.r, nb.c]);
    }
    points += clear.size * 10 * chain;
    const cleared = [...clear].map(unkey);
    const before = clone(b);
    b = collapse(b, rng, questionChance);
    steps.push({ cleared, bombs, exploded: [...exploded].map(unkey), board: before, after: clone(b) });
    focus = null;
  }
  return { board: b, steps, points, questions };
}
