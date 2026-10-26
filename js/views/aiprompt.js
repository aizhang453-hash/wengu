// 「复制提示词」按钮和「查看提示词」(拍照让 AI 记错题、做卡片都用)。
// 复制不了 (老浏览器、没给权限) 就把这段话打开、选好, 自己复制。返回 { button, details }

import { h, toast, icon } from '../dom.js';

export function promptControls(prompt, { primary = true } = {}) {
  const box = h('textarea', { class: 'input ai-prompt', rows: 12, readonly: true, 'aria-label': '给 AI 的话' });
  box.value = prompt;
  const details = h('details', { class: 'ai-prompt-box' }, h('summary', {}, '查看提示词'), box);
  const button = h(
    'button',
    {
      class: `btn${primary ? ' primary' : ''}`,
      type: 'button',
      onclick: async () => {
        try {
          await navigator.clipboard.writeText(prompt);
          toast('已复制，请粘贴到 AI 对话中并发送照片');
        } catch {
          details.open = true;
          box.focus();
          box.select();
          toast('无法自动复制，请手动复制下方内容');
        }
      },
    },
    icon('copy', 16),
    '复制提示词',
  );
  return { button, details };
}
