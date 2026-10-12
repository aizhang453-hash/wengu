// 「从 Quizlet 一键搬」的说明页: 把书签小工具装到浏览器上

import { h, toast } from '../dom.js';
import { bookmarkletCode } from '../quizlet.js';

export function renderQuizlet() {
  const code = bookmarkletCode(`${location.origin}${location.pathname}`);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      toast('书签代码复制好了');
    } catch {
      box.open = true;
      area.select();
      toast('自动复制不了, 下面的框里全选复制');
    }
  };
  const area = h('textarea', { class: 'input mono', rows: 4, readonly: true, value: code, 'aria-label': '书签代码', onfocus: (e) => e.target.select() });
  const box = h('details', { class: 'howto' }, h('summary', {}, '看看书签代码'), h('p', { class: 'muted small' }, '只做两件事: 读出这一页的卡片, 打开温故的导入页。不会碰你的 Quizlet 账号。'), area);
  const el = h(
    'section',
    { class: 'quizlet-page' },
    h('a', { class: 'back', href: '#/' }, '← 首页'),
    h('h1', {}, '从 Quizlet 一键搬过来'),
    h('p', {}, '装一个书签小工具。以后在 Quizlet 上打开卡片集, 点一下这个书签, 整个卡片集 (词、解释、网上的图片) 就搬进温故, 一张张复制粘贴都省了。'),
    h('h2', {}, '电脑上 (Chrome、Edge、Firefox、Safari)'),
    h(
      'ol',
      { class: 'steps' },
      h('li', {}, '先让书签栏显示出来: 按 ', h('kbd', {}, 'Ctrl'), ' + ', h('kbd', {}, 'Shift'), ' + ', h('kbd', {}, 'B'), ' (苹果电脑 ', h('kbd', {}, '⌘'), ' + ', h('kbd', {}, 'Shift'), ' + ', h('kbd', {}, 'B'), ')'),
      h(
        'li',
        {},
        '把这个按钮', h('strong', {}, '拖到书签栏上'), ': ',
        h(
          'a',
          {
            class: 'btn primary bookmarklet',
            href: code,
            title: '拖到书签栏上',
            onclick: (e) => {
              e.preventDefault();
              toast('别点它, 把它拖到书签栏上');
            },
          },
          '搬到温故',
        ),
      ),
      h('li', {}, '在 Quizlet 上打开一个卡片集 (能看到所有词的那一页), 点书签栏上的「搬到温故」'),
      h('li', {}, '温故会打开一个新页面, 看看卡片对不对, 点「导入到我的卡片集」'),
    ),
    h('h2', {}, '手机上 (iPhone 的 Safari、安卓的 Chrome)'),
    h('p', { class: 'muted small' }, '手机上不能拖, 要手动建一个书签:'),
    h(
      'ol',
      { class: 'steps' },
      h('li', {}, h('button', { class: 'btn', type: 'button', onclick: copy }, '复制书签代码')),
      h('li', {}, '随便把一个网页 (比如这一页) 加到书签 / 收藏, 名字改成「搬到温故」, 把网址那一栏清空, 粘贴刚才复制的代码, 存好'),
      h('li', {}, '用浏览器 (不是 Quizlet App) 打开 Quizlet 的卡片集。iPhone: 打开书签, 点「搬到温故」; 安卓: 在地址栏打「搬到温故」, 点下面出来的那个书签'),
    ),
    h('h2', {}, '说明'),
    h(
      'ul',
      { class: 'notes' },
      h('li', {}, '你在 Quizlet 上能看到的卡片集都能搬, 不用是自己做的, 也不用开会员'),
      h('li', {}, '图片: Quizlet 让拿的话会一起搬过来, 拿不到的会告诉你几张。录音搬不过来, 温故自己能念'),
      h('li', {}, 'Quizlet 改了网页, 书签可能会找不到卡片 (会提示)。那时候还能用老办法: 自己做的卡片集在 Quizlet 上「导出」→「复制文字」, 粘贴到「导入」里'),
    ),
    box,
  );
  return { title: '从 Quizlet 一键搬', el };
}
