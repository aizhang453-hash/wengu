// 分享窗口 (卡片集页上点「分享」) 和打开分享链接后的导入页 (#/share/<..>)

import { h, fill, toast, openDialog } from '../dom.js';
import { encodeShare, decodeShare, shareUrl } from '../share.js';
import { qrSvg } from '../qr.js';
import { makeCard, newId } from '../store.js';
import { quizToMistakes } from '../quiz.js';
import { putMedia, shrinkImage } from '../media.js';
import { rich } from '../cardview.js';
import { normalizeLang } from '../speech.js';
import { onIosWeb, appLink } from '../platform.js';

export async function openShareDialog(set) {
  const code = await encodeShare(set);
  const url = shareUrl(code);
  const hasMedia = set.cards.some((c) => c.image || c.termAudio || c.defAudio);
  const input = h('input', { class: 'input', value: url, readonly: true, 'aria-label': '分享链接', onfocus: (e) => e.target.select() });
  const qr = url.length < 1800 ? qrSvg(url, 200) : null;
  const d = openDialog({
    title: '分享卡片集',
    body: [
      h('p', {}, `打开此链接即可导入「${set.title || '未命名卡片集'}」。`),
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
                toast('链接已复制');
              } catch {
                input.select();
                toast('请按 Ctrl+C 复制');
              }
            },
          },
          '复制链接',
        ),
        navigator.share
          ? h('button', { class: 'btn', onclick: () => navigator.share({ title: set.title || '温故卡片集', url }).catch(() => {}) }, '分享')
          : null,
      ),
      qr ? h('div', { class: 'qr-box' }, qr, h('p', { class: 'small' }, '也可用手机扫描二维码')) : h('p', { class: 'muted small' }, '链接过长，无法生成二维码，请复制链接。'),
      hasMedia ? h('p', { class: 'muted small' }, '链接仅包含文字，不含自行添加的图片和录音；如需完整迁移，请使用「设置 › 备份」。') : null,
      url.length > 8000 ? h('p', { class: 'muted small' }, '链接较长，部分聊天软件可能截断。') : null,
    ],
  });
  input.focus();
  return d;
}

// 打开分享链接: 先看看是什么, 再决定要不要导入
export function renderShareImport({ store, go }, code) {
  const root = h('section', { class: 'share-page' }, h('p', { class: 'muted' }, '正在读取……'));
  decodeShare(code ?? '').then((data) => {
    if (!data || !data.cards.length) {
      fill(root, h('div', { class: 'empty' }, h('h1', {}, '链接无效'), h('p', { class: 'muted' }, '链接可能不完整，请重新复制。'), h('a', { class: 'btn primary', href: '#/' }, '返回首页')));
      return;
    }
    const withImages = data.cards.filter((c) => c.imageUrl).length;
    // 老的题目集的分享链接: 题目集并进了错题集, 导入成错题
    const quiz = data.kind === 'quiz';
    const unit = quiz ? '道题' : '张卡片';
    const btn = h(
      'button',
      {
        class: 'btn primary',
        onclick: async () => {
          btn.disabled = true;
          btn.textContent = '正在导入……';
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
            cards.push(makeCard(c.term, c.def, { image, ...(c.q ? { q: c.q } : {}) }));
          }
          const note = imageFailed ? `，${imageFailed} 张图片无法获取` : '';
          try {
            if (quiz) {
              const list = quizToMistakes({ id: newId(), title: data.title, cards });
              store.transaction(() => list.forEach((m) => store.putMistake(m)));
              toast(`已导入 ${list.length} 道题${note}`);
              return go('#/mistakes');
            }
            const set = store.putSet({ title: data.title || '分享的卡片集', description: data.description, termLang: normalizeLang(data.termLang), defLang: normalizeLang(data.defLang), cards });
            toast(`导入完成${note}`);
            go(`#/set/${encodeURIComponent(set.id)}`);
          } catch {
            toast('存储空间已满，无法导入');
            btn.disabled = false;
          }
        },
      },
      quiz ? `导入到错题集（${data.cards.length} 道）` : `导入（${data.cards.length} 张）`,
    );
    fill(
      root,
      h('h1', {}, data.title || (quiz ? '分享的题目' : '分享的卡片集')),
      data.description ? h('p', { class: 'description' }, data.description) : null,
      h('p', { class: 'muted' }, `${data.from === 'quizlet' ? '来自 Quizlet' : '他人分享'} · ${data.cards.length} ${unit}${withImages ? ` · ${withImages} 张图片` : ''}`),
      h('div', { class: 'row' }, btn, h('a', { class: 'btn', href: '#/' }, '取消')),
      // 别人发来的链接只会在浏览器里打开; 装了 App 的, 从这里导入到 App
      onIosWeb() ? h('p', { class: 'muted small' }, '在 iPhone / iPad 上装了温故 App？', h('a', { href: appLink(`#/share/${code}`) }, '在 App 中导入')) : null,
      h('h2', {}, '预览'),
      h(
        'ul',
        { class: 'card-list' },
        data.cards.slice(0, 10).map((c) => h('li', { class: 'card-row' }, h('div', { class: 'card-side term' }, rich(c.term, { class: 'text' })), h('div', { class: 'card-side def' }, rich(c.def, { class: 'text' })))),
      ),
      data.cards.length > 10 ? h('p', { class: 'muted small' }, `另有 ${data.cards.length - 10} ${quiz ? '道' : '张'}`) : null,
    );
  });
  return { title: '导入分享', el: root };
}
