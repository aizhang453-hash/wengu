// 今天的复习: 到了该复习日子的卡片 (所有卡片集, 或者一个卡片集 / 文件夹), 翻卡片自己说记不记得;
// 定了计划的卡片集今天的新词也插在里面 (plan.js)。复习每天有上限, 太多时最可能忘的先来

import { h, fill, dialogOpen, icon } from '../dom.js';
import { stopSpeaking, sayCard } from '../speech.js';
import { playSound } from '../sound.js';
import { rich, cardImage, sayButton } from '../cardview.js';
import { editButton, editCardDialog } from './cardedit.js';
import { dueTomorrow } from '../srs.js';
import { reviewCount } from '../revlog.js';
import { reviewedToday, mixIn, newCards, newToday, plannedSets, planOf, shareOf } from '../plan.js';
import { todayText, planLine, openCapDialog, dateText, todayAll } from './plan.js';
import { openOptimizeDialog } from './optimize.js';

const PREFS_KEY = 'wengu:review-prefs';
const TYPING = 'textarea, select, input:not([type=checkbox]):not([type=radio])';
const MORE = 10; // 「再学几个新词」一次几个
const AGAIN_GAP = 4; // 不会 / 忘了的, 隔几张再出来 (跟 Anki 一样一直出, 直到点会 / 记得)

