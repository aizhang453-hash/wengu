// 今天的复习: 到了该复习日子的卡片 (所有卡片集, 或者一个卡片集 / 文件夹), 翻卡片自己说记不记得;
// 定了计划的卡片集今天的新词也插在里面 (plan.js)。复习每天有上限, 太多时最可能忘的先来

import { h, dialogOpen, icon } from '../dom.js';
import { stopSpeaking, sayCard } from '../speech.js';
import { playSound } from '../sound.js';
import { rich, cardImage, sayButton } from '../cardview.js';
import { editButton, editCardDialog } from './cardedit.js';
import { dueTomorrow } from '../srs.js';
import { reviewCount } from '../revlog.js';
import { todayQueue, reviewedToday, mixIn, newCards, newToday, plannedSets, planOf } from '../plan.js';
import { todayText, planLine, openCapDialog } from './plan.js';

const PREFS_KEY = 'wengu:review-prefs';
const TYPING = 'textarea, select, input:not([type=checkbox]):not([type=radio])';
const MORE = 10; // 「再学几个新词」一次几个

export function renderReview({ store, go }, setId = null) {
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

  // 能学新词的: 定了计划的; 只复习一个卡片集时, 没定计划也能「再学几个」
  const learnable = setId ? sets.filter((s) => s.kind !== 'quiz') : plannedSets(sets);
  let queue = [];
  let total = 0;
  let held = 0; // 超过每天上限、没排进来的
  let retried = new Set();
  let done = 0;
  let right = 0;
  let flipped = false;
  let extra = false; // 今天的做完以后多来的 (不管上限 / 多学新词)
  let freshTotal = 0;
  const sub = h('p', { class: 'muted small review-sub' });

  // noCap: 不管每天的上限; more: 计划以外再学几个新词
  function start({ noCap = false, more = 0 } = {}) {
    if (more) {
      queue = learnable.flatMap((set) => newCards(set).map((card) => ({ set, card, fresh: true }))).slice(0, more);
      held = 0;
    } else {
      const today = todayQueue(sets, { cap: noCap ? Infinity : store.reviewCap, reviewed: reviewedToday(store.allSets()) });
      queue = mixIn(today.reviews, today.fresh);
      held = today.held;
    }
    extra = Boolean(noCap || more);
    total = queue.length;
    freshTotal = queue.filter((x) => x.fresh).length;
    sub.textContent = todayText(total - freshTotal, freshTotal);
    retried = new Set();
    done = 0;
    right = 0;
    draw();
  }

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
    const fresh = queue[0].fresh;
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
      h('button', { class: 'option tf bad-choice', onclick: () => grade(false) }, h('span', { class: 'key' }, '1'), fresh ? '✗ 不会' : '✗ 忘了'),
      h('button', { class: 'option tf good-choice', onclick: () => grade(true) }, h('span', { class: 'key' }, '2'), fresh ? '✓ 会' : '✓ 记得'),
    );
    const flipBtn = h('button', { class: 'btn primary', onclick: () => reveal() }, '翻过来看答案');
    stage.replaceChildren(
      h(
        'div',
        { class: 'question q-flash' },
        h(
          'div',
          { class: 'q-head' },
          h('span', { class: 'muted small' }, front === 'term' ? '词' : '解释', fresh ? h('span', { class: 'badge new-badge' }, '新词') : null),
          h('span', { class: 'muted small' }, set.title || '未命名卡片集'),
        ),
        h(
          'div',
          { class: 'q-prompt' },
          h('div', {}, front === 'def' ? cardImage(card.image, 'q-img') : null, h('div', { class: 'q-text' }, rich(card[front]))),
          h(
            'div',
            { class: 'q-prompt-tools' },
            sayButton(card, front, set),
            editButton(() =>
              editCardDialog({
                store,
                setId: set.id,
                card,
                onSaved: () => {
                  const wasFlipped = flipped;
                  draw();
                  if (wasFlipped) reveal();
                },
              }),
            ),
          ),
        ),
        answer,
        h('div', { class: 'row center' }, flipBtn),
        judge,
        h('p', { class: 'muted small center-text' }, fresh ? '空格翻面 · 1 不会 · 2 会' : '空格翻面 · 1 忘了 · 2 记得'),
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
    store.recordAnswer(item.set.id, item.card.id, ok, { selfRated: true });
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

  // 复习记录攒了多少 (以后按自己的记录优化 FSRS 用)
  function logNote() {
    const n = reviewCount(store.data.revlog);
    return n ? h('p', { class: 'muted small' }, `翻卡自评的记录已经攒了 ${n} 次。现在按 FSRS 的默认参数排; 攒到 1000 次左右, 就能按你自己的记录优化。`) : null;
  }

  // 计划走到哪了 (这里有定了计划的卡片集才有)
  function planNotes() {
    const planned = plannedSets(sets);
    if (!planned.length) return null;
    return h(
      'ul',
      { class: 'plan-list' },
      planned.map((set) => h('li', {}, h('strong', {}, set.title || '未命名卡片集'), h('span', { class: 'muted small' }, planLine(newToday(set), planOf(set))))),
    );
  }

  // 做完了还想背: 不管上限接着复习, 或者计划以外再学几个新词
  function moreButtons() {
    const left = learnable.reduce((n, set) => n + newToday(set).left, 0);
    return [
      held ? h('button', { class: 'btn', onclick: () => start({ noCap: true }) }, `接着复习剩下的 ${held} 张`) : null,
      left ? h('button', { class: 'btn', onclick: () => start({ more: MORE }) }, `再学 ${Math.min(MORE, left)} 个新词`) : null,
    ];
  }

  function finish() {
    const tomorrow = dueTomorrow(sets);
    const backBtn = h('a', { class: 'btn primary', href: back }, `回到${backText}`);
    const heldNote = held ? h('p', {}, `还有 ${held} 张到日子的, 超过了每天最多复习 ${store.reviewCap} 张的上限, 明天先来最可能忘的。想现在接着复习也行。`) : null;
    if (total === 0) {
      const busy = reviewedToday(sets) > 0 || learnable.some((set) => newToday(set).learned);
      stage.replaceChildren(
        h(
          'div',
          { class: 'summary' },
          h('div', { class: 'game-emoji', 'aria-hidden': 'true' }, '✅'),
          h('h2', {}, held ? '今天复习够了' : busy ? '今天的背完了' : '今天没有要复习的'),
          heldNote ??
            (busy
              ? null
              : h('p', { class: 'muted' }, '在单词卡里 (还有学习里的单词卡题) 翻过来、自己说了会不会的卡片, 会用 FSRS 排到以后某一天再出来: 记得的隔得越来越久, 忘了的很快再来。在卡片集里定个「每天背新词」的计划, 每天的新词也会在这里出。')),
          tomorrow ? h('p', {}, `明天有 ${tomorrow} 张要复习。`) : null,
          planNotes(),
          logNote(),
          h('div', { class: 'row center' }, moreButtons(), backBtn),
        ),
      );
      return;
    }
    if (prefs.sound) playSound('done');
    const fresh = freshTotal ? ` (新词 ${freshTotal} 个)` : '';
    stage.replaceChildren(
      h(
        'div',
        { class: 'summary' },
        h('div', { class: 'game-emoji', 'aria-hidden': 'true' }, '🎉'),
        h('h2', {}, extra ? '做完了' : '今天的复习做完了'),
        h('p', { class: 'muted' }, `背了 ${total} 张${fresh}, 一次就会的 ${right} 张。`),
        heldNote,
        tomorrow ? h('p', {}, `明天还有 ${tomorrow} 张。`) : h('p', { class: 'muted' }, '明天没有要复习的。'),
        planNotes(),
        logNote(),
        h('div', { class: 'row center' }, moreButtons(), backBtn),
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

  start();

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
    h('button', { class: 'btn small', onclick: () => openCapDialog({ store, onSaved: () => go(location.hash) }) }, icon('gear', 16), ` 每天最多复习 ${store.reviewCap} 张`),
  );

  return {
    title: '今天的复习',
    el: h(
      'section',
      { class: 'learn-page' },
      h('div', { class: 'cards-head' }, h('a', { class: 'back', href: back }, `← ${backText}`), counter),
      h('h1', { class: 'review-title' }, scope ? `复习: ${scope.title || '未命名卡片集'}` : '今天的复习'),
      sub,
      h('span', { class: 'meter thin' }, bar),
      stage,
      options,
    ),
    cleanup: () => {
      document.removeEventListener('keydown', onKey);
      stopSpeaking();
    },
  };
}
