// 备份文件: 卡片集 + 图片 + 录音, 一个 .json 文件

import { getMedia, putMedia, mediaIdsOf, blobToDataURL, dataURLToBlob } from './media.js';

export async function exportBackup(store) {
  const data = JSON.parse(store.exportBackup());
  const media = {};
  const ids = new Set(store.data.sets.flatMap((s) => s.cards.flatMap(mediaIdsOf)));
  for (const id of ids) {
    try {
      const blob = await getMedia(id);
      if (blob) media[id] = await blobToDataURL(blob);
    } catch {
      // 读不出来的跳过
    }
  }
  if (Object.keys(media).length) data.media = media;
  return JSON.stringify(data);
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