export function renderReview({ store }, setId = null) {
  // 卡片集这些每次开始、做完时都从 store 现拿: 别的标签页存了、同步回来了, 数据会整个换掉
  let scope;
  let sets;
  let groups; // 定了计划的文件夹 (合起来的): 全部复习时所有的, 只复习一个文件夹时它自己
  let learnable; // 能学新词的: 定了计划的; 只复习一个卡片集 / 文件夹时, 没定计划也能「再学几个」(文件夹照里面的顺序)
  function resolve() {
    scope = setId ? store.getSet(setId) : null;
    sets = setId ? store.setsOf(setId) : store.allSets();
    groups = !setId ? store.plannedFolders() : scope?.virtual && scope.plan?.on ? [scope] : [];
    learnable = setId ? (scope?.virtual ? [scope] : sets.filter((s) => s.kind !== 'quiz')) : [...groups, ...plannedSets(sets)];
  }
  resolve();
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

  let queue = [];
  let total = 0;
  let held = 0; // 超过每天上限、没排进来的
  let retried = new Set(); // 这次忘过的 (不算「一次就会」)
  let history = []; // 撤销用: 每答一张之前的样子
  let done = 0;
  let right = 0;
  let flipped = false;
  let extra = false; // 今天的做完以后多来的 (不管上限 / 多学新词)
  let freshTotal = 0;
  const sub = h('p', { class: 'muted small review-sub' });

  // 今天的: 所有卡片集一起排好每天的上限, 只背一个卡片集 / 文件夹时拿它那份 (跟首页的表上写的一样多)
  const todayOf = (cap = store.reviewCap) => {
    const all = todayAll(store, { cap });
    return setId ? shareOf(all, sets) : all;
  };

  // 计划以外还能学的新词 (卡片集和文件夹都定了计划的, 同一张只算一次); 卡片记在原来的卡片集上
  function moreCards() {
    const owner = new Map(sets.flatMap((set) => set.cards.map((c) => [c.id, set])));
    const seen = new Set();
    return learnable
      .flatMap((set) => newCards(set).map((card) => ({ set: owner.get(card.id), card, fresh: true })))
      .filter((x) => x.set && !seen.has(x.card.id) && seen.add(x.card.id));
  }

  // noCap: 不管每天的上限; more: 计划以外再学几个新词
  function start({ noCap = false, more = 0 } = {}) {
    resolve();
    if (more) {
      queue = moreCards().slice(0, more);
      held = todayOf().held; // 超过上限的复习还在, 做完还能接着复习
    } else {
      const today = todayOf(noCap ? Infinity : store.reviewCap);
      queue = mixIn(today.reviews, today.fresh);
      held = today.held;
    }
    extra = Boolean(noCap || more);
    total = queue.length;
    freshTotal = queue.filter((x) => x.fresh).length;
    sub.textContent = todayText(total - freshTotal, freshTotal);
    retried = new Set();
    history = [];
    done = 0;
    right = 0;
    draw();
  }

  const bar = h('span', { class: 'meter-fill' });
  const counter = h('span', { class: 'counter' });
  const undoBtn = h('button', { class: 'btn small undo-btn', title: '撤销 (Z): 退回上一张重新选', onclick: () => undo() }, icon('undo', 16), ' 撤销');
  const stage = h('div', { class: 'learn-stage' });

  function sides() {
    return prefs.defFirst ? ['def', 'term'] : ['term', 'def'];
  }

  function draw() {
    bar.style.width = `${total ? (done / total) * 100 : 0}%`;
    counter.textContent = total ? `${Math.min(done, total)} / ${total}` : '';
    undoBtn.disabled = !history.length;
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
        h('p', { class: 'muted small center-text' }, fresh ? '空格翻面 · 1 不会 · 2 会 · Z 撤销' : '空格翻面 · 1 忘了 · 2 记得 · Z 撤销'),
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

  // 记得 / 会: 这张背完了; 忘了 / 不会: 隔几张再出来, 一直到点记得 (跟 Anki 一样)
  function grade(ok) {
    if (!flipped || !queue.length) return;
    const item = queue[0];
    const stat = store.ownerOf(item.set.id, item.card.id)?.stats[item.card.id];
    const before = { queue: [...queue], done, right, retried: new Set(retried), item, stat: stat ? structuredClone(stat) : null };
    queue.shift();
    before.code = store.recordAnswer(item.set.id, item.card.id, ok, { selfRated: true });
    history.push(before);
    if (prefs.sound) playSound(ok ? 'right' : 'wrong');
    if (ok) {
      if (!retried.has(item.card.id)) right++; // 忘过的不算「一次就会」
      done++;
    } else {
      retried.add(item.card.id);
      queue.splice(Math.min(queue.length, AGAIN_GAP), 0, item);
    }
    draw();
  }

  // 撤销: 上一张恢复成答以前的样子 (复习记录、下次哪天复习都退回去), 再出来重新选
  function undo() {
    const last = history.pop();
    if (!last) return;
    store.restoreStat(last.item.set.id, last.item.card.id, last.stat, last.code);
    ({ queue, done, right, retried } = last);
    draw();
  }

  // 改了每天的上限、复习排法: 正在背的不打断 (只改按钮上的字), 已经做完的重新算一下今天的
  function settingsChanged() {
    fill(capBtn, icon('gear', 16), ` 每天最多复习 ${store.reviewCap} 张`);
    fill(optBtn, store.data.settings.fsrs ? '📈 复习排法: 按我的记录' : '📈 复习排法: 默认');
    if (!queue.length) start();
  }

  // 复习记录攒了多少, 按自己的记录优化 FSRS 参数
  const optimizeBtn = (text) => h('button', { class: 'link-btn', onclick: () => openOptimizeDialog({ store, onChanged: settingsChanged }) }, text);
  function logNote() {
    const n = reviewCount(store.data.revlog);
    if (!n) return null;
    const own = store.data.settings.fsrs;
    const text = own
      ? `现在按你的记录优化过的参数排 (${dateText(own.at)})。翻卡自评的记录一共 ${n} 次, 攒多了可以再优化一次。`
      : n >= 400
        ? `翻卡自评的记录已经攒了 ${n} 次, 可以按你自己的记录优化排法了。`
        : `翻卡自评的记录已经攒了 ${n} 次。现在按 FSRS 的默认参数排; 攒到 1000 次左右, 按你自己的记录优化会更准。`;
    return h('p', { class: 'muted small' }, text, ' ', optimizeBtn('按我的记录优化'));
  }

  // 计划走到哪了 (这里有定了计划的卡片集才有)
  function planNotes() {
    const planned = [...groups, ...plannedSets(sets)];
    if (!planned.length) return null;
    return h(
      'ul',
      { class: 'plan-list' },
      planned.map((set) => h('li', {}, h('strong', {}, set.title || '未命名卡片集'), h('span', { class: 'muted small' }, planLine(newToday(set), planOf(set))))),
    );
  }

  // 做完了还想背: 不管上限接着复习, 或者计划以外再学几个新词
  function moreButtons() {
    const left = moreCards().length;
    return [
      held ? h('button', { class: 'btn', onclick: () => start({ noCap: true }) }, `接着复习剩下的 ${held} 张`) : null,
      left ? h('button', { class: 'btn', onclick: () => start({ more: MORE }) }, `再学 ${Math.min(MORE, left)} 个新词`) : null,
    ];
  }

  function finish() {
    resolve();
    held = todayOf().held; // 做完以后按现在的算 (复习到上限了, 剩下的都超了)
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
          h('div', { class: 'row center' }, history.length ? h('button', { class: 'btn', onclick: undo }, icon('undo', 16), ' 撤销最后一张') : null, moreButtons(), backBtn),
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
        h('div', { class: 'row center' }, history.length ? h('button', { class: 'btn', onclick: undo }, icon('undo', 16), ' 撤销最后一张') : null, moreButtons(), backBtn),
      ),
    );
  }

  function onKey(e) {
    if (dialogOpen() || e.target.closest?.(TYPING) || e.altKey) return;
    if ((e.key === 'z' || e.key === 'Z' || e.key === 'Backspace') && !e.shiftKey) {
      e.preventDefault();
      return undo();
    }
    if (e.metaKey || e.ctrlKey || !queue.length) return;
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

  const capBtn = h('button', { class: 'btn small', onclick: () => openCapDialog({ store, onSaved: settingsChanged }) });
  const optBtn = h('button', { class: 'btn small', onclick: () => openOptimizeDialog({ store, onChanged: settingsChanged }) });
  settingsChanged();

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
    capBtn,
    optBtn,
  );

  return {
    title: '今天的复习',
    el: h(
      'section',
      { class: 'learn-page' },
      h('div', { class: 'cards-head' }, h('a', { class: 'back', href: back }, `← ${backText}`), h('div', { class: 'row' }, undoBtn, counter)),
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
