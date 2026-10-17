// 游戏页的样子 (照 Quizlet): 整页深色, 顶上一条 —— 左边换游戏、中间换卡片集、右边音效 / 设置 / 不玩了。
// 还有「拿哪个卡片集玩」的列表 (游戏板块和换卡片集的窗口都用它)。

import { h, openDialog, icon } from '../dom.js';
import { GAMES, gameOf, whyNotPlayable, bestText } from '../games.js';
import { FOLDER_PREFIX } from '../store.js';
import { soundToggle } from './match.js';

const LAST_KEY = 'wengu:last-game'; // 上次玩的 { game, set }: 游戏板块先选上它

export function rememberGame(game, setId) {
  try {
    localStorage.setItem(LAST_KEY, JSON.stringify({ game, set: setId }));
  } catch {
    // 存不了就算了
  }
}

export function lastGame() {
  try {
    return JSON.parse(localStorage.getItem(LAST_KEY) ?? 'null');
  } catch {
    return null;
  }
}

export const gameHref = (setId, key) => `#/set/${encodeURIComponent(setId)}/${key}`;
export const setHref = (set) => (set.virtual ? `#/folder/${encodeURIComponent(set.folderId)}` : `#/set/${encodeURIComponent(set.id)}`);

// 点 ✕ 回哪: 从游戏板块进来的回游戏板块, 不然回卡片集 (文件夹)
export function exitHref(from, set) {
  return from?.startsWith('#/games') ? from : setHref(set);
}

// 能拿来玩的: 所有卡片集, 再加上文件夹 (里面的卡片集合起来玩)。能玩的在前面
export function gameChoices(store, key) {
  const sets = store.allSets();
  const folders = store
    .allFolders()
    .map((f) => store.getSet(FOLDER_PREFIX + f.id))
    .filter((s) => s?.cards.length);
  const all = [...sets, ...folders].map((set) => ({ set, why: whyNotPlayable(key, set) }));
  return [...all.filter((x) => !x.why), ...all.filter((x) => x.why)];
}

// 一行一个卡片集, 点了就去玩。mark: 打勾的 (正在玩的); tag: { id: 旁边写的字 }
export function choiceList(store, key, { mark = null, tag = {} } = {}) {
  const choices = gameChoices(store, key);
  const first = choices.findIndex((x) => tag[x.set.id]);
  if (first > 0) choices.unshift(...choices.splice(first, 1));
  return h(
    'ul',
    { class: 'pick-list' },
    choices.map(({ set, why }) => {
      const meta = set.virtual ? `${set.cards.length} 张卡片 · 文件夹里的合起来` : `${set.cards.length} 张卡片`;
      const best = bestText(key, set.best);
      const body = [
        h('span', { class: 'pick-title' }, set.virtual ? '📁 ' : '', set.title || '未命名卡片集', tag[set.id] ? h('span', { class: 'pick-tag' }, tag[set.id]) : null),
        h('span', { class: 'pick-meta' }, why || [meta, best].filter(Boolean).join(' · ')),
      ];
      return h(
        'li',
        {},
        why
          ? h('div', { class: 'pick-row disabled', 'aria-disabled': 'true' }, h('span', { class: 'pick-body' }, body))
          : h('a', { class: `pick-row${set.id === mark ? ' on' : ''}`, href: gameHref(set.id, key) }, h('span', { class: 'pick-body' }, body), set.id === mark ? icon('check', 20) : icon('right', 20)),
      );
    }),
  );
}

function pickGameDialog(set, current) {
  openDialog({
    title: '换个游戏',
    body: h(
      'ul',
      { class: 'pick-list' },
      GAMES.map((g) => {
        const why = whyNotPlayable(g.key, set);
        const body = [h('span', { class: 'pick-title' }, `${g.emoji} ${g.name}`), h('span', { class: 'pick-meta' }, why || bestText(g.key, set.best) || g.hint)];
        return h(
          'li',
          {},
          why
            ? h('div', { class: 'pick-row disabled', 'aria-disabled': 'true' }, h('span', { class: 'pick-body' }, body))
            : h('a', { class: `pick-row${g.key === current ? ' on' : ''}`, href: gameHref(set.id, g.key) }, h('span', { class: 'pick-body' }, body), g.key === current ? icon('check', 20) : icon('right', 20)),
        );
      }),
    ),
  });
}

