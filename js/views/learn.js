// 学习模式 (照 Quizlet 的 Learn): 先选目标 (备考 / 全部记住),
// 再一轮一轮做题 (选择、判断、打字、单词卡), 直到全部掌握。
// 卡片多的 (从 Anki 搬来的上千张) 不一下全学: 「学哪些」选接着学 N 个 / 今天的新词 / 星标的 / 全部 (scope.js)

import { h, fill, toast, openDialog, dialogOpen, switchRow, icon } from '../dom.js';
import { speak, canSpeak, canSay, sayCard, stopSpeaking } from '../speech.js';
import { rich, cardImage, sayButton } from '../cardview.js';
import { otherSide, refreshQuestion } from '../questions.js';
import { editButton, editCardDialog } from './cardedit.js';
import { grade } from '../grade.js';
import { playSound } from '../sound.js';
import { LearnSession, MASTERED, LEARNING, DEFAULT_LEARN_OPTIONS } from '../learn.js';
import { LEARN_SCOPES, DEFAULT_NEXT, defaultLearnScope, scopeCards, scopeSizes } from '../scope.js';
import { queueFor } from './plan.js';

// 在这些框里打字时不接快捷键 (勾选框、单选框不算)
const TYPING = 'textarea, select, input:not([type=checkbox]):not([type=radio])';
const PREFS_KEY = 'wengu:learn-prefs';
const PRAISE = ['答对了!', '没错!', '好样的!', '对了!', '记住了!'];
const TYPE_LABELS = { mc: '多项选择', tf: '判断题', written: '打字 (书面问题)', listen: '听写', flash: '单词卡' };
const isTyping = (q) => q.type === 'written' || q.type === 'listen'; // 要打字的题

export const GOALS = {
  cram: { name: '备考', desc: '时间紧, 先把整套过一遍: 每张答对一次就算过, 题型混着出。' },
  memorize: { name: '全部记住', desc: '记得最牢: 每张先认出来 (选择 / 判断), 再写出来 (打字 / 听写 / 单词卡), 都答对才算掌握。' },
};

function defaultPrefs() {
  const d = DEFAULT_LEARN_OPTIONS;
  return {
    types: { ...d.types },
    answerTerm: false,
    answerDef: true,
    smart: d.smart,
    retype: false,
    shuffle: d.shuffle,
    starredOnly: false,
    sound: true,
    autoSpeak: false,
    imageInPrompt: false,
  };
}

function loadPrefs() {
  const prefs = defaultPrefs();
  try {
    const p = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}');
    // 老版本用 answerWith
    if (p.answerWith) {
      p.answerTerm = p.answerWith !== 'def';
      p.answerDef = p.answerWith !== 'term';
    }
    for (const key of Object.keys(prefs)) {
      if (key === 'types') prefs.types = { ...prefs.types, ...p.types };
      else if (typeof p[key] === 'boolean') prefs[key] = p[key];
    }
  } catch {
    // 用默认的
  }
  if (!prefs.answerTerm && !prefs.answerDef) prefs.answerDef = true;
  if (!Object.values(prefs.types).some(Boolean)) prefs.types.mc = true;
  return prefs;
}

function saveJSON(key, value) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 存不了就算了
  }
}

function answerWith(prefs) {
  if (prefs.answerTerm && prefs.answerDef) return 'both';
  return prefs.answerTerm ? 'term' : 'def';
}

