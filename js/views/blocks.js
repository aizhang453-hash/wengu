// 方块 (照 Quizlet 的 Blocks): 把积木拖到棋盘上, 填满一行或一列就消掉。三块放完答对一题再给三块。

import { h } from '../dom.js';
import { SIZE, emptyBoard, canPlace, place, fitsAnywhere, randomTray } from '../blocks.js';
import { askGameQuestion, quizCards } from './gamequiz.js';
import { soundToggle, sound, soundOn } from './match.js';
import { pickDistinct } from '../games.js';

const PREFS_KEY = 'wengu:blocks-prefs';

export function renderBlocks({ store }, id) {
  const set = store.getSet(id);
  const back = set ? (set.virtual ? `#/folder/${encodeURIComponent(set.folderId)}` : `#/set/${encodeURIComponent(set.id)}`) : '#/';
  if (!set || pickDistinct(quizCards(set.cards), 2).length < 2) {
    return {
      title: '方块',
      el: h(
        'section',
        { class: 'empty' },
        h('h1', {}, set ? '卡片不够, 玩不了方块' : '找不到这个卡片集'),
        set ? h('p', { class: 'muted' }, '至少要两张词和解释都有、而且不一样的卡片。') : null,
        h('a', { class: 'btn primary', href: set ? back : '#/' }, set ? '回去' : '回首页'),
      ),
    };
  }

  let prefs = { answerWith: 'def', type: 'mc' };
  try {
    prefs = { ...prefs, ...JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') };
  } catch {
    // 用默认的
  }
  const root = h('section', { class: 'game-page blocks-page' });
  let cleanupDrag = null;
  let left = false; // 离开这一页了 (答题窗口被换页关掉时别再出题)

  const head = () => h('div', { class: 'cards-head' }, h('a', { class: 'back', href: back }, `← ${set.title || '未命名卡片集'}`), soundToggle());

  function showReady() {
    const radio = (name, value, label) =>
      h(
        'label',
        { class: 'toggle' },
        h('input', {
          type: 'radio',
          name,
          value,
          checked: prefs[name] === value,
          onchange: () => {
            prefs[name] = value;
            try {
              localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
            } catch {
              // 存不了就算了
            }
          },
        }),
        ` ${label}`,
      );
    root.replaceChildren(
      head(),
      h(
        'div',
        { class: 'summary game-ready' },
        h('div', { class: 'game-emoji', 'aria-hidden': 'true' }, '🧱'),
        h('h1', {}, '方块'),
        h('p', {}, '把积木拖到棋盘上, 填满一整行或一整列就消掉、得分。三块都放完, 答对一道题再给三块。哪块都放不下了游戏结束。'),
        h('p', { class: 'muted small' }, '手机上按住积木拖; 电脑上也可以先点积木, 再点棋盘上要放的地方 (积木左上角放在那格)。'),
        h('div', { class: 'row center' }, radio('answerWith', 'def', '答解释'), radio('answerWith', 'term', '答词'), ' · ', radio('type', 'mc', '选择题'), radio('type', 'written', '打字')),
        set.best.blocks ? h('p', { class: 'muted' }, `你的最高分: ${set.best.blocks}`) : null,
        h('div', { class: 'row center' }, h('button', { class: 'btn primary big-choice', onclick: play }, '开始游戏')),
      ),
    );
  }

  function play() {
    let board = emptyBoard();
    let tray = randomTray();
    let score = 0;
    let selected = null; // 点选的积木序号
    let over = false;

    const scoreEl = h('span', { class: 'hud-item' });
    const boardEl = h('div', { class: 'blocks-board', style: `--n:${SIZE}` });
    const cells = [];
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const cell = h('div', { class: 'bcell', dataset: { r: String(r), c: String(c) } });
        cells.push(cell);
        boardEl.append(cell);
      }
    }
    const trayEl = h('div', { class: 'blocks-tray' });
    const cellAt = (r, c) => cells[r * SIZE + c];

    function drawBoard() {
      for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) cellAt(r, c).className = `bcell${board[r][c] ? ` filled k${board[r][c]}` : ''}`;
      scoreEl.textContent = `分数 ${score}`;
    }

    function pieceEl(piece, i) {
      const { shape, color } = piece;
      const el = h('div', {
        class: `bpiece${selected === i ? ' selected' : ''}${fitsAnywhere(board, shape) ? '' : ' nofit'}`,
        style: `--rows:${shape.rows};--cols:${shape.cols}`,
        dataset: { i: String(i) },
        role: 'button',
        'aria-label': `积木 ${i + 1}`,
      });
      for (let r = 0; r < shape.rows; r++) {
        for (let c = 0; c < shape.cols; c++) {
          const on = shape.cells.some(([dr, dc]) => dr === r && dc === c);
          el.append(h('div', { class: on ? `bmini filled k${color}` : 'bmini' }));
        }
      }
      el.addEventListener('pointerdown', (e) => startDrag(e, i, el));
      return el;
    }

    function drawTray() {
      trayEl.replaceChildren(...tray.map((p, i) => (p ? pieceEl(p, i) : h('div', { class: 'bpiece empty' }))));
    }

    function clearPreview() {
      for (const cell of cells) cell.classList.remove('preview', 'bad', 'willclear');
    }

    function preview(shape, r, c) {
      clearPreview();
      if (r === null) return;
      const ok = canPlace(board, shape, r, c);
      for (const [dr, dc] of shape.cells) {
        const rr = r + dr;
        const cc = c + dc;
        if (rr >= 0 && cc >= 0 && rr < SIZE && cc < SIZE) cellAt(rr, cc).classList.add(ok ? 'preview' : 'bad');
      }
      // 放下去会消掉的行、列先亮一下
      if (ok) for (const [rr, cc] of place(board, shape, r, c).cleared) cellAt(rr, cc).classList.add('willclear');
    }

    function drop(i, r, c) {
      const piece = tray[i];
      if (!piece || over || !canPlace(board, piece.shape, r, c)) return false;
      const res = place(board, piece.shape, r, c, piece.color);
      board = res.board;
      score += res.points;
      tray[i] = null;
      selected = null;
      clearPreview();
      drawBoard();
      if (res.lines) {
        sound('right');
        for (const [rr, cc] of res.cleared) {
          const cell = cellAt(rr, cc);
          cell.classList.add('pop');
          setTimeout(() => cell.classList.remove('pop'), 350);
        }
        if (res.lines >= 2) flash(`一次消了 ${res.lines} 条! +${res.points - piece.shape.cells.length}`);
      }
      if (tray.every((p) => !p)) {
        drawTray();
        askForPieces();
      } else {
        drawTray();
        checkOver();
      }
      return true;
    }

    // 三块都放完: 答对一道题再给三块 (答错换一题再答)
    function askForPieces() {
      askGameQuestion({
        store,
        set,
        title: '答对拿三块新积木',
        reward: '给你三块新积木',
        answerWith: prefs.answerWith,
        type: prefs.type,
        sound: soundOn(),
        onAnswer: (correct) => {
          if (over || left) return;
          if (!correct) return askForPieces();
          tray = randomTray();
          drawTray();
          checkOver();
        },
      });
    }

    function checkOver() {
      if (tray.some((p) => p && fitsAnywhere(board, p.shape))) return;
      over = true;
      const record = store.recordBest(set.id, 'blocks', score);
      sound('done');
      setTimeout(() => {
        root.replaceChildren(
          head(),
          h(
            'div',
            { class: 'summary game-ready' },
            h('div', { class: 'game-emoji', 'aria-hidden': 'true' }, record ? '🏆' : '🧱'),
            h('h1', {}, record ? '新纪录!' : '放不下了'),
            h('div', { class: 'big-score good' }, `${score} 分`),
            h('p', { class: 'muted' }, `最高分 ${set.best.blocks ?? score}`),
            h('div', { class: 'row center' }, h('button', { class: 'btn primary', onclick: play }, '再玩一次'), h('a', { class: 'btn', href: back }, '回去')),
          ),
        );
      }, 700);
    }

    const banner = h('div', { class: 'blast-banner', hidden: true });
    function flash(text) {
      banner.textContent = text;
      banner.hidden = false;
      clearTimeout(flash.t);
      flash.t = setTimeout(() => (banner.hidden = true), 1300);
    }

    // ---- 拖积木 ----
    // 拖的时候积木画在手指上方一点 (不然被手指挡住); 积木左上角对准的那格就是放的地方
    function startDrag(e, i, el) {
      if (over || !tray[i]) return;
      e.preventDefault();
      const { shape, color } = tray[i];
      const rect = boardEl.getBoundingClientRect();
      const cell = rect.width / SIZE;
      const ghost = h('div', { class: 'bpiece ghost', style: `--rows:${shape.rows};--cols:${shape.cols};--cell:${cell}px` });
      for (let r = 0; r < shape.rows; r++) for (let c = 0; c < shape.cols; c++) ghost.append(h('div', { class: shape.cells.some(([dr, dc]) => dr === r && dc === c) ? `bmini filled k${color}` : 'bmini' }));
      document.body.append(ghost);
      const lift = e.pointerType === 'touch' ? cell * 1.6 : 0;
      const startX = e.clientX;
      const startY = e.clientY;
      let moved = false;
      let target = null;
      const move = (ev) => {
        if (Math.abs(ev.clientX - startX) + Math.abs(ev.clientY - startY) > 6) moved = true;
        if (!moved) return;
        el.classList.add('dragging');
        const left = ev.clientX - (shape.cols * cell) / 2;
        const top = ev.clientY - shape.rows * cell - lift + cell / 2;
        ghost.style.transform = `translate(${left}px, ${top}px)`;
        ghost.classList.add('show');
        const r = Math.round((top - rect.top) / cell);
        const c = Math.round((left - rect.left) / cell);
        target = r > -shape.rows && c > -shape.cols && r < SIZE && c < SIZE ? [r, c] : null;
        preview(shape, target ? target[0] : null, target ? target[1] : null);
      };
      const up = () => {
        cleanupDrag();
        if (!moved) {
          // 没拖动 = 点选
          selected = selected === i ? null : i;
          drawTray();
          return;
        }
        el.classList.remove('dragging');
        if (!target || !drop(i, target[0], target[1])) clearPreview();
      };
      cleanupDrag = () => {
        ghost.remove();
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', up);
        cleanupDrag = null;
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', up);
    }

    // 点选以后点棋盘: 积木左上角放在点的那格; 电脑上移过去先看放下的样子
    boardEl.addEventListener('click', (e) => {
      const cell = e.target.closest('.bcell');
      if (!cell || selected === null) return;
      if (!drop(selected, Number(cell.dataset.r), Number(cell.dataset.c))) {
        cell.classList.add('shake-cell');
        setTimeout(() => cell.classList.remove('shake-cell'), 300);
      }
    });
    boardEl.addEventListener('pointermove', (e) => {
      if (selected === null || e.pointerType === 'touch') return;
      const cell = e.target.closest('.bcell');
      if (cell) preview(tray[selected].shape, Number(cell.dataset.r), Number(cell.dataset.c));
    });
    boardEl.addEventListener('pointerleave', () => selected !== null && clearPreview());

    root.replaceChildren(head(), h('div', { class: 'hud' }, scoreEl, set.best.blocks ? h('span', { class: 'hud-item muted' }, `最高 ${set.best.blocks}`) : null), h('div', { class: 'space-wrap' }, boardEl, banner), trayEl);
    drawBoard();
    drawTray();
  }

  showReady();
  return {
    title: `方块 · ${set.title}`,
    el: root,
    cleanup: () => {
      left = true;
      cleanupDrag?.();
    },
  };
}
