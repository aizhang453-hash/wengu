// 答题 (照 Kahoot): 一道一道来。先只看题目一会儿, 然后出选项、开始倒计时; 点了就算 (多选题选好点「提交」)。
// 答对得分, 越快越多, 连对还加分。每题答完看对错和得分, 点「下一题」; 最后看总分、排行榜、答错的题。

import { h, icon, dialogOpen } from '../dom.js';
import { rich, cardImage } from '../cardview.js';
import { shuffle } from '../questions.js';
import { textSize } from '../games.js';
import { SHAPES, optionsOf, isMulti, checkAnswer, questionPoints, questionProblem, answerText } from '../quiz.js';
import { sound, soundToggle } from './match.js';
import { fitText } from './gameshell.js';
import { scoreBoard, typeLabel } from './quizset.js';

const PREFS_KEY = 'wengu:quiz-prefs';
// 判断题: 对 是蓝色 ◆, 错 是红色 ▲ (跟 Kahoot 一样)
const TF_LOOK = [
  { cls: 'opt-c1', shape: '✓' },
  { cls: 'opt-c0', shape: '✕' },
];

export function renderQuizPlay({ store }, id) {
  const set = store.getSet(id);
  const back = set ? `#/set/${encodeURIComponent(set.id)}` : '#/';
  const playable = set?.kind === 'quiz' ? set.cards.filter((c) => !questionProblem(c)) : [];
  if (!playable.length) {
    return {
      title: '答题',
      el: h(
        'section',
        { class: 'empty game-empty' },
        h('div', { class: 'game-emoji', 'aria-hidden': 'true' }, '📝'),
        h('h1', {}, set?.kind === 'quiz' ? '这个题目集还没有能答的题' : '找不到这个题目集'),
        h('div', { class: 'row center' }, set?.kind === 'quiz' ? h('a', { class: 'btn primary', href: `${back}/edit` }, '去写题目') : null, h('a', { class: 'btn', href: back }, '回去')),
      ),
    };
  }

  let prefs = { timed: true, shuffle: true, shuffleOptions: false };
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

  const root = h('section', { class: 'game-page quiz-play' });
  const header = h(
    'header',
    { class: 'game-head' },
    h('span', { class: 'gh-game' }, h('span', { 'aria-hidden': 'true' }, '📝'), h('span', { class: 'gh-name' }, '答题')),
    h('span', { class: 'gh-set static' }, h('span', { class: 'gh-title' }, set.title || '未命名题目集')),
    h('div', { class: 'gh-tools' }, soundToggle(), h('a', { class: 'icon-btn tool', href: back, title: '不玩了', 'aria-label': '不玩了' }, icon('x', 22))),
  );
  const stage = h('div', { class: 'qz-stage' });
  root.append(header, stage);

  let run = null; // { list, i, score, streak, correct, results, timed, partial }
  let raf = null;
  let introTimer = null;
  let keys = null; // 现在能按的键: { pick(i), submit(), next() }
  // 计时: 切到别的标签页的那段不算
  const clock = { start: 0, hiddenAt: 0, paused: 0 };
  const elapsed = () => {
    const now = performance.now();
    return now - clock.start - clock.paused - (clock.hiddenAt ? now - clock.hiddenAt : 0);
  };

  function stopTimers() {
    cancelAnimationFrame(raf);
    clearTimeout(introTimer);
    raf = null;
  }

  function toggle(name, label) {
    return h('label', { class: 'toggle' }, h('input', { type: 'checkbox', checked: prefs[name], onchange: (e) => ((prefs[name] = e.target.checked), savePrefs()) }), ` ${label}`);
  }

  function showReady() {
    stopTimers();
    keys = null;
    stage.className = 'qz-stage center';
    stage.replaceChildren(
      h(
        'div',
        { class: 'summary game-ready' },
        h('div', { class: 'game-emoji', 'aria-hidden': 'true' }, '📝'),
        h('h1', {}, set.title || '未命名题目集'),
        h('p', {}, `${playable.length} 道题。${prefs.timed ? '每题限时, 答得越快分越高, 连对还加分。' : ''}`),
        h('div', { class: 'qz-prefs' }, toggle('timed', '限时 (答得快分高)'), toggle('shuffle', '打乱题目顺序'), toggle('shuffleOptions', '打乱选项顺序')),
        set.best.quiz ? h('p', { class: 'muted' }, `你的最高分: ${set.best.quiz}`) : null,
        h('div', { class: 'row center' }, h('button', { class: 'btn primary big-choice', 'data-autofocus': '1', onclick: () => start(playable) }, '开始')),
        scoreBoard(set.runs),
      ),
    );
    stage.querySelector('[data-autofocus]')?.focus();
  }

  function start(list, partial = false) {
    run = { list: prefs.shuffle ? shuffle(list) : [...list], i: 0, score: 0, streak: 0, correct: 0, results: [], timed: prefs.timed, partial };
    showQuestion();
  }

  function showQuestion() {
    stopTimers();
    const card = run.list[run.i];
    const q = card.q;
    const options = optionsOf(q);
    const order = q.type === 'tf' || !prefs.shuffleOptions ? options.map((_, i) => i) : shuffle(options.map((_, i) => i));
    const multi = isMulti(q);
    const picked = new Set();
    let answered = false;

    const qtext = h('div', { class: 'qz-qtext' }, rich(card.term));
    const question = h('div', { class: 'qz-question' }, cardImage(card.image, 'qz-img'), card.term.trim() ? qtext : null);
    const top = h(
      'div',
      { class: 'qz-top' },
      h('span', { class: 'qz-count' }, `${run.i + 1} / ${run.list.length}`),
      h('span', { class: 'qz-type' }, multi ? `多选题 · 选出 ${q.correct.length} 个对的` : typeLabel(q)),
      h('span', { class: 'qz-score' }, `${run.score} 分`),
    );
    const clockNum = h('div', { class: 'qz-clock' });
    const barFill = h('span', {});
    const timerEl = h('div', { class: 'qz-timer', hidden: !run.timed }, clockNum, h('div', { class: 'qz-bar' }, barFill));
    const status = h('div', { class: 'qz-status' }, timerEl);

    const long = options.some((o) => ['longer', 'longest'].includes(textSize(o, [16, 40, 90])));
    const buttons = new Map();
    const answers = h(
      'div',
      { class: `qz-answers n${options.length}${q.type === 'tf' ? ' tf' : ''}${long ? ' long' : ''}`, hidden: true },
      order.map((i, pos) => {
        const look = q.type === 'tf' ? TF_LOOK[i] : { cls: `opt-c${i}`, shape: SHAPES[i] };
        const btn = h(
          'button',
          { class: `qz-opt ${look.cls} ${textSize(options[i], [16, 40, 90])}`, onclick: () => choose(i) },
          h('span', { class: 'qz-shape', 'aria-hidden': 'true' }, look.shape),
          h('span', { class: 'qz-opt-text' }, rich(options[i])),
          h('span', { class: 'qz-key', 'aria-hidden': 'true' }, String(pos + 1)),
        );
        buttons.set(i, btn);
        return btn;
      }),
    );
    const submitBtn = h('button', { class: 'btn primary big-choice qz-submit', disabled: true, hidden: true, onclick: () => submit() }, '提交');

    function choose(i) {
      if (answered) return;
      if (!multi) return reveal([i], false);
      if (picked.has(i)) picked.delete(i);
      else picked.add(i);
      buttons.get(i).classList.toggle('picked', picked.has(i));
      buttons.get(i).setAttribute('aria-pressed', String(picked.has(i)));
      submitBtn.disabled = picked.size === 0;
    }
    function submit() {
      if (!answered && picked.size) reveal([...picked], false);
    }

    // 答完: 对的标出来, 说得了几分
    function reveal(choice, timedOut) {
      if (answered) return;
      answered = true;
      stopTimers();
      const ms = run.timed ? elapsed() : 0;
      const correct = !timedOut && checkAnswer(q, choice);
      run.streak = correct ? run.streak + 1 : 0;
      const points = questionPoints({ correct, ms, time: q.time, streak: run.streak, timed: run.timed });
      run.score += points;
      if (correct) run.correct++;
      run.results.push({ card, choice, correct, points, timedOut });
      sound(correct ? 'right' : 'wrong');
      for (const [i, btn] of buttons) {
        btn.disabled = true;
        if (q.correct.includes(i)) btn.classList.add('right');
        else if (choice.includes(i)) btn.classList.add('wrong');
        else btn.classList.add('dim');
      }
      submitBtn.hidden = true;
      const last = run.i + 1 >= run.list.length;
      const next = h('button', { class: 'btn qz-next', 'data-autofocus': '1', onclick: () => goNext() }, last ? '看成绩' : '下一题', icon('right', 18));
      status.replaceChildren(
        h(
          'div',
          { class: `qz-band ${correct ? 'good' : 'bad'}` },
          h('strong', {}, correct ? '答对了!' : timedOut ? '时间到' : '答错了'),
          correct ? h('span', { class: 'qz-points' }, `+${points}`) : null,
          run.streak >= 2 ? h('span', { class: 'qz-streak' }, `🔥 连对 ${run.streak}`) : null,
          correct ? null : h('span', { class: 'qz-answer' }, '对的答案: ', rich(answerText(q))),
          next,
        ),
      );
      top.lastChild.textContent = `${run.score} 分`;
      keys = { next: goNext };
      next.focus({ preventScroll: true });
    }

    function goNext() {
      keys = null;
      run.i++;
      if (run.i < run.list.length) showQuestion();
      else finish();
    }

    // 先只看题目, 字多多看一会儿 (回车跳过)
    let begun = false;
    function begin() {
      if (begun) return;
      begun = true;
      clearTimeout(introTimer);
      answers.hidden = false;
      submitBtn.hidden = !multi;
      intro.remove();
      keys = { pick: (pos) => order[pos] !== undefined && choose(order[pos]), submit: multi ? submit : null };
      if (!run.timed) return;
      clock.start = performance.now();
      clock.paused = 0;
      clock.hiddenAt = document.hidden ? clock.start : 0;
      const total = q.time * 1000;
      const tick = () => {
        const left = Math.max(0, total - elapsed());
        clockNum.textContent = String(Math.ceil(left / 1000));
        clockNum.classList.toggle('low', left <= 5000);
        barFill.style.width = `${(left / total) * 100}%`;
        if (left <= 0) return reveal([], true); // 多选题选了没提交也算没答
        raf = requestAnimationFrame(tick);
      };
      tick();
    }
    const introMs = Math.min(5000, 1200 + Array.from(card.term).length * 25);
    const intro = h('div', { class: 'qz-intro', style: `--ms:${introMs}ms` }, h('span', {}));
    keys = { next: begin }; // 回车跳过

    stage.className = 'qz-stage';
    stage.replaceChildren(top, question, intro, status, answers, submitBtn);
    fitText(qtext, { max: window.innerWidth < 640 ? 26 : 40, min: 14 });
    introTimer = setTimeout(begin, introMs);
  }

  function finish() {
    stopTimers();
    keys = null;
    const total = run.list.length;
    let at = null;
    let record = false;
    if (!run.partial) {
      at = Date.now();
      record = store.recordRun(set.id, { score: run.score, correct: run.correct, total, timed: run.timed }, at);
    }
    sound('done');
    const wrong = run.results.filter((r) => !r.correct);
    const pct = Math.round((run.correct / total) * 100);
    stage.className = 'qz-stage center';
    stage.replaceChildren(
      h(
        'div',
        { class: 'summary game-ready qz-result' },
        h('div', { class: 'game-emoji', 'aria-hidden': 'true' }, record ? '🏆' : run.correct === total ? '🎉' : '📝'),
        h('h1', {}, record ? '新纪录!' : run.correct === total ? '全对了!' : run.partial ? '练完了' : '答完了'),
        h('div', { class: 'big-score good' }, run.timed ? `${run.score} 分` : `${run.correct} / ${total}`),
        h('p', { class: 'muted' }, `对 ${run.correct} / ${total} 题 · 正确率 ${pct}%${run.timed && set.best.quiz ? ` · 最高 ${set.best.quiz} 分` : ''}`),
        run.timed && !run.partial ? scoreBoard(set.runs, { mark: at }) : null,
        wrong.length
          ? h(
              'div',
              { class: 'missed' },
              h('p', { class: 'muted small' }, '答错的题, 再看一眼:'),
              h(
                'ul',
                { class: 'qz-review' },
                wrong.map((r) =>
                  h(
                    'li',
                    {},
                    h('div', { class: 'qz-review-q' }, rich(r.card.term || '(图片题)')),
                    h('div', { class: 'qz-review-a' }, h('span', { class: 'qp-good' }, '✓ '), rich(answerText(r.card.q))),
                    r.timedOut ? h('div', { class: 'muted small' }, '时间到了没答') : h('div', { class: 'muted small' }, '你选的: ', r.choice.map((i) => optionsOf(r.card.q)[i]).join('; ')),
                  ),
                ),
              ),
            )
          : null,
        h(
          'div',
          { class: 'row center' },
          h('button', { class: 'btn primary big-choice', 'data-autofocus': '1', onclick: () => start(playable) }, '再来一次'),
          wrong.length ? h('button', { class: 'btn big-choice', onclick: () => start(wrong.map((r) => r.card), true) }, `只练答错的 ${wrong.length} 道`) : null,
          h('a', { class: 'btn big-choice', href: back }, '回到题目集'),
        ),
      ),
    );
    stage.querySelector('[data-autofocus]')?.focus();
  }

  function onKey(e) {
    if (!keys || dialogOpen() || e.metaKey || e.ctrlKey || e.altKey || e.target.closest?.('input, textarea, select')) return;
    if (keys.pick && /^[1-6]$/.test(e.key)) {
      e.preventDefault();
      keys.pick(Number(e.key) - 1);
    } else if (e.key === 'Enter' && !e.target.closest?.('button, a')) {
      const go = keys.submit ?? keys.next;
      if (go) {
        e.preventDefault();
        go();
      }
    }
  }

  function onVisibility() {
    const now = performance.now();
    if (document.hidden) clock.hiddenAt = now;
    else if (clock.hiddenAt) {
      clock.paused += now - clock.hiddenAt;
      clock.hiddenAt = 0;
    }
  }

  document.addEventListener('keydown', onKey);
  document.addEventListener('visibilitychange', onVisibility);
  showReady();

  return {
    title: `答题 · ${set.title}`,
    el: root,
    cleanup: () => {
      stopTimers();
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('visibilitychange', onVisibility);
    },
  };
}
