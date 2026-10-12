// Anki: 读卡组 (.apkg, 连图片和声音), 读 / 写 Anki 的文字格式 (.txt)。
// .apkg 是一个 zip: 里面一个 SQLite 数据库 (新版 Anki 还用 zstd 压缩过), 加上图片声音文件。

import { readZip } from './zip.js';
import { SQLiteDB } from './sqlite.js';
import { parseCsv } from './csv.js';
import { parseMarks } from './rich.js';
import { decompress as unzstd } from './vendor/fzstd.js';

const ENTITIES = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", ensp: ' ', emsp: ' ', thinsp: ' ', hellip: '…', mdash: '—', ndash: '–', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', middot: '·', times: '×', divide: '÷', deg: '°', copy: '©', reg: '®' };

export function decodeEntities(s) {
  return s.replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

// 字段里的图片和声音: <img src="x.jpg">、[sound:y.mp3]
export function mediaRefs(html) {
  const s = String(html ?? '');
  const images = [...s.matchAll(/<img\b[^>]*?\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)].map((m) => decodeEntities(m[1] ?? m[2] ?? m[3]));
  const sounds = [...s.matchAll(/\[sound:([^\]]+)\]/g)].map((m) => m[1]);
  return { images, sounds };
}

// Anki 的 HTML → 温故的文字 (加粗、斜体、下划线、高亮变成记号, 别的标签去掉)
export function htmlToText(html) {
  return decodeEntities(
    String(html ?? '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<(style|script)\b[\s\S]*?<\/\1>/gi, '')
      .replace(/\[sound:[^\]]*\]/g, '')
      .replace(/<img\b[^>]*>/gi, '')
      .replace(/\s*\n\s*/g, ' ') // HTML 里的换行只是空格
      .replace(/<(b|strong|i|em|u|mark)\b[^>]*>(\s*)<\/\1>/gi, '$2') // 空的格式
      .replace(/<\/(b|strong|i|em|u|mark)>(\s*)<\1\b[^>]*>/gi, '$2') // 挨着的同一种格式连起来
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/?(b|strong)\b[^>]*>/gi, '**')
      .replace(/<\/?(i|em)\b[^>]*>/gi, '*')
      .replace(/<\/?u\b[^>]*>/gi, '__')
      .replace(/<\/?mark\b[^>]*>/gi, '==')
      .replace(/<(div|p|li|tr|h[1-6]|blockquote|pre)\b[^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, ''),
  )
    .replace(/[ \t ]+/g, ' ')
    .split('\n')
    .map((l) => l.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// 完形填空 (Cloze): "首都是 {{c1::巴黎::城市}}" → 词: "首都是 [城市]", 答案: "巴黎"
const CLOZE = /\{\{c\d+::([\s\S]*?)(?:::([\s\S]*?))?\}\}/g;
export function cloze(text) {
  if (!/\{\{c\d+::/.test(text)) return null;
  const answers = [];
  const question = text.replace(CLOZE, (m, answer, hint) => {
    answers.push(answer);
    return hint ? `[${hint}]` : '[…]';
  });
  return { question, answer: answers.join('; ') };
}

// ---- Anki 导出的文字 (.txt): 开头几行 #separator:tab 之类的说明, 后面一行一个笔记 ----
// 返回 { columns, rows: [{ cells, deck }], html } ; 不是这种格式返回 null
export function parseAnkiText(text) {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/);
  const meta = {};
  let i = 0;
  for (; i < lines.length; i++) {
    const m = lines[i].match(/^#([a-z ]+):(.*)$/i);
    if (!m) break;
    meta[m[1].trim().toLowerCase()] = m[2];
  }
  if (!('separator' in meta || 'html' in meta || 'columns' in meta)) return null;
  const sepName = (meta.separator ?? 'tab').trim();
  const SEPS = { tab: '\t', comma: ',', semicolon: ';', space: ' ', pipe: '|', colon: ':' };
  const delim = SEPS[sepName.toLowerCase()] ?? (sepName.length === 1 ? sepName : '\t');
  const html = /^(true|yes|1)$/i.test((meta.html ?? 'false').trim());
  const col = (k) => Number(meta[`${k} column`]) - 1;
  const special = new Set(['guid', 'notetype', 'deck', 'tags'].map(col).filter((n) => n >= 0));
  const deckCol = col('deck');
  const allColumns = meta.columns ? meta.columns.split(delim).map((s) => s.trim()) : [];
  const rows = parseCsv(lines.slice(i).join('\n'), delim).map((r) => ({
    cells: r.filter((_, c) => !special.has(c)),
    deck: (deckCol >= 0 ? r[deckCol] : meta.deck)?.trim() || '',
  }));
  const columns = allColumns.filter((_, c) => !special.has(c));
  return { columns, rows, html };
}

// 温故的文字 → Anki 的 HTML
export function textToHtml(text) {
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return parseMarks(text)
    .map((t) => {
      let s = esc(t.text).replace(/\n/g, '<br>');
      if (t.b) s = `<b>${s}</b>`;
      if (t.i) s = `<i>${s}</i>`;
      if (t.u) s = `<u>${s}</u>`;
      if (t.hl) s = `<mark>${s}</mark>`;
      return s;
    })
    .join('');
}

// 卡片集 → Anki 能导入的文字 (Anki: 文件 → 导入)
export function toAnkiText(set) {
  const field = (s) => (/[\t\n"]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const lines = ['#separator:tab', '#html:true', '#columns:Front\tBack'];
  for (const c of set.cards) lines.push(`${field(textToHtml(c.term))}\t${field(textToHtml(c.def))}`);
  return lines.join('\n') + '\n';
}

// ---- .apkg ----
const isZstd = (b) => b[0] === 0x28 && b[1] === 0xb5 && b[2] === 0x2f && b[3] === 0xfd;

// protobuf 里最简单的那部分: 一个个 (字段号, 值)
function* protoFields(b) {
  let i = 0;
  const varint = () => {
    let n = 0;
    let mul = 1;
    for (;;) {
      const x = b[i++];
      n += (x & 0x7f) * mul;
      if (!(x & 0x80)) return n;
      mul *= 128;
    }
  };
  while (i < b.length) {
    const key = varint();
    const wire = key % 8;
    const field = Math.floor(key / 8);
    if (wire === 0) yield [field, varint()];
    else if (wire === 2) {
      const len = varint();
      yield [field, b.subarray(i, i + len)];
      i += len;
    } else if (wire === 1) i += 8;
    else if (wire === 5) i += 4;
    else return;
  }
}

// 媒体清单: 文件名 → zip 里的名字 ("0"、"1"……)
function mediaMap(bytes) {
  const names = new Map();
  if (!bytes?.length) return names;
  if (isZstd(bytes)) {
    let i = 0;
    for (const [f, entry] of protoFields(unzstd(bytes))) {
      if (f !== 1) continue;
      let name = '';
      let zipName = String(i);
      for (const [g, v] of protoFields(entry)) {
        if (g === 1) name = new TextDecoder().decode(v);
        if (g === 255) zipName = String(v);
      }
      if (name) names.set(name, zipName);
      i++;
    }
    return names;
  }
  try {
    for (const [zipName, name] of Object.entries(JSON.parse(new TextDecoder().decode(bytes)))) names.set(name, zipName);
  } catch {
    // 清单坏了就当没有图片
  }
  return names;
}

const MEDIA_TYPES = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp', avif: 'image/avif', mp3: 'audio/mpeg', ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/ogg', wav: 'audio/wav', m4a: 'audio/mp4', aac: 'audio/aac', flac: 'audio/flac', webm: 'audio/webm', mp4: 'audio/mp4' };
export const mediaType = (name) => MEDIA_TYPES[String(name).split('.').pop().toLowerCase()] ?? '';

export class AnkiError extends Error {}

// 返回 { notes: [{ fields: [html], model, fieldNames, deck }], media: { has(name), get(name) → Blob | null } }
export async function readApkg(bytes) {
  let zip;
  try {
    zip = readZip(bytes);
  } catch {
    throw new AnkiError('不是 Anki 卡组 (.apkg)');
  }
  let db = null;
  for (const name of ['collection.anki21b', 'collection.anki21', 'collection.anki2']) {
    const f = zip.get(name);
    if (!f) continue;
    let data = await f.read();
    if (isZstd(data)) data = unzstd(data);
    db = new SQLiteDB(data);
    break;
  }
  if (!db) throw new AnkiError('不是 Anki 卡组 (.apkg)');

  // 笔记类型 (字段叫什么) 和牌组 (叫什么): 新版存在单独的表里, 老版存在 col 表的 JSON 里
  const models = new Map();
  const decks = new Map();
  if (db.hasTable('notetypes')) {
    for (const r of db.rows('notetypes')) models.set(String(r.id), { name: r.name, fields: [] });
    for (const r of db.rows('fields')) {
      const m = models.get(String(r.ntid));
      if (m) m.fields[r.ord] = r.name;
    }
  }
  if (db.hasTable('decks')) {
    for (const r of db.rows('decks')) decks.set(String(r.id), String(r.name).split('\x1f').join('::'));
  }
  const col = db.rows('col')[0];
  try {
    for (const m of Object.values(JSON.parse(col?.models || '{}'))) {
      if (!models.has(String(m.id))) models.set(String(m.id), { name: m.name, fields: [...(m.flds ?? [])].sort((a, b) => a.ord - b.ord).map((f) => f.name) });
    }
    for (const d of Object.values(JSON.parse(col?.decks || '{}'))) if (!decks.has(String(d.id))) decks.set(String(d.id), d.name);
  } catch {
    // 没有就算了, 字段和牌组没名字
  }
  const deckOf = new Map();
  for (const c of db.rows('cards')) if (!deckOf.has(String(c.nid))) deckOf.set(String(c.nid), String(c.did));

  const notes = db
    .rows('notes')
    .sort((a, b) => a.id - b.id)
    .map((n) => {
      const model = models.get(String(n.mid));
      return {
        fields: String(n.flds ?? '').split('\x1f'),
        model: model?.name ?? '',
        fieldNames: model?.fields ?? [],
        deck: decks.get(deckOf.get(String(n.id))) ?? '',
      };
    });
  if (notes.length === 1 && /^Please update to the latest Anki version/.test(notes[0].fields[0])) {
    throw new AnkiError('这个卡组是更新的 Anki 版本导出的, 读不了。在 Anki 里导出时勾上「兼容旧版本 Anki」再试试');
  }

  const names = mediaMap(await zip.get('media')?.read());
  const media = {
    has: (name) => names.has(name) || names.has(safeDecode(name)),
    async get(name) {
      const zipName = names.get(name) ?? names.get(safeDecode(name));
      const f = zipName != null && zip.get(zipName);
      if (!f) return null;
      let data = await f.read();
      if (isZstd(data)) data = unzstd(data);
      return new Blob([data], { type: mediaType(name) });
    },
  };
  return { notes, media };
}

function safeDecode(s) {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}
