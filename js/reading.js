// 阅读 (书库): 唐诗宋词、论语、古文观止和古代启蒙读物的原文 (js/library/, tools/library.mjs 生成)。这里是不碰网页的部分: 拿书、找、做卡片、每日一首、收藏和读到哪 (画在 views/read.js)
//   一篇的编号 (收藏、读到哪用): '书:第几篇', 比如 'qianjiashi:0' 是《千家诗》第一首
//   data.reading = { favs: { 编号: { on 1 收藏 / 0 取消了, at } }, last: { 书: { i 读到第几篇, at } } }; 没读过是 null
//   同步: 收藏、读到哪都按编号 (书) 听后改的

import { BOOKS, SOURCE } from './library/books.js';

export { BOOKS, SOURCE };

export const bookOf = (id) => BOOKS.find((b) => b.id === id) ?? null;

// 拿一本书的正文 (hant: 繁体原文); 拿过的记着。没有这本书是 null
const loaded = new Map();
export function loadBook(id, { hant = false } = {}) {
  if (!bookOf(id)) return Promise.resolve(null);
  const key = `${hant ? 'hant/' : ''}${id}`;
  if (!loaded.has(key)) {
    const p = import(`./library/${key}.js`).then((m) => m.default);
    p.catch(() => loaded.delete(key)); // 没网拿不到: 下次再拿
    loaded.set(key, p);
  }
  return loaded.get(key);
}

export const pieceId = (book, i) => `${book}:${i}`;
const PIECE_ID = /^([a-z]+):(\d+)$/;
// '书:第几篇' → { book, i }; 不是书库里有的返回 null
export function parsePieceId(pid) {
  const m = PIECE_ID.exec(String(pid));
  const b = m && bookOf(m[1]);
  const i = m ? Number(m[2]) : -1;
  return b && i < b.count ? { book: b.id, i } : null;
}

// ---- 做卡片 ----
const MARKS = '，。；：？！、';
const QUOTES = /[“”‘’「」『』]/g;
// 「子曰」「曾子曰」「子禽问于子贡曰」这种 (谁说的) 跟后面一句连起来, 不然卡片正面只有「子曰」
const SPEAKER = /^.{1,8}[曰云]$/;
// 一句一句拆开 (按标点), 去掉句末的标点和引号
export function clauses(lines) {
  const out = [];
  for (const line of lines) {
    let cur = '';
    for (const ch of line.replace(QUOTES, '')) {
      if (MARKS.includes(ch)) {
        if (cur.trim()) out.push(cur.trim());
        cur = '';
      } else cur += ch;
    }
    if (cur.trim()) out.push(cur.trim());
  }
  for (let i = 0; i + 1 < out.length; i++) if (SPEAKER.test(out[i])) out.splice(i, 2, `${out[i]}：${out[i + 1]}`);
  return out;
}

const poemName = (p) => `《${p.t}》${p.a ? `（${p.a}）` : ''}`;

// 组诗 (一篇里有「其一」「其二」, k: [[从第几行, '其一'], …]) 拆成一首一首: [{ ...p, t: '宫词·其一', p: 那几行 }]
export function poemsOf(p) {
  if (!p.k?.length) return [p];
  return p.k.map(([from, label], j) => ({ ...p, t: `${p.t}·${label}`, p: p.p.slice(from, p.k[j + 1]?.[0] ?? p.p.length), k: undefined }));
}

// 做成卡片: style 'next' 接下句 (正面一句, 背面下一句), 'whole' 整篇 (正面题目, 背面全文)。返回 [{ term, def }]
//   诗一首一首分开接 (组诗也拆开), 第一张是「《题目》（作者）第一句」(题目里就有第一句的不要, 像宋词「水调歌头·明月几时有」);
//   文章看书的 chain: 'book' 整本连着接 (三字经切成的几段, 上一段的末句接下一段的头一句), 'line' 一行一行接 (论语一章、增广贤文一句, 互不相干), 别的一篇里连着接
export function makeCards(book, pieces, style = 'next') {
  if (style === 'whole') return pieces.flatMap(poemsOf).map((p) => ({ term: p.a ? poemName(p) : `${book.title} · ${p.t}`, def: p.p.join('\n') }));
  const cards = [];
  const chain = (list) => {
    for (let i = 0; i + 1 < list.length; i++) cards.push({ term: list[i], def: list[i + 1] });
  };
  if (book.kind === 'poem') {
    for (const p of pieces.flatMap(poemsOf)) {
      const list = clauses(p.p);
      if (list.length && !p.t.includes(list[0])) cards.push({ term: `${poemName(p)}第一句`, def: list[0] });
      chain(list);
    }
  } else if (book.chain === 'book') chain(pieces.flatMap((p) => clauses(p.p)));
  else if (book.chain === 'line') for (const p of pieces) for (const line of p.p) chain(clauses([line]));
  else for (const p of pieces) chain(clauses(p.p));
  return cards;
}

