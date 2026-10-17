// 读写 zip。Excel 的 .xlsx、Anki 的 .apkg 其实都是 zip。
// 读: 支持「不压缩」和「deflate 压缩」(用浏览器自带的解压); 写: 只写不压缩的 (够用, 也简单)。

const u16 = (b, o) => b[o] | (b[o + 1] << 8);
const u32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
const u64 = (b, o) => u32(b, o) + u32(b, o + 4) * 2 ** 32;

export async function inflateRaw(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// 文件末尾的「目录在哪」(最多还跟着 64KB 注释): tail 是文件最后一段, base 是它在文件里从哪开始。
// 返回 { at 目录的位置, size 目录多大, count 几个文件, zip64 }; zip64 (很大的文件) 不是 null 时,
// 真正的位置在文件的 zip64 那一段 (56 个字节), 读出来交给 useZip64
function locate(tail, base) {
  let end = -1;
  for (let i = tail.length - 22; i >= Math.max(0, tail.length - 22 - 0xffff); i--) {
    if (u32(tail, i) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new Error('不是 zip 文件');
  const info = { count: u16(tail, end + 10), size: u32(tail, end + 12), at: u32(tail, end + 16), zip64: null };
  const big = info.at === 0xffffffff || info.count === 0xffff || info.size === 0xffffffff;
  if (big && end >= 20 && u32(tail, end - 20) === 0x07064b50) info.zip64 = u64(tail, end - 12);
  info.end = base + end;
  return info;
}

function useZip64(info, z) {
  if (u32(z, 0) !== 0x06064b50) return;
  info.count = u64(z, 32);
  info.size = u64(z, 40);
  info.at = u64(z, 48);
}

// 目录里一个个文件: b 里从 p 开始是目录。open(local, compSize, method, name) 给出读这个文件的函数
function listFiles(b, p, count, open) {
  const files = new Map();
  const dec = new TextDecoder();
  for (let n = 0; n < count && p + 46 <= b.length && u32(b, p) === 0x02014b50; n++) {
    const method = u16(b, p + 10);
    let compSize = u32(b, p + 20);
    let size = u32(b, p + 24);
    const nameLen = u16(b, p + 28);
    const extraLen = u16(b, p + 30);
    const commentLen = u16(b, p + 32);
    let local = u32(b, p + 42);
    const name = dec.decode(b.subarray(p + 46, p + 46 + nameLen));
    // zip64 的大小、位置放在 extra 里
    for (let e = p + 46 + nameLen; e + 4 <= p + 46 + nameLen + extraLen; ) {
      const id = u16(b, e);
      const len = u16(b, e + 2);
      if (id === 1) {
        let q = e + 4;
        if (size === 0xffffffff) (size = u64(b, q)), (q += 8);
        if (compSize === 0xffffffff) (compSize = u64(b, q)), (q += 8);
        if (local === 0xffffffff) local = u64(b, q);
      }
      e += 4 + len;
    }
    p += 46 + nameLen + extraLen + commentLen;
    if (name.endsWith('/')) continue; // 文件夹
    files.set(name, { size, read: open(local, compSize, method, name) });
  }
  return files;
}

async function unpackEntry(data, method, name) {
  if (method === 0) return data;
  if (method === 8) return inflateRaw(data);
  throw new Error(`zip 里的 ${name} 用了不认识的压缩方式`);
}

// 整个 zip 已经读进来了 (bytes): 返回 Map: 文件名 → { size, read(): Promise<Uint8Array> }; 不是 zip 就抛错
export function readZip(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const dir = locate(b, 0);
  if (dir.zip64 !== null) useZip64(dir, b.subarray(dir.zip64, dir.zip64 + 56));
  return listFiles(b, dir.at, dir.count, (local, compSize, method, name) => async () => {
    if (u32(b, local) !== 0x04034b50) throw new Error(`zip 里的 ${name} 坏了`);
    const start = local + 30 + u16(b, local + 26) + u16(b, local + 28);
    return unpackEntry(b.subarray(start, start + compSize), method, name);
  });
}

// 很大的文件 (几百 MB 的 Anki 卡组): 不整个读进来, 先读末尾的目录, 用到哪个文件再读那一段。
// file 是浏览器的 File / Blob。返回跟 readZip 一样的 Map
export async function readZipFile(file) {
  const readAt = async (at, n) => new Uint8Array(await file.slice(at, at + n).arrayBuffer());
  const tailLen = Math.min(file.size, 22 + 0xffff + 20);
  const dir = locate(await readAt(file.size - tailLen, tailLen), file.size - tailLen);
  if (dir.zip64 !== null) useZip64(dir, await readAt(dir.zip64, 56));
  const b = await readAt(dir.at, dir.size || dir.end - dir.at);
  return listFiles(b, 0, dir.count, (local, compSize, method, name) => async () => {
    const head = await readAt(local, 30);
    if (u32(head, 0) !== 0x04034b50) throw new Error(`zip 里的 ${name} 坏了`);
    const start = local + 30 + u16(head, 26) + u16(head, 28);
    return unpackEntry(await readAt(start, compSize), method, name);
  });
}

// ---- 写 ----
let crcTable = null;
export function crc32(data) {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = crcTable[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// files: [{ name, data: Uint8Array | string }] → Uint8Array (zip 文件)
export function writeZip(files, date = new Date()) {
  const enc = new TextEncoder();
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
  const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  const parts = [];
  const central = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name);
    const data = typeof f.data === 'string' ? enc.encode(f.data) : f.data;
    const crc = crc32(data);
    const head = new Uint8Array(30 + name.length);
    const v = new DataView(head.buffer);
    v.setUint32(0, 0x04034b50, true);
    v.setUint16(4, 20, true);
    v.setUint16(6, 0x0800, true); // 文件名是 UTF-8
    v.setUint16(8, 0, true);
    v.setUint16(10, time, true);
    v.setUint16(12, day, true);
    v.setUint32(14, crc, true);
    v.setUint32(18, data.length, true);
    v.setUint32(22, data.length, true);
    v.setUint16(26, name.length, true);
    head.set(name, 30);
    const cd = new Uint8Array(46 + name.length);
    const w = new DataView(cd.buffer);
    w.setUint32(0, 0x02014b50, true);
    w.setUint16(4, 20, true);
    w.setUint16(6, 20, true);
    w.setUint16(8, 0x0800, true);
    w.setUint16(12, time, true);
    w.setUint16(14, day, true);
    w.setUint32(16, crc, true);
    w.setUint32(20, data.length, true);
    w.setUint32(24, data.length, true);
    w.setUint16(28, name.length, true);
    w.setUint32(42, offset, true);
    cd.set(name, 46);
    parts.push(head, data);
    central.push(cd);
    offset += head.length + data.length;
  }
  const cdSize = central.reduce((n, c) => n + c.length, 0);
  const tail = new Uint8Array(22);
  const t = new DataView(tail.buffer);
  t.setUint32(0, 0x06054b50, true);
  t.setUint16(8, files.length, true);
  t.setUint16(10, files.length, true);
  t.setUint32(12, cdSize, true);
  t.setUint32(16, offset, true);
  const out = new Uint8Array(offset + cdSize + 22);
  let p = 0;
  for (const part of [...parts, ...central, tail]) {
    out.set(part, p);
    p += part.length;
  }
  return out;
}
