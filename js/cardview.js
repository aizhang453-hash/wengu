// 各页面显示卡片内容用: 带格式的字、图片、朗读按钮

import { h } from './dom.js';
import { richNodes } from './rich.js';
import { mediaURL } from './media.js';
import { sayCard, canSay } from './speech.js';

// 带格式的字 (加粗、斜体、下划线、高亮)
export function rich(text, props = {}) {
  return h('span', props, ...richNodes(text));
}

// 卡片的图片, 读出来以前先占着位置
export function cardImage(id, cls = 'card-img') {
  if (!id) return null;
  const img = h('img', { class: cls, alt: '卡片上的图片', loading: 'lazy', decoding: 'async' });
  mediaURL(id).then((url) => {
    if (url) img.src = url;
    else img.remove();
  });
  return img;
}

// 念卡片某一面的按钮 (有录音放录音)
export function sayButton(card, side, set, extra = {}) {
  if (!canSay(card, side)) return null;
  const custom = side === 'term' ? card.termAudio : card.defAudio;
  return h(
    'button',
    {
      class: 'icon-btn',
      title: custom ? '播放录音' : '朗读',
      'aria-label': custom ? '播放录音' : '朗读',
      ...extra,
      onclick: (e) => {
        e.stopPropagation();
        sayCard(card, side, set);
      },
    },
    custom ? '🎙' : '🔊',
  );
}
