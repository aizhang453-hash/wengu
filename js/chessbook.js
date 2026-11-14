// 国际象棋的开局谱 (v1.83): 复盘时认「开局谱着」(走的是开局谱上的标准走法), 教练顺便说是什么开局。
// 资料是 Lichess 整理的开局表 (chess-openings, CC0 公有领域), tools/chess-book.mjs 生成 chessbook-data.js (复盘时才下载)。
// 局面的「钥匙」: 棋子摆法 + 谁走 + 易位权 + 吃过路兵的格子 (不算步数), 算成一个短短的编号。

export const BOOK_DATA = './chessbook-data.js';

// FNV-1a 32 位, 写成 36 进制 (几千个局面里撞号的机会极小)
export function hashText(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

export const bookKey = (fen) => hashText(String(fen).split(' ').slice(0, 4).join(' '));

// 读进来的谱: Map(钥匙 → 开局名的编号); names[编号] 是中文名 ('' 是没有中文名的冷门开局)
export function parseBook(data) {
  const map = new Map();
  for (const part of String(data.book ?? '').split(',')) {
    const i = part.indexOf(':');
    if (i > 0) map.set(part.slice(0, i), Number(part.slice(i + 1)));
  }
  return { map, names: data.names ?? [] };
}

let loading = null;
export function loadBook() {
  loading ??= import(BOOK_DATA).then(parseBook).catch((e) => {
    loading = null;
    throw e;
  });
  return loading;
}

// 一盘棋的每一步是不是开局谱着: 从第一步起连着在谱上的才算 (中间离谱了, 后面再回到谱上的局面也不算)
//   fens: 每个局面 (第 0 个是开局); 返回 [{ book: true/false, name: '中文开局名' }] (比走法少一个: 第 i 个是第 i 步)
export function bookMoves(book, fens) {
  const out = [];
  let on = true;
  let name = '';
  for (let i = 1; i < fens.length; i++) {
    const id = on ? book.map.get(bookKey(fens[i])) : undefined;
    if (id === undefined) on = false;
    else if (book.names[id]) name = book.names[id];
    out.push({ book: on, name: on ? name : '' });
  }
  return out;
}
