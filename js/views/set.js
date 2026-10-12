// 一个卡片集: 选学习方式, 看所有卡片

import { h, toast, download, openDialog, switchRow } from '../dom.js';
import { formatCards } from '../parse.js';
import { pickDistinct, formatTime } from '../games.js';
import { stripMarks } from '../rich.js';
import { rich, cardImage, sayButton } from '../cardview.js';
import { printSet } from '../print.js';
import { newFolder } from './folder.js';
import { dueCards } from '../srs.js';

export function renderSet({ store, go }, id) {
  const set = store.getSet(id);
  if (!set) {
    return {
      title: '找不到',
      el: h(
        'section',
        { class: 'empty' },
        h('h1', {}, '找不到这个卡片集'),
        h('a', { class: 'btn primary', href: '#/' }, '回首页'),
      ),
    };
  }
  const base = `#/set/${encodeURIComponent(set.id)}`;
  let onlyStarred = false;

  const listEl = h('ul', { class: 'card-list' });
  const filterAll = h('button', { class: 'chip on', onclick: () => setFilter(false) }, '全部');
  const filterStar = h('button', { class: 'chip', onclick: () => setFilter(true) }, '');

  function setFilter(starred) {
    onlyStarred = starred;
    filterAll.classList.toggle('on', !starred);
    filterStar.classList.toggle('on', starred);
    drawList();
  }

  function drawList() {
    const starred = new Set(set.starred);
    filterStar.textContent = `★ 星标 (${starred.size})`;
    const cards = onlyStarred ? set.cards.filter((c) => starred.has(c.id)) : set.cards;
    listEl.replaceChildren(
      ...(cards.length
        ? cards.map((card) => {
            const star = h(
              'button',
              {
                class: `icon-btn star${starred.has(card.id) ? ' on' : ''}`,
                title: '星标',
                'aria-label': '星标',
                'aria-pressed': String(starred.has(card.id)),
                onclick: () => {
                  store.toggleStar(set.id, card.id);
                  drawList();
                },
              },
              '★',
            );
            return h(
              'li',
              { class: 'card-row' },
              h('div', { class: 'card-side term' }, rich(card.term, { class: 'text' }), sayButton(card, 'term', set)),
              h(
                'div',
                { class: 'card-side def' },
                h('span', { class: 'def-body' }, rich(card.def, { class: 'text' }), cardImage(card.image, 'card-thumb')),
                sayButton(card, 'def', set),
              ),
              h(
                'div',
                { class: 'card-row-tools' },
                levelBadge(set.learn[card.id]),
                star,
              ),
            );
          })
        : [h('li', { class: 'muted empty-note' }, onlyStarred ? '还没有加星标的卡片。点卡片右边的 ★ 加星标。' : '还没有卡片。')]),
    );
  }

  const total = set.cards.length;
  const modes = h(
    'div',
    { class: 'modes' },
    mode('单词卡', '翻面背, 标记会不会', `${base}/cards`, total > 0),
    mode('学习', '选择题加打字, 答对为止', `${base}/learn`, total > 0),
    mode('测试', '出一套卷子打分', `${base}/test`, total > 0),
  );

  // 游戏 (Quizlet 的「通过有趣的游戏掌握所学内容」)
  const canPlay = pickDistinct(set.cards, 2).length >= 2;
  const games = h(
    'div',
    { class: 'modes games' },
    mode('🧩 配对', set.best.match ? `最好 ${formatTime(set.best.match)}` : '把词和解释配起来, 比谁快', `${base}/match`, canPlay, '至少要两张不一样的卡片'),
    mode('☄️ 打陨石', set.best.blast ? `最高 ${set.best.blast} 分` : '打中写着对的答案的陨石', `${base}/blast`, canPlay, '至少要两张不一样的卡片'),
  );

  const actions = h(
    'div',
    { class: 'row' },
    h('a', { class: 'btn', href: `${base}/edit` }, '编辑'),
    h(
      'button',
      {
        class: 'btn',
        disabled: total === 0,
        onclick: async () => {
          // 格式记号去掉, 粘回 Quizlet 才干净
          const text = formatCards(set.cards.map((c) => ({ term: stripMarks(c.term), def: stripMarks(c.def) })));
          try {
            await navigator.clipboard.writeText(text);
            toast('复制好了 (Tab 和换行隔开, 能直接粘回 Quizlet)');
          } catch {
            download(`${set.title || '卡片集'}.txt`, text, 'text/plain;charset=utf-8');
          }
        },
      },
      '复制成文字',
    ),
    h('button', { class: 'btn', disabled: total === 0, onclick: () => printSet(set) }, '打印'),
    h('button', { class: 'btn', onclick: () => pickFolders() }, '📁 加到文件夹'),
    h(
      'button',
      {
        class: 'btn',
        disabled: set.known.length === 0,
        onclick: () => {
          if (!confirm('把「会了」的记录都清掉, 从头背?')) return;
          store.resetKnown(set.id);
          go(base);
        },
      },
      '清掉进度',
    ),
    h(
      'button',
      {
        class: 'btn danger',
        onclick: () => {
          if (!confirm(`删掉「${set.title || '未命名卡片集'}」? 删了就找不回来了。`)) return;
          store.deleteSet(set.id);
          toast('删掉了');
          go('#/');
        },
      },
      '删除',
    ),
  );

  // 放进哪些文件夹 (可以放进好几个)
  function pickFolders() {
    const folders = store.allFolders();
    const d = openDialog({
      title: '加到文件夹',
      body: [
        folders.length
          ? folders.map((f) =>
              switchRow({
                label: `📁 ${f.name || '未命名文件夹'}`,
                desc: `${f.setIds.length} 个卡片集`,
                checked: f.setIds.includes(set.id),
                onchange: (v) => store.setInFolder(f.id, set.id, v),
              }),
            )
          : h('p', { class: 'muted' }, '还没有文件夹。'),
        h(
          'button',
          {
            class: 'btn small',
            onclick: () => {
              d.close();
              newFolder(store, (f) => {
                store.setInFolder(f.id, set.id, true);
                toast(`放进「${f.name}」了`);
                go(base);
              });
            },
          },
          '＋ 新建文件夹',
        ),
      ],
      // 关掉时重画这一页 (显示在哪些文件夹里); 已经换到别的页就不管了
      onClose: () => {
        if (location.hash === base) go(base);
      },
    });
  }

  const inFolders = store.foldersOf(set.id);
  const due = dueCards([set]).length;

  drawList();

  return {
    title: set.title || '未命名卡片集',
    el: h(
      'section',
      {},
      h('a', { class: 'back', href: '#/' }, '← 我的卡片集'),
      h('h1', {}, set.title || '未命名卡片集'),
      set.description ? h('p', { class: 'description' }, set.description) : null,
      h('p', { class: 'muted' }, progressLine(set)),
      inFolders.length
        ? h(
            'p',
            { class: 'in-folders small' },
            '在文件夹: ',
            inFolders.map((f, i) => [i ? '、' : '', h('a', { href: `#/folder/${encodeURIComponent(f.id)}` }, `📁 ${f.name || '未命名文件夹'}`)]),
          )
        : null,
      due ? h('a', { class: 'due-chip', href: `#/review/${encodeURIComponent(set.id)}` }, `🔁 该复习 ${due} 张 · 去复习`) : null,
      modes,
      h('h2', { class: 'games-title' }, '用游戏来记'),
      games,
      actions,
      h(
        'div',
        { class: 'list-head' },
        h('h2', {}, `卡片 (${total})`),
        h('div', { class: 'row' }, filterAll, filterStar),
      ),
      listEl,
    ),
  };
}

function progressLine(set) {
  const total = set.cards.length;
  const levels = Object.values(set.learn);
  const mastered = levels.filter((l) => l === 2).length;
  const learning = levels.filter((l) => l === 1).length;
  const parts = [`${total} 张卡片`];
  if (mastered || learning) parts.push(`学习: 掌握 ${mastered} 张, 认得 ${learning} 张`);
  if (set.known.length) parts.push(`单词卡: 会了 ${set.known.length} 张`);
  return parts.join(' · ');
}

function levelBadge(level) {
  if (level === 2) return h('span', { class: 'badge good', title: '学习模式里掌握了' }, '掌握了');
  if (level === 1) return h('span', { class: 'badge mid', title: '学习模式里认得了, 还要会写' }, '认得了');
  return null;
}

function mode(name, hint, href, enabled, disabledHint = '先加卡片') {
  if (!enabled) {
    return h(
      'div',
      { class: 'mode disabled', 'aria-disabled': 'true' },
      h('span', { class: 'mode-name' }, name),
      h('span', { class: 'muted small' }, disabledHint),
    );
  }
  return h(
    'a',
    { class: 'mode', href },
    h('span', { class: 'mode-name' }, name),
    h('span', { class: 'muted small' }, hint),
  );
}
