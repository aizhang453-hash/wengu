// 从文件导入卡片: Excel (.xlsx)、CSV、TSV、Anki 卡组 (.apkg)、Anki 导出的文字 (.txt)。
// 不管哪种, 先变成「表格」(一行一张卡片, 一列一样东西), 再选哪一列是词、哪一列是解释。
// 普通的 .txt (比如 Quizlet 导出的) 交给原来的「粘贴文字」去拆。

import { readXlsx, writeXlsx, colName } from './xlsx.js';
import { decodeText, parseCsv, toCsv } from './csv.js';
import { readApkg, parseAnkiText, htmlToText, mediaRefs, cloze, toAnkiText } from './anki.js';
import { stripMarks } from './rich.js';

export class FileError extends Error {}

const ext = (name) => String(name).split('.').pop().toLowerCase();

// 返回 { kind: 'text', text } 或者
// { kind: 'table', title, html, label, sheets: [{ name, columns: [列名], rows: [[字]] }], media, history }
// Anki 卡组: 每一行 (数组) 上还挂着 reviews (那张卡片在 Anki 里的复习记录); history: { cards, reviews } 一共多少
export async function readCardFile(file) {
  const name = file.name ?? '';
  const title = name.replace(/\.[^.]+$/, '');
  const e = ext(name);
  if (e === 'xls') throw new FileError('老的 Excel 格式 (.xls) 读不了: 在 Excel 里「另存为」选 .xlsx 或 CSV 再导入');
  if (e === 'numbers') throw new FileError('Numbers 的文件读不了: 在 Numbers 里「导出为」Excel 或 CSV 再导入');
  if (e === 'ods') throw new FileError('.ods 读不了: 「另存为」.xlsx 或 CSV 再导入');
  if (e === 'docx' || e === 'doc' || e === 'pdf') throw new FileError('Word、PDF 读不了: 里面的表格可以直接复制, 粘贴到下面的框里');
  const deck = e === 'apkg' || e === 'colpkg';
  // Anki 卡组 (连图片声音可能好几百 MB) 不整个读进来; 别的文件太大的不读
  if (!deck && file.size > 300 * 1024 * 1024) throw new FileError('文件太大了 (超过 300MB)');
  const lazy = deck && typeof Blob !== 'undefined' && file instanceof Blob;
  const bytes = lazy ? null : new Uint8Array(await file.arrayBuffer());
  const isZip = bytes?.[0] === 0x50 && bytes?.[1] === 0x4b;

  if (deck) {
    const { notes, media } = await readApkg(lazy ? file : bytes);
    // 一个牌组一张表
    const byDeck = new Map();
    for (const n of notes) {
      if (!byDeck.has(n.deck)) byDeck.set(n.deck, []);
      byDeck.get(n.deck).push(n);
    }
    const sheets = [...byDeck].map(([deck, list]) => {
      // 列名用这个牌组里最常见的笔记类型的字段名
      const counts = new Map();
      for (const n of list) counts.set(n.model, (counts.get(n.model) ?? 0) + 1);
      const common = [...counts].sort((a, b) => b[1] - a[1])[0][0];
      const columns = list.find((n) => n.model === common)?.fieldNames ?? [];
      return { name: deck || '卡组', columns, rows: list.map((n) => Object.assign([...n.fields], { reviews: n.reviews })) };
    });
    sheets.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })); // 2.Book 在 10.Book 前面
    const withHistory = notes.filter((n) => n.reviews.length);
    const history = { cards: withHistory.length, reviews: withHistory.reduce((k, n) => k + n.reviews.length, 0) };
    return { kind: 'table', title: sheets.length === 1 ? lastPart(sheets[0].name) : title, html: true, label: '牌组', sheets, media, history };
  }

  if (e === 'xlsx' || e === 'xlsm' || (isZip && e !== 'csv' && e !== 'txt')) {
    let sheets;
    try {
      sheets = await readXlsx(bytes);
    } catch {
      throw new FileError('读不了这个文件, 是不是坏了? (要 Excel 的 .xlsx)');
    }
    sheets = sheets.filter((s) => s.rows.length);
    if (!sheets.length) throw new FileError('这个 Excel 文件里没有字');
    return { kind: 'table', title, html: false, label: '工作表', sheets: sheets.map((s) => ({ ...s, columns: [] })), media: null };
  }

  const text = decodeText(bytes);
  const anki = parseAnkiText(text);
  if (anki) {
    const byDeck = new Map();
    for (const r of anki.rows) {
      if (!byDeck.has(r.deck)) byDeck.set(r.deck, []);
      byDeck.get(r.deck).push(r.cells);
    }
    const sheets = [...byDeck].map(([deck, rows]) => ({ name: deck || title, columns: anki.columns, rows }));
    const only = sheets.length === 1 && sheets[0].name !== title;
    return { kind: 'table', title: only ? lastPart(sheets[0].name) : title, html: anki.html, label: '牌组', sheets, media: null };
  }
  if (e === 'csv' || e === 'tsv') {
    const rows = parseCsv(text, e === 'tsv' ? '\t' : undefined);
    if (!rows.length) throw new FileError('文件里没有字');
    return { kind: 'table', title, html: false, label: '表', sheets: [{ name: title, columns: [], rows }], media: null };
  }
  return { kind: 'text', text, title };
}

