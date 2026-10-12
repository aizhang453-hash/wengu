// 一个卡片集: 选学习方式, 看所有卡片

import { h, toast, download } from '../dom.js';
import { formatCards } from '../parse.js';
import { speak, canSpeak } from '../speech.js';

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
    const known = new Set(set.known);
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
              h(
                'div',
                { class: 'card-side term' },
                h('span', { class: 'text' }, card.term),
                speakBtn(card.term, set.termLang),
              ),
              h(
                'div',
                { class: 'card-side def' },
                h('span', { class: 'text' }, card.def),
                speakBtn(card.def, set.defLang),
              ),
              h(
                'div',
                { class: 'card-row-tools' },
                known.has(card.id) ? h('span', { class: 'badge', title: '单词卡里标过「会了」' }, '会了') : null,
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
    mode('学习', '选择题加打字, 答对为止', null, false),
    mode('测试', '出一套卷子打分', null, false),
    mode('配对', '把词和解释连起来, 计时', null, false),
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
          const text = formatCards(set.cards);
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

  drawList();

  return {
    title: set.title || '未命名卡片集',
    el: h(
      'section',
      {},
      h('a', { class: 'back', href: '#/' }, '← 我的卡片集'),
      h('h1', {}, set.title || '未命名卡片集'),
      set.description ? h('p', { class: 'description' }, set.description) : null,
      h('p', { class: 'muted' }, `${total} 张卡片 · 会了 ${set.known.length} 张`),
      modes,
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

function mode(name, hint, href, enabled) {
  if (!enabled) {
    return h(
      'div',
      { class: 'mode disabled', 'aria-disabled': 'true' },
      h('span', { class: 'mode-name' }, name),
      h('span', { class: 'muted small' }, href === null ? '下一块做' : '先加卡片'),
    );
  }
  return h(
    'a',
    { class: 'mode', href },
    h('span', { class: 'mode-name' }, name),
    h('span', { class: 'muted small' }, hint),
  );
}

export function speakBtn(text, lang) {
  if (!canSpeak() || !text.trim()) return null;
  return h(
    'button',
    {
      class: 'icon-btn',
      title: '朗读',
      'aria-label': '朗读',
      onclick: (e) => {
        e.stopPropagation();
        speak(text, lang);
      },
    },
    '🔊',
  );
}
