// 阅读 (书库): 唐诗宋词、论语、古文观止和古代启蒙读物的原文 (js/library/, tools/library.mjs 生成)。这里是不碰网页的部分: 拿书、找、做卡片、每日一首、收藏和读到哪 (画在 views/read.js)
//   一篇的编号 (收藏、读到哪用): '书:第几篇', 比如 'qianjiashi:0' 是《千家诗》第一首
//   data.reading = { favs: { 编号: { on 1 收藏 / 0 取消了, at } }, last: { 书: { i 读到第几篇, at } } }; 没读过是 null
//   同步: 收藏、读到哪都按编号 (书) 听后改的

import { BOOKS, SOURCE } from './library/books.js';
import { READINGS } from './library/readings.js';

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

// 做成卡片: style 'next' 接下句 (正面一句, 背面下一句), 'whole' 整篇 (正面题目, 背面全文), 'zhu' 字词 (正面注的词, 背面注释), 'cy' 成语 (正面成语, 背面意思和出处; 这两种要有 yizhu)。返回 [{ term, def }]
//   诗一首一首分开接 (组诗也拆开), 第一张是「《题目》（作者）第一句」(题目里就有第一句的不要, 像宋词「水调歌头·明月几时有」);
//   文章看书的 chain: 'book' 整本连着接 (三字经切成的几段, 上一段的末句接下一段的头一句), 'line' 一行一行接 (论语一章、增广贤文一句, 互不相干), 别的一篇里连着接
export function makeCards(book, pieces, style = 'next', yizhu = null) {
  if (style === 'zhu') return pieces.flatMap((p) => noteCards(p, entryOf(yizhu, p)));
  if (style === 'cy') return pieces.flatMap((p) => idiomCards(p, entryOf(yizhu, p)));
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

// ---- 读音特别的字 (library/readings.js) ----
// 一篇 (简体) 里要标的: [{ line (-1 是题目, 0 起是正文第几行), at 第几个字, len 几个字, ch, py, note, say }], 按位置排好
export function readingsOf(bookId, piece) {
  const texts = [piece.t, ...piece.p];
  const marks = [];
  const taken = new Set();
  for (const r of READINGS) {
    if (r.book && r.book !== bookId) continue;
    const off = r.at.indexOf(r.ch);
    texts.forEach((text, k) => {
      for (let i = text.indexOf(r.at); i !== -1; i = text.indexOf(r.at, i + 1)) {
        const key = `${k}:${i + off}`;
        if (taken.has(key)) continue; // 两条都标了同一个字 (「好学」「好之者」), 留前面那条
        taken.add(key);
        marks.push({ line: k - 1, at: i + off, len: r.ch.length, ch: r.ch, py: r.py, note: r.note, say: r.say });
      }
    });
  }
  return marks.sort((a, b) => a.line - b.line || a.at - b.at);
}

// 一行字按标出来的拆开: [{ text }, { text, mark }, …] (画注音、朗读换字都用这个)
export function splitMarks(text, marks) {
  const out = [];
  let from = 0;
  for (const m of marks) {
    if (m.at < from || m.at + m.len > text.length) continue;
    if (m.at > from) out.push({ text: text.slice(from, m.at) });
    out.push({ text: text.slice(m.at, m.at + m.len), mark: m });
    from = m.at + m.len;
  }
  if (from < text.length) out.push({ text: text.slice(from) });
  return out;
}

// 朗读用的字: 读音特别的换成同音字 (「不亦说乎」念成「不亦悦乎」), 系统就不会念错
export function spokenText(bookId, piece) {
  const marks = readingsOf(bookId, piece);
  const line = (text, k) =>
    splitMarks(
      text,
      marks.filter((m) => m.line === k),
    )
      .map((x) => x.mark?.say ?? x.text)
      .join('');
  return { title: line(piece.t, -1), lines: piece.p.map(line) };
}

// ---- 注释、译文、成语 (library/yizhu/<书>.js, 手写的; 现在只有《古文观止》的名篇有) ----
//   { '篇名': { notes: [{ at, w, note }], yi: [译文, 跟原文一段对一段], cy: [成语、名句], zhi: [知道吗] } }
//   一条注释: at 在哪几个字里 (简体), w 注哪几个字 (at 里的, 不写就是 at 整个), note 解释。
//   按原文的顺序写, 每条从上一条注的字后面往下找 (同一个词出现几次也标得对)
export const YIZHU_BOOKS = ['guwen'];
// 一篇的注释: 按「篇名|作者」找 (书里有同名的两篇, 像《左传》和《谷梁传》的《郑伯克段于鄢》), 没有再按篇名找
export const entryOf = (yizhu, piece) => yizhu?.[`${piece.t}|${piece.a}`] ?? yizhu?.[piece.t] ?? null;
const yizhuLoaded = new Map();
export function loadYizhu(id) {
  if (!YIZHU_BOOKS.includes(id)) return Promise.resolve(null);
  if (!yizhuLoaded.has(id)) {
    const p = import(`./library/yizhu/${id}.js`).then((m) => m.default);
    p.catch(() => yizhuLoaded.delete(id));
    yizhuLoaded.set(id, p);
  }
  return yizhuLoaded.get(id);
}

// 一篇 (简体) 的注释标在哪: [{ n 第几条 (从 1 数), line (-1 题目, 0 起正文第几行), at 第几个字, len, w, note }]; 找不到的那条跳过 (测试会查)
export function notesOf(piece, entry) {
  const texts = [piece.t, ...piece.p];
  const out = [];
  let k = 0;
  let from = 0;
  (entry?.notes ?? []).forEach((x, j) => {
    const w = x.w ?? x.at;
    const off = x.at.indexOf(w);
    if (off < 0) return;
    for (let kk = k; kk < texts.length; kk++) {
      const i = texts[kk].indexOf(x.at, kk === k ? Math.max(0, from - off) : 0);
      if (i === -1) continue;
      out.push({ n: j + 1, line: kk - 1, at: i + off, len: w.length, w, note: x.note });
      k = kk;
      from = i + off + w.length;
      return;
    }
  });
  return out;
}

// 注的词在哪一小句里 (按标点断): 「间」→「又何间焉」; 做字词卡片用
export function clauseAround(text, at, len) {
  const stop = (ch) => MARKS.includes(ch) || /[“”‘’「」『』]/.test(ch);
  let a = at;
  let b = at + len;
  while (a > 0 && !stop(text[a - 1])) a--;
  while (b < text.length && !stop(text[b])) b++;
  return text.slice(a, b);
}

// 字词卡片: 正面「间（又何间焉）」, 背面注释
export function noteCards(piece, entry) {
  return notesOf(piece, entry).map((m) => {
    const text = m.line < 0 ? piece.t : piece.p[m.line];
    const clause = clauseAround(text, m.at, m.len);
    return { term: clause === m.w ? m.w : `${m.w}（${clause}）`, def: m.note };
  });
}

// ---- 出自这篇的成语、名句 (yizhu 的 cy) ----
//   { w 成语或名句, kind '成语' (不写) | '名句' | '词语', at 原文里是哪几个字 (不写: 整篇的故事来的, 像「世外桃源」), note 现在的意思 }
//   只收出自这篇的; 化用别的书的在 note 里写明「语本……」
export const CY_KINDS = ['成语', '名句', '词语'];
// 一段字在一篇里第一次出现的地方: { line (-1 题目), at }; 找不到 null
export function findText(piece, at) {
  const texts = [piece.t, ...piece.p];
  for (let k = 0; k < texts.length; k++) {
    const i = texts[k].indexOf(at);
    if (i !== -1) return { line: k - 1, at: i };
  }
  return null;
}

// [{ n 第几条 (从 1 数), w, kind, note, line, at, len }]; 没写 at 的 line 是 null
export function idiomsOf(piece, entry) {
  return (entry?.cy ?? []).map((x, j) => {
    const where = x.at ? findText(piece, x.at) : null;
    return { n: j + 1, w: x.w, kind: x.kind ?? '成语', note: x.note, line: where?.line ?? null, at: where?.at ?? -1, len: x.at?.length ?? 0 };
  });
}

// 一段字在哪一整句里 (按句号、问号、叹号、分号断; 在引号里的只要引号里那句): 做成语卡片时写原句
export function sentenceAround(text, at, len) {
  const end = '。？！；';
  const stop = (ch) => end.includes(ch) || '“”「」'.includes(ch);
  let a = at;
  let b = at + len;
  while (a > 0 && !stop(text[a - 1])) a--;
  while (b < text.length && !stop(text[b])) b++;
  if (b < text.length && end.includes(text[b])) b++; // 带上句末的标点
  return text.slice(a, b).replace(/[“”‘’「」『』]/g, '');
}

// 成语卡片: 正面成语, 背面意思和出处 (有原句的写原句)
export function idiomCards(piece, entry) {
  const src = `《${piece.t}》${piece.a ? `（${piece.a}）` : ''}`;
  return idiomsOf(piece, entry).map((x) => {
    const text = x.line === null ? '' : x.line < 0 ? piece.t : piece.p[x.line];
    const said = x.line === null || x.line < 0 ? '' : `：${sentenceAround(text, x.at, x.len)}`;
    return { term: x.w, def: `${x.note}\n出自${src}${said}` };
  });
}

// ---- 版本注释 (一篇的 n: 「明年 一作：年年」「轴 通：舳」, 资料里有的几条用「；」连在一起) ----
// 拆成一条一条: [{ w 原文的字, kind '一作' | '通', alt 别的写法 }]; 看不懂格式的 { text } 原样
export function variantsOf(notes) {
  return (notes ?? [])
    .flatMap((n) => String(n).split(/[；;]/))
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => {
      const m = /^(.+?)\s*(一作|通)\s*[：:]?\s*(.+)$/.exec(x); // 冒号有的资料没写
      return m ? { w: m[1].replace(/\s+/g, ''), kind: m[2], alt: m[3].replace(/\s+/g, '') } : { text: x };
    });
}

