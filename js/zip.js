// 读写 zip。Excel 的 .xlsx、Anki 的 .apkg 其实都是 zip。
// 读: 支持「不压缩」和「deflate 压缩」(用浏览器自带的解压); 写: 只写不压缩的 (够用, 也简单)。

const u16 = (b, o) => b[o] | (b[o + 1] << 8);
const u32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
const u64 = (b, o) => u32(b, o) + u32(b, o + 4) * 2 ** 32;

export async function inflateRaw(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// 返回 Map: 文件名 → { size, read(): Promise<Uint8Array> }; 不是 zip 就抛错
export function readZip(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  // 文件末尾的「目录在哪」(最多还跟着 64KB 注释)
  let end = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 22 - 0xffff); i--) {
    if (u32(b, i) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new Error('不是 zip 文件');
  let count = u16(b, end + 10);
  let at = u32(b, end + 16);
  // zip64 (很大的文件) 的目录位置在另一个地方
  if ((at === 0xffffffff || count === 0xffff) && end >= 20 && u32(b, end - 20) === 0x07064b50) {
    const z = u64(b, end - 12);
    if (u32(b, z) === 0x06064b50) {
      count = u64(b, z + 32);
      at = u64(b, z + 48);
    }
  }
  const files = new Map();
  const dec = new TextDecoder();
  for (let n = 0; n < count && u32(b, at) === 0x02014b50; n++) {
    const method = u16(b, at + 10);
    let compSize = u32(b, at + 20);
    let size = u32(b, at + 24);
    const nameLen = u16(b, at + 28);
    const extraLen = u16(b, at + 30);
    const commentLen = u16(b, at + 32);
    let local = u32(b, at + 42);
    const name = dec.decode(b.subarray(at + 46, at + 46 + nameLen));
    // zip64 的大小、位置放在 extra 里
    for (let e = at + 46 + nameLen; e + 4 <= at + 46 + nameLen + extraLen; ) {
      const id = u16(b, e);
      const len = u16(b, e + 2);
      if (id === 1) {
        let p = e + 4;
        if (size === 0xffffffff) (size = u64(b, p)), (p += 8);
        if (compSize === 0xffffffff) (compSize = u64(b, p)), (p += 8);
        if (local === 0xffffffff) local = u64(b, p);
      }
      e += 4 + len;
    }
    at += 46 + nameLen + extraLen + commentLen;
    if (name.endsWith('/')) continue; // 文件夹
    files.set(name, {
      size,
      async read() {
        if (u32(b, local) !== 0x04034b50) throw new Error(`zip 里的 ${name} 坏了`);
        const start = local + 30 + u16(b, local + 26) + u16(b, local + 28);
        const data = b.subarray(start, start + compSize);
        if (method === 0) return data;
        if (method === 8) return inflateRaw(data);
        throw new Error(`zip 里的 ${name} 用了不认识的压缩方式`);
      },
    });
  }
  return files;
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
