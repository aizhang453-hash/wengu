// 测试模式: 设置 → 答卷 → 交卷打分, 看错题, 只考错的

import { h, toast } from '../dom.js';
import { speak, canSpeak } from '../speech.js';
import { TYPE_NAMES } from '../questions.js';
import { buildExam, gradeExam, countAnswered, DEFAULT_EXAM_OPTIONS } from '../exam.js';

const PREFS_KEY = 'wengu:exam-prefs';
const LETTERS = 'ABCDEFGHIJ';

function loadPrefs() {
  const d = DEFAULT_EXAM_OPTIONS;
  try {
    const p = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}');
    return {
      count: Number(p.count) > 0 ? Number(p.count) : d.count,
      types: { ...d.types, ...p.types },
      answerWith: ['def', 'term', 'both'].includes(p.answerWith) ? p.answerWith : d.answerWith,
      smart: p.smart ?? d.smart,
      starredOnly: Boolean(p.starredOnly),
    };
  } catch {
    return { ...d, types: { ...d.types }, starredOnly: false };
  }
}

function savePrefs(prefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // 存不了就算了
  }
}

function clock(ms) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function renderExam({ store }, id) {
  const set = store.getSet(id);
  const base = set ? `#/set/${encodeURIComponent(set.id)}` : '#/';
  if (!set || set.cards.length === 0) {
    return {
      title: '测试',
      el: h(
        'section',
        { class: 'empty' },
        h('h1', {}, set ? '这个卡片集还没有卡片' : '找不到这个卡片集'),
        h('a', { class: 'btn primary', href: set ? `${base}/edit` : '#/' }, set ? '去加卡片' : '回首页'),
      ),
    };
  }

  const prefs = loadPrefs();
  const root = h('section', { class: 'exam-page' });
  let timer = null;
  let inProgress = null; // 答卷时: () => 答了几题

  // ---- 设置 ----
  function showSetup() {
    clearInterval(timer);
    inProgress = null;
    const starredCount = set.starred.length;
    const poolSize = () => (prefs.starredOnly && starredCount ? starredCount : set.cards.length);
    const countInput = h('input', {
      class: 'input count',
      type: 'number',
      min: 1,
      max: poolSize(),
      value: String(Math.min(prefs.count, poolSize())),
      'aria-label': '题数',
    });
    const ofText = h('span', { class: 'muted' }, `/ 共 ${poolSize()} 张`);
    const refreshMax = () => {
      countInput.max = poolSize();
      ofText.textContent = `/ 共 ${poolSize()} 张`;
      if (Number(countInput.value) > poolSize()) countInput.value = String(poolSize());
    };

    const typeBoxes = Object.fromEntries(
      ['tf', 'mc', 'match', 'written'].map((t) => [t, h('input', { type: 'checkbox', checked: prefs.types[t] })]),
    );
    const answerRadios = [
      ['def', '解释'],
      ['term', '词'],
      ['both', '都有'],
    ].map(([v, label]) => [v, h('input', { type: 'radio', name: 'examAnswerWith', value: v, checked: prefs.answerWith === v }), label]);
    const smartBox = h('input', { type: 'checkbox', checked: prefs.smart });
    const starBox = h('input', {
      type: 'checkbox',
      checked: prefs.starredOnly,
      onchange: () => {
        prefs.starredOnly = starBox.checked;
        refreshMax();
      },
    });

    const start = () => {
      const types = Object.fromEntries(Object.entries(typeBoxes).map(([t, b]) => [t, b.checked]));
      if (!Object.values(types).some(Boolean)) {
        toast('至少选一种题型');
        return;
      }
      const count = Math.max(1, Math.min(poolSize(), Math.floor(Number(countInput.value)) || 1));
      Object.assign(prefs, {
        count,
        types,
        answerWith: answerRadios.find(([, r]) => r.checked)?.[0] ?? 'def',
        smart: smartBox.checked,
        starredOnly: starBox.checked,
      });
      savePrefs(prefs);
      startExam(poolCards());
    };

    root.replaceChildren(
      h('a', { class: 'back', href: base }, `← ${set.title || '未命名卡片集'}`),
      h('h1', {}, '测试'),
      h(
        'div',
        { class: 'panel exam-setup' },
        h('label', { class: 'setup-row' }, h('span', { class: 'setup-label' }, '题数'), countInput, ofText),
        h(
          'div',
          { class: 'setup-row' },
          h('span', { class: 'setup-label' }, '用什么回答'),
          answerRadios.map(([, r, label]) => h('label', { class: 'toggle' }, r, ` ${label}`)),
        ),
        h(
          'div',
          { class: 'setup-row' },
          h('span', { class: 'setup-label' }, '题型'),
          Object.entries(typeBoxes).map(([t, b]) => h('label', { class: 'toggle' }, b, ` ${TYPE_NAMES[t]}`)),
        ),
        h(
          'div',
          { class: 'setup-row' },
          h('span', { class: 'setup-label' }, '其他'),
          h('label', { class: 'toggle', title: '括号里的可以不写、打错一两个字母也算对' }, smartBox, ' 智能判分 (容错)'),
          starredCount ? h('label', { class: 'toggle' }, starBox, ` 只考星标 (${starredCount})`) : null,
        ),
        h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: start }, '开始测试')),
      ),
    );
    window.scrollTo(0, 0);
  }

  function poolCards() {
    if (prefs.starredOnly && set.starred.length) {
      const starred = new Set(set.starred);
      return set.cards.filter((c) => starred.has(c.id));
    }
    return set.cards;
  }

  // ---- 答卷 ----
  function startExam(cards, count = prefs.count) {
    const exam = buildExam(cards, { ...prefs, count: Math.min(count, cards.length) }, set.cards);
    const answers = {};
    const started = Date.now();
    const status = h('span', { class: 'counter' });
    const updateStatus = () => {
      status.textContent = `已答 ${countAnswered(exam, answers)} / ${exam.total} · ${clock(Date.now() - started)}`;
    };
    const set_ = (qid, value) => {
      answers[qid] = value;
      updateStatus();
    };

    const sections = exam.sections.map((section) =>
      h(
        'div',
        { class: 'exam-section' },
        h('h2', {}, `${TYPE_NAMES[section.type]} (${section.type === 'match' ? section.questions.reduce((n, g) => n + g.items.length, 0) : section.questions.length})`),
        section.questions.map((q) => questionInput(section.type, q, set_)),
      ),
    );

    const submit = () => {
      const left = exam.total - countAnswered(exam, answers);
      if (left > 0 && !confirm(`还有 ${left} 题没答, 确定交卷?`)) return;
      clearInterval(timer);
      inProgress = null;
      showResult(exam, answers, Date.now() - started, cards);
    };

    root.replaceChildren(
      h('div', { class: 'cards-head sticky-head' }, h('a', { class: 'back', href: base }, `← ${set.title || '未命名卡片集'}`), status),
      ...sections,
      h('div', { class: 'row center exam-submit' }, h('button', { class: 'btn primary big-choice', onclick: submit }, '交卷')),
    );
    updateStatus();
    clearInterval(timer);
    timer = setInterval(updateStatus, 1000);
    inProgress = () => countAnswered(exam, answers);
    window.scrollTo(0, 0);
  }

  function promptBlock(text, lang, n) {
    return h(
      'div',
      { class: 'exam-prompt' },
      h('span', { class: 'qnum' }, String(n)),
      h('div', { class: 'q-text small' }, text || h('span', { class: 'muted' }, '(空)')),
      canSpeak() && text.trim()
        ? h('button', { class: 'icon-btn', title: '朗读', 'aria-label': '朗读', onclick: () => speak(text, lang) }, '🔊')
        : null,
    );
  }

  const langs = (q) => ({
    prompt: q.side === 'def' ? set.termLang : set.defLang,
    answer: q.side === 'def' ? set.defLang : set.termLang,
  });
  const num = (qid) => Number(qid.slice(1));

  function questionInput(type, q, setAnswer) {
    if (type === 'match') {
      const selects = q.items.map((item) =>
        h(
          'select',
          {
            class: 'input',
            'aria-label': `第 ${num(item.qid)} 题的答案`,
            onchange: (e) => setAnswer(item.qid, e.target.value === '' ? null : Number(e.target.value)),
          },
          h('option', { value: '' }, '—'),
          q.options.map((_, i) => h('option', { value: String(i) }, LETTERS[i])),
        ),
      );
      return h(
        'div',
        { class: 'exam-q match-group' },
        h('p', { class: 'muted small' }, `给每一题选对的${q.side === 'def' ? '解释' : '词'}`),
        h(
          'div',
          { class: 'match-cols' },
          h(
            'ol',
            { class: 'match-prompts' },
            q.items.map((item, i) =>
              h('li', {}, h('span', { class: 'qnum' }, String(num(item.qid))), h('span', { class: 'mp-text' }, item.prompt || '(空)'), selects[i]),
            ),
          ),
          h(
            'ol',
            { class: 'match-options' },
            q.options.map((opt, i) => h('li', {}, h('span', { class: 'letter' }, LETTERS[i]), h('span', {}, opt || '(空)'))),
          ),
        ),
      );
    }

    const l = langs(q);
    const answerName = q.side === 'def' ? '解释' : '词';
    if (type === 'tf') {
      const buttons = [true, false].map((v) =>
        h(
          'button',
          {
            class: 'option tf',
            'aria-pressed': 'false',
            onclick: () => {
              for (const b of buttons) {
                b.classList.remove('picked');
                b.setAttribute('aria-pressed', 'false');
              }
              buttons[v ? 0 : 1].classList.add('picked');
              buttons[v ? 0 : 1].setAttribute('aria-pressed', 'true');
              setAnswer(q.qid, v);
            },
          },
          v ? '✓ 对' : '✗ 错',
        ),
      );
      return h(
        'div',
        { class: 'exam-q' },
        promptBlock(q.prompt, l.prompt, num(q.qid)),
        h('div', { class: 'tf-shown' }, h('span', { class: 'muted small' }, `${answerName}对吗?`), h('div', { class: 'q-text small' }, q.shown || '(空)')),
        h('div', { class: 'options-grid two' }, buttons),
      );
    }
    if (type === 'mc') {
      const buttons = q.options.map((opt, i) =>
        h(
          'button',
          {
            class: 'option',
            'aria-pressed': 'false',
            onclick: () => {
              for (const b of buttons) {
                b.classList.remove('picked');
                b.setAttribute('aria-pressed', 'false');
              }
              buttons[i].classList.add('picked');
              buttons[i].setAttribute('aria-pressed', 'true');
              setAnswer(q.qid, i);
            },
          },
          h('span', { class: 'key' }, LETTERS[i]),
          h('span', { class: 'option-text' }, opt || '(空)'),
        ),
      );
      return h('div', { class: 'exam-q' }, promptBlock(q.prompt, l.prompt, num(q.qid)), h('div', { class: 'options-grid' }, buttons));
    }
    return h(
      'div',
      { class: 'exam-q' },
      promptBlock(q.prompt, l.prompt, num(q.qid)),
      h('input', {
        class: 'input',
        type: 'text',
        placeholder: `写出${answerName}`,
        autocomplete: 'off',
        autocapitalize: 'off',
        spellcheck: 'false',
        'aria-label': `第 ${num(q.qid)} 题: 写出${answerName}`,
        oninput: (e) => setAnswer(q.qid, e.target.value),
        onkeydown: (e) => {
          // 回车跳到下一题
          if (e.key === 'Enter' && !e.isComposing) {
            e.preventDefault();
            const all = [...root.querySelectorAll('.exam-q input[type=text]')];
            all[all.indexOf(e.target) + 1]?.focus();
          }
        },
      }),
    );
  }

  // ---- 交卷 ----
  function showResult(exam, answers, elapsed, cards) {
    const results = gradeExam(exam, answers, { smart: prefs.smart });
    for (const r of results) store.recordAnswer(set.id, r.card.id, r.correct, { save: false });
    try {
      store.save();
    } catch {
      // 存不下也照样显示成绩
    }
    const byQid = Object.fromEntries(results.map((r) => [r.qid, r]));

    const scoreBig = h('div', { class: 'big-score' });
    const scoreLine = h('p', { class: 'muted' });
    const actions = h('div', { class: 'row center' });
    function drawScore() {
      const right = results.filter((r) => r.correct).length;
      const pct = Math.round((right / results.length) * 100);
      scoreBig.textContent = `${pct}%`;
      scoreBig.className = `big-score ${pct >= 80 ? 'good' : pct >= 50 ? 'mid' : 'bad'}`;
      scoreLine.textContent = `对了 ${right} / ${results.length} 题 · 用时 ${clock(elapsed)} · ${pct === 100 ? '满分! 🎉' : pct >= 80 ? '很不错!' : pct >= 50 ? '继续加油' : '再学学, 下次会更好'}`;
      const missed = [...new Map(results.filter((r) => !r.correct).map((r) => [r.card.id, r.card])).values()];
      actions.replaceChildren(
        missed.length ? h('button', { class: 'btn primary', onclick: () => startExam(missed, missed.length) }, `只考错的 ${missed.length} 题`) : null,
        h('button', { class: missed.length ? 'btn' : 'btn primary', onclick: () => startExam(cards) }, '再考一次 (换题)'),
        h('button', { class: 'btn', onclick: showSetup }, '改设置'),
        h('a', { class: 'btn', href: base }, '回到卡片集'),
      );
    }
    drawScore();

    const review = exam.sections.map((section) =>
      h(
        'div',
        { class: 'exam-section' },
        h('h2', {}, TYPE_NAMES[section.type]),
        section.questions.map((q) => reviewBlock(section.type, q, answers, byQid, () => drawScore())),
      ),
    );

    root.replaceChildren(
      h('a', { class: 'back', href: base }, `← ${set.title || '未命名卡片集'}`),
      h('div', { class: 'summary exam-result' }, h('h2', {}, '成绩'), scoreBig, scoreLine, actions),
      ...review,
    );
    window.scrollTo(0, 0);
  }

  function mark(correct) {
    return h('span', { class: `mark ${correct ? 'good' : 'bad'}`, 'aria-label': correct ? '对' : '错' }, correct ? '✓' : '✗');
  }

  function reviewBlock(type, q, answers, byQid, onAmend) {
    if (type === 'match') {
      return h(
        'div',
        { class: 'exam-q match-group' },
        h(
          'ol',
          { class: 'match-review' },
          q.items.map((item) => {
            const r = byQid[item.qid];
            const given = answers[item.qid];
            return h(
              'li',
              { class: r.correct ? 'right' : 'wrong' },
              mark(r.correct),
              h('span', { class: 'qnum' }, String(num(item.qid))),
              h('span', { class: 'mp-text' }, item.prompt || '(空)'),
              h(
                'span',
                { class: 'mr-answer' },
                r.correct
                  ? item.answer
                  : [
                      given === undefined || given === null ? h('span', { class: 'muted' }, '没答') : h('span', { class: 'strike' }, q.options[given]),
                      h('span', { class: 'arrow' }, ' → '),
                      h('strong', {}, item.answer),
                    ],
              ),
            );
          }),
        ),
      );
    }

    const r = byQid[q.qid];
    const l = langs(q);
    const given = answers[q.qid];
    const box = h('div', { class: `exam-q reviewed ${r.correct ? 'right' : 'wrong'}` });
    const head = h('div', { class: 'review-head' }, mark(r.correct), promptBlock(q.prompt, l.prompt, num(q.qid)));
    const parts = [head];

    if (type === 'tf') {
      parts.push(
        h('div', { class: 'tf-shown' }, h('span', { class: 'muted small' }, '题目给的'), h('div', { class: 'q-text small' }, q.shown || '(空)')),
        h(
          'p',
          { class: 'review-line' },
          `你选: ${given === undefined ? '没答' : given ? '对' : '错'} · 应该是: ${q.isTrue ? '对' : '错'}`,
        ),
      );
      if (!q.isTrue) parts.push(answerLine(q.answer, l.answer));
    } else if (type === 'mc') {
      parts.push(
        h(
          'div',
          { class: 'options-grid' },
          q.options.map((opt, i) =>
            h(
              'div',
              { class: `option static${i === q.correctIndex ? ' right' : i === given ? ' wrong' : ''}` },
              h('span', { class: 'key' }, LETTERS[i]),
              h('span', { class: 'option-text' }, opt || '(空)'),
            ),
          ),
        ),
      );
      if (given === undefined) parts.push(h('p', { class: 'review-line muted' }, '没答'));
    } else {
      const typed = typeof given === 'string' ? given.trim() : '';
      if (r.correct && !r.close) {
        parts.push(h('p', { class: 'review-line' }, `你写的: ${typed}`));
      } else if (r.close) {
        parts.push(h('p', { class: 'review-line' }, `你写的: ${typed} (差一点, 算你对)`), answerLine(q.answer, l.answer));
      } else {
        parts.push(
          h('p', { class: 'review-line' }, typed ? h('span', {}, '你写的: ', h('span', { class: 'strike' }, typed)) : h('span', { class: 'muted' }, '没答')),
          answerLine(q.answer, l.answer),
        );
        if (typed) {
          const amend = h(
            'button',
            {
              class: 'btn small',
              onclick: () => {
                r.correct = true;
                store.amendAnswer(set.id, q.card.id);
                box.className = 'exam-q reviewed right';
                head.firstChild.replaceWith(mark(true));
                amend.remove();
                onAmend();
              },
            },
            '我答对了',
          );
          parts.push(amend);
        }
      }
    }
    box.append(...parts);
    return box;
  }

  function answerLine(text, lang) {
    return h(
      'div',
      { class: 'answer-line' },
      h('span', { class: 'muted small' }, '正确答案'),
      h('div', { class: 'answer-text' }, text || '(空)'),
      canSpeak() && text.trim() ? h('button', { class: 'icon-btn', title: '朗读', 'aria-label': '朗读', onclick: () => speak(text, lang) }, '🔊') : null,
    );
  }

  showSetup();

  return {
    title: `测试 · ${set.title}`,
    el: root,
    isDirty: () => Boolean(inProgress?.()),
    canLeave: () => !inProgress?.() || confirm('卷子还没交, 确定要走吗?'),
    cleanup: () => {
      clearInterval(timer);
      if (canSpeak()) window.speechSynthesis.cancel();
    },
  };
}
