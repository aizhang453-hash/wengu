// 只读的 SQLite 小读取器: Anki 的卡组 (.apkg) 里面是一个 SQLite 数据库。
// 只会「把一张表从头到尾读出来」, 不会查询、不会写, 够导入用了。
// 文件格式: https://www.sqlite.org/fileformat2.html

export class SQLiteError extends Error {}

export class SQLiteDB {
  constructor(bytes) {
    const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    if (b.length < 100 || new TextDecoder().decode(b.subarray(0, 15)) !== 'SQLite format 3') throw new SQLiteError('不是 SQLite 数据库');
    this.b = b;
    this.v = new DataView(b.buffer, b.byteOffset, b.byteLength);
    const ps = this.v.getUint16(16);
    this.pageSize = ps === 1 ? 65536 : ps;
    this.usable = this.pageSize - b[20];
    this.pageCount = Math.floor(b.length / this.pageSize);
    const enc = this.v.getUint32(56);
    this.text = new TextDecoder(enc === 2 ? 'utf-16le' : enc === 3 ? 'utf-16be' : 'utf-8');
    this.schema = this.readTable(1, ['type', 'name', 'tbl_name', 'rootpage', 'sql']);
  }

  // 表名 → { root, columns, rowidCol, withoutRowid }
  table(name) {
    const row = this.schema.find((r) => r.type === 'table' && String(r.name).toLowerCase() === name.toLowerCase());
    if (!row) return null;
    return { root: row.rootpage, ...parseCreate(row.sql ?? '') };
  }

  hasTable(name) {
    return !!this.table(name);
  }

  // 整张表读出来: [{ 列名: 值 }]; 没有这张表返回 []
  rows(name) {
    const t = this.table(name);
    if (!t) return [];
    return this.readTable(t.root, t.columns, t);
  }

  readTable(root, columns, { rowidCol = null } = {}) {
    const out = [];
    this.walk(root, (payload, rowid) => {
      const values = this.record(payload);
      const row = {};
      columns.forEach((c, i) => (row[c] = values[i] ?? null));
      if (rowidCol && row[rowidCol] == null) row[rowidCol] = rowid;
      out.push(row);
    });
    return out;
  }

  // 一页一页走 B 树, 每条记录调一次 fn(payload, rowid)
  walk(root, fn, seen = new Set()) {
    if (root < 1 || root > this.pageCount || seen.has(root)) throw new SQLiteError('数据库坏了');
    seen.add(root);
    const base = (root - 1) * this.pageSize;
    const h = root === 1 ? base + 100 : base;
    const type = this.b[h];
    const n = this.v.getUint16(h + 3);
    const interior = type === 2 || type === 5;
    const cells = h + (interior ? 12 : 8);
    for (let i = 0; i < n; i++) {
      let p = base + this.v.getUint16(cells + i * 2);
      if (type === 13) {
        // 表的叶子: 长度, rowid, 内容
        const [size, a] = this.varint(p);
        const [rowid, c] = this.varint(a);
        fn(this.payload(c, size, false), rowid);
      } else if (type === 5) {
        this.walk(this.v.getUint32(p), fn, seen);
      } else if (type === 10 || type === 2) {
        // 索引 (WITHOUT ROWID 的表也是这样存的): 中间页的记录也是数据
        if (type === 2) {
          this.walk(this.v.getUint32(p), fn, seen);
          p += 4;
        }
        const [size, a] = this.varint(p);
        fn(this.payload(a, size, true), null);
      } else {
        throw new SQLiteError('数据库坏了');
      }
    }
    if (interior) this.walk(this.v.getUint32(h + 8), fn, seen);
  }

  // 一条记录的内容; 太长的放在「溢出页」里, 要一页页接起来
  payload(at, size, isIndex) {
    const U = this.usable;
    const X = isIndex ? Math.floor(((U - 12) * 64) / 255) - 23 : U - 35;
    if (size <= X) return this.b.subarray(at, at + size);
    const M = Math.floor(((U - 12) * 32) / 255) - 23;
    const K = M + ((size - M) % (U - 4));
    const local = K <= X ? K : M;
    const out = new Uint8Array(size);
    out.set(this.b.subarray(at, at + local));
    let got = local;
    let page = this.v.getUint32(at + local);
    let guard = 0;
    while (got < size && page && guard++ < this.pageCount) {
      const o = (page - 1) * this.pageSize;
      const take = Math.min(size - got, U - 4);
      out.set(this.b.subarray(o + 4, o + 4 + take), got);
      got += take;
      page = this.v.getUint32(o);
    }
    if (got < size) throw new SQLiteError('数据库坏了');
    return out;
  }

