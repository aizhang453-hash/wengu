// 在后台算参数 (不卡网页): 收到 { histories, current }, 一边算一边说 { progress: 0–1 }, 算完 { result }, 出错 { error }

import { optimize } from './optimize.js';

self.onmessage = ({ data }) => {
  try {
    let last = 0;
    const onProgress = (p) => {
      if (p - last < 0.02 && p < 1) return;
      last = p;
      self.postMessage({ progress: p });
    };
    self.postMessage({ result: optimize(data.histories, { current: data.current, onProgress }) });
  } catch (e) {
    self.postMessage({ error: String(e?.message ?? e) });
  }
};
