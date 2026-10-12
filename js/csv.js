// CSV / TSV: 一行一张卡片, 逗号 (或者 Tab、分号) 隔开; 字里有逗号、换行的用双引号包起来。

// 文件的字节 → 文字。中文版 Excel 存的 CSV 常常是 GBK 编码, 不是 UTF-8
export function decodeText(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) return new TextDecoder().decode(b.subarray(3));
  if (b[0] === 0xff && b[1] === 0xfe) return new TextDecoder('utf-16le').decode(b.subarray(2));
  if (b[0] === 0xfe && b[1] === 0xff) return new TextDecoder('utf-16be').decode(b.subarray(2));
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(b);
  } catch {
    try {
      return new TextDecoder('gb18030').decode(b);
    } catch {
      return new TextDecoder().decode(b);
    }
  }
}

// 猜用的是哪个分隔符: 看前几行, 哪个每行出现得多又整齐
export function guessDelimiter(text) {
  const lines = text.split(/\r\n?|\n/).filter((l) => l.trim()).slice(0, 20);
  let best = ',';
  let bestScore = 0;
  for (const d of ['\t', ',', ';', '|']) {
    const counts = lines.map((l) => l.split(d).length - 1);
    const withIt = counts.filter((n) => n > 0).length;
    if (!withIt) continue;
    // 大多数行都有, 越多越好; Tab 优先 (字里很少有 Tab)
    const score = withIt / lines.length + (d === '\t' ? 0.5 : 0) + (withIt === lines.length ? 0.3 : 0);
    if (score > bestScore) {
      best = d;
      bestScore = score;
    }
  }
  return best;
}

// 返回 [[字, 字, ...], ...]。引号宽松处理: 只有格子开头的引号才算「包起来」
export function parseCsv(text, delimiter = guessDelimiter(text)) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  let atStart = true;
  const s = text.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quoted) {
      if (ch === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          const next = s[i + 1];
          quoted = false;
          if (!(next === undefined || next === delimiter || next === '\n' || next === '\r')) field += '"'; // 引号后面还有字: 当成普通的引号
        }
      } else field += ch;
      continue;
    }
    if (ch === '"' && atStart) {
      quoted = true;
      atStart = false;
    } else if (ch === delimiter) {
      row.push(field);
      field = '';
      atStart = true;
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      atStart = true;
    } else {
      field += ch;
      atStart = false;
    }
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((x) => x.trim()));
}

// [[字]] → CSV 文字 (Excel 能直接打开, 记得前面加 BOM)
export function toCsv(rows, delimiter = ',') {
  const cell = (v) => {
    const s = String(v ?? '');
    return /["\r\n]/.test(s) || s.includes(delimiter) || /^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map((r) => r.map(cell).join(delimiter)).join('\r\n') + '\r\n';
}
