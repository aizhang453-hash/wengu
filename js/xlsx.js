// 读写 Excel 的 .xlsx (一个 zip, 里面是几个 XML 文件)。
// 只管格子里的字, 不管颜色、公式 (公式读算好的结果)、图片。

import { readZip, writeZip } from './zip.js';

const unescapeXml = (s) =>
  s
    .replace(/&(lt|gt|amp|quot|apos|#\d+|#x[0-9a-f]+);/gi, (m, e) => {
      const named = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" }[e.toLowerCase()];
      if (named) return named;
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    })
    .replace(/_x([0-9a-f]{4})_/gi, (m, hex) => String.fromCharCode(parseInt(hex, 16)));

// <t> 里的字连起来 (富文本是好几段 <r><t>), 日语注音 <rPh> 不要
function textOf(xml) {
  return [...xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '').matchAll(/<t\b[^>]*?(?:\/>|>([\s\S]*?)<\/t>)/g)].map((m) => unescapeXml(m[1] ?? '')).join('');
}

const attr = (tag, name) => tag.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1];

// 去掉标签的命名空间前缀 (<x:row> → <row>)
const noPrefix = (xml) => xml.replace(/<(\/?)[A-Za-z][\w.-]*:/g, '<$1');

// "C12" → 2 (第几列, 从 0 开始)
function colIndex(ref) {
  const letters = ref.match(/^[A-Z]+/i)?.[0].toUpperCase() ?? '';
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

export function colName(i) {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

function cellValue(attrs, inner, shared) {
  const t = attr(attrs, 't') ?? 'n';
  if (t === 'inlineStr') return textOf(inner);
  const v = inner.match(/<v>([\s\S]*?)<\/v>/)?.[1];
  if (v == null) return '';
  if (t === 's') return shared[Number(v)] ?? '';
  if (t === 'b') return v === '1' ? 'TRUE' : 'FALSE';
  if (t === 'str' || t === 'e') return unescapeXml(v);
  const num = Number(v);
  return Number.isFinite(num) ? String(parseFloat(num.toPrecision(15))) : unescapeXml(v);
}

function parseSheet(xml, shared) {
  const rows = [];
  let nextRow = 0;
  for (const m of noPrefix(xml).matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const r = Number(attr(m[1], 'r'));
    const index = Number.isFinite(r) && r > 0 ? r - 1 : nextRow;
    nextRow = index + 1;
    const row = [];
    let nextCol = 0;
    for (const c of (m[2] ?? '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = attr(c[1], 'r');
      const col = ref ? colIndex(ref) : nextCol;
      nextCol = col + 1;
      if (col < 0 || col > 16383) continue;
      const value = cellValue(c[1], c[2] ?? '', shared);
      if (value !== '') row[col] = value;
    }
    if (row.length && index < 1048576) rows[index] = Array.from(row, (x) => x ?? '');
  }
  // 中间空着的行去掉
  return rows.filter((r) => r && r.some((x) => x.trim()));
}

// 返回 [{ name, rows: [[字, 字, ...]] }] (每个工作表一个)
export async function readXlsx(bytes) {
  const zip = readZip(bytes);
  const text = async (path) => {
    const f = zip.get(path);
    return f ? new TextDecoder().decode(await f.read()) : null;
  };
  const workbook = await text('xl/workbook.xml');
  if (workbook == null) throw new Error('不是 Excel 文件 (.xlsx)');
  const sharedXml = await text('xl/sharedStrings.xml');
  const shared = sharedXml ? [...noPrefix(sharedXml).matchAll(/<si\b[^>]*?(?:\/>|>([\s\S]*?)<\/si>)/g)].map((m) => textOf(m[1] ?? '')) : [];
  const rels = new Map();
  for (const m of noPrefix((await text('xl/_rels/workbook.xml.rels')) ?? '').matchAll(/<Relationship\b[^>]*>/g)) {
    const target = attr(m[0], 'Target') ?? '';
    rels.set(attr(m[0], 'Id'), target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`);
  }
  const sheets = [];
  for (const m of noPrefix(workbook).matchAll(/<sheet\b[^>]*>/g)) {
    const id = m[0].match(/\b(?:r:)?id="([^"]*)"/)?.[1];
    const path = rels.get(id) ?? `xl/worksheets/sheet${sheets.length + 1}.xml`;
    const xml = await text(path);
    if (xml == null) continue;
    sheets.push({ name: unescapeXml(attr(m[0], 'name') ?? `Sheet${sheets.length + 1}`), rows: parseSheet(xml, shared) });
  }
  return sheets;
}

// ---- 写 ----
const escapeXml = (s) =>
  String(s)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

// 工作表名字: 最多 31 个字, 不能有 []:*?/\, 不能重名
function sheetNames(names) {
  const used = new Set();
  return names.map((raw, i) => {
    const base = String(raw || `Sheet${i + 1}`).replace(/[[\]:*?/\\]/g, ' ').replace(/^'|'$/g, '').trim().slice(0, 31) || `Sheet${i + 1}`;
    let name = base;
    for (let n = 2; used.has(name.toLowerCase()); n++) name = `${base.slice(0, 31 - String(n).length - 1)} ${n}`;
    used.add(name.toLowerCase());
    return name;
  });
}

// sheets: [{ name, rows: [[字]], widths?: [列宽], header?: 第一行加粗 }] → Uint8Array
export function writeXlsx(sheets) {
  const names = sheetNames(sheets.map((s) => s.name));
  const NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';
  const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const files = [
    {
      name: '[Content_Types].xml',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`,
    },
    {
      name: '_rels/.rels',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    },
    {
      name: 'xl/workbook.xml',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook ${NS} xmlns:r="${REL}"><sheets>${names.map((n, i) => `<sheet name="${escapeXml(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`,
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${REL}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="${REL}/styles" Target="styles.xml"/></Relationships>`,
    },
    {
      // 样式 0: 普通; 1: 自动换行、靠上; 2: 加粗 (标题行)
      name: 'xl/styles.xml',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet ${NS}><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`,
    },
  ];
  sheets.forEach((sheet, i) => {
    const cols = sheet.widths?.length ? `<cols>${sheet.widths.map((w, c) => `<col min="${c + 1}" max="${c + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` : '';
    const rows = sheet.rows
      .map((row, r) => {
        const style = r === 0 && sheet.header ? 2 : 1;
        const cells = row
          .map((v, c) => (v === '' || v == null ? '' : `<c r="${colName(c)}${r + 1}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(v)}</t></is></c>`))
          .join('');
        return `<row r="${r + 1}">${cells}</row>`;
      })
      .join('');
    const freeze = sheet.header ? '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' : '';
    files.push({ name: `xl/worksheets/sheet${i + 1}.xml`, data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet ${NS}>${freeze}${cols}<sheetData>${rows}</sheetData></worksheet>` });
  });
  return writeZip(files);
}
