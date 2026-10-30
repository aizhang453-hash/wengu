// 打印: 把要打印的东西放进 #print-area, 打印时只印它

import { h, openDialog } from './dom.js';
import { rich, cardImage } from './cardview.js';
import { inApp } from './platform.js';

export function printNode(node) {
  document.getElementById('print-area')?.remove(); // 上一次的还没清掉 (连着点了两次)
  const area = h('div', { id: 'print-area' }, node);
  document.body.append(area);
  document.body.classList.add('print-area-on');
  const done = () => {
    area.remove();
    document.body.classList.remove('print-area-on');
    window.removeEventListener('afterprint', done);
  };
  window.addEventListener('afterprint', done);
  // 等图片读出来再打印
  const imgs = [...area.querySelectorAll('img')];
  Promise.race([Promise.all(imgs.map((img) => (img.complete && img.src ? null : new Promise((r) => img.addEventListener('load', r, { once: true }))))), new Promise((r) => setTimeout(r, 1500))]).then(() => {
    window.print();
    // 有的浏览器不发 afterprint。App 里打印窗口不会挡住网页, 关掉打印窗口时 App 会发 afterprint
    if (!inApp()) setTimeout(done, 1000);
  });
}

// 卡片集: 表格 (词 | 解释), 或者折叠卡片 (沿虚线对折, 一面词一面解释)
export function printSet(set) {
  const go = (layout) => {
    d.close();
    const cards = set.cards;
    const body =
      layout === 'table'
        ? h(
            'table',
            { class: 'print-table' },
            h('thead', {}, h('tr', {}, h('th', {}, '#'), h('th', {}, '词'), h('th', {}, '解释'))),
            h(
              'tbody',
              {},
              cards.map((c, i) => h('tr', {}, h('td', { class: 'pt-num' }, String(i + 1)), h('td', {}, rich(c.term)), h('td', {}, rich(c.def), cardImage(c.image, 'print-img')))),
            ),
          )
        : h(
            'div',
            { class: 'print-fold' },
            cards.map((c) => h('div', { class: 'fold-card' }, h('div', { class: 'fold-side' }, rich(c.term)), h('div', { class: 'fold-side' }, cardImage(c.image, 'print-img'), rich(c.def)))),
          );
    printNode(h('div', {}, h('h1', { class: 'print-title' }, set.title || '未命名卡片集'), h('p', { class: 'print-sub' }, `${cards.length} 张卡片 · 温故`), body));
  };
  const d = openDialog({
    title: '打印卡片集',
    body: [
      h('button', { class: 'goal-option', onclick: () => go('table') }, h('span', { class: 'goal-name' }, '表格'), h('span', { class: 'muted small' }, '一行一张: 左边词, 右边解释。适合对着复习、贴墙上。')),
      h(
        'button',
        { class: 'goal-option', onclick: () => go('fold') },
        h('span', { class: 'goal-name' }, '折叠卡片'),
        h('span', { class: 'muted small' }, '剪下来, 沿中间虚线对折, 一面词一面解释, 做成纸质单词卡。'),
      ),
    ],
  });
}
