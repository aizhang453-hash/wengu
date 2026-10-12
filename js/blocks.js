// 方块 (照 Quizlet 的 Blocks): 8×8 棋盘, 一次给三块积木, 放上去填满一整行或一整列就消掉。
// 三块都放完答对一道题再给三块; 剩下的积木哪儿都放不下了, 游戏结束。

export const SIZE = 8;

// 积木的形状: 格子的 [行, 列]
const RAW = [
  [[0, 0]],
  [[0, 0], [0, 1]],
  [[0, 0], [1, 0]],
  [[0, 0], [0, 1], [0, 2]],
  [[0, 0], [1, 0], [2, 0]],
  [[0, 0], [0, 1], [0, 2], [0, 3]],
  [[0, 0], [1, 0], [2, 0], [3, 0]],
  [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4]],
  [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]],
  [[0, 0], [0, 1], [1, 0], [1, 1]],
  [[0, 0], [0, 1], [0, 2], [1, 0], [1, 1], [1, 2], [2, 0], [2, 1], [2, 2]],
  [[0, 0], [1, 0], [1, 1]],
  [[0, 1], [1, 0], [1, 1]],
  [[0, 0], [0, 1], [1, 0]],
  [[0, 0], [0, 1], [1, 1]],
  [[0, 0], [1, 0], [2, 0], [2, 1]],
  [[0, 0], [0, 1], [0, 2], [1, 0]],
  [[0, 0], [0, 1], [1, 1], [2, 1]],
  [[0, 2], [1, 0], [1, 1], [1, 2]],
  [[0, 0], [0, 1], [0, 2], [1, 1]],
  [[0, 1], [1, 0], [1, 1], [2, 1]],
  [[0, 1], [1, 0], [1, 1], [1, 2]],
  [[0, 0], [1, 0], [1, 1], [2, 0]],
  [[0, 1], [0, 2], [1, 0], [1, 1]],
  [[0, 0], [1, 0], [1, 1], [2, 1]],
];

export const COLORS = 6; // 积木有几种颜色 (只是好看)

export const SHAPES = RAW.map((cells, id) => {
  const rows = Math.max(...cells.map(([r]) => r)) + 1;
  const cols = Math.max(...cells.map(([, c]) => c)) + 1;
  return { id, cells, rows, cols };
});

export function emptyBoard() {
  return Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
}

// 积木左上角放在 (r, c) 能不能放
export function canPlace(board, shape, r, c) {
  return shape.cells.every(([dr, dc]) => {
    const rr = r + dr;
    const cc = c + dc;
    return rr >= 0 && cc >= 0 && rr < SIZE && cc < SIZE && !board[rr][cc];
  });
}

// 放上去, 消掉满了的行和列。返回 { board, lines: 消了几条, cleared: [[r, c]...], points }
// 得分: 每格 1 分; 一次消 n 条 = 10 × n × n (一次消得多, 分加得多)
export function place(board, shape, r, c, color = 1) {
  const next = board.map((row) => [...row]);
  for (const [dr, dc] of shape.cells) next[r + dr][c + dc] = color;
  const fullRows = [];
  const fullCols = [];
  for (let i = 0; i < SIZE; i++) {
    if (next[i].every(Boolean)) fullRows.push(i);
    if (next.every((row) => row[i])) fullCols.push(i);
  }
  const cleared = [];
  for (const i of fullRows) for (let j = 0; j < SIZE; j++) cleared.push([i, j]);
  for (const j of fullCols) for (let i = 0; i < SIZE; i++) if (!fullRows.includes(i)) cleared.push([i, j]);
  for (const [i, j] of cleared) next[i][j] = 0;
  const lines = fullRows.length + fullCols.length;
  return { board: next, lines, cleared, points: shape.cells.length + 10 * lines * lines };
}

export function fitsAnywhere(board, shape) {
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (canPlace(board, shape, r, c)) return true;
  return false;
}

// 一盘三块, 每块一个颜色
export function randomTray(rng = Math.random) {
  return Array.from({ length: 3 }, () => ({
    shape: SHAPES[Math.floor(rng() * SHAPES.length)],
    color: 1 + Math.floor(rng() * COLORS),
  }));
}
