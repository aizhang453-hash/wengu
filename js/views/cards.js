// 单词卡 (照 Quizlet 的 Flashcards): 点一下翻面。
// 开着「跟踪进度」时, 每张标「还不会 / 会了」, 一轮完了可以只背还不会的; 关着时左右翻看, 能自动播放。
// 背到一半关掉, 下次打开接着背。

import { h, shuffled, openDialog, dialogOpen, switchRow, icon } from '../dom.js';
import { canSpeak, sayCard, stopSpeaking } from '../speech.js';
import { stripMarks } from '../rich.js';
import { rich, cardImage, sayButton } from '../cardview.js';

// 在这些框里打字时不接快捷键 (勾选框、单选框不算)
const TYPING = 'textarea, select, input:not([type=checkbox]):not([type=radio])';
const PREFS_KEY = 'wengu:cards-prefs';
const DEFAULT_PREFS = { track: true, shuffle: false, front: 'term', starredOnly: false, autoSpeak: false };
const AUTOPLAY_MS = 2500;

function loadPrefs() {
  try {
    const p = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}');
    // 老版本叫 defFirst
    if (p.front === undefined && p.defFirst !== undefined) p.front = p.defFirst ? 'def' : 'term';
    return { ...DEFAULT_PREFS, ...p };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

function saveJSON(key, value) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 存不了就算了
  }
}

