// 备份文件: 卡片集 + 图片 + 录音, 一个 .json 文件

import { getMedia, putMedia, usedMediaIds, blobToDataURL, dataURLToBlob } from './media.js';

// 返回 Blob: 一段一段接起来, 不拼成一个大字符串 (图片录音几百 MB 时, 浏览器一个字符串放不下)
export async function exportBackup(store) {
  const head = JSON.stringify({ app: 'wengu', ...store.data });
  const parts = [head.slice(0, -1)];
  let first = true;
  for (const id of new Set(usedMediaIds(store.data))) {
    try {
      const blob = await getMedia(id);
      if (!blob) continue;
      parts.push(`${first ? ',"media":{' : ','}${JSON.stringify(id)}:${JSON.stringify(await blobToDataURL(blob))}`);
      first = false;
    } catch {
      // 读不出来的跳过
    }
  }
  parts.push(first ? '}' : '}}');
  return new Blob(parts, { type: 'application/json' });
}

// 先把图片、录音放回去, 再导入卡片集。返回 { added, replaced }
export async function importBackup(store, text) {
  const raw = JSON.parse(text);
  if (raw && raw.media && typeof raw.media === 'object') {
    for (const [id, url] of Object.entries(raw.media)) {
      if (!/^m_[\w-]+$/.test(id) || typeof url !== 'string' || !/^data:(image|audio)\//.test(url)) continue;
      try {
        await putMedia(await dataURLToBlob(url), id);
      } catch {
        // 坏的跳过
      }
    }
  }
  return store.importBackup(text);
}