const lastPart = (deck) => deck.split('::').pop().trim();

// Anki 的牌组「大牌组::小牌组」照样搬: 有小牌组的大牌组变成文件夹, 小牌组变成里面的卡片集
// (再往下分的用「 · 」连起来, 大牌组自己的卡片叫大牌组的名字)。
// groups: [{ path: 牌组全名, title, cards }] → [{ folder: 文件夹名或 null, sets: [{ title, cards }] }], 顺序不变
export function deckFolders(groups) {
  const byTop = new Map();
  for (const g of groups) {
    const parts = String(g.path ?? '').split('::').map((p) => p.trim()).filter(Boolean);
    const top = parts[0] ?? '';
    if (!byTop.has(top)) byTop.set(top, []);
    byTop.get(top).push({ g, parts });
  }
  const out = [];
  for (const [top, list] of byTop) {
    const nested = top && list.some(({ parts }) => parts.length > 1);
    if (!nested) {
      out.push(...list.map(({ g }) => ({ folder: null, sets: [{ title: g.title, cards: g.cards }] })));
      continue;
    }
    out.push({ folder: top, sets: list.map(({ g, parts }) => ({ title: parts.length > 1 ? parts.slice(1).join(' · ') : top, cards: g.cards })) });
  }
  return out;
}

// 第一行是不是标题 (「词」「解释」「Term」「Definition」这种)
const HEADER_WORDS = /^(terms?|words?|vocab(ulary)?|front|questions?|prompts?|definitions?|meanings?|back|answers?|translations?|examples?|notes?|pronunciation|phonetics?|ipa|pinyin|english|chinese|词|单词|词语|生词|词汇|术语|名词|解释|释义|意思|含义|定义|翻译|中文|英文|英语|正面|背面|问题|答案|例句|备注|音标|拼音|发音|词性)$/i;

export function guessHeader(rows) {
  const first = rows[0];
  if (!first || rows.length < 2) return false;
  return first.some((c) => HEADER_WORDS.test(String(c).trim().replace(/[:：\s]+$/, '')));
}

const DEF_WORDS = /^(definitions?|meanings?|back|answers?|translations?|解释|释义|意思|含义|定义|翻译|中文|背面|答案)$/i;
const TERM_WORDS = /^(terms?|words?|vocab(ulary)?|front|questions?|prompts?|词|单词|词语|生词|词汇|术语|英文|正面|问题)$/i;

// 表格最宽的那一行有几列。不用 Math.max(...几十万行), 行太多会出错
export function widthOf(rows) {
  let w = 0;
  for (const r of rows) if (r.length > w) w = r.length;
  return w;
}

// 猜哪一列是词、哪一列是解释: 有标题 (或者 Anki 的字段名 names) 按名字, 没有就用前两列有字的
// (Anki 里只放图片、声音的字段不算有字)
export function guessColumns(rows, header, { names = null, html = false } = {}) {
  const width = widthOf(rows);
  const body = header ? rows.slice(1) : rows;
  const hasText = (c) => body.some((r) => (html ? htmlToText(String(r[c] ?? '')) : String(r[c] ?? '')).trim());
  const filled = [];
  for (let c = 0; c < width; c++) if (hasText(c)) filled.push(c);
  let term = filled[0] ?? 0;
  let def = filled[1] ?? (filled[0] ?? 0) + 1;
  const labels = names?.length ? names : header ? rows[0] : null;
  if (labels) {
    const clean = (s) => String(s ?? '').trim().replace(/[:：\s]+$/, '');
    const t = labels.findIndex((c) => TERM_WORDS.test(clean(c)));
    const d = labels.findIndex((c) => DEF_WORDS.test(clean(c)));
    if (t >= 0) term = t;
    if (d >= 0 && d !== term) def = d;
    else if (t >= 0) def = filled.find((c) => c !== term) ?? term + 1;
  }
  return { term, def, width: Math.max(width, def + 1) };
}