// 「显示提示」: 每个词只露第一个字, 后面用下划线, 比如 apple pie → a____ p__。
// 只有一个字的词什么都不露, 只告诉你有一个字
export function hintOf(text) {
  return stripMarks(text)
    .split(/(\s+)/)
    .map((word) => {
      if (/^\s*$/.test(word)) return word;
      const chars = Array.from(word);
      const blank = (c) => (/[\p{L}\p{N}]/u.test(c) ? '_' : c);
      if (chars.filter((c) => /[\p{L}\p{N}]/u.test(c)).length <= 1) return chars.map(blank).join('');
      return chars[0] + chars.slice(1).map(blank).join('');
    })
    .join('');
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
  const sessionKey = `wengu:cards-session:${set.id}`;
  let deck = []; // 这一轮的卡片
  let index = 0;
  let flipped = false;
  let history = []; // 这一轮标过的 { id, known, wasKnown }, 用来撤销
  let finished = false;
  let busy = false; // 卡片飞出去的那一下不接新的操作
  let hint = false;
  let playTimer = null;
  let dialog = null;

  const byId = new Map(set.cards.map((c) => [c.id, c]));
  const sig = () => JSON.stringify([prefs.track, prefs.shuffle, prefs.front, prefs.starredOnly]);

  // ---- 记住背到哪了 ----
  function saveSession() {
    saveJSON(sessionKey, { sig: sig(), deck: deck.map((c) => c.id), index, history, finished });
  }

  function loadSession() {
    try {
      const s = JSON.parse(localStorage.getItem(sessionKey) ?? 'null');
      if (!s || s.sig !== sig() || !Array.isArray(s.deck) || s.deck.length === 0) return false;
      const cards = s.deck.map((cid) => byId.get(cid));
      if (cards.some((c) => !c)) return false; // 卡片改过了, 重新开始
      deck = cards;
      index = Math.min(Math.max(0, Number(s.index) || 0), deck.length - 1);
      history = Array.isArray(s.history) ? s.history.filter((x) => byId.has(x.id)) : [];
      finished = Boolean(s.finished);
      return true;
    } catch {
      return false;
    }
  }

  // ---- 页面上的东西 ----
  const bar = h('span', { class: 'meter-fill' });
  const stage = h('div', { class: 'stage' });
  const faceFront = h('div', { class: 'face front' });
  const faceBack = h('div', { class: 'face back' });
  const cardEl = h(
    'div',
    { class: 'flashcard', tabindex: 0, role: 'button', 'aria-label': '单词卡, 点一下翻面' },
    h('div', { class: 'flashcard-inner' }, faceFront, faceBack),
  );
  const keysStrip = h('div', { class: 'keys-strip' });
  const trackSwitch = h('input', {
    type: 'checkbox',
    role: 'switch',
    class: 'switch',
    checked: prefs.track,
    'aria-label': '跟踪进度',
    onchange: (e) => setPref('track', e.target.checked),
  });
  const center = h('div', { class: 'cc-center' });
  const undoBtn = h('button', { class: 'icon-btn tool', title: '撤销 (Z)', 'aria-label': '撤销', onclick: () => undo() }, icon('undo'));
  const shuffleBtn = h(
    'button',
    { class: 'icon-btn tool', title: '打乱顺序', 'aria-label': '打乱顺序', onclick: () => setPref('shuffle', !prefs.shuffle) },
    icon('shuffle'),
  );
  const playBtn = h('button', { class: 'icon-btn tool', 'aria-label': '自动播放', onclick: () => togglePlay() }, icon('play'));
  const settingsBtn = h('button', { class: 'icon-btn tool', title: '设置', 'aria-label': '设置', onclick: () => openSettings() }, icon('gear'));
  const fullBtn = h('button', { class: 'icon-btn tool', title: '全屏 (F)', 'aria-label': '全屏', onclick: () => toggleFull() }, icon('expand'));
  const page = h('section', { class: 'cards-page' });

  // 点一下翻面; 开着「跟踪进度」时手机上左右滑 = 还不会 / 会了
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
    if (prefs.track && Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) mark(dx > 0);
    else if (Math.abs(dx) < 10 && Math.abs(dy) < 10) flip();
  });
  cardEl.addEventListener('pointercancel', () => {
    downX = null;
  });

  function setPref(key, value) {
    prefs[key] = value;
    saveJSON(PREFS_KEY, prefs);
    stopPlay();
    start();
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

  function restart() {
    store.resetKnown(set.id);
    saveJSON(sessionKey, null);
    start();
  }

  function flip() {
    if (finished) return;
    flipped = !flipped;
    cardEl.classList.toggle('flipped', flipped);
    autoSpeak();
  }

  function mark(known) {
    if (finished || busy || !prefs.track) return;
    const card = deck[index];
    // 记下标之前的样子, 撤销时恢复 (会不会、答对答错次数、下次复习的日子)
    const stat = set.stats[card.id] ? structuredClone(set.stats[card.id]) : null;
    history.push({ id: card.id, known, wasKnown: set.known.includes(card.id), stat });
    store.setKnown(set.id, card.id, known);
    store.recordAnswer(set.id, card.id, known); // 也排进以后的复习
    busy = true;
    cardEl.classList.add(known ? 'fly-right' : 'fly-left');
    setTimeout(() => {
      busy = false;
      next();
    }, 180);
  }

  // 退回上一张; 跟踪进度时那张的「会了」恢复成标之前的样子
  function undo() {
    if (busy) return;
    if (!prefs.track) return prev();
    if (history.length === 0) return;
    const last = history.pop();
    store.setKnown(set.id, last.id, last.wasKnown);
    if ('stat' in last) store.restoreStat(set.id, last.id, last.stat);
    if (!finished) index = Math.max(0, index - 1);
    finished = false;
    flipped = false;
    draw();
  }

  function next() {
    if (index >= deck.length - 1) finished = true;
    else index++;
    flipped = false;
    if (finished) stopPlay();
    draw();
  }

  function prev() {
    if (index === 0 && !finished) return;
    if (finished) finished = false;
    else index--;
    flipped = false;
    draw();
  }

  // ---- 自动播放 (只在不跟踪进度时): 翻面, 下一张, 翻面…… ----
  function togglePlay() {
    if (playTimer) return stopPlay();
    if (prefs.track || finished) return;
    playTimer = setInterval(() => {
      if (!flipped) flip();
      else next();
    }, AUTOPLAY_MS);
    drawTools();
  }

  function stopPlay() {
    clearInterval(playTimer);
    playTimer = null;
    drawTools();
  }

  // ---- 全屏 ----
  function toggleFull() {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else page.requestFullscreen?.().catch(() => {});
  }

  // 现在看到的是哪一面
  function showingSide() {
    return flipped !== (prefs.front === 'def') ? 'def' : 'term';
  }

  function autoSpeak() {
    if (!prefs.autoSpeak || finished) return;
    sayCard(deck[index], showingSide(), set);
  }

  // ---- 画出来 ----
  function draw({ speakIt = true } = {}) {
    const shown = finished ? deck.length : index;
    bar.style.width = `${(shown / deck.length) * 100}%`;
    trackSwitch.checked = prefs.track;
    keysStrip.replaceChildren(
      h(
        'span',
        {},
        icon('keyboard', 18),
        h('strong', {}, ' 快捷键 '),
        ' 按 ',
        h('kbd', {}, '空格'),
        ' 或点卡片翻面',
        prefs.track ? [' · ', h('kbd', {}, '←'), ' 还不会 ', h('kbd', {}, '→'), ' 会了'] : [' · ', h('kbd', {}, '←'), ' ', h('kbd', {}, '→'), ' 上一张 / 下一张'],
      ),
    );
    drawTools();
    saveSession();

    if (finished) {
      stage.replaceChildren(summary());
      drawCenter();
      return;
    }
    const card = deck[index];
    const front = prefs.front === 'def' ? 'def' : 'term';
    const back = front === 'def' ? 'term' : 'def';
    faceFront.replaceChildren(...face(card, front, card[back]));
    faceBack.replaceChildren(...face(card, back, null));
    cardEl.className = 'flashcard';
    cardEl.classList.toggle('flipped', flipped);
    stage.replaceChildren(cardEl);
    drawCenter();
    if (speakIt) autoSpeak();
  }

  function drawCenter() {
    const counter = h('span', { class: 'cc-count' }, `${Math.min((finished ? deck.length : index) + 1, deck.length)} / ${deck.length}`);
    if (prefs.track) {
      const still = history.filter((x) => !x.known).length;
      const knew = history.length - still;
      center.replaceChildren(
        h(
          'button',
          { class: 'round-choice bad', title: '还不会 (←)', 'aria-label': '还不会', disabled: finished, onclick: () => mark(false) },
          icon('x', 22),
          still ? h('span', { class: 'tally' }, String(still)) : null,
        ),
        counter,
        h(
          'button',
          { class: 'round-choice good', title: '会了 (→)', 'aria-label': '会了', disabled: finished, onclick: () => mark(true) },
          icon('check', 22),
          knew ? h('span', { class: 'tally' }, String(knew)) : null,
        ),
      );
    } else {
      center.replaceChildren(
        h('button', { class: 'round-choice', title: '上一张 (←)', 'aria-label': '上一张', disabled: index === 0 && !finished, onclick: prev }, icon('left', 22)),
        counter,
        h('button', { class: 'round-choice', title: '下一张 (→)', 'aria-label': '下一张', disabled: finished, onclick: next }, icon('right', 22)),
      );
    }
  }

  function drawTools() {
    undoBtn.disabled = prefs.track ? history.length === 0 : index === 0 && !finished;
    shuffleBtn.classList.toggle('on', prefs.shuffle);
    shuffleBtn.setAttribute('aria-pressed', String(prefs.shuffle));
    playBtn.replaceChildren(icon(playTimer ? 'pause' : 'play'));
    playBtn.classList.toggle('on', Boolean(playTimer));
    playBtn.disabled = prefs.track || finished;
    playBtn.title = prefs.track ? '自动播放 (关掉跟踪进度才能用)' : playTimer ? '暂停 (P)' : '自动播放 (P)';
  }

  // 卡片的一面 (side: 'term' / 'def'; 图片在解释那面)。hintFor 是背面的答案, 只有正面给「显示提示」
  function face(card, side, hintFor) {
    const text = card[side];
    const image = side === 'def' ? card.image : '';
    const starred = set.starred.includes(card.id);
    const hintEl = h('div', { class: 'hint-text', hidden: !(hint && hintFor) }, hintFor ? hintOf(hintFor) : '');
    const tools = h(
      'div',
      { class: 'face-tools' },
      hintFor && hintFor.trim()
        ? h(
            'button',
            {
              class: 'hint-btn',
              title: '显示提示 (H)',
              onclick: (e) => {
                e.stopPropagation();
                toggleHint();
              },
            },
            icon('bulb', 18),
            hint ? ' 隐藏提示' : ' 显示提示',
          )
        : h('span'),
      h(
        'span',
        { class: 'row' },
        sayButton(card, side, set, { title: '朗读 (S)' }),
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
      ),
    );
    const size = text.length > 200 || (image && text.length > 60) ? ' tiny' : text.length > 60 || image ? ' small' : '';
    return [
      tools,
      h(
        'div',
        { class: `face-text${size}${image ? ' with-image' : ''}` },
        cardImage(image, 'face-img'),
        text.trim() ? rich(text) : image ? null : h('span', { class: 'muted' }, '(空)'),
      ),
      hintEl,
    ];
  }

  function toggleHint() {
    hint = !hint;
    draw({ speakIt: false });
  }

  function summary() {
    if (!prefs.track) {
      return h(
        'div',
        { class: 'summary' },
        h('h2', {}, '看完一遍了'),
        h(
          'div',
          { class: 'row center' },
          h('button', { class: 'btn primary', onclick: () => start() }, '从头再来'),
          h('a', { class: 'btn', href: `${base}/learn` }, '用学习模式练'),
          h('a', { class: 'btn', href: base }, '回到卡片集'),
        ),
      );
    }
    const knownIds = new Set(history.filter((x) => x.known).map((x) => x.id));
    const missed = deck.filter((c) => !knownIds.has(c.id));
    const got = deck.length - missed.length;
    return h(
      'div',
      { class: 'summary' },
      h('h2', {}, missed.length ? '你做得很好! 接着背还不会的吧' : '全都会了 🎉'),
      h(
        'div',
        { class: 'score' },
        h('div', { class: 'score-item good' }, h('strong', {}, String(got)), h('span', {}, '会了')),
        h('div', { class: 'score-item bad' }, h('strong', {}, String(missed.length)), h('span', {}, '还不会')),
      ),
      h(
        'div',
        { class: 'row center' },
        missed.length ? h('button', { class: 'btn primary', onclick: () => start(missed) }, `接着背还不会的 ${missed.length} 张`) : null,
        h('button', { class: missed.length ? 'btn' : 'btn primary', onclick: restart }, '重新开始单词卡模式'),
        h('a', { class: 'btn', href: `${base}/learn` }, '用学习模式练'),
        h('button', { class: 'btn', disabled: history.length === 0, onclick: undo }, '撤销最后一张'),
      ),
    );
  }

  // ---- 设置 ----
  function openSettings() {
    stopPlay();
    const keys = h(
      'details',
      { class: 'keys-list' },
      h('summary', {}, '快捷键'),
      h(
        'dl',
        {},
        [
          ['空格 / ↑ / ↓', '翻面'],
          ['← / →', '跟踪进度时: 还不会 / 会了; 不跟踪时: 上一张 / 下一张'],
          ['Z', '撤销'],
          ['S', '朗读看到的这一面'],
          ['H', '显示 / 隐藏提示'],
          ['F', '全屏'],
          ['P', '自动播放 (不跟踪进度时)'],
        ].map(([k, v]) => [h('dt', {}, h('kbd', {}, k)), h('dd', {}, v)]),
      ),
    );
    const frontSelect = h(
      'select',
      { class: 'input', 'aria-label': '正面', onchange: (e) => setPref('front', e.target.value) },
      h('option', { value: 'term', selected: prefs.front === 'term' }, '词'),
      h('option', { value: 'def', selected: prefs.front === 'def' }, '解释'),
    );
    dialog = openDialog({
      title: '选项',
      body: [
        switchRow({
          label: '跟踪进度',
          desc: '把卡片分成「还不会」和「会了」两堆, 记下你会了哪些。只想快速翻一遍的话关掉。',
          checked: prefs.track,
          onchange: (v) => setPref('track', v),
        }),
        switchRow({
          label: `只学星标的卡片${set.starred.length ? ` (${set.starred.length})` : ''}`,
          desc: set.starred.length ? null : '还没有加星标的卡片',
          checked: prefs.starredOnly,
          disabled: set.starred.length === 0,
          onchange: (v) => setPref('starredOnly', v),
        }),
        h('label', { class: 'switch-row' }, h('span', { class: 'switch-text' }, h('span', { class: 'switch-label' }, '正面')), frontSelect),
        switchRow({
          label: '自动朗读',
          desc: canSpeak() ? '每张卡片一出来、一翻面就念出来' : '这个浏览器不能朗读',
          checked: prefs.autoSpeak,
          disabled: !canSpeak(),
          onchange: (v) => {
            prefs.autoSpeak = v;
            saveJSON(PREFS_KEY, prefs);
          },
        }),
        keys,
        h(
          'button',
          {
            class: 'link-btn danger-link',
            onclick: () => {
              if (!confirm('把「会了」的记录都清掉, 从第一张重新开始?')) return;
              dialog?.close();
              restart();
            },
          },
          '重新开始单词卡模式',
        ),
      ],
      onClose: () => {
        dialog = null;
      },
    });
  }

  // ---- 键盘 ----
  function onKey(e) {
    if (dialogOpen() || e.target.closest?.(TYPING) || e.metaKey || e.ctrlKey || e.altKey) return;
    const key = e.key;
    if (key === 'f' || key === 'F') return toggleFull();
    if (finished) return;
    // 勾选框上按空格是勾 / 不勾, 不翻面
    if (key === ' ' && e.target.matches?.('input')) return;
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
      e.preventDefault();
      undo();
    } else if (key === 's' || key === 'S') {
      sayCard(deck[index], showingSide(), set);
    } else if (key === 'h' || key === 'H') {
      toggleHint();
    } else if (key === 'p' || key === 'P') {
      togglePlay();
    }
  }
  document.addEventListener('keydown', onKey);

  if (!loadSession()) start();
  else draw();

  page.append(
    h('div', { class: 'cards-head' }, h('a', { class: 'back', href: base }, `← ${set.title || '未命名卡片集'}`)),
    h('span', { class: 'meter thin' }, bar),
    stage,
    keysStrip,
    h(
      'div',
      { class: 'card-bar' },
      h('label', { class: 'track-toggle' }, h('span', {}, '跟踪进度'), trackSwitch),
      center,
      h('div', { class: 'cc-tools' }, undoBtn, shuffleBtn, playBtn, settingsBtn, fullBtn),
    ),
  );

  return {
    title: `单词卡 · ${set.title}`,
    el: page,
    cleanup: () => {
      stopPlay();
      dialog?.close();
      document.removeEventListener('keydown', onKey);
      if (document.fullscreenElement) document.exitFullscreen?.();
      stopSpeaking();
    },
  };
}
