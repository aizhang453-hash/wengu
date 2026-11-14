// 国际象棋的棋盘 (v1.82): 画棋子、拖或点着走、走的时候棋子滑过去、上一步的格子变色、能走的地方有小点、箭头、好坏的小标记。
// 只管画和点, 规矩 (哪里能走) 由用的人告诉它 (dests), 走了以后告诉用的人 (onMove)。
// 棋子图是 img/chess/ 里那套 (Cburnett 画的, BSD 许可)。

import { h } from '../dom.js';
import { kindOf } from '../chess.js';
import { kindIcon } from './chessicons.js';

const FILES = 'abcdefgh';
export const PIECE_IMG = (code) => new URL(`../../img/chess/${code}.svg`, import.meta.url).href;

// FEN 的棋子那段 → { e4: 'wp', … }
export function placement(fen) {
  const out = {};
  const rows = String(fen).split(' ')[0].split('/');
  rows.forEach((row, i) => {
    let f = 0;
    for (const ch of row) {
      if (/\d/.test(ch)) f += Number(ch);
      else {
        out[FILES[f] + (8 - i)] = (ch === ch.toUpperCase() ? 'w' : 'b') + ch.toLowerCase();
        f++;
      }
    }
  });
  return out;
}

// 新旧两个局面: 哪个棋子从哪滑到哪 (同样的子配最近的), 哪些不见了 (被吃), 哪些是新冒出来的 (升变)
export function diffBoards(before, after) {
  const moves = [];
  const gone = [];
  const born = [];
  const stay = new Set();
  for (const [sq, code] of Object.entries(after)) if (before[sq] === code) stay.add(sq);
  const left = Object.entries(before).filter(([sq]) => !stay.has(sq));
  const need = Object.entries(after).filter(([sq]) => !stay.has(sq));
  const dist = (a, b) => Math.abs(a.charCodeAt(0) - b.charCodeAt(0)) + Math.abs(a[1] - b[1]);
  const used = new Set();
  for (const [to, code] of need) {
    let best = null;
    for (const [from, c] of left) if (c === code && !used.has(from) && (!best || dist(from, to) < dist(best, to))) best = from;
    if (best) {
      used.add(best);
      moves.push({ from: best, to, code });
    } else born.push({ sq: to, code });
  }
  for (const [sq, code] of left) if (!used.has(sq)) gone.push({ sq, code });
  return { moves, gone, born };
}