export function renderLearn({ store }, id) {
  const set = store.getSet(id);
  const base = set ? `#/set/${encodeURIComponent(set.id)}` : '#/';
  if (!set || set.cards.length === 0) {
    return {
      title: '学习',
      el: h(
        'section',
        { class: 'empty' },
        h('h1', {}, set ? '这个卡片集还没有卡片' : '找不到这个卡片集'),
        h('a', { class: 'btn primary', href: set ? `${base}/edit` : '#/' }, set ? '去加卡片' : '回首页'),
      ),
    };
  }

  const goalKey = `wengu:learn-goal:${set.id}`;
  const scopeKey = `wengu:learn-scope:${set.id}`;
  let prefs = loadPrefs();
  // 学哪些 (每个卡片集自己记着; 以前开着「学习星标」的当成星标的)
  let scope = (() => {
    try {
      const s = JSON.parse(localStorage.getItem(scopeKey) ?? 'null');
      if (s && s.kind in LEARN_SCOPES) return { kind: s.kind, count: Math.min(500, Math.max(1, Math.round(s.count) || DEFAULT_NEXT)) };
    } catch {
      // 用默认的
    }
    return prefs.starredOnly && set.starred.length ? { kind: 'starred', count: DEFAULT_NEXT } : defaultLearnScope(set);
  })();
  const todayFresh = () => queueFor(store, set).fresh.map((x) => x.card);
  const scopeText = () => (scope.kind === 'next' ? `接着学 ${scope.count} 个` : LEARN_SCOPES[scope.kind]);
  const scopeBtn = h('button', { class: 'btn small scope-btn', title: '学哪些卡片', onclick: () => openScope() });
  let goal = (() => {
    try {
      const g = JSON.parse(localStorage.getItem(goalKey) ?? 'null');
      return g in GOALS ? g : null;
    } catch {
      return null;
    }
  })();
  let session = null;
  let phase = 'question'; // goal | question | feedback | round-end | done
  let autoTimer = null;
  let pending = null; // 这题的结果, 进下一题时记到统计里 { cardId, correct, selfRated (单词卡题是翻卡自评) }
  let dialog = null;

  // ---- 进度条: 左边掌握了几张, 右边一共几张 ----
  const barMastered = h('span', { class: 'seg mastered' });
  const barLearning = h('span', { class: 'seg learning' });
  const leftNum = h('span', { class: 'end-num good' }, '0');
  const rightNum = h('span', { class: 'end-num' }, '0');
  const stage = h('div', { class: 'learn-stage' });

  function drawProgress() {
    const c = session.counts();
    barMastered.style.width = `${(c.mastered / c.total) * 100}%`;
    barLearning.style.width = `${(c.learning / c.total) * 100}%`;
    leftNum.textContent = String(c.mastered);
    leftNum.title = `掌握了 ${c.mastered} 张`;
    rightNum.textContent = String(c.total);
    rightNum.title = `一共 ${c.total} 张`;
  }

  // ---- 流程 ----
  function build() {
    flush();
    clearTimeout(autoTimer);
    fill(scopeBtn, `学: ${scopeText()} ▾`);
    const cards = scopeCards(set, scope.kind, { count: scope.count, fresh: todayFresh() });
    if (!cards.length) return showEmptyScope();
    session = new LearnSession(cards, set.learn, {
      goal: goal ?? 'memorize',
      types: prefs.types,
      answerWith: answerWith(prefs),
      smart: prefs.smart,
      shuffle: prefs.shuffle,
      canListen: (card) => card.term.trim() !== '' && canSay(card, 'term'),
    });
    // 选择题的错误选项从整个卡片集里挑, 只学一部分时也一样
    session.pool = set.cards;
    drawProgress();
    if (!goal) return showGoal();
    nextRound();
  }

  function nextRound() {
    if (session.done()) return showDone();
    session.startRound();
    ask();
  }

  function ask() {
    flush();
    const q = session.next();
    if (!q) return showRoundEnd();
    phase = 'question';
    const view = questionView(q);
    stage.replaceChildren(view);
    stage.querySelector('[data-autofocus]')?.focus();
    if (q.type === 'listen') sayCard(q.card, 'term', set);
    else if (prefs.autoSpeak) sayCard(q.card, otherSide(q.side), set);
  }

  // 这题答完了: 记下来, 给反馈
  function answered(correct, { close = false, typed = null } = {}) {
    if (phase !== 'question') return;
    const q = session.current;
    const level = session.answer(correct);
    store.setLevels(set.id, { [q.card.id]: level });
    pending = { cardId: q.card.id, correct, selfRated: q.type === 'flash' };
    drawProgress();
    if (prefs.sound) playSound(correct ? 'right' : 'wrong');
    phase = 'feedback';
    // 单词卡题自己说了会不会, 不用再看反馈
    if (q.type === 'flash') return void (autoTimer = setTimeout(proceed, 250));
    showFeedback(q, { correct, close, typed });
  }

  function flush() {
    if (pending) store.recordAnswer(set.id, pending.cardId, pending.correct, { selfRated: pending.selfRated });
    pending = null;
  }

  function proceed() {
    if (phase !== 'feedback') return;
    clearTimeout(autoTimer);
    ask();
  }

  // ---- 选目标 ----
  function showGoal() {
    phase = 'goal';
    let picked = 'memorize';
    const options = Object.entries(GOALS).map(([key, g]) =>
      h(
        'button',
        {
          class: `goal-option${key === picked ? ' picked' : ''}`,
          'aria-pressed': String(key === picked),
          onclick: () => {
            picked = key;
            for (const b of options) {
              const on = b.dataset.goal === key;
              b.classList.toggle('picked', on);
              b.setAttribute('aria-pressed', String(on));
            }
          },
          dataset: { goal: key },
        },
        h('span', { class: 'goal-icon', 'aria-hidden': 'true' }, key === 'cram' ? '⏱' : '🧠'),
        h('span', { class: 'goal-name' }, g.name),
        h('span', { class: 'muted small' }, g.desc),
      ),
    );
    stage.replaceChildren(
      h(
        'div',
        { class: 'question goal-card' },
        h('p', { class: 'muted small' }, set.title || '未命名卡片集'),
        h('h2', {}, '选一个学习目标'),
        h('div', { class: 'goal-options' }, options),
        h(
          'div',
          { class: 'row end' },
          h(
            'button',
            {
              class: 'btn primary',
              dataset: { autofocus: '1' },
              onclick: () => {
                goal = picked;
                saveJSON(goalKey, goal);
                build();
              },
            },
            '开始学习 →',
          ),
        ),
      ),
    );
    stage.querySelector('[data-autofocus]')?.focus();
  }

  // ---- 一道题 ----
  // 不是这张卡片自己的字 (判断题给的答案), 只能朗读
  function speakBtn(text, lang) {
    return canSpeak() && text.trim()
      ? h('button', { class: 'icon-btn', title: '朗读', 'aria-label': '朗读', onclick: (e) => (e.stopPropagation(), speak(text, lang)) }, '🔊')
      : null;
  }

  // 学着学着改卡片: 改完题目里的字跟着换; 答对了自动跳下一题的, 先停下来
  function editCard(q) {
    if (phase === 'feedback') {
      clearTimeout(autoTimer);
      const fb = stage.firstChild?.feedback;
      if (fb && !fb.querySelector('button')) fb.append(h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: proceed }, '继续')));
    }
    editCardDialog({
      store,
      setId: set.id,
      card: q.card,
      onSaved: () => {
        refreshQuestion(q);
        const el = stage.firstChild;
        if (!el?.body || el.question !== q) return;
        if (phase === 'question') {
          stage.replaceChildren(questionView(q));
          stage.querySelector('[data-autofocus]')?.focus();
        } else if (phase === 'feedback') {
          const text = el.querySelector('.q-prompt .q-text');
          if (text) fill(text, q.prompt.trim() ? rich(q.prompt) : imageWithPrompt(q) ? null : h('span', { class: 'muted' }, '(空)'));
          const answer = el.querySelector('.answer-text');
          if (answer) fill(answer, q.answer ? rich(q.answer) : '(空)', imageWithAnswer(q) ? cardImage(q.card.image, 'q-img small') : null);
        }
      },
    });
  }

  // 听写题的上半部分: 再听一遍、慢一点; 解释 (和图片) 藏着当提示
  function listenPrompt(q) {
    const focusInput = () => stage.querySelector('.question input[type=text]')?.focus();
    const hint = h(
      'div',
      { class: 'listen-hint', hidden: true },
      h('span', { class: 'muted small' }, '解释'),
      q.card.image ? cardImage(q.card.image, 'q-img') : null,
      h('div', { class: 'q-text small' }, q.prompt.trim() ? rich(q.prompt) : h('span', { class: 'muted' }, '(空)')),
    );
    const hintBtn = h(
      'button',
      {
        class: 'link-btn',
        type: 'button',
        onclick: () => {
          hint.hidden = false;
          hintBtn.remove();
          focusInput();
        },
      },
      '听不出来? 看看解释',
    );
    return h(
      'div',
      { class: 'q-prompt listen-prompt' },
      h(
        'div',
        { class: 'listen-main' },
        h(
          'div',
          { class: 'row' },
          h('button', { class: 'btn listen-btn', type: 'button', onclick: () => (sayCard(q.card, 'term', set), focusInput()) }, '🔊 再听一遍'),
          h('button', { class: 'btn', type: 'button', onclick: () => (sayCard(q.card, 'term', set, { slow: true }), focusInput()) }, '🐢 慢一点'),
        ),
        hintBtn,
        hint,
      ),
      h('div', { class: 'q-prompt-tools' }, editButton(() => editCard(q))),
    );
  }

  // 图片跟着解释走; 设置里「图片放在题目里」时, 题目里总有图片 (当提示)
  const imageWithPrompt = (q) => q.card.image && (q.side === 'term' || prefs.imageInPrompt);
  const imageWithAnswer = (q) => q.card.image && q.side === 'def' && !prefs.imageInPrompt;

  function questionView(q) {
    const answerName = q.side === 'def' ? '解释' : '词';
    const promptName = q.side === 'def' ? '词' : '解释';
    const answerLang = q.side === 'def' ? set.defLang : set.termLang;
    const label = {
      mc: `选择答案 · 选出对的${answerName}`,
      tf: `判断 · 这个${answerName}对吗?`,
      written: `打字 · 写出${answerName}`,
      listen: '听写 · 听发音, 写出词',
      flash: `单词卡 · 先想一想${answerName}, 再翻过来`,
    }[q.type];

    const prompt = q.type === 'listen' ? listenPrompt(q) : h(
      'div',
      { class: 'q-prompt' },
      h(
        'div',
        {},
        h('div', { class: 'q-label muted small' }, promptName),
        imageWithPrompt(q) ? cardImage(q.card.image, 'q-img') : null,
        h('div', { class: 'q-text' }, q.prompt.trim() ? rich(q.prompt) : imageWithPrompt(q) ? null : h('span', { class: 'muted' }, '(空)')),
      ),
      h('div', { class: 'q-prompt-tools' }, sayButton(q.card, otherSide(q.side), set), editButton(() => editCard(q))),
    );

    let body;
    if (q.type === 'mc') {
      const buttons = q.options.map((opt, i) =>
        h(
          'button',
          { class: 'option', onclick: () => choose(i) },
          h('span', { class: 'key' }, String(i + 1)),
          h('span', { class: 'option-text' }, opt ? rich(opt) : '(空)'),
        ),
      );
      const choose = (i) => {
        if (phase !== 'question' || !buttons[i]) return;
        const correct = i === q.correctIndex;
        for (const b of buttons) b.disabled = true;
        buttons[q.correctIndex].classList.add('right');
        if (!correct) buttons[i].classList.add('wrong');
        answered(correct);
      };
      body = h('div', {}, h('div', { class: 'q-label muted small' }, '选择答案'), h('div', { class: 'options-grid' }, buttons));
      body.choose = choose;
    } else if (q.type === 'tf') {
      const tfButtons = [
        h('button', { class: 'option tf', onclick: () => pick(0) }, h('span', { class: 'key' }, '1'), '✓ 对'),
        h('button', { class: 'option tf', onclick: () => pick(1) }, h('span', { class: 'key' }, '2'), '✗ 错'),
      ];
      const pick = (i) => {
        if (phase !== 'question' || !tfButtons[i]) return;
        const correct = (i === 0) === q.isTrue;
        for (const b of tfButtons) b.disabled = true;
        tfButtons[i].classList.add(correct ? 'right' : 'wrong');
        answered(correct);
      };
      body = h(
        'div',
        {},
        h(
          'div',
          { class: 'tf-shown' },
          h('span', { class: 'muted small' }, answerName),
          h('div', { class: 'q-text small' }, q.shown ? rich(q.shown) : '(空)'),
          speakBtn(q.shown, answerLang),
        ),
        h('div', { class: 'options-grid two' }, tfButtons),
      );
      body.choose = pick;
    } else if (q.type === 'flash') {
      const answerBox = h(
        'div',
        { class: 'flash-answer', hidden: true },
        h('span', { class: 'muted small' }, answerName),
        imageWithAnswer(q) ? cardImage(q.card.image, 'q-img') : null,
        h('div', { class: 'q-text small' }, q.answer ? rich(q.answer) : '(空)'),
        sayButton(q.card, q.side, set),
      );
      const judge = h(
        'div',
        { class: 'options-grid two', hidden: true },
        h('button', { class: 'option tf bad-choice', onclick: () => grade_(false) }, h('span', { class: 'key' }, '1'), '✗ 还不会'),
        h('button', { class: 'option tf good-choice', onclick: () => grade_(true) }, h('span', { class: 'key' }, '2'), '✓ 会了'),
      );
      const flipBtn = h('button', { class: 'btn primary', dataset: { autofocus: '1' }, onclick: () => reveal() }, '翻过来看答案');
      let shown = false;
      const reveal = () => {
        if (shown || phase !== 'question') return;
        shown = true;
        answerBox.hidden = false;
        judge.hidden = false;
        flipBtn.remove();
        if (prefs.autoSpeak) sayCard(q.card, q.side, set);
      };
      const grade_ = (correct) => {
        if (!shown || phase !== 'question') return;
        for (const b of judge.querySelectorAll('button')) b.disabled = true;
        answered(correct);
      };
      body = h('div', { class: 'flash-q' }, answerBox, h('div', { class: 'row center' }, flipBtn), judge, h('p', { class: 'muted small center-text' }, '空格翻面 · 1 还不会 · 2 会了'));
      body.choose = (i) => (shown ? grade_(i === 1) : null);
      body.space = () => (shown ? null : reveal());
    } else {
      const input = h('input', {
        class: 'input big',
        type: 'text',
        placeholder: q.type === 'listen' ? '写出你听到的词' : `写出${answerName}`,
        autocomplete: 'off',
        autocapitalize: 'off',
        spellcheck: 'false',
        'aria-label': q.type === 'listen' ? '写出你听到的词' : `写出${answerName}`,
        dataset: { autofocus: '1' },
        onkeydown: (e) => {
          if (e.key === 'Enter' && !e.isComposing) {
            e.preventDefault();
            e.stopPropagation();
            submit();
          }
        },
      });
      const submit = () => {
        if (phase !== 'question') return;
        const typed = input.value;
        if (!typed.trim()) {
          input.focus();
          return;
        }
        const r = grade(typed, q.answer, { smart: prefs.smart });
        input.disabled = true;
        answered(r.correct, { close: r.close, typed });
      };
      const giveUp = () => {
        if (phase !== 'question') return;
        input.disabled = true;
        answered(false, { typed: '' });
      };
      body = h(
        'div',
        { class: 'written' },
        h('div', { class: 'q-label muted small' }, '你的答案'),
        h('div', { class: 'row' }, input, h('button', { class: 'btn primary', onclick: submit }, '答')),
        h('button', { class: 'link-btn', onclick: giveUp }, '不知道?'),
      );
    }

    const feedback = h('div', { class: 'feedback', 'aria-live': 'polite' });
    const el = h('div', { class: `question q-${q.type}` }, h('div', { class: 'q-label muted small' }, label), prompt, body, feedback);
    el.body = body;
    el.feedback = feedback;
    el.question = q;
    return el;
  }

  function showFeedback(q, { correct, close, typed }) {
    const fb = stage.firstChild.feedback;
    if (correct && !close) {
      fb.className = 'feedback good';
      fill(fb, h('strong', {}, PRAISE[Math.floor(Math.random() * PRAISE.length)]), q.type === 'listen' && q.prompt.trim() ? h('div', { class: 'muted small' }, '意思: ', rich(q.prompt)) : null);
      autoTimer = setTimeout(proceed, q.type === 'listen' ? 1600 : q.type === 'written' ? 900 : 700);
      return;
    }
    const cont = h('button', { class: 'btn primary', onclick: proceed }, '继续');
    const answerLine = h(
      'div',
      { class: 'answer-line' },
      h('span', { class: 'muted small' }, '正确答案'),
      h('div', { class: 'answer-text' }, q.answer ? rich(q.answer) : '(空)', imageWithAnswer(q) ? cardImage(q.card.image, 'q-img small') : null),
      sayButton(q.card, q.side, set),
    );
    if (close) {
      fb.className = 'feedback close';
      fb.replaceChildren(h('strong', {}, '差一点, 算你对'), h('div', { class: 'muted small' }, `你写的: ${typed}`), answerLine, h('div', { class: 'row' }, cont));
      cont.focus();
      return;
    }
    fb.className = 'feedback bad';
    const parts = [h('strong', {}, isTyping(q) && typed === '' ? '没关系, 记一下:' : '还没记住, 再看一眼')];
    if (isTyping(q) && typed) parts.push(h('div', { class: 'typed' }, h('span', { class: 'muted small' }, '你写的'), h('div', { class: 'strike' }, typed)));
    if (q.type !== 'mc') parts.push(answerLine);
    const row = h('div', { class: 'row' }, cont);
    if (isTyping(q) && typed) {
      row.append(
        h(
          'button',
          {
            class: 'btn',
            title: '判错了? 算我对',
            onclick: () => {
              const level = session.override();
              if (level === null) return;
              store.setLevels(set.id, { [q.card.id]: level });
              if (pending) pending.correct = true;
              drawProgress();
              proceed();
            },
          },
          '我答对了',
        ),
      );
    }
    // 更正选项「答错了把正确答案打一遍」: 打对了才能继续
    if (prefs.retype && isTyping(q)) {
      cont.disabled = true;
      const retype = h('input', {
        class: 'input',
        type: 'text',
        placeholder: '把正确答案打一遍',
        autocomplete: 'off',
        autocapitalize: 'off',
        spellcheck: 'false',
        'aria-label': '把正确答案打一遍',
        oninput: () => {
          const ok = grade(retype.value, q.answer, { smart: prefs.smart }).correct;
          cont.disabled = !ok;
          retype.classList.toggle('ok', ok);
        },
        onkeydown: (e) => {
          if (e.key === 'Enter' && !e.isComposing) {
            e.preventDefault();
            e.stopPropagation();
            if (!cont.disabled) proceed();
          }
        },
      });
      parts.push(retype);
      parts.push(row);
      fb.replaceChildren(...parts);
      retype.focus();
      return;
    }
    parts.push(row);
    fb.replaceChildren(...parts);
    cont.focus();
  }

  // ---- 一轮完了 ----
  function showRoundEnd() {
    flush();
    if (session.done()) return showDone();
    phase = 'round-end';
    const results = session.roundResults;
    const right = results.filter((r) => r.correct).length;
    const c = session.counts();
    const cont = h('button', { class: 'btn primary', onclick: nextRound }, '继续下一轮');
    stage.replaceChildren(
      h(
        'div',
        { class: 'summary' },
        h('h2', {}, `第 ${session.round} 轮完了`),
        h('p', { class: 'muted' }, `这一轮答了 ${results.length} 题, 对了 ${right} 题`),
        h(
          'div',
          { class: 'score' },
          h('div', { class: 'score-item good' }, h('strong', {}, String(c.mastered)), h('span', {}, '掌握了')),
          h('div', { class: 'score-item mid' }, h('strong', {}, String(c.learning)), h('span', {}, '认得了')),
          h('div', { class: 'score-item plain' }, h('strong', {}, String(c.new)), h('span', {}, '没学过')),
        ),
        h(
          'ul',
          { class: 'round-list' },
          session.roundCards.map((card) => {
            const level = session.level(card);
            return h(
              'li',
              {},
              h('span', { class: `dot l${level}`, title: level >= MASTERED ? '掌握了' : level === LEARNING ? '认得了' : '没学过' }),
              h('span', { class: 'rl-term' }, rich(card.term)),
              h('span', { class: 'muted' }, rich(card.def)),
            );
          }),
        ),
        h('div', { class: 'row center' }, cont),
      ),
    );
    cont.focus();
  }

  function showDone() {
    phase = 'done';
    clearTimeout(autoTimer);
    if (prefs.sound) playSound('done');
    const next = scope.kind === 'next' ? scopeCards(set, 'next', { count: scope.count }).length : 0;
    stage.replaceChildren(
      h(
        'div',
        { class: 'summary' },
        h('h2', {}, scope.kind === 'all' ? '全部掌握了 🎉' : `这 ${session.cards.length} 张都掌握了 🎉`),
        h('p', { class: 'muted' }, `${session.cards.length} 张卡片都会了。在单词卡、今天的复习里翻过、说了会不会的, 会按遗忘的规律排进以后的复习。`),
        h(
          'div',
          { class: 'row center' },
          next ? h('button', { class: 'btn primary', onclick: () => build() }, `接着学下 ${next} 个`) : null,
          h('a', { class: `btn${next ? '' : ' primary'}`, href: `${base}/test` }, '考一下试试'),
          h('button', { class: 'btn', onclick: () => restart(false) }, '再学一遍'),
          h('a', { class: 'btn', href: base }, '回到卡片集'),
        ),
      ),
    );
  }

  // 选的那种一张都没有
  function showEmptyScope() {
    phase = 'done';
    const why = {
      next: '没背过的都学完了 🎉 可以选「全部」再练练。',
      today: '今天还没有新词。在卡片集里定个「每天背新词」的计划, 每天的新词就会在这里; 或者选「接着学」。',
      starred: '还没有星标的卡片 (卡片右边的 ★)。',
    };
    stage.replaceChildren(
      h(
        'div',
        { class: 'summary' },
        h('h2', {}, `「${scopeText()}」没有卡片`),
        h('p', { class: 'muted' }, why[scope.kind] ?? ''),
        h('div', { class: 'row center' }, h('button', { class: 'btn primary', onclick: () => openScope() }, '换一种'), h('a', { class: 'btn', href: base }, '回到卡片集')),
      ),
    );
  }

  // 学哪些: 接着学 N 个 / 今天的新词 / 星标的 / 全部 (几张写在旁边)
  function openScope() {
    let kind = scope.kind;
    const fresh = todayFresh();
    const count = () => Math.min(500, Math.max(1, Math.round(Number(countInput.value)) || scope.count));
    const sizes = scopeSizes(set, Object.keys(LEARN_SCOPES), { count: scope.count, fresh });
    const radios = {};
    const nextSize = h('span', { class: 'muted' });
    const showNext = () => (nextSize.textContent = ` (${scopeCards(set, 'next', { count: count() }).length} 张)`);
    const countInput = h('input', {
      class: 'input count',
      type: 'number',
      min: 1,
      max: 500,
      value: scope.count,
      inputmode: 'numeric',
      'aria-label': '接着学几个',
      oninput: () => {
        showNext();
        radios.next.checked = true;
        kind = 'next';
      },
    });
    const desc = {
      next: '照卡片集里的顺序, 还没背过、还没掌握的往下学; 学完了点「接着学下几个」',
      today: '今天的复习里要出的新词 (定了「每天背新词」才有): 先用选择题、打字学一遍',
      starred: '卡片右边点了 ★ 的',
      all: `整个卡片集 ${set.cards.length} 张`,
    };
    const rows = Object.entries(LEARN_SCOPES).map(([k, name]) => {
      const id = `learn-scope-${k}`;
      radios[k] = h('input', { type: 'radio', id, name: 'learnScope', value: k, checked: kind === k, disabled: k !== 'next' && !sizes[k], onchange: () => (kind = k) });
      return h(
        'div',
        { class: `switch-row${k !== 'next' && !sizes[k] ? ' disabled' : ''}` },
        h(
          'label',
          { class: 'switch-text', for: id },
          h('span', { class: 'switch-label' }, k === 'next' ? '接着学' : name, k === 'next' ? nextSize : h('span', { class: 'muted' }, ` (${sizes[k]} 张)`)),
          h('span', { class: 'switch-desc' }, desc[k]),
        ),
        k === 'next' ? h('span', { class: 'scope-count' }, countInput, ' 个') : null,
        radios[k],
      );
    });
    showNext();
    const d = openDialog({
      title: '学哪些',
      body: rows,
      footer: [
        h('button', { class: 'btn', onclick: () => d.close() }, '取消'),
        h(
          'button',
          {
            class: 'btn primary',
            onclick: () => {
              scope = { kind, count: count() };
              saveJSON(scopeKey, scope);
              d.close();
              build();
            },
          },
          '好了',
        ),
      ],
    });
  }

  // 重新开始学习模式: 清掉进度; askGoal 时也重新选目标
  function restart(askGoal = true) {
    const reset = {};
    for (const c of session?.cards ?? set.cards) reset[c.id] = 0; // 只清这次学的这些
    store.setLevels(set.id, reset);
    if (askGoal) {
      goal = null;
      saveJSON(goalKey, null);
    }
    build();
  }

  // ---- 设置 (跟 Quizlet 一样改完点「保存」才算) ----
  function openSettings() {
    const draft = structuredClone({ ...prefs, goal: goal ?? 'memorize' });
    const chip = (key, icon, text, disabled = false) => {
      const b = h(
        'button',
        {
          class: `chip-toggle${draft[key] ? ' on' : ''}`,
          'aria-pressed': String(draft[key]),
          disabled,
          onclick: () => {
            draft[key] = !draft[key];
            b.classList.toggle('on', draft[key]);
            b.setAttribute('aria-pressed', String(draft[key]));
          },
        },
        h('span', { 'aria-hidden': 'true' }, icon),
        ` ${text}`,
      );
      return b;
    };
    // 一组开关至少开一个
    const atLeastOne = (keys, get, set_, label) =>
      keys.map(([k, text, desc]) =>
        switchRow({
          label: text,
          desc,
          checked: get(k),
          onchange: (v, input) => {
            set_(k, v);
            if (!keys.some(([kk]) => get(kk))) {
              set_(k, true);
              input.checked = true;
              toast(`${label}至少开一个`);
            }
          },
        }),
      );

    const section = (title, ...rows) => h('details', { class: 'opt-section', open: true }, h('summary', {}, title), h('div', { class: 'opt-rows' }, ...rows));

    const body = [
      h(
        'div',
        { class: 'chip-row' },
        chip('shuffle', icon('shuffle', 18), '随机'),
        chip('sound', '🔊', '音效'),
      ),
      section(
        '学习目标',
        ...Object.entries(GOALS).map(([key, g]) =>
          h(
            'label',
            { class: 'switch-row' },
            h('span', { class: 'switch-text' }, h('span', { class: 'switch-label' }, g.name), h('span', { class: 'switch-desc' }, g.desc)),
            h('input', { type: 'radio', name: 'learnGoal', value: key, checked: draft.goal === key, onchange: () => (draft.goal = key) }),
          ),
        ),
      ),
      section(
        '问题类型',
        ...atLeastOne(
          [
            ['mc', TYPE_LABELS.mc, '四个里选一个'],
            ['tf', TYPE_LABELS.tf, '给一个答案, 判断对不对'],
            ['written', TYPE_LABELS.written, '自己把答案打出来'],
            ['listen', TYPE_LABELS.listen, canSpeak() ? '念出词 (有录音放录音), 听着把词打出来' : '这个浏览器不能朗读, 只有带录音的卡片能出听写'],
            ['flash', TYPE_LABELS.flash, '想一想再翻过来, 自己说会不会'],
          ],
          (k) => draft.types[k],
          (k, v) => (draft.types[k] = v),
          '问题类型',
        ),
      ),
      section(
        '回答',
        ...atLeastOne(
          [
            ['answerTerm', '词', '看解释, 答词'],
            ['answerDef', '解释', '看词, 答解释'],
          ],
          (k) => draft[k],
          (k, v) => (draft[k] = v),
          '回答',
        ),
      ),
      section(
        '更正选项',
        switchRow({
          label: '智能判分',
          desc: '大小写、标点从来不算错。开着时再宽一点: 括号里的可以不写、几个意思写一个就行、打错一两个字母也算对',
          checked: draft.smart,
          onchange: (v) => (draft.smart = v),
        }),
        switchRow({
          label: '答错了把正确答案打一遍',
          desc: '打字题答错后, 要照着正确答案打一遍才能继续, 记得更牢',
          checked: draft.retype,
          onchange: (v) => (draft.retype = v),
        }),
      ),
      section(
        '图片位置',
        switchRow({
          label: '图片放在题目里',
          desc: '卡片的图片跟着解释走。打开后, 答解释的时候图片也放在题目里当提示',
          checked: draft.imageInPrompt,
          onchange: (v) => (draft.imageInPrompt = v),
        }),
      ),
      switchRow({
        label: '自动朗读',
        desc: canSpeak() ? '每道题一出来就把题目念出来 (有录音放录音)' : '这个浏览器不能朗读',
        checked: draft.autoSpeak,
        disabled: !canSpeak(),
        onchange: (v) => (draft.autoSpeak = v),
      }),
    ];

    const footer = [
      h(
        'button',
        {
          class: 'link-btn danger-link',
          onclick: () => {
            if (!confirm('把学习进度都清掉, 重新选目标、从头学?')) return;
            dialog?.close();
            restart(true);
          },
        },
        '重新开始学习模式',
      ),
      h('span', { class: 'spacer' }),
      h('button', { class: 'btn', onclick: () => dialog?.close() }, '取消'),
      h(
        'button',
        {
          class: 'btn primary',
          onclick: () => {
            const { goal: newGoal, ...rest } = draft;
            prefs = rest;
            saveJSON(PREFS_KEY, prefs);
            if (goal) {
              goal = newGoal;
              saveJSON(goalKey, goal);
            }
            dialog?.close();
            build();
          },
        },
        '保存',
      ),
    ];
    dialog = openDialog({
      title: '选项',
      body,
      footer,
      onClose: () => {
        dialog = null;
      },
    });
  }

  // ---- 键盘 ----
  function onKey(e) {
    if (dialogOpen() || e.target.closest?.(TYPING) || e.metaKey || e.ctrlKey || e.altKey) return;
    const body = stage.firstChild?.body;
    if (phase === 'question') {
      const n = Number(e.key);
      if (n >= 1 && n <= 4 && body?.choose) {
        e.preventDefault();
        body.choose(n - 1);
      } else if (e.key === ' ' && body?.space && !e.target.closest?.('button')) {
        e.preventDefault();
        body.space();
      }
    } else if (phase === 'feedback' && (e.key === 'Enter' || e.key === ' ') && !e.target.closest?.('button')) {
      e.preventDefault();
      proceed();
    }
  }
  document.addEventListener('keydown', onKey);

  build();

  return {
    title: `学习 · ${set.title}`,
    el: h(
      'section',
      { class: 'learn-page' },
      h(
        'div',
        { class: 'cards-head' },
        h('a', { class: 'back', href: base }, `← ${set.title || '未命名卡片集'}`),
        h('div', { class: 'row' }, scopeBtn, h('button', { class: 'icon-btn tool', title: '选项', 'aria-label': '选项', onclick: () => openSettings() }, icon('gear'))),
      ),
      h('div', { class: 'progress-ends' }, leftNum, h('span', { class: 'meter stacked' }, barMastered, barLearning), rightNum),
      stage,
      h('p', { class: 'muted small keys' }, '键盘: 选择题按 1–4 · 判断题 1 对 2 错 · 单词卡空格翻面 · 打字按回车 · 回车继续'),
    ),
    cleanup: () => {
      flush();
      clearTimeout(autoTimer);
      dialog?.close();
      document.removeEventListener('keydown', onKey);
      stopSpeaking();
    },
  };
}
