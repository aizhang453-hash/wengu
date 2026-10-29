// 「从 Quizlet 一键搬」的说明页: 把书签小工具装到浏览器上

import { h, toast } from '../dom.js';
import { bookmarkletCode } from '../quizlet.js';
import { inApp, siteBase } from '../platform.js';

export function renderQuizlet() {
  const code = bookmarkletCode(siteBase());
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      toast('书签代码已复制');
    } catch {
      box.open = true;
      area.select();
      toast('无法自动复制，请手动复制下方代码');
    }
  };
  const area = h('textarea', { class: 'input mono', rows: 4, readonly: true, value: code, 'aria-label': '书签代码', onfocus: (e) => e.target.select() });
  const box = h('details', { class: 'howto' }, h('summary', {}, '查看书签代码'), h('p', { class: 'muted small' }, '书签仅读取当前页面的卡片并打开温故的导入页，不会访问你的 Quizlet 账号。'), area);
  const el = h(
    'section',
    { class: 'quizlet-page' },
    h('a', { class: 'back', href: '#/' }, '← 首页'),
    h('h1', {}, 'Quizlet 一键导入'),
    h('p', {}, '添加一个书签后，在 Quizlet 卡片集页面点击该书签，即可将词语、释义和图片导入温故。'),
    // 书签只能装在浏览器里, 点了打开的是网页版的导入页 (那里有「在 App 中导入」)
    inApp() ? h('p', { class: 'muted small' }, '书签需添加到浏览器中。点击书签后会打开网页版的导入页，再点「在 App 中导入」即可导入到 App。') : null,
    h('h2', {}, '电脑（Chrome、Edge、Firefox、Safari）'),
    h(
      'ol',
      { class: 'steps' },
      h('li', {}, '显示书签栏：按 ', h('kbd', {}, 'Ctrl'), ' + ', h('kbd', {}, 'Shift'), ' + ', h('kbd', {}, 'B'), '（Mac 为 ', h('kbd', {}, '⌘'), ' + ', h('kbd', {}, 'Shift'), ' + ', h('kbd', {}, 'B'), '）'),
      h(
        'li',
        {},
        '将此按钮', h('strong', {}, '拖到书签栏'), '：',
        h(
          'a',
          {
            class: 'btn primary bookmarklet',
            href: code,
            title: '拖到书签栏',
            onclick: (e) => {
              e.preventDefault();
              toast('请将按钮拖到书签栏');
            },
          },
          '导入温故',
        ),
      ),
      h('li', {}, '在 Quizlet 打开卡片集页面，点击书签栏中的「导入温故」'),
      h('li', {}, '在打开的温故页面中核对卡片，点击「导入」'),
    ),
    h('h2', {}, '手机（iPhone Safari、Android Chrome）'),
    h('p', { class: 'muted small' }, '手机需手动创建书签：'),
    h(
      'ol',
      { class: 'steps' },
      h('li', {}, h('button', { class: 'btn', type: 'button', onclick: copy }, '复制书签代码')),
      h('li', {}, '将任意网页（如本页）加入书签，名称改为「导入温故」，将网址替换为复制的代码并保存'),
      h('li', {}, '在浏览器（非 Quizlet App）中打开卡片集。iPhone：在书签中点击「导入温故」；Android：在地址栏输入「导入温故」并选择该书签'),
    ),
    h('h2', {}, '说明'),
    h(
      'ul',
      { class: 'notes' },
      h('li', {}, '可导入 Quizlet 上任何可见的卡片集，无需会员'),
      h('li', {}, '图片会尽量一并导入；录音无法导入，温故可自动朗读'),
      h('li', {}, '若 Quizlet 页面改版导致书签失效，可改用「导出 › 复制文字」后粘贴到「导入」中'),
    ),
    box,
  );
  return { title: '从 Quizlet 一键搬', el };
}
