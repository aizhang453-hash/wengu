// 宝石 (照 Quizlet 的 Charms): 交换相邻的两颗宝石, 三颗以上同色连成一线就消掉。
// 连四颗以上出炸弹; 消掉问题宝石出一道题, 答对加步数。步数用完游戏结束。

import { h, fill } from '../dom.js';
import { ROWS, COLS, makeBoard, adjacent, swap, swapMakesMatch, resolve, hasMove } from '../gems.js';
import { askGameQuestion, quizCards } from './gamequiz.js';
import { soundToggle, sound, soundOn } from './match.js';
import { pickDistinct } from '../games.js';

const START_MOVES = 15;
// 每种颜色一个形状, 分不清颜色的人也能玩
const SHAPES = ['●', '◆', '▲', '■', '★', '⬟'];

export function renderGems({ store }, id) {
  const set = store.getSet(id);
  const back = set ? (set.virtual ? `#/folder/${encodeURIComponent(set.folderId)}` : `#/set/${encodeURIComponent(set.id)}`) : '#/';
  if (!set || pickDistinct(quizCards(set.cards), 2).length < 2) {
    return {
      title: '宝石',
      el: h(
        'section',
        { class: 'empty' },
        h('h1', {}, set ? '卡片不够, 玩不了宝石' : '找不到这个卡片集'),
        set ? h('p', { class: 'muted' }, '至少要两张词和解释都有、而且不一样的卡片。') : null,
        h('a', { class: 'btn primary', href: set ? back : '#/' }, set ? '回去' : '回首页'),
      ),
    };
  }

  const root = h('section', { class: 'game-page gems-page' });
  let left = false;
  const head = () => h('div', { class: 'cards-head' }, h('a', { class: 'back', href: back }, `← ${set.title || '未命名卡片集'}`), soundToggle());

  function showReady() {
    root.replaceChildren(
      head(),
      h(
        'div',
        { class: 'summary game-ready' },
        h('div', { class: 'game-emoji', 'aria-hidden': 'true' }, '💎'),
        h('h1', {}, '宝石'),
        h('p', {}, '交换相邻的两颗宝石, 三颗以上同色连成一线就消掉。一次连四颗以上会留下炸弹 💣, 炸弹再被消掉时连周围一圈一起炸。'),
        h('p', {}, `消掉带 ? 的问题宝石会出一道题, 答对加上面写的步数。一开始有 ${START_MOVES} 步, 步数用完游戏结束。`),
        h('p', { class: 'muted small' }, '点一颗再点旁边那颗交换, 或者按住往旁边一划。'),
        set.best.gems ? h('p', { class: 'muted' }, `你的最高分: ${set.best.gems}`) : null,
        h('div', { class: 'row center' }, h('button', { class: 'btn primary big-choice', onclick: play }, '开始游戏')),
      ),
    );
  }

  function play() {
    let board = makeBoard();
    let moves = START_MOVES;
    let score = 0;
    let busy = false;
    let picked = null;
    let over = false;

    const scoreEl = h('span', { class: 'hud-item' });
    const movesEl = h('span', { class: 'hud-item' });
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
      scoreEl.textContent = `分数 ${score}`;
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
        const correct = await new Promise((resolveQ) =>
          askGameQuestion({ store, set, title: `答对加 ${plus} 步`, reward: `+${plus} 步`, sound: soundOn(), onAnswer: resolveQ }),
        );
        if (left) return;
        if (correct) {
          moves += plus;
          drawHud();
        }
      }
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
          head(),
          h(
            'div',
            { class: 'summary game-ready' },
            h('div', { class: 'game-emoji', 'aria-hidden': 'true' }, record ? '🏆' : '💎'),
            h('h1', {}, record ? '新纪录!' : '步数用完了'),
            h('div', { class: 'big-score good' }, `${score} 分`),
            h('p', { class: 'muted' }, `最高分 ${set.best.gems ?? score}`),
            h('div', { class: 'row center' }, h('button', { class: 'btn primary', onclick: play }, '再玩一次'), h('a', { class: 'btn', href: back }, '回去')),
          ),
        );
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

    root.replaceChildren(head(), h('div', { class: 'hud' }, scoreEl, movesEl, set.best.gems ? h('span', { class: 'hud-item muted' }, `最高 ${set.best.gems}`) : null), h('div', { class: 'space-wrap' }, boardEl, banner));
    drawHud();
    draw(board);
  }

  showReady();
  return {
    title: `宝石 · ${set.title}`,
    el: root,
    cleanup: () => {
      left = true;
    },
  };
}
