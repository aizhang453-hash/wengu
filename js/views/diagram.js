// 标注图的页面部分: 显示图和点、编辑页里标点、卡片集页上的图、练习 (#/set/<id>/diagram)

import { h, fill, dialogOpen } from '../dom.js';
import { cardImage, rich, sayButton } from '../cardview.js';
import { pinnedCards, nearestPin, diagramQuestions } from '../diagram.js';
import { stripMarks } from '../rich.js';
import { playSound } from '../sound.js';

// 图上点的位置 (0~1)
function relPos(e, box) {
  const r = box.getBoundingClientRect();
  return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
}

// 一张图加上点。
//   highlight: 点亮哪张卡片的点; labels: 'number' 点上写编号, 'none' 不写
//   onPick(cardId): 点了某个点 (点在图上空白处时选最近的点)
// 返回的元素上有 mark(cardId, 'right' | 'wrong') 给点上色
export function diagramFigure(set, { highlight = null, labels = 'number', onPick = null, size = '' } = {}) {
  const pins = pinnedCards(set);
  const box = h('div', { class: `diagram-box${onPick ? ' pickable' : ''}` }, cardImage(set.diagram.image, 'diagram-img'));
  const pinEls = new Map();
  for (const p of pins) {
    const el = h(
      onPick ? 'button' : 'span',
      {
        class: `pin${p.cardId === highlight ? ' on' : ''}${highlight && p.cardId !== highlight ? ' dim' : ''}`,
        style: `left:${p.x * 100}%;top:${p.y * 100}%`,
        type: onPick ? 'button' : null,
        'aria-label': onPick ? `第 ${p.number} 个点` : null,
        onclick: onPick
          ? (e) => {
              e.stopPropagation();
              onPick(p.cardId);
            }
          : null,
      },
      labels === 'number' ? String(p.number) : '',
    );
    pinEls.set(p.cardId, el);
    box.append(el);
  }
  if (onPick) {
    box.addEventListener('click', (e) => {
      const { x, y } = relPos(e, box);
      const p = nearestPin(pins, x, y);
      if (p) onPick(p.cardId);
    });
  }
  const wrap = h('div', { class: `diagram ${size}` }, box);
  wrap.mark = (cardId, kind) => pinEls.get(cardId)?.classList.add(kind);
  wrap.label = (cardId, text) => {
    const el = pinEls.get(cardId);
    if (el) el.append(h('span', { class: 'pin-label' }, text));
  };
  return wrap;
}

// ---- 卡片集页上的标注图 ----
export function diagramSection(set) {
  const pins = pinnedCards(set);
  if (!set.diagram) return null;
  const caption = h('div', { class: 'diagram-caption muted small' }, pins.length ? '点一下图上的数字看是什么' : '图上还没有标点, 去「编辑」里标');
  const show = (cardId) => {
    const p = pins.find((x) => x.cardId === cardId);
    if (!p) return;
    figure.querySelectorAll('.pin').forEach((el, i) => el.classList.toggle('on', i === p.number - 1));
    fill(caption, h('strong', {}, `${p.number}. `), rich(p.card.term), p.card.def ? h('span', { class: 'muted' }, ' — ') : null, p.card.def ? rich(p.card.def) : null);
  };
  const figure = diagramFigure(set, { onPick: show });
  return h('section', { class: 'diagram-section' }, h('h2', {}, `标注图 (${pins.length} 个点)`), figure, caption);
}