// 每一列在选择框里叫什么: 字段名 / 标题, 或者「A 列: 第一格的字」
export function columnLabels(sheet, header, html) {
  const rows = sheet.rows;
  const width = Math.max(sheet.columns.length, widthOf(rows));
  const sample = (c) => {
    const row = rows.slice(header ? 1 : 0).find((r) => String(r[c] ?? '').trim());
    const s = row ? (html ? htmlToText(row[c]) : String(row[c])).replace(/\s+/g, ' ') : '';
    return s.length > 18 ? `${s.slice(0, 18)}…` : s;
  };
  return Array.from({ length: width }, (_, c) => {
    if (sheet.columns[c]) return sheet.columns[c];
    if (header && rows[0]?.[c]) return `${colName(c)} 列: ${String(rows[0][c]).trim()}`;
    const s = sample(c);
    return s ? `${colName(c)} 列 (${s})` : `${colName(c)} 列`;
  });
}

// 表格 → 卡片: [{ term, def, image, termAudio, defAudio, reviews? }] (图片声音是文件名, 导入时再去拿;
// reviews 是 Anki 卡组带来的复习记录)
// extra: 再接到解释后面的一列 (例句之类), 没有写 -1
// names: 列名 (Anki 的字段名), 用来找词和解释各自的发音 (Sound_Meaning 跟着 Meaning)
export function buildCards(rows, { term, def, extra = -1, header = false, html = false, names = null }) {
  const nameOf = (c) => String(names?.[c] ?? '').trim().toLowerCase();
  const out = [];
  for (const row of rows.slice(header ? 1 : 0)) {
    const raw = (c) => (c >= 0 ? String(row[c] ?? '') : '');
    const text = (c) => (html ? htmlToText(raw(c)) : raw(c).trim());
    let t = text(term);
    let d = text(def);
    const x = text(extra);
    // 完形填空: 挖空的那句当词, 答案当解释
    const cz = cloze(t);
    if (cz) {
      t = cz.question;
      d = [cz.answer, d].filter(Boolean).join('\n');
    }
    if (x) d = d ? `${d}\n${x}` : x;
    let image = '';
    let termAudio = '';
    let defAudio = '';
    if (html) {
      const tr = mediaRefs(raw(term));
      const dr = mediaRefs(`${raw(def)} ${raw(extra)}`);
      // 没选的字段里的: 图片 (Anki 卡组常常单独一个 Image 字段)、只放声音的字段:
      // 名字里带着解释那个字段名的 (Sound_Meaning) 是解释的发音; 剩下的第一个 (不是例句的) 是词的发音
      const others = row.map((_, c) => c).filter((c) => ![term, def, extra].includes(c));
      const otherImage = others.map((c) => mediaRefs(raw(c)).images[0]).find(Boolean);
      const sounds = others.filter((c) => !htmlToText(raw(c)).trim() && mediaRefs(raw(c)).sounds.length);
      const pairOf = (col) => (nameOf(col) ? sounds.find((c) => nameOf(c) !== nameOf(col) && nameOf(c).includes(nameOf(col))) : undefined);
      const defSound = pairOf(def);
      const termSound = pairOf(term) ?? sounds.find((c) => c !== defSound && !/example|sentence|例句/.test(nameOf(c)));
      const soundIn = (c) => (c === undefined ? undefined : mediaRefs(raw(c)).sounds[0]);
      image = dr.images[0] ?? tr.images[0] ?? otherImage ?? '';
      termAudio = tr.sounds[0] ?? soundIn(termSound) ?? '';
      defAudio = dr.sounds[0] ?? soundIn(defSound) ?? '';
    }
    if (!t && !d && !image) continue;
    out.push({ term: t, def: d, image, termAudio, defAudio, ...(row.reviews?.length ? { reviews: row.reviews } : {}) });
  }
  return out;
}

// ---- 导出 ----
const safeName = (s) => String(s || '卡片集').replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ').trim().slice(0, 80) || '卡片集';

export function exportFile(set, format) {
  const rows = [['词', '解释'], ...set.cards.map((c) => [stripMarks(c.term), stripMarks(c.def)])];
  const name = safeName(set.title);
  if (format === 'xlsx') {
    // 列宽: 最长的一行有多宽 (中文算两个), 10 到 60 之间
    const longest = (i) => {
      let w = 0;
      for (const r of rows) for (const line of r[i].split('\n')) w = Math.max(w, [...line].reduce((n, ch) => n + (ch.charCodeAt(0) > 0x2e80 ? 2 : 1), 0));
      return Math.min(60, Math.max(10, w + 2));
    };
    const data = writeXlsx([{ name: set.title, rows, header: true, widths: [longest(0), longest(1)] }]);
    return { blob: new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), filename: `${name}.xlsx` };
  }
  if (format === 'csv') return { blob: new Blob(['﻿', toCsv(rows)], { type: 'text/csv;charset=utf-8' }), filename: `${name}.csv` };
  if (format === 'anki') return { blob: new Blob([toAnkiText(set)], { type: 'text/plain;charset=utf-8' }), filename: `${name} (Anki).txt` };
  throw new Error(`不认识的格式 ${format}`);
}