  // 记录: 先是每一列的类型, 再是每一列的值
  record(p) {
    const v = new DataView(p.buffer, p.byteOffset, p.byteLength);
    const [headerSize, first] = varintAt(p, 0);
    const types = [];
    for (let at = first; at < headerSize; ) {
      const [t, next] = varintAt(p, at);
      types.push(t);
      at = next;
    }
    const values = [];
    let at = headerSize;
    for (const t of types) {
      if (t === 0) values.push(null);
      else if (t === 1) (values.push(v.getInt8(at)), (at += 1));
      else if (t === 2) (values.push(v.getInt16(at)), (at += 2));
      else if (t === 3) (values.push((v.getInt8(at) << 16) | v.getUint16(at + 1)), (at += 3));
      else if (t === 4) (values.push(v.getInt32(at)), (at += 4));
      else if (t === 5) (values.push(v.getInt16(at) * 2 ** 32 + v.getUint32(at + 2)), (at += 6));
      else if (t === 6) (values.push(Number(v.getBigInt64(at))), (at += 8));
      else if (t === 7) (values.push(v.getFloat64(at)), (at += 8));
      else if (t === 8) values.push(0);
      else if (t === 9) values.push(1);
      else if (t >= 12) {
        const len = t % 2 ? (t - 13) / 2 : (t - 12) / 2;
        const bytes = p.subarray(at, at + len);
        values.push(t % 2 ? this.text.decode(bytes) : bytes);
        at += len;
      } else values.push(null);
    }
    return values;
  }

  varint(at) {
    return varintAt(this.b, at);
  }
}

// SQLite 的变长整数: 1~9 个字节
function varintAt(b, at) {
  let n = 0;
  for (let i = 0; i < 8; i++) {
    const x = b[at + i];
    n = n * 128 + (x & 0x7f);
    if (!(x & 0x80)) return [n, at + i + 1];
  }
  return [n * 256 + b[at + 8], at + 9];
}

// 从 CREATE TABLE 里找出列名 (存的顺序), 哪一列是 rowid, 是不是 WITHOUT ROWID
export function parseCreate(sql) {
  const clean = sql.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  const open = clean.indexOf('(');
  const close = clean.lastIndexOf(')');
  if (open < 0 || close < open) return { columns: [], rowidCol: null, withoutRowid: false };
  const withoutRowid = /without\s+rowid/i.test(clean.slice(close));
  const defs = [];
  let depth = 0;
  let cur = '';
  for (const ch of clean.slice(open + 1, close)) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      defs.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  if (cur.trim()) defs.push(cur.trim());
  const unquote = (s) => s.replace(/^["`[]|["`\]]$/g, '');
  const columns = [];
  let rowidCol = null;
  let pk = [];
  for (const d of defs) {
    const m = d.match(/^(constraint\s+\S+\s+)?(primary\s+key|unique|check|foreign\s+key)\b/i);
    if (m) {
      if (/^primary/i.test(m[2])) pk = (d.match(/\(([^)]*)\)/)?.[1] ?? '').split(',').map((s) => unquote(s.trim().split(/\s+/)[0]));
      continue;
    }
    const name = unquote(d.match(/^("[^"]+"|`[^`]+`|\[[^\]]+\]|\S+)/)?.[1] ?? '');
    columns.push(name);
    if (/primary\s+key/i.test(d)) {
      pk = [name];
      if (/^\S+\s+integer\b/i.test(d)) rowidCol = name;
    }
  }
  // WITHOUT ROWID 的表, 存的时候主键的列排在最前面
  if (withoutRowid && pk.length) {
    const rest = columns.filter((c) => !pk.includes(c));
    return { columns: [...pk.filter((c) => columns.includes(c)), ...rest], rowidCol: null, withoutRowid };
  }
  return { columns, rowidCol: withoutRowid ? null : rowidCol, withoutRowid };
}
