// 宝石 (照 Quizlet 的 Charms): 交换相邻的两颗宝石, 三颗以上同色连成一线就消掉。
// 连四颗以上出炸弹; 消掉问题宝石出一道题, 答对加步数。步数用完游戏结束。

import { h, fill } from '../dom.js';
import { ROWS, COLS, makeBoard, adjacent, swap, swapMakesMatch, resolve, hasMove } from '../gems.js';
import { whyNotPlayable } from '../games.js';
import { quizPanel } from './gamequiz.js';
import { sound } from './match.js';
import { gameHeader, cantPlay, openSettings, rememberGame } from './gameshell.js';

const START_MOVES = 15;
const PREFS_KEY = 'wengu:gems-prefs';
// 每种颜色一个形状, 分不清颜色的人也能玩
const SHAPES = ['●', '◆', '▲', '■', '★', '⬟'];

export function renderGems({ store, from }, id) {
  const set = store.getSet(id);
  if (!set || whyNotPlayable('gems', set)) return cantPlay({ set, game: 'gems', from });
  rememberGame('gems', set.id);

  let prefs = { answerWith: 'term', type: 'mc' };
  try {
    prefs = { ...prefs, ...JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') };
  } catch {
    // 用默认的
  }
  const settings = () =>
    openSettings({
      groups: [
        { name: 'answerWith', label: '题目', options: [['term', '出解释, 选词'], ['def', '出词, 选解释']] },
        { name: 'type', label: '怎么答', options: [['mc', '选择题'], ['written', '打字']] },
      ],
      values: prefs,
      onChange: (name, value) => {
        prefs[name] = value;
        try {
          localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
        } catch {
          // 存不了就算了
        }
      },
      note: '下一题开始用新的设置。',
    });

  const root = h('section', { class: 'game-page gems-page' });
  const header = gameHeader({ store, set, game: 'gems', from, settings });
  const quiz = quizPanel({ store, set, prefs });
  let left = false;
  const rules = () =>
    h(
      'div',
      { class: 'side-hint' },
      h('strong', {}, '怎么玩'),
      h('p', {}, '交换相邻的两颗宝石, 三颗以上同色连成一线就消掉。一次连四颗以上留下炸弹 💣。'),
      h('p', {}, `消掉带 ? 的问题宝石会出一道题, 答对加上面写的步数。一开始 ${START_MOVES} 步, 用完游戏结束。`),
      h('p', { class: 'muted small' }, '点一颗再点旁边那颗, 或者按住往旁边一划。'),
    );

  function play() {
    let board = makeBoard();
    let moves = START_MOVES;
    let score = 0;
    let busy = false;
    let picked = null;
    let over = false;

    const scoreEl = h('span', { class: 'bs-score' });
    const movesEl = h('span', { class: 'bs-moves' });
    const hint = rules();
    const boardEl = h('div', { class: 'gems-board', style: `--rows:${ROWS};--cols:${COLS}` });
    const banner = h('div', { class: 'blast-banner', hidden: true });
    const cells = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const cell = h('button', { class: 'gem', dataset: { r: String(r), c: String(c) } });
        cells.push(cell);
        boardEl.append(cell);
      }
    }
    const cellAt = (r, c) => cells[r * COLS + c];

    function drawHud() {
      scoreEl.textContent = String(score);
      movesEl.textContent = `还剩 ${moves} 步`;
      movesEl.classList.toggle('low', moves <= 3);
    }

    function draw(b, cls = {}) {
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const g = b[r][c];
          const cell = cellAt(r, c);
          cell.className = `gem${g ? ` g${g.color}` : ' empty'}${g?.bomb ? ' bomb' : ''}${g?.question ? ' question' : ''}${cls[`${r},${c}`] ? ` ${cls[`${r},${c}`]}` : ''}`;
          fill(
            cell,
            g ? h('span', { class: 'gem-shape', 'aria-hidden': 'true' }, g.bomb ? '💣' : g.question ? '?' : SHAPES[g.color]) : null,
            g?.question ? h('span', { class: 'gem-plus' }, `+${g.question}`) : null,
          );
          cell.setAttribute('aria-label', g ? `${['红', '橙', '黄', '绿', '蓝', '紫'][g.color]}色${g.bomb ? '炸弹' : g.question ? `问题宝石, 加 ${g.question} 步` : '宝石'}` : '空');
        }
      }
      if (picked) cellAt(...picked).classList.add('picked');
    }

    function flash(text) {
      banner.textContent = text;
      banner.hidden = false;
      clearTimeout(flash.t);
      flash.t = setTimeout(() => (banner.hidden = true), 1300);
    }

    const wait = (ms) => new Promise((r) => setTimeout(r, ms));

    async function trySwap(a, b) {
      if (busy || over) return;
      picked = null;
      if (!adjacent(a, b)) return draw(board);
      if (!swapMakesMatch(board, a, b)) {
        // 换了也消不掉: 晃一下, 不算步数
        draw(board, { [`${a[0]},${a[1]}`]: 'nope', [`${b[0]},${b[1]}`]: 'nope' });
        await wait(300);
        return draw(board);
      }
      busy = true;
      moves--;
      drawHud();
      const swapped = swap(board, a, b);
      draw(swapped);
      await wait(120);
      const res = resolve(swapped, { focus: b });
      for (const [i, step] of res.steps.entries()) {
        const cls = {};
        for (const [r, c] of step.cleared) cls[`${r},${c}`] = 'pop';
        for (const [r, c] of step.exploded) cls[`${r},${c}`] = 'boom';
        draw(i === 0 ? swapped : res.steps[i - 1].after, cls);
        sound('right');
        await wait(260);
        draw(step.after, Object.fromEntries(step.bombs.map(([r, c]) => [`${r},${c}`, 'new-bomb'])));
        await wait(160);
      }
      board = res.board;
      score += res.points;
      if (res.steps.length > 1) flash(`${res.steps.length} 连消! +${res.points}`);
      drawHud();
      // 问题宝石: 一题一题答
      for (const plus of res.questions) {
        if (left) return;
        hint.hidden = true;
        const correct = await new Promise((resolveQ) => quiz.ask({ title: `答对加 ${plus} 步`, onAnswer: resolveQ }));
        if (left) return;
        if (correct) {
          moves += plus;
          drawHud();
          flash(`+${plus} 步`);
        }
      }
      quiz.hide();
      hint.hidden = false;
      if (!hasMove(board)) {
        flash('没有能走的了, 重新洗一下');
        board = makeBoard();
        draw(board);
      }
      busy = false;
      if (moves <= 0) finish();
    }

    function finish() {
      over = true;
      const record = store.recordBest(set.id, 'gems', score);
      sound('done');
      setTimeout(() => {
        if (left) return;
        root.replaceChildren(
          header,
          h(
            'div',
            { class: 'game-stage center' },
            h(
              'div',
              { class: 'summary game-ready' },
              h('div', { class: 'game-emoji', 'aria-hidden': 'true' }, record ? '🏆' : '💎'),
              h('h1', {}, record ? '新纪录!' : '步数用完了'),
              h('div', { class: 'big-score good' }, `${score} 分`),
              h('p', { class: 'muted' }, `最高分 ${set.best.gems ?? score}`),
              h('div', { class: 'row center' }, h('button', { class: 'btn primary big-choice', 'data-autofocus': '1', onclick: play }, '再玩一次')),
            ),
          ),
        );
        root.querySelector('[data-autofocus]')?.focus();
      }, 600);
    }

    // 点一颗, 再点旁边那颗; 或者按住划一下
    let down = null;
    boardEl.addEventListener('pointerdown', (e) => {
      const cell = e.target.closest('.gem');
      if (!cell) return;
      down = { r: Number(cell.dataset.r), c: Number(cell.dataset.c), x: e.clientX, y: e.clientY };
    });
    boardEl.addEventListener('pointerup', (e) => {
      if (!down || busy || over) return;
      const dx = e.clientX - down.x;
      const dy = e.clientY - down.y;
      const from = [down.r, down.c];
      down = null;
      if (Math.max(Math.abs(dx), Math.abs(dy)) > 18) {
        const to = Math.abs(dx) > Math.abs(dy) ? [from[0], from[1] + Math.sign(dx)] : [from[0] + Math.sign(dy), from[1]];
        if (to[0] >= 0 && to[1] >= 0 && to[0] < ROWS && to[1] < COLS) trySwap(from, to);
        return;
      }
      if (picked && (picked[0] !== from[0] || picked[1] !== from[1])) {
        if (adjacent(picked, from)) return trySwap(picked, from);
      }
      picked = picked && picked[0] === from[0] && picked[1] === from[1] ? null : from;
      draw(board);
    });

    // 用键盘 (Tab 到宝石上按回车 / 空格) 也能点
    boardEl.addEventListener('click', (e) => {
      if (e.detail !== 0 || busy || over) return;
      const cell = e.target.closest('.gem');
      if (!cell) return;
      const at = [Number(cell.dataset.r), Number(cell.dataset.c)];
      if (picked && adjacent(picked, at)) return trySwap(picked, at);
      picked = picked && picked[0] === at[0] && picked[1] === at[1] ? null : at;
      draw(board);
      cellAt(...at).focus();
    });

    const bestEl = set.best.gems ? h('span', { class: 'bs-best', title: '最高分' }, h('span', { 'aria-hidden': 'true' }, '🏆 '), String(set.best.gems)) : null;
    root.replaceChildren(
      header,
      h(
        'div',
        { class: 'game-stage' },
        h('div', { class: 'blocks-layout' }, quiz.el, hint, h('div', { class: 'blocks-main' }, h('div', { class: 'blocks-scores' }, scoreEl, movesEl, bestEl), h('div', { class: 'space-wrap' }, boardEl, banner))),
      ),
    );
    quiz.hide();
    drawHud();
    draw(board);
  }

  const onKey = (e) => quiz.onKey(e);
  document.addEventListener('keydown', onKey);
  play();
  return {
    title: `宝石 · ${set.title}`,
    el: root,
    cleanup: () => {
      left = true;
      quiz.stop();
      document.removeEventListener('keydown', onKey);
    },
  };
}