function pickSetDialog(store, set, game) {
  openDialog({ title: `拿哪个卡片集玩「${gameOf(game).name}」`, body: choiceList(store, game, { mark: set.id }) });
}

// 游戏页顶上那一条。settings: 点 ⚙ 时调 (没有就不显示 ⚙)
export function gameHeader({ store, set, game, from, settings = null }) {
  const g = gameOf(game);
  return h(
    'header',
    { class: 'game-head' },
    h('button', { class: 'gh-game', title: '换个游戏', onclick: () => pickGameDialog(set, game) }, h('span', { 'aria-hidden': 'true' }, g.emoji), h('span', { class: 'gh-name' }, g.name), icon('down', 18)),
    h('button', { class: 'gh-set', title: '换个卡片集', onclick: () => pickSetDialog(store, set, game) }, h('span', { class: 'gh-title' }, set.title || '未命名卡片集'), icon('down', 16)),
    h(
      'div',
      { class: 'gh-tools' },
      soundToggle(),
      settings ? h('button', { class: 'icon-btn tool', title: '设置', 'aria-label': '设置', onclick: settings }, icon('gear', 22)) : null,
      h('a', { class: 'icon-btn tool', href: exitHref(from, set), title: '不玩了', 'aria-label': '不玩了' }, icon('x', 22)),
    ),
  );
}

// 游戏玩不了 (找不到卡片集、卡片不够) 的那一页
export function cantPlay({ set, game, from }) {
  const g = gameOf(game);
  return {
    title: g.name,
    el: h(
      'section',
      { class: 'empty game-empty' },
      h('div', { class: 'game-emoji', 'aria-hidden': 'true' }, g.emoji),
      h('h1', {}, set ? `这个卡片集玩不了${g.name}` : '找不到这个卡片集'),
      set ? h('p', { class: 'muted' }, whyNotPlayable(game, set)) : null,
      h(
        'div',
        { class: 'row center' },
        h('a', { class: 'btn primary', href: `#/games/${game}` }, '换个卡片集'),
        set && !set.virtual ? h('a', { class: 'btn', href: `${setHref(set)}/edit` }, '去加卡片') : null,
        h('a', { class: 'btn', href: from?.startsWith('#/games') ? from : set ? setHref(set) : '#/' }, '回去'),
      ),
    ),
  };
}

// 字放不下就缩小 (题目、陨石上的字): 从 max 像素往下试, 到 min 为止。el 要已经在页面上、高度有限。
// 先不让英文单词从中间断开 (宁可字小一点); 缩到最小还放不下, 才让它断
export function fitText(el, { max, min }) {
  if (!el?.isConnected) return;
  const overflows = () => el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1;
  el.classList.remove('break');
  let size = max;
  el.style.fontSize = `${size}px`;
  while (size > min && overflows()) {
    size -= 1;
    el.style.fontSize = `${size}px`;
  }
  if (overflows()) el.classList.add('break');
}

// 设置窗口: 几组单选 [{ name, label, options: [[值, 字]...] }], 改了调 onChange(name, 值)
export function openSettings({ groups, values, onChange, note = '' }) {
  openDialog({
    title: '设置',
    body: h(
      'div',
      { class: 'game-settings' },
      groups.map(({ name, label, options }) =>
        h(
          'fieldset',
          { class: 'gs-group' },
          h('legend', {}, label),
          options.map(([value, text]) =>
            h('label', { class: 'toggle' }, h('input', { type: 'radio', name: `gs-${name}`, value, checked: values[name] === value, onchange: () => onChange(name, value) }), ` ${text}`),
          ),
        ),
      ),
      note ? h('p', { class: 'muted small' }, note) : null,
    ),
  });
}
