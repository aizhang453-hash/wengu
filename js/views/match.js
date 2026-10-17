// 配对游戏 (照 Quizlet 的 Match): 12 张牌, 把词和解释配起来, 越快越好, 点错加 1 秒

import { h, icon } from '../dom.js';
import { playSound } from '../sound.js';
import { rich, cardImage } from '../cardview.js';
import { makeBoard, isPair, formatTime, whyNotPlayable, textSize, MATCH_PENALTY_MS } from '../games.js';
import { gameHeader, cantPlay, rememberGame } from './gameshell.js';

const SOUND_KEY = 'wengu:game-sound';

export function soundOn() {
  try {
    return localStorage.getItem(SOUND_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function soundToggle() {
  const btn = h('button', {
    class: 'icon-btn tool',
    onclick: () => {
      const on = !soundOn();
      try {
        localStorage.setItem(SOUND_KEY, on ? 'on' : 'off');
      } catch {
        // 存不了就算了
      }
      draw();
    },
  });
  const draw = () => {
    const on = soundOn();
    btn.replaceChildren(icon(on ? 'volume' : 'mute', 22));
    btn.title = on ? '音效: 开 (点一下关掉)' : '音效: 关 (点一下打开)';
    btn.setAttribute('aria-label', btn.title);
  };
  draw();
  return btn;
}

export function sound(kind) {
  if (soundOn()) playSound(kind);
}

export function renderMatch({ store, from }, id) {
  const set = store.getSet(id);
  if (!set || whyNotPlayable('match', set)) return cantPlay({ set, game: 'match', from });
  rememberGame('match', set.id);
  const root = h('section', { class: 'game-page' });
  let raf = null;
  let started = 0;
  let penalty = 0;

  const clock = h('span', { class: 'game-clock' }, '0.0 秒');
  function tick() {
    clock.textContent = formatTime(performance.now() - started + penalty);
    raf = requestAnimationFrame(tick);
  }

  const header = gameHeader({ store, set, game: 'match', from });
  const stage = (...children) => h('div', { class: 'game-stage center' }, ...children);

  function showReady() {
    cancelAnimationFrame(raf);
    const best = set.best.match;
    root.replaceChildren(
      header,
      stage(
        h(
          'div',
          { class: 'summary game-ready' },
          h('div', { class: 'game-emoji', 'aria-hidden': 'true' }, '🧩'),
          h('h1', {}, '配对'),
          h('p', {}, '把每个词和它的解释配起来, 配对了就消失。越快越好, 点错一次加 1 秒。'),
          best ? h('p', { class: 'muted' }, `你的最好成绩: ${formatTime(best)}`) : null,
          h('div', { class: 'row center' }, h('button', { class: 'btn primary big-choice', 'data-autofocus': '1', onclick: play }, '开始游戏')),
        ),
      ),
    );
    root.querySelector('[data-autofocus]')?.focus();
  }

  function play() {
    const tiles = makeBoard(set.cards);
    let selected = null; // { tile, el }
    let left = tiles.length;
    let locked = false;
    penalty = 0;

    const board = h('div', { class: `match-board n${tiles.length}` });
    const byId = new Map(set.cards.map((c) => [c.id, c]));
    for (const tile of tiles) {
      // 解释那张牌带上卡片的图片
      const image = tile.side === 'def' ? byId.get(tile.cardId)?.image : '';
      const len = textSize(tile.text, [24, 60, 120]);
      const size = len === 'longer' || len === 'longest' || (image && len) ? ' tiny' : len || image ? ' small' : '';
      const el = h('button', { class: `match-tile${size}`, onclick: () => pick(tile, el) }, h('span', { class: 'tile-body' }, cardImage(image, 'tile-img'), rich(tile.text)));
      board.append(el);
    }

    function pick(tile, el) {
      if (locked || el.classList.contains('gone')) return;
      if (!selected) {
        selected = { tile, el };
        el.classList.add('picked');
        return;
      }
      if (selected.el === el) {
        el.classList.remove('picked');
        selected = null;
        return;
      }
      const first = selected;
      selected = null;
      first.el.classList.remove('picked');
      if (isPair(first.tile, tile)) {
        sound('right');
        for (const e of [first.el, el]) {
          e.classList.add('gone');
          e.disabled = true;
        }
        left -= 2;
        if (left === 0) finish();
      } else {
        sound('wrong');
        penalty += MATCH_PENALTY_MS;
        locked = true;
        for (const e of [first.el, el]) e.classList.add('miss');
        const plus = h('span', { class: 'penalty' }, '+1 秒');
        clock.after(plus);
        setTimeout(() => {
          for (const e of [first.el, el]) e.classList.remove('miss');
          plus.remove();
          locked = false;
        }, 450);
      }
    }

    root.replaceChildren(header, h('div', { class: 'game-stage' }, h('div', { class: 'match-top' }, clock), board));
    started = performance.now();
    cancelAnimationFrame(raf);
    tick();
  }

  function finish() {
    cancelAnimationFrame(raf);
    const time = Math.round(performance.now() - started + penalty);
    const old = set.best.match;
    const record = store.recordBest(set.id, 'match', time);
    sound('done');
    setTimeout(() => {
      root.replaceChildren(
        header,
        stage(
          h(
            'div',
            { class: 'summary game-ready' },
            h('div', { class: 'game-emoji', 'aria-hidden': 'true' }, record ? '🏆' : '🎉'),
            h('h1', {}, record ? (old ? '破纪录了!' : '第一次玩就完成了!') : '全配对了!'),
            h('div', { class: 'big-score good' }, formatTime(time)),
            h('p', { class: 'muted' }, record && old ? `原来最好是 ${formatTime(old)}` : `最好成绩: ${formatTime(set.best.match)}`),
            penalty ? h('p', { class: 'muted small' }, `其中点错罚了 ${penalty / 1000} 秒`) : null,
            h('div', { class: 'row center' }, h('button', { class: 'btn primary big-choice', 'data-autofocus': '1', onclick: play }, '再玩一次')),
          ),
        ),
      );
      root.querySelector('[data-autofocus]')?.focus();
    }, 350);
  }

  showReady();

  return {
    title: `配对 · ${set.title}`,
    el: root,
    cleanup: () => cancelAnimationFrame(raf),
  };
}
