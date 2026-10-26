// 测试模式: 设置 → 答卷 → 交卷打分, 看错题, 只考错的

import { h, toast, fill, openDialog, switchRow, icon } from '../dom.js';
import { stopSpeaking } from '../speech.js';
import { TYPE_NAMES, otherSide, refreshQuestion } from '../questions.js';
import { editButton, editCardDialog } from './cardedit.js';
import { rich, cardImage, sayButton, dictButton } from '../cardview.js';
import { buildExam, gradeExam, countAnswered, DEFAULT_EXAM_OPTIONS } from '../exam.js';
import { stripMarks } from '../rich.js';
import { TEST_SCOPES, defaultTestScope, scopeCards } from '../scope.js';
import { queueFor } from './plan.js';

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
      // 从哪些出题 (没选过的按卡片集大小定; 以前开着「只考星标」的当成星标的)
      scope: p.scope in TEST_SCOPES ? p.scope : p.starredOnly ? 'starred' : null,
    };
  } catch {
    return { ...d, types: { ...d.types }, scope: null };
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
        h('h1', {}, set ? '该卡片集暂无卡片' : '卡片集不存在'),
        h('a', { class: 'btn primary', href: set ? `${base}/edit` : '#/' }, set ? '添加卡片' : '返回首页'),
      ),
    };
  }

  const prefs = loadPrefs();
  // 从哪些出题: 上次选的这个卡片集一张都没有就换成全部
  const scopeOf = (kind) => scopeCards(set, kind === 'today' ? 'reviewed' : kind, { fresh: queueFor(store, set).fresh.map((x) => x.card) });
  if (!prefs.scope || !scopeOf(prefs.scope).length) prefs.scope = scopeOf(defaultTestScope(set)).length ? defaultTestScope(set) : 'all';
  const root = h('section', { class: 'exam-page' });
  let timer = null;
  let inProgress = null; // 答卷时: () => 答了几题

  // ---- 设置 (跟 Quizlet 一样是个弹出窗口; 打开测试时先按上次的设置出一套垫在后面) ----
  let dialog = null;
  function openSetup() {
    const draft = structuredClone(prefs);
    const sizes = Object.fromEntries(Object.keys(TEST_SCOPES).map((k) => [k, scopeOf(k).length]));
    const poolSize = () => sizes[draft.scope] || set.cards.length;
    const maxText = h('span', { class: 'muted' });
    const countInput = h('input', {
      class: 'input count',
      type: 'number',
      min: 1,
      'aria-label': '题数',
    });
    const refreshMax = () => {
      countInput.max = poolSize();
      maxText.textContent = `（最多 ${poolSize()}）`;
      countInput.value = String(Math.min(Number(countInput.value) || draft.count, poolSize()));
    };
    countInput.value = String(Math.min(draft.count, poolSize()));
    refreshMax();

    const answerSelect = h(
      'select',
      { class: 'input', 'aria-label': '回答方式', onchange: (e) => (draft.answerWith = e.target.value) },
      [
        ['term', '词语'],
        ['def', '释义'],
        ['both', '两者'],
      ].map(([v, label]) => h('option', { value: v, selected: draft.answerWith === v }, label)),
    );

    const typeRows = [
      ['tf', '判断对错'],
      ['mc', '选择题'],
      ['match', '配对'],
      ['written', '拼写题'],
    ].map(([t, label]) =>
      switchRow({
        label,
        checked: draft.types[t],
        onchange: (v, input) => {
          draft.types[t] = v;
          if (!Object.values(draft.types).some(Boolean)) {
            draft.types[t] = true;
            input.checked = true;
            toast('请至少选择一种题型');
          }
        },
      }),
    );

    const start = () => {
      draft.count = Math.max(1, Math.min(poolSize(), Math.floor(Number(countInput.value)) || 1));
      Object.assign(prefs, draft);
      savePrefs(prefs);
      dialog?.close();
      startExam(poolCards());
    };

    dialog = openDialog({
      title: '测试设置',
      body: [
        h('p', { class: 'muted dialog-sub' }, set.title || '未命名卡片集'),
        h('div', { class: 'ask-label' }, '出题范围'),
        h(
          'div',
          { class: 'chips scope-chips', role: 'group', 'aria-label': '出题范围' },
          Object.entries(TEST_SCOPES).map(([k, name]) => {
            const b = h(
              'button',
              {
                class: `chip${draft.scope === k ? ' on' : ''}`,
                type: 'button',
                disabled: !sizes[k],
                title: { studied: '在单词卡、学习或复习中学过的卡片', today: '今日学习或复习的卡片', starred: '已加星标的卡片', all: '全部卡片' }[k],
                onclick: () => {
                  draft.scope = k;
                  for (const c of b.parentElement.children) c.classList.toggle('on', c === b);
                  refreshMax();
                },
              },
              `${name} (${sizes[k]})`,
            );
            return b;
          }),
        ),
        h('label', { class: 'switch-row' }, h('span', { class: 'switch-text' }, h('span', { class: 'switch-label' }, '题数', maxText)), countInput),
        h('label', { class: 'switch-row' }, h('span', { class: 'switch-text' }, h('span', { class: 'switch-label' }, '回答方式')), answerSelect),
        ...typeRows,
        switchRow({
          label: '智能判分',
          desc: '拼写题中括号内容可省略，个别拼写错误视为正确',
          checked: draft.smart,
          onchange: (v) => (draft.smart = v),
        }),
      ].filter(Boolean),
      footer: [h('span', { class: 'spacer' }), h('button', { class: 'btn primary', onclick: start }, '开始测试')],
      onClose: () => {
        dialog = null;
      },
    });
    countInput.focus();
    countInput.select();
  }

  function poolCards() {
    const cards = scopeOf(prefs.scope);
    return cards.length ? cards : set.cards;
  }

  // ---- 答卷 ----
  let total = 0;
  function startExam(cards, count = prefs.count) {
    const exam = buildExam(cards, { ...prefs, count: Math.min(count, cards.length) }, set.cards);
    total = exam.total;
    const answers = {};
    const started = Date.now();
    const progress = h('strong', { class: 'exam-count' });
    const clockEl = h('span', { class: 'muted small' });
    const navItems = new Map(); // 题号 → 左边列表里的按钮

    const updateStatus = () => {
      progress.textContent = `${countAnswered(exam, answers)} / ${exam.total}`;
      clockEl.textContent = `用时 ${clock(Date.now() - started)}`;
    };
    const setAnswer = (qid, value, { advance = false } = {}) => {
      answers[qid] = value;
      const done = !(value === null || value === undefined || (typeof value === 'string' && !value.trim()));
      navItems.get(num(qid))?.classList.toggle('done', done);
      updateStatus();
      // 选了就跳到下一题 (跟 Quizlet 一样)
      if (advance && done) setTimeout(() => goTo(num(qid) + 1), 250);
    };

    const sections = exam.sections.map((section) =>
      h(
        'div',
        { class: 'exam-section' },
        h('h2', {}, `${TYPE_NAMES[section.type]} (${section.type === 'match' ? section.questions.reduce((n, g) => n + g.items.length, 0) : section.questions.length})`),
        section.questions.map((q) => questionInput(section.type, q, setAnswer)),
      ),
    );

    const nav = h(
      'nav',
      { class: 'exam-nav', 'aria-label': '题目列表' },
      exam.sections.map((section) => [
        h('div', { class: 'nav-type muted small' }, TYPE_NAMES[section.type]),
        h(
          'div',
          { class: 'nav-nums' },
          section.questions
            .flatMap((q) => (section.type === 'match' ? q.items : [q]))
            .map((q) => {
              const n = num(q.qid);
              const b = h('button', { class: 'nav-num', title: `第 ${n} 题`, onclick: () => goTo(n) }, String(n));
              navItems.set(n, b);
              return b;
            }),
        ),
      ]),
    );
    const navToggle = h(
      'button',
      {
        class: 'icon-btn tool nav-toggle',
        title: '题目列表',
        'aria-label': '题目列表',
        onclick: () => root.classList.toggle('nav-open'),
      },
      icon('list'),
    );

    const submit = () => {
      const left = exam.total - countAnswered(exam, answers);
      if (left > 0 && !confirm(`还有 ${left} 题未作答，确定交卷吗？`)) return;
      clearInterval(timer);
      inProgress = null;
      root.classList.remove('nav-open');
      showResult(exam, answers, Date.now() - started, cards);
    };

    fill(
      root,
      h(
        'div',
        { class: 'exam-top' },
        h('div', { class: 'row' }, navToggle, h('a', { class: 'back', href: base }, `← ${set.title || '未命名卡片集'}`)),
        h('div', { class: 'exam-top-mid' }, progress, clockEl),
        h(
          'div',
          { class: 'row exam-top-tools' },
          h('button', { class: 'btn small', onclick: printExam }, '打印'),
          h(
            'button',
            {
              class: 'icon-btn tool',
              title: '重新设置测试',
              'aria-label': '重新设置测试',
              onclick: () => {
                if (countAnswered(exam, answers) && !confirm('重新设置将生成新试卷，已作答内容将清除。继续吗？')) return;
                openSetup();
              },
            },
            icon('gear'),
          ),
        ),
      ),
      h(
        'div',
        { class: 'exam-body' },
        nav,
        h('div', { class: 'exam-questions' }, ...sections, h('div', { class: 'row center exam-submit' }, h('button', { class: 'btn primary big-choice', onclick: submit }, '交卷'))),
      ),
      answerKey(exam),
    );
    updateStatus();
    clearInterval(timer);
    timer = setInterval(updateStatus, 1000);
    inProgress = () => countAnswered(exam, answers);
    window.scrollTo(0, 0);
  }

  // 跳到第 n 题 (没有了就跳到交卷)
  function goTo(n) {
    const el = root.querySelector(`[data-qn="${n}"]`) ?? root.querySelector('.exam-submit');
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const input = el.matches('input, select') ? el : el.querySelector('input[type=text], select');
    input?.focus({ preventScroll: true });
    root.classList.remove('nav-open');
  }

  // ---- 打印 ----
  function printExam() {
    const go = (withKey) => {
      d.close();
      document.body.classList.add('print-exam');
      document.body.classList.toggle('print-key', withKey);
      const done = () => {
        document.body.classList.remove('print-exam', 'print-key');
        window.removeEventListener('afterprint', done);
      };
      window.addEventListener('afterprint', done);
      setTimeout(() => {
        window.print();
        // 有的浏览器不发 afterprint
        setTimeout(done, 1000);
      }, 50);
    };
    const d = openDialog({
      title: '打印测试',
      body: [h('p', {}, '打印本套试卷，是否在末尾附上答案？')],
      footer: [
        h('span', { class: 'spacer' }),
        h('button', { class: 'btn', onclick: () => go(false) }, '仅题目'),
        h('button', { class: 'btn primary', onclick: () => go(true) }, '题目和答案'),
      ],
    });
  }

  // 答案 (平时藏着, 打印「题目 + 答案」时才出来)
  function answerKey(exam) {
    const items = [];
    for (const section of exam.sections) {
      for (const q of section.questions) {
        if (section.type === 'match') {
          for (const item of q.items) items.push([num(item.qid), `${LETTERS[q.options.indexOf(item.answer)]}. ${stripMarks(item.answer)}`]);
        } else if (section.type === 'tf') {
          items.push([num(q.qid), q.isTrue ? '正确' : `错误（应为：${stripMarks(q.answer)}）`]);
        } else if (section.type === 'mc') {
          items.push([num(q.qid), `${LETTERS[q.correctIndex]}. ${stripMarks(q.answer)}`]);
        } else {
          items.push([num(q.qid), stripMarks(q.answer)]);
        }
      }
    }
    return h(
      'div',
      { class: 'answer-key' },
      h('h2', {}, '答案'),
      h(
        'ol',
        {},
        items.sort((a, b) => a[0] - b[0]).map(([n, text]) => h('li', { value: String(n) }, text)),
      ),
    );
  }

  // 题目: 左上角写给的是词还是解释, 右上角第几题; 解释那面当题目时带上图片
  function promptBlock(q, n) {
    const image = q.side === 'term' ? q.card.image : '';
    return [
      h('div', { class: 'q-head' }, h('span', { class: 'muted small' }, q.side === 'def' ? '词语' : '释义'), h('span', { class: 'muted small q-of' }, `${n}/${total}`)),
      h(
        'div',
        { class: 'exam-prompt' },
        h(
        'div',
        { class: 'q-text small' },
        cardImage(image, 'q-img small'),
        q.prompt.trim() ? rich(q.prompt) : image ? null : h('span', { class: 'muted' }, '（空）'),
        ),
        sayButton(q.card, otherSide(q.side), set),
      ),
    ];
  }

  const num = (qid) => Number(qid.slice(1));

  function questionInput(type, q, setAnswer) {
    if (type === 'match') {
      const selects = q.items.map((item) =>
        h(
          'select',
          {
            class: 'input',
            'aria-label': `第 ${num(item.qid)} 题答案`,
            onchange: (e) => setAnswer(item.qid, e.target.value === '' ? null : Number(e.target.value), { advance: true }),
          },
          h('option', { value: '' }, '—'),
          q.options.map((_, i) => h('option', { value: String(i) }, LETTERS[i])),
        ),
      );
      return h(
        'div',
        { class: 'exam-q match-group' },
        h('div', { class: 'q-head' }, h('span', { class: 'muted small' }, `为每题选择正确的${q.side === 'def' ? '释义' : '词语'}`), h('span', { class: 'muted small q-of' }, `${num(q.items[0].qid)}–${num(q.items.at(-1).qid)}/${total}`)),
        h(
          'div',
          { class: 'match-cols' },
          h(
            'ol',
            { class: 'match-prompts' },
            q.items.map((item, i) =>
              h('li', { dataset: { qn: String(num(item.qid)) } }, h('span', { class: 'qnum' }, String(num(item.qid))), h('span', { class: 'mp-text' }, item.prompt ? rich(item.prompt) : '（空）'), selects[i]),
            ),
          ),
          h(
            'ol',
            { class: 'match-options' },
            q.options.map((opt, i) => h('li', {}, h('span', { class: 'letter' }, LETTERS[i]), h('span', {}, opt ? rich(opt) : '（空）'))),
          ),
        ),
      );
    }

    const answerName = q.side === 'def' ? '释义' : '词语';
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
              setAnswer(q.qid, v, { advance: true });
            },
          },
          v ? '正确' : '错误',
        ),
      );
      return h(
        'div',
        { class: 'exam-q', dataset: { qn: String(num(q.qid)) } },
        promptBlock(q, num(q.qid)),
        h('div', { class: 'tf-shown' }, h('span', { class: 'muted small' }, `该${answerName}是否正确`), h('div', { class: 'q-text small' }, q.shown ? rich(q.shown) : '（空）')),
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
              setAnswer(q.qid, i, { advance: true });
            },
          },
          h('span', { class: 'key' }, LETTERS[i]),
          h('span', { class: 'option-text' }, opt ? rich(opt) : '（空）'),
        ),
      );
      return h('div', { class: 'exam-q', dataset: { qn: String(num(q.qid)) } }, promptBlock(q, num(q.qid)), h('div', { class: 'options-grid' }, buttons));
    }
    return h(
      'div',
      { class: 'exam-q', dataset: { qn: String(num(q.qid)) } },
      promptBlock(q, num(q.qid)),
      h('input', {
        class: 'input',
        type: 'text',
        placeholder: `输入${answerName}`,
        autocomplete: 'off',
        autocapitalize: 'off',
        spellcheck: 'false',
        'aria-label': `第 ${num(q.qid)} 题：输入${answerName}`,
        oninput: (e) => setAnswer(q.qid, e.target.value),
        onkeydown: (e) => {
          // 回车跳到下一题
          if (e.key === 'Enter' && !e.isComposing) {
            e.preventDefault();
            goTo(num(q.qid) + 1);
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
      scoreLine.textContent = `答对 ${right} / ${results.length} 题 · 用时 ${clock(elapsed)}`;
      const missed = [...new Map(results.filter((r) => !r.correct).map((r) => [r.card.id, r.card])).values()];
      fill(
        actions,
        missed.length ? h('button', { class: 'btn primary', onclick: () => startExam(missed, missed.length) }, `重测错题（${missed.length}）`) : null,
        h('button', { class: missed.length ? 'btn' : 'btn primary', onclick: () => startExam(cards) }, '重新测试'),
        h('button', { class: 'btn', onclick: openSetup }, '测试设置'),
        h('a', { class: 'btn', href: base }, '返回卡片集'),
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
    return h('span', { class: `mark ${correct ? 'good' : 'bad'}`, 'aria-label': correct ? '正确' : '错误' }, correct ? '✓' : '✗');
  }

  // 改了卡片以后整块重画
  function reviewBlock(type, q, answers, byQid, onAmend) {
    const el = buildReview(type, q, answers, byQid, onAmend, () => el.replaceWith(reviewBlock(type, q, answers, byQid, onAmend)));
    return el;
  }

  function buildReview(type, q, answers, byQid, onAmend, redraw) {
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
              h('span', { class: 'mp-text' }, item.prompt ? rich(item.prompt) : '（空）'),
              h(
                'span',
                { class: 'mr-answer' },
                r.correct
                  ? rich(item.answer)
                  : [
                      given === undefined || given === null ? h('span', { class: 'muted' }, '未作答') : h('span', { class: 'strike' }, rich(q.options[given])),
                      h('span', { class: 'arrow' }, ' → '),
                      h('strong', {}, rich(item.answer)),
                    ],
              ),
              editButton(() =>
                editCardDialog({
                  store,
                  setId: set.id,
                  card: item.card,
                  onSaved: () => {
                    const old = item.answer;
                    item.prompt = item.card[otherSide(q.side)];
                    item.answer = item.card[q.side];
                    const i = q.options.indexOf(old);
                    if (i >= 0) q.options[i] = item.answer;
                    redraw();
                  },
                }),
              ),
            );
          }),
        ),
      );
    }

    const r = byQid[q.qid];
    const given = answers[q.qid];
    const box = h('div', { class: `exam-q reviewed ${r.correct ? 'right' : 'wrong'}` });
    const head = h(
      'div',
      { class: 'review-head' },
      mark(r.correct),
      h('div', { class: 'review-prompt' }, promptBlock(q, num(q.qid))),
      editButton(() => editCardDialog({ store, setId: set.id, card: q.card, onSaved: () => (refreshQuestion(q), redraw()) })),
    );
    const parts = [head];

    if (type === 'tf') {
      parts.push(
        h('div', { class: 'tf-shown' }, h('span', { class: 'muted small' }, '题目所给'), h('div', { class: 'q-text small' }, q.shown ? rich(q.shown) : '（空）')),
        h(
          'p',
          { class: 'review-line' },
          `你的选择：${given === undefined ? '未作答' : given ? '正确' : '错误'} · 应为：${q.isTrue ? '正确' : '错误'}`,
        ),
      );
      if (!q.isTrue) parts.push(answerLine(q));
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
              h('span', { class: 'option-text' }, opt ? rich(opt) : '（空）'),
            ),
          ),
        ),
      );
      if (given === undefined) parts.push(h('p', { class: 'review-line muted' }, '未作答'));
    } else {
      const typed = typeof given === 'string' ? given.trim() : '';
      if (r.correct && !r.close) {
        parts.push(h('p', { class: 'review-line' }, `你的答案：${typed}`));
      } else if (r.close) {
        parts.push(h('p', { class: 'review-line' }, `你的答案：${typed}（基本正确）`), answerLine(q));
      } else {
        parts.push(
          h('p', { class: 'review-line' }, typed ? h('span', {}, '你的答案：', h('span', { class: 'strike' }, typed)) : h('span', { class: 'muted' }, '未作答')),
          answerLine(q),
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

  function answerLine(q) {
    const image = q.side === 'def' ? q.card.image : '';
    return h(
      'div',
      { class: 'answer-line' },
      h('span', { class: 'muted small' }, '正确答案'),
      h('div', { class: 'answer-text' }, q.answer ? rich(q.answer) : '（空）', cardImage(image, 'q-img small')),
      sayButton(q.card, q.side, set),
      dictButton(q.card, set),
    );
  }

  // 跟 Quizlet 一样: 先按上次的设置出一套卷子, 设置窗口盖在上面
  startExam(poolCards());
  openSetup();

  return {
    title: `测试 · ${set.title}`,
    el: root,
    isDirty: () => Boolean(inProgress?.()),
    canLeave: () => !inProgress?.() || confirm('试卷尚未提交，确定离开吗？'),
    cleanup: () => {
      clearInterval(timer);
      dialog?.close();
      stopSpeaking();
    },
  };
}
