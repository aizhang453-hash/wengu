// 学习模式: 先选择 / 判断 (认), 再打字 (写), 一轮 7 张, 直到全部掌握

import { h, toast } from '../dom.js';
import { speak, canSpeak } from '../speech.js';
import { grade } from '../grade.js';
import { LearnSession, MASTERED, LEARNING, DEFAULT_LEARN_OPTIONS } from '../learn.js';

// 在这些框里打字时不接快捷键 (勾选框、单选框不算)
const TYPING = 'textarea, select, input:not([type=checkbox]):not([type=radio])';
const PREFS_KEY = 'wengu:learn-prefs';
const PRAISE = ['答对了!', '没错!', '好样的!', '对了!', '记住了!'];

function loadPrefs() {
  const d = DEFAULT_LEARN_OPTIONS;
  try {
    const p = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}');
    return {
      types: { ...d.types, ...p.types },
      answerWith: ['def', 'term', 'both'].includes(p.answerWith) ? p.answerWith : d.answerWith,
      smart: p.smart ?? d.smart,
      starredOnly: Boolean(p.starredOnly),
    };
  } catch {
    return { types: { ...d.types }, answerWith: d.answerWith, smart: d.smart, starredOnly: false };
  }
}

function savePrefs(prefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // 存不了就算了
  }
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

  const prefs = loadPrefs();
  let session = null;
  let phase = 'question'; // question | feedback | round-end | done
  let autoTimer = null;
  let pending = null; // 这题的结果, 进下一题时记到统计里 { cardId, correct }

  // ---- 页面上的东西 ----
  const barMastered = h('span', { class: 'seg mastered' });
  const barLearning = h('span', { class: 'seg learning' });
  const progressText = h('span', { class: 'counter' });
  const stage = h('div', { class: 'learn-stage' });

  function drawProgress() {
    const c = session.counts();
    barMastered.style.width = `${(c.mastered / c.total) * 100}%`;
    barLearning.style.width = `${(c.learning / c.total) * 100}%`;
    progressText.textContent = `掌握 ${c.mastered} / ${c.total}`;
  }

  // ---- 设置 ----
  const typeBoxes = {};
  const settings = h(
    'details',
    { class: 'settings' },
    h('summary', {}, '⚙ 设置'),
    h(
      'div',
      { class: 'settings-body' },
      h(
        'fieldset',
        {},
        h('legend', {}, '题型'),
        ['mc', 'tf', 'written'].map((t) => {
          const box = h('input', {
            type: 'checkbox',
            checked: prefs.types[t],
            onchange: () => {
              const next = { ...prefs.types, [t]: box.checked };
              if (!next.mc && !next.tf && !next.written) {
                box.checked = true;
                toast('至少留一种题型');
                return;
              }
              prefs.types = next;
              changed();
            },
          });
          typeBoxes[t] = box;
          return h('label', { class: 'toggle' }, box, ` ${{ mc: '选择题', tf: '判断题', written: '打字' }[t]}`);
        }),
      ),
      h(
        'fieldset',
        {},
        h('legend', {}, '用什么回答'),
        [
          ['def', '解释'],
          ['term', '词'],
          ['both', '都有'],
        ].map(([v, label]) =>
          h(
            'label',
            { class: 'toggle' },
            h('input', {
              type: 'radio',
              name: 'answerWith',
              value: v,
              checked: prefs.answerWith === v,
              onchange: () => {
                prefs.answerWith = v;
                changed();
              },
            }),
            ` ${label}`,
          ),
        ),
      ),
      h(
        'fieldset',
        {},
        h('legend', {}, '其他'),
        h(
          'label',
          { class: 'toggle', title: '大小写、标点从来不算错; 开着时括号里的可以不写、打错一两个字母也算对' },
          h('input', {
            type: 'checkbox',
            checked: prefs.smart,
            onchange: (e) => {
              prefs.smart = e.target.checked;
              savePrefs(prefs);
              session.options.smart = prefs.smart;
            },
          }),
          ' 智能判分 (容错)',
        ),
        set.starred.length
          ? h(
              'label',
              { class: 'toggle' },
              h('input', {
                type: 'checkbox',
                checked: prefs.starredOnly,
                onchange: (e) => {
                  prefs.starredOnly = e.target.checked;
                  changed();
                },
              }),
              ` 只学星标 (${set.starred.length})`,
            )
          : null,
      ),
      h(
        'button',
        {
          class: 'btn small danger',
          onclick: () => {
            if (!confirm('把学习进度都清掉, 从头学?')) return;
            store.resetLearn(set.id);
            build();
          },
        },
        '清掉学习进度',
      ),
    ),
  );

  function changed() {
    savePrefs(prefs);
    build();
  }

  // ---- 流程 ----
  function build() {
    flush();
    clearTimeout(autoTimer);
    let cards = set.cards;
    if (prefs.starredOnly) {
      const starred = new Set(set.starred);
      const only = cards.filter((c) => starred.has(c.id));
      if (only.length) cards = only;
    }
    session = new LearnSession(cards, set.learn, prefs);
    // 选择题的错误选项从整个卡片集里挑, 只学星标时也一样
    session.pool = set.cards;
    drawProgress();
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
    stage.replaceChildren(questionView(q));
    stage.querySelector('[data-autofocus]')?.focus();
  }

  // 这题答完了: 记下来, 给反馈
  function answered(correct, { close = false, typed = null, chosenEl = null } = {}) {
    if (phase !== 'question') return;
    const q = session.current;
    const level = session.answer(correct);
    store.setLevels(set.id, { [q.card.id]: level });
    pending = { cardId: q.card.id, correct };
    drawProgress();
    phase = 'feedback';
    showFeedback(q, { correct, close, typed, chosenEl });
  }

  function flush() {
    if (pending) store.recordAnswer(set.id, pending.cardId, pending.correct);
    pending = null;
  }

  function proceed() {
    if (phase !== 'feedback') return;
    clearTimeout(autoTimer);
    ask();
  }

  // ---- 一道题 ----
  function questionView(q) {
    const answerName = q.side === 'def' ? '解释' : '词';
    const promptLang = q.side === 'def' ? set.termLang : set.defLang;
    const answerLang = q.side === 'def' ? set.defLang : set.termLang;
    const label = {
      mc: `选择题 · 选出对的${answerName}`,
      tf: `判断题 · 这个${answerName}对吗?`,
      written: `打字 · 写出${answerName}`,
    }[q.type];

    const prompt = h(
      'div',
      { class: 'q-prompt' },
      h('div', { class: 'q-text' }, q.prompt || h('span', { class: 'muted' }, '(空)')),
      canSpeak() && q.prompt.trim()
        ? h('button', { class: 'icon-btn', title: '朗读', 'aria-label': '朗读', onclick: () => speak(q.prompt, promptLang) }, '🔊')
        : null,
    );

    let body;
    if (q.type === 'mc') {
      const buttons = q.options.map((opt, i) =>
        h(
          'button',
          {
            class: 'option',
            dataset: { index: String(i) },
            onclick: (e) => choose(i, e.currentTarget),
          },
          h('span', { class: 'key' }, String(i + 1)),
          h('span', { class: 'option-text' }, opt || '(空)'),
        ),
      );
      function choose(i, el) {
        if (phase !== 'question') return;
        const correct = i === q.correctIndex;
        for (const b of buttons) b.disabled = true;
        buttons[q.correctIndex].classList.add('right');
        if (!correct) el.classList.add('wrong');
        answered(correct, { chosenEl: el });
      }
      body = h('div', { class: 'options-grid' }, buttons);
      body.choose = (i) => buttons[i] && choose(i, buttons[i]);
    } else if (q.type === 'tf') {
      const pick = (sayTrue, el) => {
        if (phase !== 'question') return;
        const correct = sayTrue === q.isTrue;
        for (const b of tfButtons) b.disabled = true;
        el.classList.add(correct ? 'right' : 'wrong');
        answered(correct);
      };
      const tfButtons = [
        h('button', { class: 'option tf', onclick: (e) => pick(true, e.currentTarget) }, h('span', { class: 'key' }, '1'), '✓ 对'),
        h('button', { class: 'option tf', onclick: (e) => pick(false, e.currentTarget) }, h('span', { class: 'key' }, '2'), '✗ 错'),
      ];
      body = h(
        'div',
        {},
        h(
          'div',
          { class: 'tf-shown' },
          h('span', { class: 'muted small' }, answerName),
          h('div', { class: 'q-text small' }, q.shown || '(空)'),
          canSpeak() && q.shown.trim()
            ? h('button', { class: 'icon-btn', title: '朗读', 'aria-label': '朗读', onclick: () => speak(q.shown, answerLang) }, '🔊')
            : null,
        ),
        h('div', { class: 'options-grid two' }, tfButtons),
      );
      body.choose = (i) => tfButtons[i] && pick(i === 0, tfButtons[i]);
    } else {
      const input = h('input', {
        class: 'input big',
        type: 'text',
        placeholder: `写出${answerName}`,
        autocomplete: 'off',
        autocapitalize: 'off',
        spellcheck: 'false',
        'aria-label': `写出${answerName}`,
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
        h('div', { class: 'row' }, input, h('button', { class: 'btn primary', onclick: submit }, '答')),
        h('button', { class: 'link-btn', onclick: giveUp }, '不知道?'),
      );
    }

    const feedback = h('div', { class: 'feedback', 'aria-live': 'polite' });
    const el = h('div', { class: `question q-${q.type}` }, h('div', { class: 'q-label muted small' }, label), prompt, body, feedback);
    el.body = body;
    el.feedback = feedback;
    return el;
  }

  function showFeedback(q, { correct, close, typed }) {
    const el = stage.firstChild;
    const fb = el.feedback;
    const answerLang = q.side === 'def' ? set.defLang : set.termLang;
    if (correct && !close) {
      fb.className = 'feedback good';
      fb.replaceChildren(h('strong', {}, PRAISE[Math.floor(Math.random() * PRAISE.length)]));
      autoTimer = setTimeout(proceed, q.type === 'written' ? 900 : 700);
      return;
    }
    const cont = h('button', { class: 'btn primary', onclick: proceed }, '继续');
    const answerLine = h(
      'div',
      { class: 'answer-line' },
      h('span', { class: 'muted small' }, '正确答案'),
      h('div', { class: 'answer-text' }, q.answer || '(空)'),
      canSpeak() && q.answer.trim()
        ? h('button', { class: 'icon-btn', title: '朗读', 'aria-label': '朗读', onclick: () => speak(q.answer, answerLang) }, '🔊')
        : null,
    );
    if (close) {
      fb.className = 'feedback close';
      fb.replaceChildren(h('strong', {}, '差一点, 算你对'), h('div', { class: 'muted small' }, `你写的: ${typed}`), answerLine, h('div', { class: 'row' }, cont));
    } else {
      fb.className = 'feedback bad';
      const parts = [h('strong', {}, q.type === 'written' && typed === '' ? '没关系, 记一下:' : '还没记住, 再看一眼')];
      if (q.type === 'written' && typed) parts.push(h('div', { class: 'typed' }, h('span', { class: 'muted small' }, '你写的'), h('div', { class: 'strike' }, typed)));
      if (q.type !== 'mc') parts.push(answerLine);
      const row = h('div', { class: 'row' }, cont);
      if (q.type === 'written' && typed) {
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
      parts.push(row);
      fb.replaceChildren(...parts);
    }
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
              h('span', { class: 'rl-term' }, card.term),
              h('span', { class: 'muted' }, card.def),
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
    stage.replaceChildren(
      h(
        'div',
        { class: 'summary' },
        h('h2', {}, '全部掌握了 🎉'),
        h('p', { class: 'muted' }, `${session.cards.length} 张卡片都会了。过几天再来复习一遍, 记得更牢。`),
        h(
          'div',
          { class: 'row center' },
          h(
            'button',
            {
              class: 'btn primary',
              onclick: () => {
                const reset = {};
                for (const c of session.cards) reset[c.id] = 0;
                store.setLevels(set.id, reset);
                build();
              },
            },
            '再学一遍',
          ),
          h('a', { class: 'btn', href: base }, '回到卡片集'),
        ),
      ),
    );
  }

  // ---- 键盘 ----
  function onKey(e) {
    if (e.target.closest?.(TYPING) || e.metaKey || e.ctrlKey || e.altKey) return;
    if (phase === 'question') {
      const n = Number(e.key);
      const body = stage.firstChild?.body;
      if (n >= 1 && n <= 4 && body?.choose) {
        e.preventDefault();
        body.choose(n - 1);
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
      h('div', { class: 'cards-head' }, h('a', { class: 'back', href: base }, `← ${set.title || '未命名卡片集'}`), progressText),
      h('span', { class: 'meter thin stacked' }, barMastered, barLearning),
      stage,
      settings,
      h('p', { class: 'muted small keys' }, '键盘: 选择题按 1–4 · 判断题 1 对 2 错 · 打字按回车 · 回车继续'),
    ),
    cleanup: () => {
      flush();
      clearTimeout(autoTimer);
      document.removeEventListener('keydown', onKey);
      if (canSpeak()) window.speechSynthesis.cancel();
    },
  };
}
