// 卡片集页、文件夹页上的「用游戏来记」: 五个游戏, 显示最好成绩

import { h } from '../dom.js';
import { GAMES, whyNotPlayable, bestText } from '../games.js';

export function gameModes(set, base) {
  return h(
    'div',
    { class: 'modes games' },
    GAMES.map((g) => {
      const why = whyNotPlayable(g.key, set);
      const name = h('span', { class: 'mode-name' }, `${g.emoji} ${g.name}`);
      return why
        ? h('div', { class: 'mode disabled', 'aria-disabled': 'true' }, name, h('span', { class: 'muted small' }, why))
        : h('a', { class: 'mode', href: `${base}/${g.key}` }, name, h('span', { class: 'muted small' }, bestText(g.key, set.best) || g.hint));
    }),
  );
}
