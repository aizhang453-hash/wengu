// 学着学着改卡片: 单词卡、学习、测试、复习里点 ✏️, 弹个小窗口改词和解释

import { h, toast, openDialog, icon } from '../dom.js';
import { MARKS, toggleMark } from '../rich.js';

// 小铅笔按钮。onEdit 时打开下面的窗口
export function editButton(onclick, { title = '改这张卡片' } = {}) {
  return h(
    'button',
    {
      class: 'icon-btn edit-card-btn',
      type: 'button',
      title,
      'aria-label': title,
      onclick: (e) => {
        e.stopPropagation(); // 别把单词卡翻过来
        onclick();
      },
    },
    icon('pencil', 18),
  );
}

// 改好了调 onSaved(card); card 会被直接改掉 (各页面拿着的就是这张卡片)
export function editCardDialog({ store, setId, card, onSaved = () => {} }) {
  const keys = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      save();
      return;
    }
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    const k = e.key.toLowerCase();
    const mark = k === 'b' ? MARKS.bold : k === 'i' ? MARKS.italic : k === 'u' ? MARKS.underline : k === 'h' && e.shiftKey ? MARKS.highlight : null;
    if (mark) {
      e.preventDefault();
      toggleMark(e.target, mark);
    }
  };
  const area = (value, label) => h('textarea', { class: 'input', rows: 3, value, 'aria-label': label, onkeydown: keys });
  const termEl = area(card.term, '词');
  const defEl = area(card.def, '解释');
  const hasMedia = card.image || card.termAudio || card.defAudio;

  function save() {
    const term = termEl.value.trim();
    const def = defEl.value.trim();
    if (!term && !def && !card.image) {
      toast('词和解释不能都空着');
      termEl.focus();
      return;
    }
    if (term === card.term && def === card.def) {
      d.close();
      return;
    }
    try {
      store.updateCard(setId, card.id, { term, def });
    } catch {
      toast('存不下了: 浏览器的空间满了');
      return;
    }
    Object.assign(card, { term, def });
    d.close();
    toast('改好了');
    onSaved(card);
  }

  const d = openDialog({
    title: '改这张卡片',
    body: [
      h('label', { class: 'ask-label' }, '词'),
      termEl,
      h('label', { class: 'ask-label' }, '解释'),
      defEl,
      h('p', { class: 'muted small' }, 'Ctrl + B 加粗, Ctrl + I 斜体, Ctrl + Enter 保存。', hasMedia ? '图片和录音要到「编辑」页去改。' : ''),
    ],
    footer: [h('button', { class: 'btn', type: 'button', onclick: () => d.close() }, '取消'), h('button', { class: 'btn primary', type: 'button', onclick: save }, '保存')],
  });
  termEl.focus();
  termEl.setSelectionRange(termEl.value.length, termEl.value.length);
  return d;
}