// ---- 每日一首 (《千家诗》里挑): 每天换一首, 哪台设备上都一样 ----
export const DAILY_BOOK = 'qianjiashi';
const gcd = (a, b) => (b ? gcd(b, a % b) : a);
export function dailyIndex(day, n) {
  const [y, m, d] = String(day).split('-').map(Number);
  const days = Math.floor(Date.UTC(y, m - 1, d) / 86400000);
  const step = gcd(37, n) === 1 ? 37 : 1; // 跳着挑 (不然一连几个月都是五言绝句), 一圈下来每首都轮到
  return (((days * step) % n) + n) % n;
}

// ---- 搜 (题目、作者、成语、句子) ----
// 返回 [{ book, i, piece, where 'title' | 'author' | 'idiom' | 'line', line 找到的那句 (成语是「成语「世外桃源」出自这里」) }],
//   题目、作者对上的排前面, 然后是出自这篇的成语 (「世外桃源」原文里没有这几个字也找得到)
export async function searchLibrary(query, { limit = 60 } = {}) {
  const q = String(query ?? '').replace(/\s+/g, '');
  if (!q) return [];
  const [books, extra] = await Promise.all([Promise.all(BOOKS.map((b) => loadBook(b.id))), Promise.all(BOOKS.map((b) => loadYizhu(b.id).catch(() => null)))]);
  const hits = [];
  books.forEach((data, bi) => {
    const book = BOOKS[bi];
    data.pieces.forEach((piece, i) => {
      const line = piece.p.find((l) => l.replace(/\s+/g, '').includes(q));
      const cy = entryOf(extra[bi], piece)?.cy?.find((x) => x.w.replace(/[，。；：？！、\s]/g, '').includes(q.replace(/[，。；：？！、]/g, '')));
      const where = piece.t.includes(q) ? 'title' : piece.a?.includes(q) ? 'author' : cy ? 'idiom' : line ? 'line' : '';
      if (where) hits.push({ book: book.id, i, piece, where, line: where === 'idiom' ? `${cy.kind ?? '成语'}「${cy.w}」出自这里` : (line ?? piece.p[0] ?? '') });
    });
  });
  const rank = { title: 0, author: 1, idiom: 2, line: 3 };
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