// ---- 编辑页里标点 ----
// diagram: { image, pins } (会直接改); rows(): 现在的卡片行 [{ id, label }]
// addCard(): 新加一张卡片, 返回它的 id; focusCard(id): 光标放到那张卡片上
export function diagramEditor({ diagram, rows, addCard, focusCard, onChange }) {
  let placing = null; // 正在找位置的卡片 id
  const box = h('div', { class: 'diagram-box editing' });
  const hint = h('p', { class: 'muted small' });
  const el = h('div', { class: 'diagram edit-diagram' }, hint, box);

  function draw() {
    const valid = new Set(rows().map((r) => r.id));
    diagram.pins = diagram.pins.filter((p) => valid.has(p.cardId));
    fill(box, cardImage(diagram.image, 'diagram-img'), diagram.pins.map((p, i) => pinEl(p, i + 1)));
    box.classList.toggle('placing', Boolean(placing));
    hint.textContent = placing
      ? '在图上点一下, 放这张卡片的点 (按 Esc 取消)'
      : diagram.pins.length
        ? '点图上空白的地方再加一个点; 拖动点可以挪位置; 点一下点跳到它的卡片。'
        : '在图上点一下要考的地方, 下面会多一张卡片, 写上这个地方叫什么。';
  }

  function pinEl(p, number) {
    const label = rows().find((r) => r.id === p.cardId)?.label ?? '';
    const pin = h('button', { class: 'pin', type: 'button', style: `left:${p.x * 100}%;top:${p.y * 100}%`, title: label || `第 ${number} 个点`, 'aria-label': `第 ${number} 个点${label ? `: ${label}` : ''}` }, String(number));
    let start = null;
    let moved = false;
    pin.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      start = { x: e.clientX, y: e.clientY };
      moved = false;
      pin.setPointerCapture?.(e.pointerId);
    });
    pin.addEventListener('pointermove', (e) => {
      if (!start) return;
      if (!moved && Math.hypot(e.clientX - start.x, e.clientY - start.y) < 4) return;
      moved = true;
      const { x, y } = relPos(e, box);
      p.x = x;
      p.y = y;
      pin.style.left = `${x * 100}%`;
      pin.style.top = `${y * 100}%`;
    });
    pin.addEventListener('pointerup', (e) => {
      e.stopPropagation();
      if (!start) return;
      start = null;
      if (moved) onChange();
      else focusCard(p.cardId);
    });
    pin.addEventListener('click', (e) => e.stopPropagation());
    return pin;
  }

  box.addEventListener('click', (e) => {
    const { x, y } = relPos(e, box);
    if (placing) {
      diagram.pins = diagram.pins.filter((p) => p.cardId !== placing);
      diagram.pins.push({ cardId: placing, x, y });
      const id = placing;
      placing = null;
      draw();
      onChange();
      focusCard(id);
      return;
    }
    const id = addCard();
    diagram.pins.push({ cardId: id, x, y });
    draw();
    onChange();
    focusCard(id);
  });

  draw();
  return {
    el,
    redraw: draw,
    numberOf: (cardId) => diagram.pins.findIndex((p) => p.cardId === cardId) + 1,
    place(cardId) {
      placing = cardId;
      draw();
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    },
    cancelPlacing() {
      if (!placing) return false;
      placing = null;
      draw();
      return true;
    },
    unpin(cardId) {
      diagram.pins = diagram.pins.filter((p) => p.cardId !== cardId);
      draw();
      onChange();
    },
  };
}

