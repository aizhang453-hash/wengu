// 打陨石 (照 Quizlet 的 Blast): 上面一条大字出题 (默认出解释), 陨石上写着答案 (默认是词) 往下掉,
// 点对的那块, 下面的飞船打碎它。打错或者让对的那块掉到飞船那儿, 少一条命。答对 5 题升一关, 越来越快。

import { h, dialogOpen, icon } from '../dom.js';
import { sayCard, canSay, stopSpeaking } from '../speech.js';
import { rich, cardImage } from '../cardview.js';
import { stripMarks } from '../rich.js';
import { makeQuestion, otherSide, shuffle } from '../questions.js';
import { blastSpeed, blastPoints, blastLevel, rockSlots, textSize, whyNotPlayable, BLAST_LIVES, BLAST_PER_LEVEL } from '../games.js';
import { sound } from './match.js';
import { gameHeader, cantPlay, openSettings, rememberGame, fitText } from './gameshell.js';

// 在这些框里打字时不接快捷键 (比如设置窗口)
const TYPING = 'textarea, select, input:not([type=checkbox]):not([type=radio])';
const PREFS_KEY = 'wengu:blast-prefs';
const STREAK_BAR = 10; // 连对的格子

export function renderBlast({ store, from }, id) {
  const set = store.getSet(id);
  if (!set || whyNotPlayable('blast', set)) return cantPlay({ set, game: 'blast', from });
  rememberGame('blast', set.id);

  // 默认跟 Quizlet 一样: 上面出解释 (字多也放得下), 陨石上写词
  let answerWith = 'term';
  try {
    const p = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}');
    if (p.answerWith === 'def') answerWith = 'def';
  } catch {
    // 用默认的
  }
  const setAnswerWith = (v) => {
    answerWith = v;
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({ answerWith }));
    } catch {
      // 存不了就算了
    }
  };
  const ANSWER_OPTIONS = [
    ['term', '上面出解释, 打词'],
    ['def', '上面出词, 打解释'],
  ];

  const root = h('section', { class: 'game-page blast-page' });
  let raf = null;
  let state = null;

  const settings = () =>
    openSettings({
      groups: [{ name: 'answerWith', label: '题目', options: ANSWER_OPTIONS }],
      values: { answerWith },
      onChange: (_, v) => setAnswerWith(v),
      note: '下一题开始用新的设置。',
    });
  const header = gameHeader({ store, set, game: 'blast', from, settings: () => (state?.over === false && state.togglePause(true), settings()) });

  // 词和解释都有字的卡片才拿来出题
  const usable = set.cards.filter((c) => c.term.trim() && c.def.trim());

  // ---- 场景: 上面的题、中间的太空、下面的飞船和计分 ----
  const promptText = h('div', { class: 'bp-text' });
  const promptImg = h('div', { class: 'bp-img' });
  const promptSpeak = h('button', { class: 'icon-btn tool', title: '朗读', 'aria-label': '朗读' }, icon('volume', 22));
  const prompt = h('div', { class: 'blast-prompt' }, promptImg, promptText, promptSpeak);
  const levelBar = h('div', { class: 'bt-fill' });
  const scoreEl = h('div', { class: 'blast-score' });
  const space = h('div', { class: 'space', role: 'application', 'aria-label': '陨石' });
  const laser = h('div', { class: 'laser' });
  const turret = h('div', { class: 'ship-gun' });
  const ship = h('div', { class: 'ship', 'aria-hidden': 'true' }, turret, h('div', { class: 'ship-body' }, h('div', { class: 'ship-window' })));
  const banner = h('div', { class: 'blast-banner', hidden: true });
  const levelEl = h('div', { class: 'bf-level' });
  const livesEl = h('div', { class: 'lives', 'aria-label': '命' });
  const streakEl = h('div', { class: 'bf-streak' });
  const pauseBtn = h('button', { class: 'icon-btn tool bf-pause', title: '暂停 (P)', 'aria-label': '暂停', onclick: () => state?.togglePause() }, icon('pause', 20));
  const overlay = h('div', { class: 'blast-overlay', hidden: true });
  const stage = h(
    'div',
    { class: 'blast-stage' },
    h('div', { class: 'blast-top' }, prompt, h('div', { class: 'blast-track' }, levelBar), scoreEl),
    h('div', { class: 'space-wrap' }, space, banner),
    laser,
    ship,
    h('div', { class: 'blast-foot' }, h('div', { class: 'bf-left' }, h('div', { class: 'bf-row' }, pauseBtn, levelEl), livesEl), streakEl),
    overlay,
  );
  root.replaceChildren(header, stage);

  function showOverlay(...children) {
    overlay.replaceChildren(h('div', { class: 'summary game-ready' }, ...children));
    overlay.hidden = false;
    overlay.querySelector('[data-autofocus]')?.focus();
  }

  function showReady() {
    stop();
    stage.classList.add('idle');
    const best = set.best.blast;
    showOverlay(
      h('div', { class: 'game-emoji', 'aria-hidden': 'true' }, '☄️'),
      h('h1', {}, '打陨石'),
      h('p', {}, '上面出题, 陨石上写着答案往下掉。点对的那块, 飞船会把它打碎。'),
      h('p', { class: 'muted small' }, `打错、或者让对的那块掉到飞船那儿, 少一条命 (一共 ${BLAST_LIVES} 条)。答对 ${BLAST_PER_LEVEL} 题升一关, 越掉越快。键盘可以按 1–4, P 暂停。`),
      h(
        'div',
        { class: 'row center' },
        ANSWER_OPTIONS.map(([v, label]) => h('label', { class: 'toggle' }, h('input', { type: 'radio', name: 'blastAnswer', value: v, checked: answerWith === v, onchange: () => setAnswerWith(v) }), ` ${label}`)),
      ),
      best ? h('p', { class: 'muted' }, `你的最高分: ${best}`) : null,
      h('div', { class: 'row center' }, h('button', { class: 'btn primary big-choice', 'data-autofocus': '1', onclick: play }, '开始游戏')),
    );
  }

  // ---- 玩 ----
  function play() {
    overlay.hidden = true;
    stage.classList.remove('idle');
    for (const r of state?.rocks ?? []) r.el.remove();
    state = {
      score: 0,
      correct: 0,
      streak: 0,
      lives: BLAST_LIVES,
      level: 1,
      q: null,
      rocks: [],
      last: 0,
      paused: false,
      over: false,
      missed: new Map(), // 卡片 id → 卡片, 没打中的
    };
    state.togglePause = togglePause;
    draw();
    nextQuestion();
    stop();
    raf = requestAnimationFrame(frame);
  }

  function draw() {
    scoreEl.textContent = String(state.score);
    const inLevel = state.correct % BLAST_PER_LEVEL;
    levelBar.style.width = `${(inLevel / BLAST_PER_LEVEL) * 100}%`;
    levelEl.replaceChildren(h('strong', {}, `第 ${state.level} 关`), h('span', {}, ` ${inLevel}/${BLAST_PER_LEVEL}`));
    livesEl.textContent = '♥'.repeat(state.lives) + '♡'.repeat(BLAST_LIVES - state.lives);
    livesEl.title = `还有 ${state.lives} 条命`;
    const lit = Math.min(state.streak, STREAK_BAR);
    streakEl.replaceChildren(
      h('span', { class: 'bf-label' }, state.streak ? `连对 ${state.streak}` : '连对'),
      h('span', { class: 'streak-bar' }, Array.from({ length: STREAK_BAR }, (_, i) => h('span', { class: i < lit ? 'on' : '' }))),
    );
  }

  function nextQuestion() {
    for (const r of state.rocks) r.el.remove();
    state.rocks = [];
    let q = null;
    for (let tries = 0; tries < 50 && q?.type !== 'mc'; tries++) {
      q = makeQuestion('mc', usable[Math.floor(Math.random() * usable.length)], set.cards, { answerWith });
    }
    state.q = q;
    // 题目: 字多就小一点, 放得下为止
    promptText.className = `bp-text ${textSize(q.prompt, [16, 50, 120])}`;
    promptText.replaceChildren(rich(q.prompt));
    promptImg.replaceChildren(q.side === 'term' ? cardImage(q.card.image, 'bp-pic') ?? '' : '');
    promptSpeak.onclick = () => sayCard(q.card, otherSide(q.side), set);
    promptSpeak.hidden = !canSay(q.card, otherSide(q.side));
    fitText(promptText, { max: space.clientWidth < 640 ? 30 : 46, min: 13 });

    // 窄屏两块一排、摆两排; 宽屏一排。第几个选项放哪个位置打乱
    const narrow = space.clientWidth < 640;
    const slots = rockSlots(q.options.length, narrow);
    const order = shuffle([...q.options.keys()]);
    space.classList.toggle('narrow', narrow);
    for (const [i, slot] of slots.entries()) {
      const opt = order[i];
      const text = q.options[opt];
      const el = h(
        'button',
        { class: `rock ${textSize(text, [10, 24, 60])}`, style: `left:${slot.x * 100}%;--w:${slot.width}` },
        h('span', { class: 'rock-key', 'aria-hidden': 'true' }, String(slot.key)),
        h('span', { class: 'rock-text' }, text ? rich(text) : '(空)'),
      );
      el.setAttribute('aria-label', `${slot.key}: ${stripMarks(text)}`);
      const rock = { el, text, key: slot.key, correct: opt === q.correctIndex, y: 0, alive: true };
      el.addEventListener('click', () => shoot(rock));
      space.append(el);
      // 起点: 整块露出来, 第二排往下错开
      rock.y = el.offsetHeight / 2 / Math.max(1, space.clientHeight) + 0.02 + slot.y;
      el.style.top = `${rock.y * 100}%`;
      fitText(el.querySelector('.rock-text'), { max: 26, min: 11 });
      state.rocks.push(rock);
    }
    state.speed = blastSpeed(state.level);
  }

  // 飞船转过去, 打一道光 (从飞船中间往上, 转到对着陨石)
  function fire(rock) {
    const box = stage.getBoundingClientRect();
    const a = ship.getBoundingClientRect();
    const b = rock.el.getBoundingClientRect();
    const x1 = a.left + a.width / 2 - box.left;
    const y1 = a.top + a.height * 0.45 - box.top;
    const x2 = b.left + b.width / 2 - box.left;
    const y2 = b.top + b.height / 2 - box.top;
    const angle = Math.atan2(x2 - x1, y1 - y2); // 0 是正上方, 往右为正
    const len = Math.hypot(x2 - x1, y2 - y1);
    turret.style.transform = `translateX(-50%) rotate(${angle}rad)`;
    laser.style.cssText = `left:${x1}px;top:${y1 - len}px;height:${len}px;transform:rotate(${angle}rad)`;
    laser.classList.remove('on');
    void laser.offsetWidth; // 重新播动画
    laser.classList.add('on');
  }

  function shoot(rock) {
    if (!state || state.over || state.paused || !rock.alive) return;
    fire(rock);
    if (rock.correct) {
      rock.alive = false;
      rock.el.classList.add('boom');
      sound('right');
      state.correct++;
      state.streak++;
      state.score += blastPoints(state.level);
      const level = blastLevel(state.correct);
      if (level > state.level) {
        state.level = level;
        flash(`第 ${level} 关! 更快了`);
      }
      draw();
      // 别的陨石也散掉
      for (const r of state.rocks) if (r !== rock) (r.alive = false), r.el.classList.add('fade');
      setTimeout(() => !state.over && nextQuestion(), 380);
    } else {
      rock.alive = false;
      rock.el.classList.add('wrong-hit');
      sound('wrong');
      state.missed.set(state.q.card.id, state.q.card);
      loseLife();
    }
  }

  function loseLife() {
    state.lives--;
    state.streak = 0;
    draw();
    stage.classList.add('shake');
    setTimeout(() => stage.classList.remove('shake'), 300);
    if (state.lives <= 0) gameOver();
  }

  function flash(text) {
    banner.textContent = text;
    banner.hidden = false;
    clearTimeout(flash.t);
    flash.t = setTimeout(() => (banner.hidden = true), 1600);
  }

  function frame(ts) {
    if (!state || state.over) return;
    const dt = state.last ? Math.min(0.05, (ts - state.last) / 1000) : 0;
    state.last = ts;
    if (!state.paused) {
      for (const r of state.rocks) {
        if (!r.alive) continue;
        r.y += state.speed * dt;
        r.el.style.top = `${r.y * 100}%`;
        if (r.y < 1) continue;
        // 掉到飞船那儿了
        r.alive = false;
        r.el.classList.add('fade');
        if (r.correct) {
          sound('wrong');
          state.missed.set(state.q.card.id, state.q.card);
          flash(`答案是: ${stripMarks(r.text)}`);
          loseLife();
          for (const o of state.rocks) if (o.alive) (o.alive = false), o.el.classList.add('fade');
          if (!state.over) setTimeout(() => !state.over && nextQuestion(), 900);
        }
      }
    }
    raf = requestAnimationFrame(frame);
  }

  function togglePause(force) {
    if (!state || state.over) return;
    state.paused = force ?? !state.paused;
    state.last = 0;
    pauseBtn.replaceChildren(icon(state.paused ? 'play' : 'pause', 20));
    pauseBtn.title = state.paused ? '接着玩 (P)' : '暂停 (P)';
    stage.classList.toggle('paused', state.paused);
    if (state.paused) {
      showOverlay(
        h('div', { class: 'game-emoji', 'aria-hidden': 'true' }, '⏸'),
        h('h1', {}, '暂停了'),
        h('p', { class: 'muted' }, `${state.score} 分 · 第 ${state.level} 关`),
        h('div', { class: 'row center' }, h('button', { class: 'btn primary big-choice', 'data-autofocus': '1', onclick: () => togglePause(false) }, '接着玩')),
      );
    } else overlay.hidden = true;
  }

  function gameOver() {
    state.over = true;
    stop();
    const record = store.recordBest(set.id, 'blast', state.score);
    sound('done');
    const missed = [...state.missed.values()];
    setTimeout(() => {
      if (!root.isConnected) return;
      stage.classList.add('idle');
      showOverlay(
        h('div', { class: 'game-emoji', 'aria-hidden': 'true' }, record ? '🏆' : '💥'),
        h('h1', {}, record ? '新纪录!' : '游戏结束'),
        h('div', { class: 'big-score good' }, `${state.score} 分`),
        h('p', { class: 'muted' }, `打中 ${state.correct} 题, 到了第 ${state.level} 关 · 最高分 ${set.best.blast ?? state.score}`),
        missed.length
          ? h(
              'div',
              { class: 'missed' },
              h('p', { class: 'muted small' }, '这些没打中, 再看一眼:'),
              h(
                'ul',
                { class: 'round-list' },
                missed.map((c) => h('li', {}, h('span', { class: 'dot' }), h('span', { class: 'rl-term' }, rich(c.term)), h('span', { class: 'muted' }, rich(c.def)))),
              ),
            )
          : null,
        h('div', { class: 'row center' }, h('button', { class: 'btn primary big-choice', 'data-autofocus': '1', onclick: play }, '再玩一次')),
      );
    }, 500);
  }

  function stop() {
    cancelAnimationFrame(raf);
    raf = null;
  }

  function onKey(e) {
    if (e.metaKey || e.ctrlKey || e.altKey || dialogOpen() || e.target.closest?.(TYPING)) return;
    if (!state || state.over) return;
    if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
      e.preventDefault();
      state.togglePause();
    } else if (/^[1-4]$/.test(e.key) && !state.paused) {
      e.preventDefault();
      const r = state.rocks.find((x) => x.alive && x.key === Number(e.key));
      if (r) shoot(r);
    }
  }

  // 切到别的标签页就自动暂停
  function onVisibility() {
    if (document.hidden && state && !state.over && !state.paused) state.togglePause(true);
  }

  document.addEventListener('keydown', onKey);
  document.addEventListener('visibilitychange', onVisibility);
  showReady();

  return {
    title: `打陨石 · ${set.title}`,
    el: root,
    cleanup: () => {
      if (state) state.over = true;
      stop();
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('visibilitychange', onVisibility);
      stopSpeaking();
    },
  };
}