let audio = null;
// 落子、吃子的声音 (浏览器自己合成: 一下短的木头声)
export function chessSound(kind = 'move') {
  try {
    audio ??= new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume();
    const t = audio.currentTime;
    const len = kind === 'capture' ? 0.09 : 0.06;
    const buf = audio.createBuffer(1, Math.ceil(audio.sampleRate * len), audio.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 3;
    const src = audio.createBufferSource();
    src.buffer = buf;
    const filter = audio.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = kind === 'capture' ? 900 : 1500;
    filter.Q.value = 1.2;
    const gain = audio.createGain();
    gain.gain.value = kind === 'capture' ? 0.9 : 0.6;
    src.connect(filter).connect(gain).connect(audio.destination);
    src.start(t);
    if (kind === 'capture' || kind === 'check') {
      const osc = audio.createOscillator();
      const g = audio.createGain();
      osc.frequency.value = kind === 'check' ? 660 : 180;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(kind === 'check' ? 0.05 : 0.12, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
      osc.connect(g).connect(audio.destination);
      osc.start(t);
      osc.stop(t + 0.16);
    }
  } catch {}
}

// orientation: 'w' 白在下面 / 'b'; dests(square) → 这个子能走到的格子 (不能动是 []); onMove(uci) 走了一步 (升变的带 q/r/b/n)
export function createBoard({ orientation = 'w', dests = () => [], onMove = () => {}, onTapEmpty = null } = {}) {
  let side = orientation;
  let pieces = {}; // 格子 → 棋子的 div
  let current = {};
  let selected = null;
  let last = null; // [from, to]
  let check = null; // 被将军的王在哪
  let locked = false;
  let drag = null;
  let promo = null;

  const squares = h('div', { class: 'cb-squares', 'aria-hidden': 'true' });
  const marks = h('div', { class: 'cb-marks', 'aria-hidden': 'true' });
  const layer = h('div', { class: 'cb-pieces' });
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'cb-arrows');
  svg.setAttribute('viewBox', '0 0 8 8');
  svg.setAttribute('aria-hidden', 'true');
  const badgeLayer = h('div', { class: 'cb-badges', 'aria-hidden': 'true' });
  const el = h('div', { class: 'cb', role: 'application', 'aria-label': '棋盘' }, squares, marks, layer, svg, badgeLayer);

  const xy = (sq) => {
    const f = FILES.indexOf(sq[0]);
    const r = Number(sq[1]) - 1;
    return side === 'w' ? [f, 7 - r] : [7 - f, r];
  };
  const place = (node, sq) => {
    const [x, y] = xy(sq);
    node.style.transform = `translate(${x * 100}%, ${y * 100}%)`;
  };
  const sqAt = (clientX, clientY) => {
    const r = el.getBoundingClientRect();
    const x = Math.floor(((clientX - r.left) / r.width) * 8);
    const y = Math.floor(((clientY - r.top) / r.height) * 8);
    if (x < 0 || x > 7 || y < 0 || y > 7) return null;
    return side === 'w' ? FILES[x] + (8 - y) : FILES[7 - x] + (y + 1);
  };

  function drawSquares() {
    squares.replaceChildren();
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const f = side === 'w' ? x : 7 - x;
        const r = side === 'w' ? 7 - y : y;
        const light = (f + r) % 2 === 1;
        const sq = h('div', { class: `cb-sq ${light ? 'light' : 'dark'}` });
        if (y === 7) sq.append(h('span', { class: 'cb-file' }, FILES[f]));
        if (x === 0) sq.append(h('span', { class: 'cb-rank' }, String(r + 1)));
        squares.append(sq);
      }
    }
  }

  function mark(sq, cls) {
    const m = h('div', { class: `cb-mark ${cls}` });
    place(m, sq);
    marks.append(m);
  }
  function drawMarks() {
    marks.replaceChildren();
    if (last) for (const sq of last) mark(sq, 'm-last');
    if (check) mark(check, 'm-check');
    if (selected) {
      mark(selected, 'm-sel');
      for (const to of dests(selected)) mark(to, current[to] ? 'm-cap' : 'm-dot');
    }
  }

  function pieceEl(code, sq) {
    const p = h('div', { class: `cb-piece ${code}`, style: `background-image:url("${PIECE_IMG(code)}")` });
    place(p, sq);
    return p;
  }

  // 摆一个局面。animate: 棋子滑过去 (换局面时); last: 上一步 [from, to]; check: 被将军的王的格子
  function set(fen, { animate = true, last: lm = null, check: ck = null } = {}) {
    const next = placement(fen);
    selected = null;
    last = lm;
    check = ck;
    clearPromo();
    if (!animate) {
      layer.replaceChildren();
      pieces = {};
      for (const [sq, code] of Object.entries(next)) layer.append((pieces[sq] = pieceEl(code, sq)));
    } else {
      const { moves, gone, born } = diffBoards(current, next);
      const nextPieces = {};
      for (const [sq, node] of Object.entries(pieces)) if (next[sq] === current[sq]) nextPieces[sq] = node;
      for (const m of moves) {
        const node = pieces[m.from];
        node.classList.add('moving');
        place(node, m.to);
        nextPieces[m.to] = node;
        setTimeout(() => node.classList.remove('moving'), 260);
      }
      for (const g of gone) {
        const node = pieces[g.sq];
        if (!node) continue;
        node.classList.add('gone');
        setTimeout(() => node.remove(), 260);
      }
      for (const b of born) {
        const node = pieceEl(b.code, b.sq);
        node.classList.add('born');
        layer.append(node);
        nextPieces[b.sq] = node;
      }
      pieces = nextPieces;
    }
    current = next;
    drawMarks();
  }

  // 箭头: [{ from, to, tone: 'best' / 'move' / 'hint' }]
  function arrows(list = []) {
    svg.replaceChildren();
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    svg.append(defs);
    for (const [i, a] of list.entries()) {
      const id = `cb-head-${i}-${Math.random().toString(36).slice(2, 6)}`;
      const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
      marker.setAttribute('id', id);
      marker.setAttribute('viewBox', '0 0 10 10');
      marker.setAttribute('refX', '5');
      marker.setAttribute('refY', '5');
      marker.setAttribute('markerWidth', '2.6');
      marker.setAttribute('markerHeight', '2.6');
      marker.setAttribute('orient', 'auto');
      const head = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      head.setAttribute('d', 'M0 0 L10 5 L0 10 z');
      head.setAttribute('class', `cb-arrow-head ${a.tone ?? 'best'}`);
      marker.append(head);
      defs.append(marker);
      const [x1, y1] = xy(a.from);
      const [x2, y2] = xy(a.to);
      const dx = x2 - x1;
      const dy = y2 - y1;
      const len = Math.hypot(dx, dy) || 1;
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', String(x1 + 0.5 + (dx / len) * 0.2));
      line.setAttribute('y1', String(y1 + 0.5 + (dy / len) * 0.2));
      line.setAttribute('x2', String(x2 + 0.5 - (dx / len) * 0.38));
      line.setAttribute('y2', String(y2 + 0.5 - (dy / len) * 0.38));
      line.setAttribute('class', `cb-arrow ${a.tone ?? 'best'}`);
      line.setAttribute('marker-end', `url(#${id})`);
      svg.append(line);
    }
  }

  // 好坏的小标记 (复盘时, 贴在刚走的那个子的右上角); extra: 别的格子上也贴 [{ sq, node }] (终局两个王的皇冠、#)
  function badge(sq = null, kind = null, extra = []) {
    badgeLayer.replaceChildren();
    const k = kindOf(kind);
    const add = (where, node, cls = '') => {
      const b = h('div', { class: 'cb-badge-box' }, h('span', { class: `cb-badge ${cls}` }, node));
      place(b, where);
      badgeLayer.append(b);
    };
    for (const x of extra) add(x.sq, x.node, 'cb-end'); // 贴在格子左上角, 跟好坏的标记 (右上角) 不打架
    if (sq && k) add(sq, kindIcon(k.key), `ck-${k.key}`);
  }

  // ---- 走棋: 拖着走或者先点子再点格子 ----
  function clearPromo() {
    promo?.remove();
    promo = null;
  }
  function tryMove(from, to) {
    if (!dests(from).includes(to)) return false;
    const code = current[from];
    if (code?.[1] === 'p' && (to[1] === '8' || to[1] === '1')) {
      askPromotion(from, to, code[0]);
      return true;
    }
    selected = null;
    drawMarks();
    onMove(from + to);
    return true;
  }
  function askPromotion(from, to, color) {
    clearPromo();
    const [x, y] = xy(to);
    const down = y === 0;
    promo = h(
      'div',
      { class: 'cb-promo', style: `left:${x * 12.5}%;${down ? 'top:0' : 'bottom:0'}` },
      ['q', 'n', 'r', 'b'].map((p) =>
        h('button', {
          type: 'button',
          class: 'cb-promo-btn',
          'aria-label': { q: '后', n: '马', r: '车', b: '象' }[p],
          style: `background-image:url("${PIECE_IMG(color + p)}")`,
          onclick: (e) => {
            e.stopPropagation();
            clearPromo();
            selected = null;
            drawMarks();
            onMove(from + to + p);
          },
        }),
      ),
    );
    el.append(promo);
  }

  el.addEventListener('pointerdown', (e) => {
    if (locked || promo || e.button > 0) return;
    const sq = sqAt(e.clientX, e.clientY);
    if (!sq) return;
    if (selected && selected !== sq && tryMove(selected, sq)) return;
    if (current[sq] && dests(sq).length) {
      e.preventDefault();
      const was = selected;
      selected = sq;
      drawMarks();
      const node = pieces[sq];
      const r = el.getBoundingClientRect();
      drag = { from: sq, node, rect: r, x0: e.clientX, y0: e.clientY, moved: false, was, id: e.pointerId };
      el.setPointerCapture?.(e.pointerId);
      return;
    }
    selected = null;
    drawMarks();
    onTapEmpty?.(sq);
  });
  el.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 4) return;
    drag.moved = true;
    const size = drag.rect.width / 8;
    drag.node.classList.add('dragging');
    drag.node.style.transform = `translate(${e.clientX - drag.rect.left - size / 2}px, ${e.clientY - drag.rect.top - size / 2}px)`;
  });
  const endDrag = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag;
    drag = null;
    d.node.classList.remove('dragging');
    if (!d.moved) {
      // 只是点了一下: 再点同一个子就取消选中
      if (d.was === d.from) {
        selected = null;
        drawMarks();
      }
      place(d.node, d.from);
      return;
    }
    const to = e.type === 'pointerup' ? sqAt(e.clientX, e.clientY) : null;
    if (to && to !== d.from && dests(d.from).includes(to)) {
      // 拖到了: 先把子放到那里 (不要滑回去再滑过来)
      d.node.style.transition = 'none';
      place(d.node, to);
      requestAnimationFrame(() => (d.node.style.transition = ''));
      tryMove(d.from, to);
    } else place(d.node, d.from);
  };
  el.addEventListener('pointerup', endDrag);
  el.addEventListener('pointercancel', endDrag);

  function setOrientation(color) {
    side = color;
    drawSquares();
    for (const [sq, node] of Object.entries(pieces)) place(node, sq);
    drawMarks();
    const b = badgeLayer.firstChild;
    if (b) badgeLayer.replaceChildren();
  }

  // 在一个格子上冒出一个小东西, 往上飘一下就没了 (复盘领到技巧分的「+1」)
  function pop(sq, node, ms = 1600) {
    const box = h('div', { class: 'cb-pop-box', 'aria-hidden': 'true' }, node);
    place(box, sq);
    el.append(box);
    setTimeout(() => box.remove(), ms);
  }

  drawSquares();
  return {
    el,
    set,
    arrows,
    badge,
    pop,
    setOrientation,
    flip: () => setOrientation(side === 'w' ? 'b' : 'w'),
    orientation: () => side,
    lock: (on) => {
      locked = on;
      if (on) {
        selected = null;
        clearPromo();
        drawMarks();
      }
    },
  };
}