// ---- 练习: 「这是哪个?」和「找到它」 ----
export function renderDiagramPractice({ store }, id) {
  const set = store.getSet(id);
  const back = `#/set/${encodeURIComponent(id)}`;
  const pins = set && !set.virtual ? pinnedCards(set) : [];
  if (pins.length < 2) {
    return {
      title: '标注图',
      el: h('section', { class: 'empty' }, h('h1', {}, '标注图上至少要有两个点'), h('p', { class: 'muted' }, '在卡片集的「编辑」里加一张图, 在图上标出要考的地方。'), h('a', { class: 'btn primary', href: set ? `${back}/edit` : '#/' }, set ? '去编辑' : '回首页')),
    };
  }
  let queue = [];
  let total = 0;
  let firstTry = 0;
  let missed = new Set();
  let phase = 'question';
  const bar = h('span', { class: 'meter-fill' });
  const stage = h('div', { class: 'learn-stage' });

  function start() {
    queue = diagramQuestions(set);
    total = queue.length;
    firstTry = 0;
    missed = new Set();
    ask();
  }

  function ask() {
    bar.style.width = `${((total - queue.length) / total) * 100}%`;
    const q = queue[0];
    if (!q) return finish();
    phase = 'question';
    stage.replaceChildren(q.kind === 'name' ? nameView(q) : locateView(q));
  }

  function answered(q, correct, view) {
    if (phase !== 'question') return;
    phase = 'feedback';
    store.recordAnswer(set.id, q.card.id, correct);
    playSound(correct ? 'right' : 'wrong');
    const key = `${q.kind}:${q.card.id}`;
    queue.shift();
    if (correct && !missed.has(key)) firstTry++;
    if (!correct) {
      missed.add(key);
      queue.push(q); // 答错的最后再来一次, 直到答对
    }
    const fb = view.feedback;
    const cont = h('button', { class: 'btn primary', onclick: next }, '继续');
    if (correct) {
      fb.className = 'feedback good';
      fill(fb, h('strong', {}, '对了!'), ' ', rich(q.card.term), q.card.def ? h('span', { class: 'muted' }, ' — ', rich(q.card.def)) : null);
      view.timer = setTimeout(next, 1100);
    } else {
      fb.className = 'feedback bad';
      fill(fb, h('strong', {}, '不对, 是这个: '), rich(q.card.term), q.card.def ? h('div', { class: 'muted small' }, rich(q.card.def)) : null, h('div', { class: 'row' }, cont));
      cont.focus();
    }
    stage.next = next;
    function next() {
      clearTimeout(view.timer);
      if (phase !== 'feedback') return;
      ask();
    }
  }

  function nameView(q) {
    const figure = diagramFigure(set, { highlight: q.card.id, labels: 'none' });
    const feedback = h('div', { class: 'feedback', 'aria-live': 'polite' });
    const buttons = q.options.map((opt, i) =>
      h('button', { class: 'option', onclick: () => choose(i) }, h('span', { class: 'key' }, String(i + 1)), h('span', { class: 'option-text' }, opt ? rich(opt) : '(空)')),
    );
    const view = h('div', { class: 'question diagram-q' }, h('div', { class: 'q-label muted small' }, '这是哪个? · 亮着的那个点'), figure, h('div', { class: 'options-grid' }, buttons), feedback);
    view.feedback = feedback;
    const choose = (i) => {
      if (phase !== 'question' || !buttons[i]) return;
      buttons.forEach((b, j) => {
        b.disabled = true;
        if (j === q.correctIndex) b.classList.add('right');
        else if (j === i) b.classList.add('wrong');
      });
      answered(q, i === q.correctIndex, view);
    };
    view.choose = choose;
    return view;
  }

  function locateView(q) {
    const feedback = h('div', { class: 'feedback', 'aria-live': 'polite' });
    let view = null;
    const figure = diagramFigure(set, {
      labels: 'none',
      size: 'locate',
      onPick: (cardId) => {
        if (phase !== 'question') return;
        const ok = cardId === q.card.id;
        figure.mark(q.card.id, 'right');
        if (!ok) {
          figure.mark(cardId, 'wrong');
          const other = pins.find((p) => p.cardId === cardId);
          if (other) figure.label(cardId, stripMarks(other.card.term));
        }
        figure.label(q.card.id, stripMarks(q.card.term));
        answered(q, ok, view);
      },
    });
    view = h(
      'div',
      { class: 'question diagram-q' },
      h('div', { class: 'q-label muted small' }, '找到它 · 在图上点出来'),
      h('div', { class: 'q-prompt' }, h('div', { class: 'q-text' }, rich(q.card.term)), sayButton(q.card, 'term', set)),
      figure,
      feedback,
    );
    view.feedback = feedback;
    return view;
  }

  function finish() {
    phase = 'done';
    bar.style.width = '100%';
    const wrong = [...missed].map((k) => k.split(':')[1]);
    const wrongCards = [...new Set(wrong)].map((cid) => set.cards.find((c) => c.id === cid)).filter(Boolean);
    stage.replaceChildren(
      h(
        'div',
        { class: 'summary' },
        h('div', { class: 'game-emoji', 'aria-hidden': 'true' }, firstTry === total ? '🎯' : '🗺️'),
        h('h2', {}, firstTry === total ? '全对了!' : '练完了'),
        h('p', { class: 'muted' }, `${total} 道题, ${firstTry} 道第一次就答对`),
        wrongCards.length ? h('p', {}, '要多看看: ', wrongCards.map((c, i) => [i ? '、' : '', stripMarks(c.term)])) : null,
        h('div', { class: 'row center' }, h('button', { class: 'btn primary', onclick: start }, '再练一次'), h('a', { class: 'btn', href: back }, '回卡片集')),
      ),
    );
  }

  function onKey(e) {
    if (dialogOpen() || e.metaKey || e.ctrlKey || e.altKey || e.target.closest?.('input, textarea, select')) return;
    const view = stage.firstChild;
    if (phase === 'question' && view?.choose) {
      const n = Number(e.key);
      if (n >= 1 && n <= 4) {
        e.preventDefault();
        view.choose(n - 1);
      }
    } else if (phase === 'feedback' && (e.key === 'Enter' || e.key === ' ') && !e.target.closest?.('button')) {
      e.preventDefault();
      stage.next?.();
    }
  }
  document.addEventListener('keydown', onKey);
  start();

  return {
    title: `标注图 · ${set.title || '未命名卡片集'}`,
    el: h(
      'section',
      { class: 'learn diagram-practice' },
      h('a', { class: 'back', href: back }, `← ${set.title || '未命名卡片集'}`),
      h('span', { class: 'meter thin' }, bar),
      stage,
      h('p', { class: 'muted small keys' }, '键盘: 「这是哪个」按 1–4 · 回车继续'),
    ),
    cleanup: () => {
      clearTimeout(stage.firstChild?.timer);
      document.removeEventListener('keydown', onKey);
    },
  };
}

