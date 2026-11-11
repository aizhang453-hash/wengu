// 每日猜词 (v1.76, #/news/word): 每天一个五个字母的英文词, 6 次猜出来 (规则见 ../wordle.js)。从邸报页进来。
// 今天猜到哪、成绩存在这台设备上 (localStorage); 关了再开接着猜。词表 (words.js 八十多 KB) 进这一页才拿。

import { h, dialogOpen, toast, fill } from '../dom.js';
import { playSound } from '../sound.js';
import { TRIES, LEN, dayIndex, dailyWord, canGuess, evaluate, mergeKeys, emptyStats, addResult } from '../wordle.js';
import { soundOn } from './match.js';

const TYPING = 'textarea, select, input:not([type=checkbox]):not([type=radio])';
const ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
const GAME_KEY = 'wengu:daily-word'; // { day, guesses: ['crane', ...] }
const STATS_KEY = 'wengu:daily-word-stats';

function load(key, fallback) {
  try {
    return { ...fallback, ...JSON.parse(localStorage.getItem(key) ?? '{}') };
  } catch {
    return { ...fallback };
  }
}
function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 存不了就算了
  }
}

export function renderDailyWord() {
  const today = dayIndex();
  const date = new Date();
  const box = h('section', { class: 'wordle-page daily-word' }, h('p', { class: 'muted news-wait' }, '正在准备今天的词……'));
  let cleanup = () => {};

  import('../words.js').then(({ ANSWERS, ALLOWED }) => {
    const target = dailyWord(today, ANSWERS);
    const allowed = new Set(ALLOWED.split(' '));
    const saved = load(GAME_KEY, { day: today, guesses: [] });
    let guesses = (saved.day === today ? saved.guesses : []).filter((w) => typeof w === 'string' && w.length === LEN).map((word) => ({ word, result: evaluate(word, target) }));
    let stats = load(STATS_KEY, emptyStats());
    let current = '';
    let keys = guesses.reduce((k, g) => mergeKeys(k, g.word, g.result), {});
    let busy = false;
    const won = () => guesses.some((g) => g.result.every((x) => x === 'correct'));
    let done = won() || guesses.length >= TRIES;

    const statsEl = h('p', { class: 'wordle-stats muted small' });
    const grid = h('div', { class: 'wordle-grid' });
    const kb = h('div', { class: 'wordle-kb' });
    const msg = h('div', { class: 'wordle-msg', 'aria-live': 'polite' });
    grid.style.setProperty('--len', String(LEN));

    // 连胜: 昨天、今天都没猜中就断了
    const streakNow = () => (stats.lastWin !== undefined && stats.lastWin >= today - 1 ? stats.streak : 0);
    const drawStats = () => {
      statsEl.textContent = stats.played ? `玩了 ${stats.played} 天 · 猜中 ${Math.round((stats.won / stats.played) * 100)}% · 连胜 ${streakNow()} · 最长连胜 ${stats.maxStreak}` : '';
    };

    function drawGrid(revealRow = -1) {
      const rows = [];
      for (let i = 0; i < TRIES; i++) {
        const letters = i < guesses.length ? Array.from(guesses[i].word) : i === guesses.length && !done ? Array.from(current) : [];
        const result = guesses[i]?.result;
        rows.push(
          h(
            'div',
            { class: `wordle-row${i === guesses.length && !done ? ' active' : ''}` },
            Array.from({ length: LEN }, (_, j) => h('div', { class: `tile${letters[j] ? ' filled' : ''}${result ? ` ${result[j]}` : ''}${i === revealRow ? ' reveal' : ''}`, style: i === revealRow ? `animation-delay:${j * 120}ms` : null }, letters[j] ?? '')),
          ),
        );
      }
      grid.replaceChildren(...rows);
    }

    function drawKeyboard() {
      const key = (ch, label = ch, cls = '') => h('button', { class: `kb-key ${keys[ch] ?? ''} ${cls}`, 'aria-label': label, onclick: () => press(ch) }, label);
      fill(kb, ...ROWS.map((row, i) => h('div', { class: 'kb-row' }, i === 2 ? key('Enter', '确定', 'wide') : null, Array.from(row).map((ch) => key(ch)), i === 2 ? key('Backspace', '⌫', 'wide') : null)));
      kb.hidden = done;
    }

    function drawEnd() {
      if (!done) return msg.replaceChildren();
      const win = won();
      const max = Math.max(1, ...stats.dist);
      msg.replaceChildren(
        h(
          'div',
          { class: `summary wordle-end ${win ? 'win' : 'lose'}` },
          h('h2', {}, win ? ['太棒了！', '漂亮！', '厉害！', '不错！', '好险！', '最后一次猜中！'][guesses.length - 1] : '没猜出来'),
          h('div', { class: 'wordle-answer' }, h('div', { class: 'answer-text' }, target)),
          h(
            'div',
            { class: 'wordle-dist' },
            stats.dist.map((n, i) => h('div', { class: 'dist-row' }, h('span', {}, String(i + 1)), h('span', { class: `dist-bar${win && i === guesses.length - 1 ? ' this' : ''}`, style: `width:${Math.max(8, (n / max) * 100)}%` }, String(n)))),
          ),
          h('p', { class: 'muted' }, '明天再来猜新的词。'),
        ),
      );
    }

    function drawAll(revealRow) {
      drawStats();
      drawGrid(revealRow);
      drawKeyboard();
      drawEnd();
    }

    function shakeRow(text) {
      toast(text);
      const row = grid.children[guesses.length];
      row?.classList.add('shake-row');
      setTimeout(() => row?.classList.remove('shake-row'), 400);
    }

    function press(k) {
      if (busy || done) return;
      if (dayIndex() !== today) return toast('已经是新的一天了，重新打开这一页猜今天的词');
      if (k === 'Backspace') {
        current = current.slice(0, -1);
        return drawGrid();
      }
      if (k === 'Enter') {
        if (current.length < LEN) return shakeRow(`要 ${LEN} 个字母`);
        if (!canGuess(current, allowed)) return shakeRow('词表里没有这个词');
        return submit();
      }
      const ch = k.toLowerCase();
      if (!/^[a-z]$/.test(ch) || current.length >= LEN) return;
      current += ch;
      drawGrid();
    }

    function submit() {
      const word = current;
      const result = evaluate(word, target);
      guesses.push({ word, result });
      const win = result.every((x) => x === 'correct');
      // won: 邸报上那一条要写「今天猜中了」(那边不拿词表)
      save(GAME_KEY, { day: today, guesses: guesses.map((g) => g.word), won: win });
      keys = mergeKeys(keys, word, result);
      current = '';
      done = win || guesses.length >= TRIES;
      busy = true;
      drawGrid(guesses.length - 1);
      setTimeout(
        () => {
          busy = false;
          if (done) {
            stats = addResult(stats, today, win, guesses.length);
            save(STATS_KEY, stats);
            if (soundOn()) playSound(win ? 'done' : 'wrong');
          }
          drawAll();
        },
        LEN * 120 + 350,
      );
    }

    function onKey(e) {
      if (dialogOpen() || e.target.closest?.(TYPING) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'Enter' || e.key === 'Backspace' || /^[a-zA-Z]$/.test(e.key)) {
        if (e.key === 'Enter' || e.key === 'Backspace') e.preventDefault();
        press(e.key);
      }
    }
    // 拿词表的时候已经离开这一页了: 不挂键盘
    if (!box.isConnected) return;
    document.addEventListener('keydown', onKey);
    cleanup = () => document.removeEventListener('keydown', onKey);

    fill(box, h('a', { class: 'back', href: '#/news' }, '← 邸报'), h('div', { class: 'page-head daily-word-head' }, h('h1', {}, '每日猜词'), h('span', { class: 'muted' }, `${date.getMonth() + 1}月${date.getDate()}日`)), statsEl, grid, msg, kb);
    drawAll();
  }, () => {
    // 拿不到词表 (断网、又没存着): 别一直停在「正在准备」 (只管拿词表失败, 上面画页面出的错不算在这里)
    fill(box, h('a', { class: 'back', href: '#/news' }, '← 邸报'), h('h1', {}, '每日猜词'), h('p', { class: 'muted' }, '没连上网，拿不到词表。连上网再打开这一页。'));
  });

  return { title: '每日猜词', el: box, cleanup: () => cleanup() };
}
