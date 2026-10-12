// 今天的复习: 到了该复习日子的卡片 (所有卡片集, 或者一个卡片集 / 文件夹), 翻卡片自己说记不记得

import { h, dialogOpen } from '../dom.js';
import { stopSpeaking, sayCard } from '../speech.js';
import { playSound } from '../sound.js';
import { rich, cardImage, sayButton } from '../cardview.js';
import { dueCards, dueTomorrow } from '../srs.js';
import { shuffle } from '../questions.js';

const PREFS_KEY = 'wengu:review-prefs';
const TYPING = 'textarea, select, input:not([type=checkbox]):not([type=radio])';
const MAX = 100; // 一次最多复习几张

export function renderReview({ store }, setId = null) {
  const scope = setId ? store.getSet(setId) : null;
  const sets = setId ? store.setsOf(setId) : store.allSets();
  const back = scope ? (scope.virtual ? `#/folder/${encodeURIComponent(scope.folderId)}` : `#/set/${encodeURIComponent(scope.id)}`) : '#/';
  const backText = scope ? scope.title || '未命名卡片集' : '首页';
  let prefs = { defFirst: false, sound: true };
  try {
    prefs = { ...prefs, ...JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') };
  } catch {
    // 用默认的
  }
  const savePrefs = () => {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch {
      // 存不了就算了
    }
  };

  // 同一天该复习的打乱一下, 免得老是一个顺序
  const queue = shuffle(dueCards(sets)).slice(0, MAX);
  const total = queue.length;
  const retried = new Set();
  let done = 0;
  let right = 0;
  let flipped = false;

  const bar = h('span', { class: 'meter-fill' });
  const counter = h('span', { class: 'counter' });
  const stage = h('div', { class: 'learn-stage' });

  function sides() {
    return prefs.defFirst ? ['def', 'term'] : ['term', 'def'];
  }

  function draw() {
    bar.style.width = `${total ? (done / total) * 100 : 0}%`;
    counter.textContent = total ? `${Math.min(done, total)} / ${total}` : '';
    if (!queue.length) return finish();
    const { set, card } = queue[0];
    const [front, backSide] = sides();
    flipped = false;
    const answer = h(
      'div',
      { class: 'flash-answer', hidden: true },
      h('span', { class: 'muted small' }, backSide === 'term' ? '词' : '解释'),
      backSide === 'def' ? cardImage(card.image, 'q-img') : null,
      h('div', { class: 'q-text small' }, rich(card[backSide])),
      sayButton(card, backSide, set),
    );
    const judge = h(
      'div',
      { class: 'options-grid two', hidden: true },
      h('button', { class: 'option tf bad-choice', onclick: () => grade(false) }, h('span', { class: 'key' }, '1'), '✗ 忘了'),
      h('button', { class: 'option tf good-choice', onclick: () => grade(true) }, h('span', { class: 'key' }, '2'), '✓ 记得'),
    );
    const flipBtn = h('button', { class: 'btn primary', onclick: () => reveal() }, '翻过来看答案');
    stage.replaceChildren(
      h(
        'div',
        { class: 'question q-flash' },
        h('div', { class: 'q-head' }, h('span', { class: 'muted small' }, front === 'term' ? '词' : '解释'), h('span', { class: 'muted small' }, set.title || '未命名卡片集')),
        h(
          'div',
          { class: 'q-prompt' },
          h('div', {}, front === 'def' ? cardImage(card.image, 'q-img') : null, h('div', { class: 'q-text' }, rich(card[front]))),
          sayButton(card, front, set),
        ),
        answer,
        h('div', { class: 'row center' }, flipBtn),
        judge,
        h('p', { class: 'muted small center-text' }, '空格翻面 · 1 忘了 · 2 记得'),
      ),
    );
    flipBtn.focus();
    stage.reveal = () => {
      if (flipped) return;
      flipped = true;
      answer.hidden = false;
      judge.hidden = false;
      flipBtn.remove();
    };
  }

  function reveal() {
    stage.reveal?.();
  }

  function grade(ok) {
    if (!flipped || !queue.length) return;
    const item = queue.shift();
    store.recordAnswer(item.set.id, item.card.id, ok);
    if (prefs.sound) playSound(ok ? 'right' : 'wrong');
    if (ok) {
      if (!retried.has(item.card.id)) right++; // 忘过一次的不算「一次就记得」
      done++;
    } else if (!retried.has(item.card.id)) {
      // 忘了的这次复习最后再来一遍
      retried.add(item.card.id);
      queue.push(item);
    } else {
      done++;
    }
    draw();
  }

  function finish() {
    const tomorrow = dueTomorrow(sets);
    if (total === 0) {
      stage.replaceChildren(
        h(
          'div',
          { class: 'summary' },
          h('div', { class: 'game-emoji', 'aria-hidden': 'true' }, '✅'),
          h('h2', {}, '今天没有要复习的'),
          h('p', { class: 'muted' }, '单词卡、学习、测试里答过的卡片, 会照遗忘的规律排到以后某一天再出来: 答对了隔得越来越久, 答错了很快再来。'),
          tomorrow ? h('p', {}, `明天有 ${tomorrow} 张要复习。`) : null,
          h('div', { class: 'row center' }, h('a', { class: 'btn primary', href: back }, `回到${backText}`)),
        ),
      );
      return;
    }
    if (prefs.sound) playSound('done');
    stage.replaceChildren(
      h(
        'div',
        { class: 'summary' },
        h('div', { class: 'game-emoji', 'aria-hidden': 'true' }, '🎉'),
        h('h2', {}, '今天的复习做完了'),
        h('p', { class: 'muted' }, `复习了 ${total} 张, 一次就记得的 ${right} 张。`),
        tomorrow ? h('p', {}, `明天还有 ${tomorrow} 张。`) : h('p', { class: 'muted' }, '明天没有要复习的。'),
        h('div', { class: 'row center' }, h('a', { class: 'btn primary', href: back }, `回到${backText}`)),
      ),
    );
  }

  function onKey(e) {
    if (dialogOpen() || e.target.closest?.(TYPING) || e.metaKey || e.ctrlKey || e.altKey || !queue.length) return;
    if (e.key === ' ' && !e.target.closest?.('button')) {
      e.preventDefault();
      reveal();
    } else if (e.key === '1' || e.key === '2') {
      e.preventDefault();
      grade(e.key === '2');
    } else if (e.key === 's' || e.key === 'S') {
      const { set, card } = queue[0];
      const [front, backSide] = sides();
      sayCard(card, flipped ? backSide : front, set);
    }
  }
  document.addEventListener('keydown', onKey);

  draw();

  const options = h(
    'div',
    { class: 'options' },
    h(
      'label',
      { class: 'toggle' },
      h('input', {
        type: 'checkbox',
        checked: prefs.defFirst,
        onchange: (e) => {
          prefs.defFirst = e.target.checked;
          savePrefs();
          if (queue.length) draw();
        },
      }),
      ' 先看解释',
    ),
    h(
      'label',
      { class: 'toggle' },
      h('input', {
        type: 'checkbox',
        checked: prefs.sound,
        onchange: (e) => {
          prefs.sound = e.target.checked;
          savePrefs();
        },
      }),
      ' 音效',
    ),
  );

  return {
    title: '今天的复习',
    el: h(
      'section',
      { class: 'learn-page' },
      h('div', { class: 'cards-head' }, h('a', { class: 'back', href: back }, `← ${backText}`), counter),
      h('h1', { class: 'review-title' }, scope ? `复习: ${scope.title || '未命名卡片集'}` : '今天的复习'),
      h('span', { class: 'meter thin' }, bar),
      stage,
      total ? options : null,
    ),
    cleanup: () => {
      document.removeEventListener('keydown', onKey);
      stopSpeaking();
    },
  };
}
