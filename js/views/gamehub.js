// 游戏 (单独一个板块): 上面选玩哪个游戏, 下面选拿哪个卡片集玩, 点了就开始

import { h } from '../dom.js';
import { GAMES, gameOf } from '../games.js';
import { choiceList, lastGame } from './gameshell.js';

export function renderGames({ store }, key = null) {
  const last = lastGame();
  const current = gameOf(key)?.key ?? gameOf(last?.game)?.key ?? GAMES[0].key;
  const g = gameOf(current);

  const tabs = h(
    'div',
    { class: 'game-tabs', role: 'tablist', 'aria-label': '玩哪个游戏' },
    GAMES.map((x) =>
      h(
        'a',
        { class: `game-tab${x.key === current ? ' on' : ''}`, href: `#/games/${x.key}`, role: 'tab', 'aria-selected': String(x.key === current) },
        h('span', { class: 'game-tab-emoji', 'aria-hidden': 'true' }, x.emoji),
        h('span', { class: 'game-tab-name' }, x.name),
        h('span', { class: 'game-tab-hint' }, x.hint),
      ),
    ),
  );

  const hasSets = store.allSets().some((s) => s.kind !== 'quiz');
  return {
    title: '游戏',
    el: h(
      'section',
      { class: 'games-hub' },
      h('a', { class: 'back', href: '#/' }, '← 我的卡片集'),
      h('h1', {}, '🎮 游戏'),
      h('p', { class: 'muted' }, '挑一个游戏, 再挑拿哪个卡片集来玩。'),
      tabs,
      h('h2', { class: 'games-title' }, `拿哪个卡片集玩「${g.name}」`),
      hasSets
        ? choiceList(store, current, { tag: last?.game === current && last.set ? { [last.set]: '上次玩的' } : {} })
        : h('div', { class: 'empty-note' }, h('p', { class: 'muted' }, '还没有卡片集。先建一个, 再来玩。'), h('a', { class: 'btn primary', href: '#/new' }, '＋ 新建卡片集')),
    ),
  };
}
