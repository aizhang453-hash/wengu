// 图片和录音存在浏览器的 IndexedDB 里 (比 localStorage 大得多)。
// 卡片上只记一个 id, 比如 card.image = 'm_xxx'。

import { newId } from './store.js';

const DB_NAME = 'wengu-media';
const STORE = 'files';
const KEEP_NEW_MS = 60 * 60 * 1000; // 一小时内放进来的不清 (可能是别的标签页正在编辑, 还没保存)

let dbPromise = null;

function db() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function run(mode, fn) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(req?.result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

// 存一个文件 (Blob), 返回 id
export async function putMedia(blob, id = `m_${newId()}`) {
  await run('readwrite', (s) => s.put({ blob, at: Date.now() }, id));
  return id;
}

// 一下存好几个 (导入 Anki 卡组时几千个): 一次存完比一个一个存快好几倍。返回 id (跟 blobs 一样的顺序)
export async function putMediaMany(blobs) {
  const ids = blobs.map(() => `m_${newId()}`);
  if (!blobs.length) return ids;
  await run('readwrite', (s) => {
    const at = Date.now();
    blobs.forEach((blob, i) => s.put({ blob, at }, ids[i]));
  });
  return ids;
}

export async function getMedia(id) {
  if (!id) return null;
  const rec = await run('readonly', (s) => s.get(id));
  return rec?.blob ?? null;
}

// 本机存着哪些 (id), 一下拿全 (同步时上万个也不用一个一个问)
export async function mediaKeys() {
  return run('readonly', (s) => s.getAllKeys());
}

export async function deleteMedia(id) {
  urls.delete(id);
  await run('readwrite', (s) => s.delete(id));
}

const urls = new Map();

// 给 <img> / <audio> 用的网址, 同一个 id 只做一次
export async function mediaURL(id) {
  if (!id) return null;
  if (urls.has(id)) return urls.get(id);
  try {
    const blob = await getMedia(id);
    if (!blob) return null;
    const url = URL.createObjectURL(blob);
    urls.set(id, url);
    return url;
  } catch {
    return null;
  }
}

export function mediaIdsOf(card) {
  return [card.image, card.termAudio, card.defAudio].filter(Boolean);
}

// 一个卡片集用到的: 卡片上的, 加上标注图的图
export function setMediaIds(set) {
  return [...set.cards.flatMap(mediaIdsOf), set.diagram?.image].filter(Boolean);
}

// 所有用到的图片、录音: 卡片集的, 加上错题集的图片 (同步、备份、清理都看这个)
export function usedMediaIds(data) {
  return [...data.sets.flatMap(setMediaIds), ...(data.mistakes ?? []).flatMap((m) => m.images ?? [])];
}

// 没有卡片 (错题) 用的图片、录音删掉, 省地方
export async function cleanMedia(store) {
  try {
    const used = new Set(usedMediaIds(store.data));
    const d = await db();
    const old = await new Promise((resolve, reject) => {
      const out = [];
      const req = d.transaction(STORE, 'readonly').objectStore(STORE).openCursor();
      req.onsuccess = () => {
        const cur = req.result;
        if (!cur) return resolve(out);
        if (!used.has(cur.key) && Date.now() - (cur.value?.at ?? 0) > KEEP_NEW_MS) out.push(cur.key);
        cur.continue();
      };
      req.onerror = () => reject(req.error);
    });
    for (const id of old) await deleteMedia(id);
    return old.length;
  } catch {
    return 0;
  }
}

// 图片缩小到最长边 max 像素再存, 照片动不动几 MB, 背卡片用不着那么大
export async function shrinkImage(file, max = 1000, small = 0) {
  if (file.size < small) return file; // 本来就小的不用打开看 (导入几千张时省很多时间)
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < 400_000) return file;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const type = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
    const blob = await new Promise((res) => canvas.toBlob(res, type, 0.85));
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file;
  } finally {
    bitmap?.close?.();
  }
}

// 备份用: Blob ↔ 一串字 (data: 网址)
export function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

export async function dataURLToBlob(url) {
  return (await fetch(url)).blob();
}
