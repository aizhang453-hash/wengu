// 分享窗口 (卡片集页上点「分享」) 和打开分享链接后的导入页 (#/share/<..>)

import { h, fill, toast, openDialog } from '../dom.js';
import { encodeShare, decodeShare, shareUrl } from '../share.js';
import { qrSvg } from '../qr.js';
import { makeCard } from '../store.js';
import { putMedia, shrinkImage } from '../media.js';
import { rich } from '../cardview.js';
import { normalizeLang } from '../speech.js';

export async function openShareDialog(set) {
  const code = await encodeShare(set);
  const url = shareUrl(code);
  const hasMedia = set.cards.some((c) => c.image || c.termAudio || c.defAudio);
  const input = h('input', { class: 'input', value: url, readonly: true, 'aria-label': '分享链接', onfocus: (e) => e.target.select() });
  const qr = url.length < 1800 ? qrSvg(url, 200) : null;
  const d = openDialog({
    title: '分享卡片集',
    body: [
      h('p', {}, `把这条链接发给别人 (或者发到自己的手机), 点开就能把「${set.title || '未命名卡片集'}」导入成自己的卡片集。`),
      input,
      h(
        'div',
        { class: 'row' },
        h(
          'button',
          {
            class: 'btn primary',
            onclick: async () => {
              try {
                await navigator.clipboard.writeText(url);
                toast('链接复制好了');
              } catch {
                input.select();
                toast('按 Ctrl+C 复制');
              }
            },
          },
          '复制链接',
        ),
        navigator.share
          ? h('button', { class: 'btn', onclick: () => navigator.share({ title: set.title || '温故卡片集', url }).catch(() => {}) }, '分享到……')
          : null,
      ),
      qr ? h('div', { class: 'qr-box' }, qr, h('p', { class: 'small' }, '也可以用手机扫这个二维码')) : h('p', { class: 'muted small' }, '卡片多, 链接太长, 做不成二维码; 复制链接发过去就行。'),
      hasMedia ? h('p', { class: 'muted small' }, '链接里只有文字, 你自己加的图片和录音带不过去 (太大了)。要连图片一起给, 用首页的「导出备份」。') : null,
      url.length > 8000 ? h('p', { class: 'muted small' }, '链接比较长, 有的聊天软件会截断; 截断了就用「导出备份」。') : null,
    ],
  });
  input.focus();
  return d;
}

// 打开分享链接: 先看看是什么, 再决定要不要导入
export function renderShareImport({ store, go }, code) {
  const root = h('section', { class: 'share-page' }, h('p', { class: 'muted' }, '读取中……'));
  decodeShare(code ?? '').then((data) => {
    if (!data || !data.cards.length) {
      fill(root, h('div', { class: 'empty' }, h('h1', {}, '这条分享链接坏了'), h('p', { class: 'muted' }, '可能复制的时候少了一截。'), h('a', { class: 'btn primary', href: '#/' }, '回首页')));
      return;
    }
    const withImages = data.cards.filter((c) => c.imageUrl).length;
    const btn = h(
      'button',
      {
        class: 'btn primary',
        onclick: async () => {
          btn.disabled = true;
          btn.textContent = withImages ? '导入中 (拿图片)……' : '导入中……';
          const cards = [];
          let imageFailed = 0;
          for (const c of data.cards) {
            let image = '';
            if (c.imageUrl) {
              try {
                const res = await fetch(c.imageUrl);
                if (!res.ok) throw new Error();
                image = await putMedia(await shrinkImage(await res.blob()));
              } catch {
                imageFailed++;
              }
            }
            cards.push(makeCard(c.term, c.def, { image }));
          }
          try {
            const set = store.putSet({ title: data.title || '分享的卡片集', description: data.description, termLang: normalizeLang(data.termLang), defLang: normalizeLang(data.defLang), cards });
            toast(imageFailed ? `导入好了 (${imageFailed} 张图片拿不到)` : '导入好了');
            go(`#/set/${encodeURIComponent(set.id)}`);
          } catch {
            toast('存不下了: 浏览器的空间满了');
            btn.disabled = false;
          }
        },
      },
      `导入到我的卡片集 (${data.cards.length} 张)`,
    );
    fill(root, 
      h('h1', {}, data.title || '分享的卡片集'),
      data.description ? h('p', { class: 'description' }, data.description) : null,
      h('p', { class: 'muted' }, `${data.from === 'quizlet' ? '从 Quizlet 读到的卡片集' : '别人分享给你的卡片集'}, ${data.cards.length} 张卡片${withImages ? `, ${withImages} 张带图片` : ''}。导入以后就是你自己的, 可以随便改。`),
      h('div', { class: 'row' }, btn, h('a', { class: 'btn', href: '#/' }, '不要')),
      h('h2', {}, '前面几张'),
      h(
        'ul',
        { class: 'card-list' },
        data.cards.slice(0, 10).map((c) => h('li', { class: 'card-row' }, h('div', { class: 'card-side term' }, rich(c.term, { class: 'text' })), h('div', { class: 'card-side def' }, rich(c.def, { class: 'text' })))),
      ),
      data.cards.length > 10 ? h('p', { class: 'muted small' }, `还有 ${data.cards.length - 10} 张……`) : null,
    );
  });
  return { title: '导入分享的卡片集', el: root };
}
