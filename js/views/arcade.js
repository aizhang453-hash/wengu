// 游戏厅: 学累了玩一会儿的正经游戏 (拿卡片集玩的在「学习游戏」)。现在有弹珠台, 以后再加

import { h } from '../dom.js';
import { ARCADE, bestOf } from '../arcade.js';

export function renderArcade({ store }) {
  const cards = ARCADE.map((g) => {
    const best = bestOf(store.data.arcade, g.key);
    const top = store.data.arcade?.[g.key]?.top ?? [];
    return h(
      'a',
      { class: 'arcade-card', href: g.href },
      h('div', { class: `arcade-art ${g.key}`, 'aria-hidden': 'true' }, h('span', { class: 'ball' }), h('span', { class: 'flip l' }), h('span', { class: 'flip r' }), h('span', { class: 'bump a' }), h('span', { class: 'bump b' }), h('span', { class: 'bump c' })),
      h('div', { class: 'arcade-text' }, h('strong', {}, g.name), h('span', { class: 'muted small' }, g.hint), h('span', { class: 'small' }, best ? `最高 ${best.toLocaleString('en-US')} · 玩过的前 ${top.length} 名记着` : '还没玩过')),
      h('span', { class: 'btn primary' }, '开始'),
    );
  });
  return {
    title: '游戏厅',
    el: h(
      'section',
      { class: 'arcade-page' },
      h('a', { class: 'back', href: '#/' }, '← 主页'),
      h('h1', {}, '🕹 游戏厅'),
      h('p', { class: 'muted' }, '学累了玩一会儿。拿卡片集玩的在 ', h('a', { href: '#/games' }, '学习游戏'), ' 里。'),
      h('div', { class: 'arcade-list' }, cards),
      h('p', { class: 'muted small' }, '更多游戏以后再加。成绩跟着多设备同步。'),
    ),
  };
}
