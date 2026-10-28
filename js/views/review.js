// 今天的复习: 到了该复习日子的卡片 (所有卡片集, 或者一个卡片集 / 文件夹), 翻卡片自己说记不记得;
// 定了计划的卡片集今天的新词也插在里面 (plan.js)。复习每天有上限, 太多时最可能忘的先来。
// 按钮上写着点了以后多久再来; 老忘的 (难记卡) 提醒换个记法; 能「明天再背这张」、暂停; 自定义学习 (custom.js)

import { h, fill, dialogOpen, icon, openDialog, toast } from '../dom.js';
import { stopSpeaking, sayCard } from '../speech.js';
import { playSound } from '../sound.js';
import { rich, cardImage, sayButton, dictButton } from '../cardview.js';
import { stripMarks } from '../rich.js';
import { editButton, editCardDialog } from './cardedit.js';
import { dueTomorrow, leechAlert, LEECH } from '../srs.js';
import { reviewCount } from '../revlog.js';
import { reviewedToday, mixIn, newCards, newToday, plannedSets, planOf, shareOf } from '../plan.js';
import { CUSTOM, PRACTICE, customCards } from '../custom.js';
import { todayText, planLine, dateText, todayAll, laterText } from './plan.js';
import { openOptimizeDialog } from './optimize.js';

const PREFS_KEY = 'wengu:review-prefs';
const TYPING = 'textarea, select, input:not([type=checkbox]):not([type=radio])';
const MORE = 10; // 「再学几个新词」一次几个
const AHEAD = 20; // 「提前复习」默认几张
const AGAIN_GAP = 4; // 不会 / 忘了的, 隔几张再出来 (跟 Anki 一样一直出, 直到点会 / 记得)