// 卡片集叫什么: 有作者的一篇「水调歌头·明月几时有（苏轼）」「出师表（诸葛亮）」, 一段文章「三字经 · 人之初」, 整本「三字经」
export const setTitle = (book, piece = null) => (!piece ? book.title : piece.a ? `${piece.t}（${piece.a}）` : `${book.title} · ${piece.t}`);

// 书架上分几层 (书目里每本书的 cat)
export const SHELVES = [
  { key: 'poetry', name: '诗词' },
  { key: 'classic', name: '经典与古文' },
  { key: 'primer', name: '启蒙读物' },
];

// ---- 每日一首 (《千家诗》里挑): 每天换一首, 哪台设备上都一样 ----
export const DAILY_BOOK = 'qianjiashi';
const gcd = (a, b) => (b ? gcd(b, a % b) : a);
export function dailyIndex(day, n) {
  const [y, m, d] = String(day).split('-').map(Number);
  const days = Math.floor(Date.UTC(y, m - 1, d) / 86400000);
  const step = gcd(37, n) === 1 ? 37 : 1; // 跳着挑 (不然一连几个月都是五言绝句), 一圈下来每首都轮到
  return (((days * step) % n) + n) % n;
}

// ---- 搜 (题目、作者、句子) ----
// 返回 [{ book, i, piece, where 'title' | 'author' | 'line', line 找到的那句 }], 题目、作者对上的排前面
export async function searchLibrary(query, { limit = 60 } = {}) {
  const q = String(query ?? '').replace(/\s+/g, '');
  if (!q) return [];
  const books = await Promise.all(BOOKS.map((b) => loadBook(b.id)));
  const hits = [];
  books.forEach((data, bi) => {
    const book = BOOKS[bi];
    data.pieces.forEach((piece, i) => {
      const line = piece.p.find((l) => l.replace(/\s+/g, '').includes(q));
      const where = piece.t.includes(q) ? 'title' : piece.a?.includes(q) ? 'author' : line ? 'line' : '';
      if (where) hits.push({ book: book.id, i, piece, where, line: line ?? piece.p[0] ?? '' });
    });
  });
  const rank = { title: 0, author: 1, line: 2 };
  return hits.sort((a, b) => rank[a.where] - rank[b.where]).slice(0, limit);
}

// ---- 收藏、读到哪 (存在 data.reading, 跟着同步、备份) ----
const time = (v) => (Number(v) > 0 ? Number(v) : 0);

export function cleanReading(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const favs = {};
  for (const [pid, f] of Object.entries(raw.favs && typeof raw.favs === 'object' ? raw.favs : {})) {
    if (parsePieceId(pid) && time(f?.at)) favs[pid] = { on: f.on ? 1 : 0, at: time(f.at) };
  }
  const last = {};
  for (const [id, r] of Object.entries(raw.last && typeof raw.last === 'object' ? raw.last : {})) {
    const b = bookOf(id);
    const i = Math.floor(Number(r?.i));
    if (b && i >= 0 && i < b.count && time(r?.at)) last[id] = { i, at: time(r.at) };
  }
  return Object.keys(favs).length || Object.keys(last).length ? { favs, last } : null;
}

export function mergeReading(a, b) {
  if (!a) return b ?? null;
  if (!b) return a;
  const later = (x, y) => (!x ? y : !y ? x : y.at > x.at ? y : x);
  const favs = { ...a.favs };
  for (const [pid, f] of Object.entries(b.favs)) favs[pid] = later(favs[pid], f);
  const last = { ...a.last };
  for (const [id, r] of Object.entries(b.last)) last[id] = later(last[id], r);
  return { favs, last };
}

export const isFav = (reading, pid) => Boolean(reading?.favs[pid]?.on);

// 收藏的, 后收藏的在前: [{ pid, book, i, at }]
export function favList(reading) {
  return Object.entries(reading?.favs ?? {})
    .filter(([pid, f]) => f.on && parsePieceId(pid))
    .map(([pid, f]) => ({ pid, ...parsePieceId(pid), at: f.at }))
    .sort((a, b) => b.at - a.at);
}

// 读过的书, 最近读的在前: [{ book, i, at }]
export function recentBooks(reading) {
  return Object.entries(reading?.last ?? {})
    .map(([book, r]) => ({ book, i: r.i, at: r.at }))
    .sort((a, b) => b.at - a.at);
}
