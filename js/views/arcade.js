// 游戏厅: 学累了玩一会儿的正经游戏 (拿卡片集玩的在「学习游戏」)。现在有弹珠台和人生草稿, 以后再加

import { h } from '../dom.js';
import { ARCADE, bestOf, progressOf } from '../arcade.js';

// 成绩那一行: 弹珠台的经典模式单独记着, 有的话也写上; 人生草稿写写过几稿
function bestLine(arcade, key, best, top) {
  if (key === 'draft') {
    const runs = progressOf(arcade, 'draft').runs;
    return best ? `最高 ${best.toLocaleString('en-US')} 分 · 已写 ${runs} 稿` : runs ? `已写 ${runs} 稿` : '还没写过';
  }
  const classic = bestOf(arcade, `${key}-classic`);
  if (!best && !classic) return '还没玩过';
  const parts = [];
  if (best) parts.push(`${classic ? '远航' : '最高'} ${best.toLocaleString('en-US')}`);
  if (classic) parts.push(`经典 ${classic.toLocaleString('en-US')}`);
  return `${parts.join(' · ')}${best ? ` · 玩过的前 ${top.length} 名记着` : ''}`;
}

// 卡片左边的小图: 弹珠台画个台子, 人生草稿画张稿纸
function art(key) {
  if (key === 'draft') return h('div', { class: 'arcade-art draft', 'aria-hidden': 'true' }, h('span', { class: 'ln a' }), h('span', { class: 'ln b' }), h('span', { class: 'ln c' }), h('span', { class: 'ln d' }), h('span', { class: 'stamp' }, '稿'));
  return h('div', { class: `arcade-art ${key}`, 'aria-hidden': 'true' }, h('span', { class: 'ball' }), h('span', { class: 'flip l' }), h('span', { class: 'flip r' }), h('span', { class: 'bump a' }), h('span', { class: 'bump b' }), h('span', { class: 'bump c' }));
}

export function renderArcade({ store }) {
  const cards = ARCADE.map((g) => {
    const best = bestOf(store.data.arcade, g.key);
    const top = store.data.arcade?.[g.key]?.top ?? [];
    return h(
      'a',
      { class: 'arcade-card', href: g.href },
      art(g.key),
      h('div', { class: 'arcade-text' }, h('strong', {}, g.name), h('span', { class: 'muted small' }, g.hint), h('span', { class: 'small' }, bestLine(store.data.arcade, g.key, best, top))),
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
