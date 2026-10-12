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
// { kind: 'table', title, html, label, sheets: [{ name, columns: [列名], rows: [[字]] }], media }
export async function readCardFile(file) {
  const name = file.name ?? '';
  const title = name.replace(/\.[^.]+$/, '');
  const e = ext(name);
  if (e === 'xls') throw new FileError('老的 Excel 格式 (.xls) 读不了: 在 Excel 里「另存为」选 .xlsx 或 CSV 再导入');
  if (e === 'numbers') throw new FileError('Numbers 的文件读不了: 在 Numbers 里「导出为」Excel 或 CSV 再导入');
  if (e === 'ods') throw new FileError('.ods 读不了: 「另存为」.xlsx 或 CSV 再导入');
  if (e === 'docx' || e === 'doc' || e === 'pdf') throw new FileError('Word、PDF 读不了: 里面的表格可以直接复制, 粘贴到下面的框里');
  if (file.size > 300 * 1024 * 1024) throw new FileError('文件太大了 (超过 300MB)');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b;

  if (e === 'apkg' || e === 'colpkg') {
    const { notes, media } = await readApkg(bytes);
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
      return { name: deck || '卡组', columns, rows: list.map((n) => n.fields) };
    });
    sheets.sort((a, b) => a.name.localeCompare(b.name));
    return { kind: 'table', title: sheets.length === 1 ? lastPart(sheets[0].name) : title, html: true, label: '牌组', sheets, media };
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

// 第一行是不是标题 (「词」「解释」「Term」「Definition」这种)
const HEADER_WORDS = /^(terms?|words?|vocab(ulary)?|front|questions?|prompts?|definitions?|meanings?|back|answers?|translations?|examples?|notes?|pronunciation|phonetics?|ipa|pinyin|english|chinese|词|单词|词语|生词|词汇|术语|名词|解释|释义|意思|含义|定义|翻译|中文|英文|英语|正面|背面|问题|答案|例句|备注|音标|拼音|发音|词性)$/i;

export function guessHeader(rows) {
  const first = rows[0];
  if (!first || rows.length < 2) return false;
  return first.some((c) => HEADER_WORDS.test(String(c).trim().replace(/[:：\s]+$/, '')));
}

const DEF_WORDS = /^(definitions?|meanings?|back|answers?|translations?|解释|释义|意思|含义|定义|翻译|中文|背面|答案)$/i;
const TERM_WORDS = /^(terms?|words?|vocab(ulary)?|front|questions?|prompts?|词|单词|词语|生词|词汇|术语|英文|正面|问题)$/i;

// 猜哪一列是词、哪一列是解释: 有标题按标题, 没有就用前两列有字的
export function guessColumns(rows, header) {
  const width = Math.max(0, ...rows.map((r) => r.length));
  const filled = [];
  for (let c = 0; c < width; c++) if (rows.some((r) => String(r[c] ?? '').trim())) filled.push(c);
  let term = filled[0] ?? 0;
  let def = filled[1] ?? (filled[0] ?? 0) + 1;
  if (header && rows[0]) {
    const clean = (s) => String(s ?? '').trim().replace(/[:：\s]+$/, '');
    const t = rows[0].findIndex((c) => TERM_WORDS.test(clean(c)));
    const d = rows[0].findIndex((c) => DEF_WORDS.test(clean(c)));
    if (t >= 0) term = t;
    if (d >= 0 && d !== term) def = d;
    else if (t >= 0) def = filled.find((c) => c !== term) ?? term + 1;
  }
  return { term, def, width: Math.max(width, def + 1) };
}

// 每一列在选择框里叫什么: 字段名 / 标题, 或者「A 列: 第一格的字」
export function columnLabels(sheet, header, html) {
  const rows = sheet.rows;
  const width = Math.max(sheet.columns.length, ...rows.map((r) => r.length));
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

// 表格 → 卡片: [{ term, def, image, termAudio, defAudio }] (图片声音是文件名, 导入时再去拿)
// extra: 再接到解释后面的一列 (例句之类), 没有写 -1
export function buildCards(rows, { term, def, extra = -1, header = false, html = false }) {
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
      image = dr.images[0] ?? tr.images[0] ?? '';
      termAudio = tr.sounds[0] ?? '';
      defAudio = dr.sounds[0] ?? '';
    }
    if (!t && !d && !image) continue;
    out.push({ term: t, def: d, image, termAudio, defAudio });
  }
  return out;
}

// ---- 导出 ----
const safeName = (s) => String(s || '卡片集').replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ').trim().slice(0, 80) || '卡片集';

export function exportFile(set, format) {
  const rows = [['词', '解释'], ...set.cards.map((c) => [stripMarks(c.term), stripMarks(c.def)])];
  const name = safeName(set.title);
  if (format === 'xlsx') {
    const longest = (i) => Math.min(60, Math.max(10, ...rows.map((r) => Math.max(...r[i].split('\n').map((l) => [...l].reduce((n, ch) => n + (ch.charCodeAt(0) > 0x2e80 ? 2 : 1), 0)))) + 2));
    const data = writeXlsx([{ name: set.title, rows, header: true, widths: [longest(0), longest(1)] }]);
    return { blob: new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), filename: `${name}.xlsx` };
  }
  if (format === 'csv') return { blob: new Blob(['﻿', toCsv(rows)], { type: 'text/csv;charset=utf-8' }), filename: `${name}.csv` };
  if (format === 'anki') return { blob: new Blob([toAnkiText(set)], { type: 'text/plain;charset=utf-8' }), filename: `${name} (Anki).txt` };
  throw new Error(`不认识的格式 ${format}`);
}