export function renderReview({ store }, setId = null, { practice: startWith = null } = {}) {
  // 卡片集这些每次开始、做完时都从 store 现拿: 别的标签页存了、同步回来了, 数据会整个换掉
  let scope;
  let sets;
  let groups; // 定了计划的文件夹 (合起来的): 全部复习时所有的, 只复习一个文件夹时它自己
  let learnable; // 能学新词的: 定了计划的; 只复习一个卡片集 / 文件夹时, 没定计划也能「再学几个」(文件夹照里面的顺序)
  function resolve() {
    scope = setId ? store.getSet(setId) : null;
    sets = setId ? store.setsOf(setId) : store.dailySets();
    groups = !setId ? store.plannedFolders() : scope?.virtual && scope.plan?.on ? [scope] : [];
    learnable = setId ? (scope?.virtual ? [scope] : sets) : [...groups, ...plannedSets(sets)];
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
  let mode = 'today'; // today 今天的 | 自定义学习的一种 (custom.js 的 CUSTOM)
  let practice = false; // 练习: 只算答对答错, 不动复习的日子
  let held = 0; // 超过每天上限、没排进来的
  let retried = new Set(); // 这次忘过的 (不算「一次就会」)
  let history = []; // 撤销用: 每答一张之前的样子
  let done = 0;
  let right = 0;
  let flipped = false;
  let freshTotal = 0;
  const sub = h('p', { class: 'muted small review-sub' });
  const notice = h('div', { class: 'review-notice' }); // 难记卡的提醒

  // 今天的: 所有卡片集一起排好每天的上限, 只背一个卡片集 / 文件夹时拿它那份 (跟首页的表上写的一样多)
  const todayOf = (cap = store.reviewCap) => {
    const all = todayAll(store, { cap });
    return setId ? shareOf(all, sets) : all;
  };

  // 计划以外还能学的新词 (卡片集和文件夹都定了计划的, 同一张只算一次; 今天计划里的不算); 卡片记在原来的卡片集上
  function moreCards() {
    const owner = new Map(sets.flatMap((set) => set.cards.map((c) => [c.id, set])));
    const seen = new Set(todayOf().fresh.map((x) => x.card.id));
    return learnable
      .flatMap((set) => newCards(set).map((card) => ({ set: owner.get(card.id), card, fresh: true })))
      .filter((x) => x.set && !seen.has(x.card.id) && seen.add(x.card.id));
  }

  // 自定义学习那几种有几张
  function customPool(kind) {
    if (kind === 'more') return moreCards();
    return customCards(kind, sets, store.data.revlog);
  }

  // kind: today 今天的 | nocap 不管每天的上限 | more 计划以外再学几个新词 | ahead / forgot / leech / starred (custom.js);
  // count: 来几张 (more、ahead)
  function start(kind = 'today', count = 0) {
    resolve();
    mode = kind;
    practice = PRACTICE.has(kind);
    if (kind === 'today' || kind === 'nocap') {
      const today = todayOf(kind === 'nocap' ? Infinity : store.reviewCap);
      queue = mixIn(today.reviews, today.fresh);
      held = today.held;
    } else {
      queue = customPool(kind).slice(0, count || Infinity);
      held = todayOf().held; // 超过上限的复习还在, 做完还能接着复习
    }
    total = queue.length;
    freshTotal = queue.filter((x) => x.fresh).length;
    retried = new Set();
    history = [];
    done = 0;
    right = 0;
    clearNotice();
    draw();
  }

  const bar = h('span', { class: 'meter-fill' });
  const counter = h('span', { class: 'counter' });
  const undoBtn = h('button', { class: 'btn small undo-btn', title: '撤销（Z）', onclick: () => undo() }, icon('undo', 16), ' 撤销');
  const stage = h('div', { class: 'learn-stage' });

  function sides() {
    return prefs.defFirst ? ['def', 'term'] : ['term', 'def'];
  }

  // 上面那行: 这次背什么、几张 (明天再背 / 暂停了的不算)
  function subText() {
    if (mode === 'ahead') return `提前复习 ${total} 张`;
    if (practice) return `练习${{ forgot: '今日遗忘', leech: '难记卡片', starred: '星标卡片' }[mode]} ${total} 张 · 不影响复习安排`;
    return todayText(total - freshTotal, freshTotal);
  }

  function draw() {
    sub.textContent = subText();
    bar.style.width = `${total ? (done / total) * 100 : 0}%`;
    counter.textContent = total ? `${Math.min(done, total)} / ${total}` : '';
    undoBtn.disabled = !history.length;
    if (!queue.length) return finish();
    const { set, card } = queue[0];
    const [front, backSide] = sides();
    const fresh = queue[0].fresh;
    const stat = store.ownerOf(set.id, card.id)?.stats[card.id];
    // 点了以后多久再来 (练习的不动日子)
    const next = practice ? null : store.previewAnswer(set.id, card.id);
    const when = (r) => (r ? h('span', { class: 'next-ivl' }, laterText(r.due)) : null);
    flipped = false;
    const answer = h(
      'div',
      { class: 'flash-answer', hidden: true },
      h('span', { class: 'muted small' }, backSide === 'term' ? '词语' : '释义'),
      backSide === 'def' ? cardImage(card.image, 'q-img') : null,
      h('div', { class: 'q-text small' }, rich(card[backSide])),
      h('span', { class: 'answer-tools' }, sayButton(card, backSide, set), dictButton(card, set)),
    );
    const judge = h(
      'div',
      { class: 'options-grid two', hidden: true },
      h('button', { class: 'option tf bad-choice', onclick: () => grade(false) }, h('span', { class: 'key' }, '1'), h('span', { class: 'judge-text' }, fresh ? '不认识' : '忘记', when(next?.again))),
      h('button', { class: 'option tf good-choice', onclick: () => grade(true) }, h('span', { class: 'key' }, '2'), h('span', { class: 'judge-text' }, fresh ? '认识' : '记得', when(next?.good))),
    );
    // 今天先不背、暂停 (练习时只能暂停)
    const asideTools = h(
      'div',
      { class: 'row center review-aside' },
      practice ? null : h('button', { class: 'link-btn', title: '今日跳过，明日再复习', onclick: () => setAside(queue[0], 'bury') }, '推迟到明天'),
      h('button', { class: 'link-btn', title: '不再安排复习，可在卡片集页恢复', onclick: () => setAside(queue[0], 'suspend') }, '暂停此卡'),
    );
    const flipBtn = h('button', { class: 'btn primary', onclick: () => reveal() }, '显示答案');
    stage.replaceChildren(
      h(
        'div',
        { class: 'question q-flash' },
        h(
          'div',
          { class: 'q-head' },
          h(
            'span',
            { class: 'muted small' },
            front === 'term' ? '词语' : '释义',
            fresh ? h('span', { class: 'badge new-badge' }, '新词') : null,
            stat?.lapses >= LEECH ? h('span', { class: 'badge leech-badge', title: `遗忘 ${stat.lapses} 次` }, '难记') : null,
          ),
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
        h('p', { class: 'muted small center-text' }, fresh ? '空格 显示答案 · 1 不认识 · 2 认识 · Z 撤销' : '空格 显示答案 · 1 忘记 · 2 记得 · Z 撤销'),
        asideTools,
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

  // 撤销用: 答 (或者放到一边) 以前的样子
  function snapshot(item) {
    const stat = store.ownerOf(item.set.id, item.card.id)?.stats[item.card.id];
    return { queue: [...queue], done, right, total, freshTotal, retried: new Set(retried), item, stat: stat ? structuredClone(stat) : null, code: null };
  }

  // 记得 / 会: 这张背完了; 忘了 / 不会: 隔几张再出来, 一直到点记得 (跟 Anki 一样)
  function grade(ok) {
    if (!flipped || !queue.length) return;
    const item = queue[0];
    const before = { ...snapshot(item), answered: Date.now() };
    queue.shift();
    before.code = store.recordAnswer(item.set.id, item.card.id, ok, { selfRated: !practice, now: before.answered });
    history.push(before);
    if (prefs.sound) playSound(ok ? 'right' : 'wrong');
    if (ok) {
      if (!retried.has(item.card.id)) right++; // 忘过的不算「一次就会」
      done++;
    } else {
      retried.add(item.card.id);
      queue.splice(Math.min(queue.length, AGAIN_GAP), 0, item);
      const lapses = store.ownerOf(item.set.id, item.card.id)?.stats[item.card.id]?.lapses ?? 0;
      if (lapses > (before.stat?.lapses ?? 0) && leechAlert(lapses)) showLeech(item, lapses);
    }
    if (ok) clearNotice(item.card.id);
    draw();
  }

  // 「明天再背这张」(bury) / 暂停 (suspend): 这次不背了, 从队里拿掉
  function setAside(item, how) {
    if (!item) return;
    history.push(snapshot(item));
    if (how === 'bury') store.bury(item.set.id, item.card.id);
    else store.suspend(item.set.id, [item.card.id], true);
    const before = queue.length;
    queue = queue.filter((x) => x.card.id !== item.card.id);
    if (queue.length < before) {
      total--;
      if (item.fresh) freshTotal--;
    }
    clearNotice(item.card.id);
    toast(how === 'bury' ? '已推迟到明天' : '已暂停，可在卡片集页恢复');
    draw();
  }

  // 撤销: 上一张恢复成答以前的样子 (复习记录、下次哪天复习都退回去), 再出来重新选
  function undo() {
    const last = history.pop();
    if (!last) return;
    if (last.answered) store.untouchActivity(last.answered); // 答的那一题不算今天答的
    if (last.code == null) store.putStat(last.item.set.id, last.item.card.id, last.stat);
    else store.restoreStat(last.item.set.id, last.item.card.id, last.stat, last.code);
    ({ queue, done, right, total, freshTotal, retried } = last);
    clearNotice(last.item.card.id);
    draw();
  }

  // 难记卡的提醒关掉 (给了 cardId: 是这张的才关)
  function clearNotice(cardId = null) {
    if (cardId !== null && notice.dataset.card !== cardId) return;
    delete notice.dataset.card;
    fill(notice);
  }

  // 难记卡 (忘了 8 次、12 次……): 多背几遍也不一定记住, 提醒换个记法, 或者先暂停
  function showLeech(item, lapses) {
    notice.dataset.card = item.card.id;
    const close = () => clearNotice();
    fill(
      notice,
      h(
        'div',
        { class: 'leech-note', role: 'status' },
        h('strong', {}, `难记卡片：「${stripMarks(item.card.term).slice(0, 40)}」已遗忘 ${lapses} 次`),
        h('p', { class: 'muted small' }, '反复遗忘的卡片，重复记忆效果有限。建议补充例句或图片、拆分词根词缀，或与形近词对比；也可暂时搁置。'),
        h(
          'div',
          { class: 'row' },
          h('button', { class: 'btn small', onclick: () => editCardDialog({ store, setId: item.set.id, card: item.card, onSaved: () => draw() }) }, '编辑卡片'),
          h('button', { class: 'btn small', onclick: () => setAside(item, 'suspend') }, '暂停此卡'),
          h('button', { class: 'btn small', onclick: close }, '继续'),
        ),
      ),
    );
  }

  // 改了每天的上限、想记住的把握、复习排法: 正在背的不打断 (只改按钮上的字), 已经做完的重新算一下今天的
  // 复习的设置改了 (按自己的记录优化以后): 按新的重新算
  function settingsChanged() {
    // 做完了的: 今天的、一张都没背过的重新算一下今天的; 背过的 (自定义学习、能撤销) 留着, 只更新下面的字
    if (!queue.length) return mode === 'today' && !history.length ? start() : finish({ quiet: true });
    // 按钮上的「几天后」换成新的 (翻过来了的还是翻着)
    const wasFlipped = flipped;
    draw();
    if (wasFlipped) reveal();
  }

  // 自定义学习: 今天的做完了还想背, 或者考前多练
  function openCustom() {
    resolve();
    let kind = null;
    const radios = {};
    const counts = {};
    const sizes = Object.fromEntries(Object.keys(CUSTOM).map((k) => [k, k === 'nocap' ? todayOf().held : customPool(k).length]));
    const desc = {
      more: '计划之外，加学未学过的卡片',
      nocap: '已到期、但超出每日上限的卡片',
      ahead: '未到期的卡片，最易遗忘的优先；适合考前巩固',
      forgot: '今日标记为忘记或不认识的卡片',
      leech: `遗忘 ${LEECH} 次以上的卡片`,
      starred: '已加星标的卡片',
    };
    const rows = Object.entries(CUSTOM).map(([k, name]) => {
      const id = `custom-${k}`;
      const empty = !sizes[k];
      radios[k] = h('input', { type: 'radio', id, name: 'customStudy', value: k, disabled: empty, onchange: () => (kind = k) });
      if (k === 'more' || k === 'ahead') {
        const value = Math.min(sizes[k], k === 'more' ? MORE : AHEAD);
        counts[k] = h('input', {
          class: 'input count',
          type: 'number',
          min: 1,
          max: Math.max(1, sizes[k]),
          value: Math.max(1, value),
          inputmode: 'numeric',
          disabled: empty,
          'aria-label': `${name}数量`,
          oninput: () => {
            radios[k].checked = true;
            kind = k;
          },
        });
      }
      return h(
        'div',
        { class: `switch-row${empty ? ' disabled' : ''}` },
        h(
          'label',
          { class: 'switch-text', for: id },
          h('span', { class: 'switch-label' }, name, h('span', { class: 'muted' }, `（${sizes[k]} 张）`), PRACTICE.has(k) ? h('span', { class: 'badge practice-badge' }, '练习') : null),
          h('span', { class: 'switch-desc' }, desc[k]),
        ),
        counts[k] ? h('span', { class: 'scope-count' }, counts[k], ' 张') : null,
        radios[k],
      );
    });
    const d = openDialog({
      title: '自定义学习',
      body: [
        h('p', { class: 'muted small' }, `${scope ? `范围：「${scope.title || '未命名卡片集'}」。` : '范围：全部卡片集。'}标有「练习」的不影响复习安排。`),
        rows,
      ],
      footer: [
        h('button', { class: 'btn', onclick: () => d.close() }, '取消'),
        h(
          'button',
          {
            class: 'btn primary',
            onclick: () => {
              if (!kind) return toast('请选择一项');
              const n = counts[kind] ? Math.min(sizes[kind], Math.max(1, Math.round(Number(counts[kind].value)) || 1)) : 0;
              d.close();
              start(kind, n);
            },
          },
          '开始',
        ),
      ],
    });
  }

  // 复习记录攒了多少, 按自己的记录优化 FSRS 参数
  const optimizeBtn = (text) => h('button', { class: 'link-btn', onclick: () => openOptimizeDialog({ store, onChanged: settingsChanged }) }, text);
  function logNote() {
    const n = reviewCount(store.data.revlog);
    if (!n) return null;
    const own = store.data.settings.fsrs;
    const text = own
      ? `当前使用个人复习参数（${dateText(own.at)}），共 ${n} 次复习记录。`
      : n >= 400
        ? `已有 ${n} 次复习记录，可按个人记录优化复习参数。`
        : `已有 ${n} 次复习记录。当前使用默认参数；积累约 1000 次后，优化效果更好。`;
    return h('p', { class: 'muted small' }, text, ' ', optimizeBtn('优化参数'));
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

  // 做完了还想背: 不管上限接着复习, 或者计划以外再学几个新词, 或者自定义学习
  function moreButtons() {
    const left = moreCards().length;
    return [
      held ? h('button', { class: 'btn', onclick: () => start('nocap') }, `继续复习剩余 ${held} 张`) : null,
      left ? h('button', { class: 'btn', onclick: () => start('more', MORE) }, `加学 ${Math.min(MORE, left)} 个新词`) : null,
      h('button', { class: 'btn', onclick: openCustom }, '自定义学习'),
    ];
  }

  function finish({ quiet = false } = {}) {
    resolve();
    held = todayOf().held; // 做完以后按现在的算 (复习到上限了, 剩下的都超了)
    const tomorrow = dueTomorrow(sets.filter((s) => store.isDaily(s))) + held; // 超过上限的明天再来; 不是每天背的不算
    const backBtn = h('a', { class: 'btn primary', href: back }, `返回${backText}`);
    const heldNote = held ? h('p', {}, `另有 ${held} 张已到期，超出每日上限（${store.reviewCap} 张），已顺延；也可现在继续复习。`) : null;
    if (total === 0) {
      const busy = reviewedToday(sets) > 0 || learnable.some((set) => newToday(set).learned) || history.length > 0;
      stage.replaceChildren(
        h(
          'div',
          { class: 'summary' },
          h('div', { class: 'done-mark', 'aria-hidden': 'true' }, icon('check', 28)),
          h('h2', {}, held ? '已达今日上限' : busy ? '今日任务已完成' : '今日没有待复习的卡片'),
          heldNote ??
            (busy
              ? null
              : h('p', { class: 'muted' }, '在单词卡中标记过「会 / 不会」的卡片，会按 FSRS 算法安排复习；在卡片集中设置每日新词计划后，新词也会出现在这里。')),
          tomorrow ? h('p', {}, `明日待复习 ${tomorrow} 张。`) : null,
          planNotes(),
          logNote(),
          h('div', { class: 'row center' }, history.length ? h('button', { class: 'btn', onclick: undo }, icon('undo', 16), '撤销上一张') : null, moreButtons(), backBtn),
        ),
      );
      return;
    }
    if (prefs.sound && !quiet) playSound('done');
    const fresh = freshTotal ? `（新词 ${freshTotal}）` : '';
    stage.replaceChildren(
      h(
        'div',
        { class: 'summary' },
        h('div', { class: 'done-mark', 'aria-hidden': 'true' }, icon('check', 28)),
        h('h2', {}, mode !== 'today' ? '已完成' : '今日复习已完成'),
        h('p', { class: 'muted' }, `共 ${total} 张${fresh}，一次答对 ${right} 张。`),
        heldNote,
        tomorrow ? h('p', {}, `明日待复习 ${tomorrow} 张。`) : h('p', { class: 'muted' }, '明日没有待复习的卡片。'),
        planNotes(),
        logNote(),
        h('div', { class: 'row center' }, history.length ? h('button', { class: 'btn', onclick: undo }, icon('undo', 16), '撤销上一张') : null, moreButtons(), backBtn),
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
    if (e.key === ' ' && !e.target.closest?.('button, input')) {
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

  const customBtn = h('button', { class: 'btn small quiet', type: 'button', title: '加学新词、提前复习、重练遗忘或难记的卡片', onclick: openCustom }, '自定义学习');
  settingsChanged();
  // 从考前清单来的: 直接练难记卡 / 星标的
  if (PRACTICE.has(startWith) && startWith !== 'forgot') start(startWith);

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
    customBtn,
    h('a', { class: 'btn small quiet', href: '#/settings', title: '每日复习上限、目标记忆率、复习参数' }, icon('gear', 16), '复习设置'),
  );

  return {
    title: '今日复习',
    el: h(
      'section',
      { class: 'learn-page' },
      h('div', { class: 'cards-head' }, h('a', { class: 'back', href: back }, `← ${backText}`), h('div', { class: 'row' }, undoBtn, counter)),
      h('h1', { class: 'review-title' }, scope ? `复习：${scope.title || '未命名卡片集'}` : '今日复习'),
      sub,
      h('span', { class: 'meter thin' }, bar),
      notice,
      stage,
      options,
    ),
    cleanup: () => {
      document.removeEventListener('keydown', onKey);
      stopSpeaking();
    },
  };
}
