// 「复制给 AI 的话」按钮和「看看这段话」(拍照让 AI 记错题、做卡片都用)。
// 复制不了 (老浏览器、没给权限) 就把这段话打开、选好, 自己复制。返回 { button, details }

import { h, toast } from '../dom.js';

export function promptControls(prompt, { primary = true } = {}) {
  const box = h('textarea', { class: 'input ai-prompt', rows: 12, readonly: true, 'aria-label': '给 AI 的话' });
  box.value = prompt;
  const details = h('details', { class: 'ai-prompt-box' }, h('summary', {}, '看看这段话'), box);
  const button = h(
    'button',
    {
      class: `btn${primary ? ' primary' : ''}`,
      type: 'button',
      onclick: async () => {
        try {
          await navigator.clipboard.writeText(prompt);
          toast('复制好了: 去 AI 那儿粘贴, 再发照片');
        } catch {
          details.open = true;
          box.focus();
          box.select();
          toast('复制不了, 下面的字选好了, 自己复制一下');
        }
      },
    },
    '📋 复制给 AI 的话',
  );
  return { button, details };
}
