// Wordle: 从卡片集里挑一个词, 6 次猜出来。解释当提示 (可以藏起来, 难一点)。

import { h, dialogOpen, toast, fill } from '../dom.js';
import { rich, cardImage, sayButton } from '../cardview.js';
import { playSound } from '../sound.js';
import { TRIES, playable, evaluate, mergeKeys } from '../wordle.js';
import { soundOn } from './match.js';
import { gameHeader, cantPlay, rememberGame, exitHref } from './gameshell.js';

const TYPING = 'textarea, select, input:not([type=checkbox]):not([type=radio])';
const ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];

function loadStats(key) {
  try {
    return { played: 0, won: 0, streak: 0, maxStreak: 0, dist: [0, 0, 0, 0, 0, 0], recent: [], showClue: true, ...JSON.parse(localStorage.getItem(key) ?? '{}') };
  } catch {
    return { played: 0, won: 0, streak: 0, maxStreak: 0, dist: [0, 0, 0, 0, 0, 0], recent: [], showClue: true };
  }
}

export function renderWordle({ store, from }, id) {
  const set = store.getSet(id);
  const pool = set ? playable(set.cards) : { items: [] };
  if (!set || pool.items.length === 0) return cantPlay({ set, game: 'wordle', from });
  rememberGame('wordle', set.id);
  const back = exitHref(from, set);

  const statsKey = `wengu:wordle:${set.id}`;
  const stats = loadStats(statsKey);
  const saveStats = () => {
    try {
      localStorage.setItem(statsKey, JSON.stringify(stats));
    } catch {
      // 存不了就算了
    }
  };
  const clueSide = pool.side === 'term' ? 'def' : 'term';
  // 键盘: 26 个字母, 再加上词里有的其他字母 (é、ü、ß……)
  const extra = [...new Set(pool.items.flatMap((x) => Array.from(x.word)))].filter((ch) => !/[a-z]/.test(ch)).sort();

  let target = null; // { card, word }
  let guesses = [];
  let current = '';
  let keys = {};
  let done = false;
  let busy = false;

  const statsEl = h('div', { class: 'wordle-stats muted small' });
  const clueEl = h('div', { class: 'wordle-clue' });
  const grid = h('div', { class: 'wordle-grid' });
  const kb = h('div', { class: 'wordle-kb' });
  const msg = h('div', { class: 'wordle-msg', 'aria-live': 'polite' });

  function pickWord() {
    // 最近猜过的先不出 (词够多的话)
    const fresh = pool.items.filter((x) => !stats.recent.includes(x.card.id));
    const list = fresh.length ? fresh : pool.items;
    return list[Math.floor(Math.random() * list.length)];
  }

  function newGame() {
    target = pickWord();
    stats.recent = [...stats.recent.filter((cid) => cid !== target.card.id), target.card.id].slice(-Math.min(10, pool.items.length - 1));
    saveStats();
    guesses = [];
    current = '';
    keys = {};
    done = false;
    msg.replaceChildren();
    drawAll();
  }

  function drawStats() {
    statsEl.textContent = `玩了 ${stats.played} 次 · 猜中 ${stats.played ? Math.round((stats.won / stats.played) * 100) : 0}% · 连胜 ${stats.streak} · 最长连胜 ${stats.maxStreak}`;
  }

  function drawClue() {
    const clue = target.card[clueSide];
    clueEl.replaceChildren(
      h(
        'div',
        { class: 'row' },
        h('span', { class: 'muted small' }, `提示 (${clueSide === 'def' ? '解释' : '词'}) · ${Array.from(target.word).length} 个字母`),
        h(
          'button',
          {
            class: 'link-btn',
            onclick: () => {
              stats.showClue = !stats.showClue;
              saveStats();
              drawClue();
            },
          },
          stats.showClue ? '藏起来 (难一点)' : '看提示',
        ),
      ),
      stats.showClue || done ? h('div', { class: 'wordle-clue-text' }, clueSide === 'def' ? cardImage(target.card.image, 'q-img small') : null, rich(clue)) : h('div', { class: 'muted' }, '提示藏起来了'),
    );
  }

  function drawGrid(revealRow = -1) {
    const len = Array.from(target.word).length;
    grid.style.setProperty('--len', String(len));
    const rows = [];
    for (let i = 0; i < TRIES; i++) {
      const letters = i < guesses.length ? Array.from(guesses[i].word) : i === guesses.length ? Array.from(current) : [];
      const result = guesses[i]?.result;
      rows.push(
        h(
          'div',
          { class: `wordle-row${i === guesses.length && !done ? ' active' : ''}` },
          Array.from({ length: len }, (_, j) =>
            h(
              'div',
              {
                class: `tile${letters[j] ? ' filled' : ''}${result ? ` ${result[j]}` : ''}${i === revealRow ? ' reveal' : ''}`,
                style: i === revealRow ? `animation-delay:${j * 120}ms` : null,
              },
              letters[j] ?? '',
            ),
          ),
        ),
      );
    }
    grid.replaceChildren(...rows);
  }

  function drawKeyboard() {
    const key = (ch, label = ch, cls = '') => h('button', { class: `kb-key ${keys[ch] ?? ''} ${cls}`, 'aria-label': label, onclick: () => press(ch) }, label);
    fill(
      kb,
      ...ROWS.map((row, i) => h('div', { class: 'kb-row' }, i === 2 ? key('Enter', '确定', 'wide') : null, Array.from(row).map((ch) => key(ch)), i === 2 ? key('Backspace', '⌫', 'wide') : null)),
      extra.length ? h('div', { class: 'kb-row' }, extra.map((ch) => key(ch))) : null,
    );
  }

  function drawAll(revealRow) {
    drawStats();
    drawClue();
    drawGrid(revealRow);
    drawKeyboard();
  }

  function shakeRow(text) {
    toast(text);
    const row = grid.children[guesses.length];
    row?.classList.add('shake-row');
    setTimeout(() => row?.classList.remove('shake-row'), 400);
  }

  function press(k) {
    if (busy) return;
    if (done) {
      if (k === 'Enter') newGame();
      return;
    }
    const len = Array.from(target.word).length;
    if (k === 'Backspace') {
      current = Array.from(current).slice(0, -1).join('');
      return drawGrid();
    }
    if (k === 'Enter') {
      if (Array.from(current).length < len) return shakeRow(`要 ${len} 个字母`);
      return submit();
    }
    const ch = k.toLowerCase();
    if (Array.from(ch).length !== 1 || !/\p{L}/u.test(ch) || Array.from(current).length >= len) return;
    current += ch;
    drawGrid();
  }

  function submit() {
    const word = current;
    const result = evaluate(word, target.word);
    guesses.push({ word, result });
    keys = mergeKeys(keys, word, result);
    current = '';
    const win = result.every((x) => x === 'correct');
    const lose = !win && guesses.length >= TRIES;
    busy = true;
    drawGrid(guesses.length - 1);
    setTimeout(
      () => {
        busy = false;
        drawKeyboard();
        if (win || lose) finish(win);
        else drawGrid();
      },
      Array.from(word).length * 120 + 350,
    );
  }

  function finish(win) {
    done = true;
    stats.played++;
    if (win) {
      stats.won++;
      stats.streak++;
      stats.maxStreak = Math.max(stats.maxStreak, stats.streak);
      stats.dist[guesses.length - 1]++;
      store.recordBest(set.id, 'wordle', stats.maxStreak);
    } else {
      stats.streak = 0;
    }
    saveStats();
    store.recordAnswer(set.id, target.card.id, win);
    if (soundOn()) playSound(win ? 'done' : 'wrong');
    const card = target.card;
    const max = Math.max(1, ...stats.dist);
    msg.replaceChildren(
      h(
        'div',
        { class: `summary wordle-end ${win ? 'win' : 'lose'}` },
        h('h2', {}, win ? ['太棒了!', '漂亮!', '厉害!', '不错!', '好险!', '最后一次猜中!'][guesses.length - 1] : '没猜出来'),
        h(
          'div',
          { class: 'wordle-answer' },
          h('div', { class: 'answer-text' }, rich(card.term), sayButton(card, 'term', set)),
          h('div', { class: 'muted' }, rich(card.def), sayButton(card, 'def', set)),
        ),
        h(
          'div',
          { class: 'wordle-dist' },
          stats.dist.map((n, i) =>
            h(
              'div',
              { class: 'dist-row' },
              h('span', {}, String(i + 1)),
              h('span', { class: `dist-bar${win && i === guesses.length - 1 ? ' this' : ''}`, style: `width:${Math.max(8, (n / max) * 100)}%` }, String(n)),
            ),
          ),
        ),
        h('div', { class: 'row center' }, h('button', { class: 'btn primary', onclick: newGame }, '下一个词 (回车)'), h('a', { class: 'btn', href: back }, '回去')),
      ),
    );
    drawAll();
  }

  function onKey(e) {
    if (dialogOpen() || e.target.closest?.(TYPING) || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'Enter' || e.key === 'Backspace' || Array.from(e.key).length === 1) {
      // 回车别同时点到正在选中的按钮
      if (e.key === 'Enter' || e.key === 'Backspace') e.preventDefault();
      if (e.key === ' ') return;
      press(e.key);
    }
  }
  document.addEventListener('keydown', onKey);

  newGame();

  return {
    title: `Wordle · ${set.title}`,
    el: h(
      'section',
      { class: 'game-page wordle-page' },
      gameHeader({ store, set, game: 'wordle', from }),
      h('div', { class: 'game-stage' }, statsEl, clueEl, grid, msg, kb),
    ),
    cleanup: () => document.removeEventListener('keydown', onKey),
  };
}
