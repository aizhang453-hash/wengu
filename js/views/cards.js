// 单词卡: 点一下翻面。开着「记录会不会」时, 每张标「还不会 / 会了」,
// 一轮完了可以只复习还不会的; 关着时就是左右翻看。

import { h, shuffled } from '../dom.js';
import { speak, canSpeak } from '../speech.js';

// 在这些框里打字时不接快捷键 (勾选框、单选框不算)
const TYPING = 'textarea, select, input:not([type=checkbox]):not([type=radio])';
const PREFS_KEY = 'wengu:cards-prefs';
const DEFAULT_PREFS = { track: true, shuffle: false, defFirst: false, starredOnly: false };

function loadPrefs() {
  try {
    return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

function savePrefs(prefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // 存不了就算了, 下次用默认的
  }
}

export function renderCards({ store }, id) {
  const set = store.getSet(id);
  const base = set ? `#/set/${encodeURIComponent(set.id)}` : '#/';
  if (!set || set.cards.length === 0) {
    return {
      title: '单词卡',
      el: h(
        'section',
        { class: 'empty' },
        h('h1', {}, set ? '这个卡片集还没有卡片' : '找不到这个卡片集'),
        h('a', { class: 'btn primary', href: set ? `${base}/edit` : '#/' }, set ? '去加卡片' : '回首页'),
      ),
    };
  }

  const prefs = loadPrefs();
  let deck = []; // 这一轮的卡片
  let index = 0;
  let flipped = false;
  let history = []; // 这一轮标过的 { card, known, wasKnown }, 用来撤销
  let finished = false;
  let busy = false; // 卡片飞出去的那一下不接新的操作

  // ---- 页面上的东西 ----
  const counter = h('span', { class: 'counter' });
  const bar = h('span', { class: 'meter-fill' });
  const stage = h('div', { class: 'stage' });
  const controls = h('div', { class: 'card-controls' });
  const keysEl = h('p', { class: 'muted small keys' });

  const faceFront = h('div', { class: 'face front' });
  const faceBack = h('div', { class: 'face back' });
  const cardEl = h(
    'div',
    {
      class: 'flashcard',
      tabindex: 0,
      role: 'button',
      'aria-label': '单词卡, 点一下翻面',
    },
    h('div', { class: 'flashcard-inner' }, faceFront, faceBack),
  );

  // 点一下翻面; 开着「记录会不会」时手机上左右滑 = 还不会 / 会了
  let downX = null;
  let downY = null;
  cardEl.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) return;
    downX = e.clientX;
    downY = e.clientY;
  });
  cardEl.addEventListener('pointerup', (e) => {
    if (downX === null) return;
    const dx = e.clientX - downX;
    const dy = e.clientY - downY;
    downX = null;
    if (prefs.track && Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) {
      mark(dx > 0);
    } else if (Math.abs(dx) < 10 && Math.abs(dy) < 10) {
      flip();
    }
  });
  cardEl.addEventListener('pointercancel', () => {
    downX = null;
  });

  const options = h(
    'div',
    { class: 'options' },
    toggle('track', '记录会不会'),
    toggle('shuffle', '打乱顺序'),
    toggle('defFirst', '先看解释'),
    set.starred.length ? toggle('starredOnly', `只看星标 (${set.starred.length})`) : null,
  );

  function toggle(key, label) {
    const box = h('input', {
      type: 'checkbox',
      checked: prefs[key],
      onchange: () => {
        prefs[key] = box.checked;
        savePrefs(prefs);
        start();
      },
    });
    return h('label', { class: 'toggle' }, box, ` ${label}`);
  }

  // ---- 一轮开始 ----
  function start(cards = null) {
    let pool = cards ?? set.cards;
    if (!cards && prefs.starredOnly) {
      const starred = new Set(set.starred);
      const only = pool.filter((c) => starred.has(c.id));
      if (only.length) pool = only;
    }
    deck = prefs.shuffle ? shuffled(pool) : [...pool];
    index = 0;
    flipped = false;
    history = [];
    finished = false;
    draw();
  }

  function flip() {
    if (finished) return;
    flipped = !flipped;
    cardEl.classList.toggle('flipped', flipped);
  }

  function mark(known) {
    if (finished || busy || !prefs.track) return;
    const card = deck[index];
    history.push({ card, known, wasKnown: set.known.includes(card.id) });
    store.setKnown(set.id, card.id, known);
    busy = true;
    cardEl.classList.add(known ? 'fly-right' : 'fly-left');
    setTimeout(() => {
      busy = false;
      next();
    }, 180);
  }

  // 退回上一张, 那张的「会了」恢复成标之前的样子
  function undo() {
    if (busy || !prefs.track || history.length === 0) return;
    const last = history.pop();
    store.setKnown(set.id, last.card.id, last.wasKnown);
    if (!finished) index = Math.max(0, index - 1);
    finished = false;
    flipped = false;
    draw();
  }

  function next() {
    if (index >= deck.length - 1) {
      finished = true;
    } else {
      index++;
    }
    flipped = false;
    draw();
  }

  function prev() {
    if (index === 0) return;
    index--;
    flipped = false;
    draw();
  }

  // ---- 画出来 ----
  function draw() {
    keysEl.textContent = `键盘: 空格翻面 · ${prefs.track ? '← 还不会 · → 会了 · Z 撤销' : '← → 上一张 / 下一张'} · S 朗读`;
    const shown = finished ? deck.length : index;
    counter.textContent = `${Math.min(shown + 1, deck.length)} / ${deck.length}`;
    bar.style.width = `${(shown / deck.length) * 100}%`;
    if (finished) {
      stage.replaceChildren(summary());
      controls.replaceChildren();
      return;
    }

    const card = deck[index];
    const front = prefs.defFirst ? card.def : card.term;
    const back = prefs.defFirst ? card.term : card.def;
    const frontLang = prefs.defFirst ? set.defLang : set.termLang;
    const backLang = prefs.defFirst ? set.termLang : set.defLang;
    faceFront.replaceChildren(...face(front, frontLang, card));
    faceBack.replaceChildren(...face(back, backLang, card));
    cardEl.className = 'flashcard';
    cardEl.classList.toggle('flipped', flipped);
    stage.replaceChildren(cardEl);

    if (prefs.track) {
      controls.replaceChildren(
        h('button', { class: 'btn round', title: '撤销 (Z)', disabled: history.length === 0, onclick: undo }, '↶'),
        h('button', { class: 'btn big-choice bad', onclick: () => mark(false) }, '✗ 还不会'),
        h('button', { class: 'btn big-choice good', onclick: () => mark(true) }, '✓ 会了'),
      );
    } else {
      controls.replaceChildren(
        h('button', { class: 'btn round', title: '上一张 (←)', disabled: index === 0, onclick: prev }, '←'),
        h('button', { class: 'btn', onclick: flip }, '翻面'),
        h('button', { class: 'btn round', title: '下一张 (→)', onclick: next }, '→'),
      );
    }
  }

  function face(text, lang, card) {
    const starred = set.starred.includes(card.id);
    const tools = h(
      'div',
      { class: 'face-tools' },
      canSpeak() && text.trim()
        ? h(
            'button',
            {
              class: 'icon-btn',
              title: '朗读 (S)',
              'aria-label': '朗读',
              onclick: (e) => {
                e.stopPropagation();
                speak(text, lang);
              },
            },
            '🔊',
          )
        : null,
      h(
        'button',
        {
          class: `icon-btn star${starred ? ' on' : ''}`,
          title: '星标',
          'aria-label': '星标',
          'aria-pressed': String(starred),
          onclick: (e) => {
            e.stopPropagation();
            store.toggleStar(set.id, card.id);
            const on = set.starred.includes(card.id);
            for (const b of cardEl.querySelectorAll('.star')) {
              b.classList.toggle('on', on);
              b.setAttribute('aria-pressed', String(on));
            }
          },
        },
        '★',
      ),
    );
    const size = text.length > 200 ? ' tiny' : text.length > 60 ? ' small' : '';
    return [tools, h('div', { class: `face-text${size}` }, text || h('span', { class: 'muted' }, '(空)'))];
  }

  function summary() {
    if (!prefs.track) {
      return h(
        'div',
        { class: 'summary' },
        h('h2', {}, '看完一遍了'),
        h('div', { class: 'row center' }, h('button', { class: 'btn primary', onclick: () => start() }, '从头再来'), h('a', { class: 'btn', href: base }, '回到卡片集')),
      );
    }
    const knownIds = new Set(history.filter((x) => x.known).map((x) => x.card.id));
    const missed = deck.filter((c) => !knownIds.has(c.id));
    const got = deck.length - missed.length;
    return h(
      'div',
      { class: 'summary' },
      h('h2', {}, missed.length ? '这一轮完了' : '全都会了 🎉'),
      h(
        'div',
        { class: 'score' },
        h('div', { class: 'score-item good' }, h('strong', {}, String(got)), h('span', {}, '会了')),
        h('div', { class: 'score-item bad' }, h('strong', {}, String(missed.length)), h('span', {}, '还不会')),
      ),
      h(
        'div',
        { class: 'row center' },
        missed.length
          ? h('button', { class: 'btn primary', onclick: () => start(missed) }, `接着背还不会的 ${missed.length} 张`)
          : null,
        h('button', { class: missed.length ? 'btn' : 'btn primary', onclick: () => start() }, '从头再来'),
        h('button', { class: 'btn', disabled: history.length === 0, onclick: undo }, '撤销最后一张'),
        h('a', { class: 'btn', href: base }, '回到卡片集'),
      ),
    );
  }

  // ---- 键盘 ----
  function onKey(e) {
    if (e.target.closest?.(TYPING) || e.metaKey || e.ctrlKey || e.altKey) return;
    if (finished) return;
    // 勾选框上按空格是勾 / 不勾, 不翻面
    if (e.key === ' ' && e.target.matches?.('input')) return;
    const key = e.key;
    if (key === ' ' || key === 'ArrowUp' || key === 'ArrowDown' || (key === 'Enter' && e.target === cardEl)) {
      e.preventDefault();
      flip();
    } else if (key === 'ArrowLeft') {
      e.preventDefault();
      if (prefs.track) mark(false);
      else prev();
    } else if (key === 'ArrowRight') {
      e.preventDefault();
      if (prefs.track) mark(true);
      else next();
    } else if (key === 'z' || key === 'Z' || key === 'Backspace') {
      if (prefs.track) {
        e.preventDefault();
        undo();
      }
    } else if (key === 's' || key === 'S') {
      const card = deck[index];
      const showingDef = flipped !== prefs.defFirst;
      speak(showingDef ? card.def : card.term, showingDef ? set.defLang : set.termLang);
    }
  }
  document.addEventListener('keydown', onKey);

  start();

  return {
    title: `单词卡 · ${set.title}`,
    el: h(
      'section',
      { class: 'cards-page' },
      h(
        'div',
        { class: 'cards-head' },
        h('a', { class: 'back', href: base }, `← ${set.title || '未命名卡片集'}`),
        counter,
      ),
      h('span', { class: 'meter thin' }, bar),
      stage,
      controls,
      options,
      keysEl,
    ),
    cleanup: () => {
      document.removeEventListener('keydown', onKey);
      if (canSpeak()) window.speechSynthesis.cancel();
    },
  };
}
