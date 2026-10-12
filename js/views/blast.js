// 打陨石 (照 Quizlet 的 Blast): 下面给一个词, 上面飘下来几块陨石, 每块写着一个答案,
// 打中对的那块。打错或者让对的那块掉下去, 少一条命。答对 5 题升一关, 越来越快。

import { h } from '../dom.js';
import { sayCard, canSay, stopSpeaking } from '../speech.js';
import { rich } from '../cardview.js';
import { stripMarks } from '../rich.js';
import { otherSide } from '../questions.js';
import { makeQuestion, shuffle } from '../questions.js';
import { pickDistinct, blastSpeed, blastPoints, blastLevel, BLAST_LIVES } from '../games.js';
import { soundToggle, sound } from './match.js';

const PREFS_KEY = 'wengu:blast-prefs';

export function renderBlast({ store }, id) {
  const set = store.getSet(id);
  const base = set ? `#/set/${encodeURIComponent(set.id)}` : '#/';
  const playable = set ? pickDistinct(set.cards, 4) : [];
  if (!set || playable.length < 2) {
    return {
      title: '打陨石',
      el: h(
        'section',
        { class: 'empty' },
        h('h1', {}, set ? '卡片不够, 玩不了打陨石' : '找不到这个卡片集'),
        set ? h('p', { class: 'muted' }, '至少要两张词和解释都不一样的卡片。') : null,
        h('a', { class: 'btn primary', href: set ? `${base}/edit` : '#/' }, set ? '去加卡片' : '回首页'),
      ),
    };
  }

  let answerWith = 'def';
  try {
    const p = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}');
    if (p.answerWith === 'term') answerWith = 'term';
  } catch {
    // 用默认的
  }

  const root = h('section', { class: 'game-page' });
  let raf = null;
  let state = null;

  function head() {
    return h('div', { class: 'cards-head' }, h('a', { class: 'back', href: base }, `← ${set.title || '未命名卡片集'}`), soundToggle());
  }

  function showReady() {
    stop();
    const best = set.best.blast;
    const radios = [
      ['def', '看词, 打解释'],
      ['term', '看解释, 打词'],
    ].map(([v, label]) =>
      h(
        'label',
        { class: 'toggle' },
        h('input', {
          type: 'radio',
          name: 'blastAnswer',
          value: v,
          checked: answerWith === v,
          onchange: () => {
            answerWith = v;
            try {
              localStorage.setItem(PREFS_KEY, JSON.stringify({ answerWith }));
            } catch {
              // 存不了就算了
            }
          },
        }),
        ` ${label}`,
      ),
    );
    root.replaceChildren(
      head(),
      h(
        'div',
        { class: 'summary game-ready' },
        h('div', { class: 'game-emoji', 'aria-hidden': 'true' }, '☄️'),
        h('h1', {}, '打陨石'),
        h('p', {}, '下面给你一个词, 上面会飘下来几块陨石, 点写着对的答案的那块把它打碎。'),
        h('p', { class: 'muted small' }, `打错、或者让对的那块掉下去, 少一条命 (一共 ${BLAST_LIVES} 条)。答对 5 题升一关, 陨石越掉越快。键盘可以按 1–4。`),
        h('div', { class: 'row center' }, radios),
        best ? h('p', { class: 'muted' }, `你的最高分: ${best}`) : null,
        h('div', { class: 'row center' }, h('button', { class: 'btn primary big-choice', 'data-autofocus': '1', onclick: play }, '开始游戏')),
      ),
    );
    root.querySelector('[data-autofocus]')?.focus();
  }

  // ---- 玩 ----
  function play() {
    const space = h('div', { class: 'space', role: 'application', 'aria-label': '陨石' });
    const scoreEl = h('span', { class: 'hud-item' });
    const levelEl = h('span', { class: 'hud-item' });
    const livesEl = h('span', { class: 'hud-item lives', 'aria-label': '命' });
    const pauseBtn = h('button', { class: 'btn small', onclick: () => togglePause() }, '暂停');
    const promptText = h('div', { class: 'blast-prompt-text' });
    const promptSpeak = h('button', { class: 'icon-btn', title: '朗读', 'aria-label': '朗读' }, '🔊');
    const banner = h('div', { class: 'blast-banner', hidden: true });

    state = {
      score: 0,
      correct: 0,
      lives: BLAST_LIVES,
      level: 1,
      q: null,
      rocks: [],
      last: 0,
      paused: false,
      over: false,
      missed: new Map(), // 卡片 id → 卡片, 没打中的
      space,
      banner,
      draw() {
        scoreEl.textContent = `分数 ${this.score}`;
        levelEl.textContent = `第 ${this.level} 关`;
        livesEl.textContent = '♥'.repeat(this.lives) + '♡'.repeat(BLAST_LIVES - this.lives);
      },
    };

    // 词和解释都有字的卡片才拿来出题
    const usable = set.cards.filter((c) => c.term.trim() && c.def.trim());

    function nextQuestion() {
      for (const r of state.rocks) r.el.remove();
      state.rocks = [];
      let q = null;
      for (let tries = 0; tries < 50 && q?.type !== 'mc'; tries++) {
        q = makeQuestion('mc', usable[Math.floor(Math.random() * usable.length)], set.cards, { answerWith });
      }
      state.q = q;
      promptText.replaceChildren(rich(q.prompt));
      promptSpeak.onclick = () => sayCard(q.card, otherSide(q.side), set);
      promptSpeak.hidden = !canSay(q.card, otherSide(q.side));
      // 分到几条道上, 从左到右编号 1–4, 起点高低错开
      const lanes = shuffle([...Array(q.options.length).keys()]);
      const order = [];
      q.options.forEach((text, i) => {
        const lane = lanes[i];
        const el = h('button', { class: 'rock', style: `left:${((lane + 0.5) / q.options.length) * 100}%` }, h('span', { class: 'rock-key' }), h('span', { class: 'rock-text' }, text ? rich(text) : '(空)'));
        const rock = { el, text, correct: i === q.correctIndex, lane, y: 0.08 + Math.random() * 0.14, alive: true };
        el.addEventListener('click', () => shoot(rock));
        space.append(el);
        state.rocks.push(rock);
        order.push(rock);
      });
      order.sort((a, b) => a.lane - b.lane).forEach((r, i) => (r.el.firstChild.textContent = String(i + 1)));
      state.speed = blastSpeed(state.level);
    }

    function shoot(rock) {
      if (state.over || state.paused || !rock.alive) return;
      if (rock.correct) {
        rock.alive = false;
        rock.el.classList.add('boom');
        sound('right');
        state.correct++;
        state.score += blastPoints(state.level);
        const level = blastLevel(state.correct);
        if (level > state.level) {
          state.level = level;
          flash(`第 ${level} 关! 更快了`);
        }
        state.draw();
        // 别的陨石也散掉
        for (const r of state.rocks) if (r !== rock) (r.alive = false), r.el.classList.add('fade');
        setTimeout(() => !state.over && nextQuestion(), 350);
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
      state.draw();
      space.classList.add('shake');
      setTimeout(() => space.classList.remove('shake'), 300);
      if (state.lives <= 0) gameOver();
    }

    function flash(text) {
      banner.textContent = text;
      banner.hidden = false;
      clearTimeout(flash.t);
      flash.t = setTimeout(() => (banner.hidden = true), 1400);
    }

    function frame(ts) {
      if (state.over) return;
      const dt = state.last ? Math.min(0.05, (ts - state.last) / 1000) : 0;
      state.last = ts;
      if (!state.paused) {
        for (const r of state.rocks) {
          if (!r.alive) continue;
          r.y += state.speed * dt;
          r.el.style.top = `${r.y * 100}%`;
          if (r.y > 1.02) {
            r.alive = false;
            r.el.remove();
            if (r.correct) {
              // 对的那块掉下去了
              sound('wrong');
              state.missed.set(state.q.card.id, state.q.card);
              flash(`答案是: ${stripMarks(r.text)}`);
              loseLife();
              if (!state.over) setTimeout(() => !state.over && nextQuestion(), 600);
              for (const o of state.rocks) if (o.alive) (o.alive = false), o.el.classList.add('fade');
            }
          }
        }
      }
      raf = requestAnimationFrame(frame);
    }

    state.togglePause = togglePause;
    function togglePause(force) {
      if (state.over) return;
      state.paused = force ?? !state.paused;
      pauseBtn.textContent = state.paused ? '继续' : '暂停';
      space.classList.toggle('paused', state.paused);
      if (state.paused) flash('暂停了, 按 P 或「继续」接着玩');
      else banner.hidden = true;
    }

    state.shootKey = (n) => {
      const r = state.rocks.find((x) => x.alive && x.el.firstChild.textContent === String(n));
      if (r) shoot(r);
    };

    root.replaceChildren(
      head(),
      h('div', { class: 'hud' }, scoreEl, levelEl, livesEl, pauseBtn),
      h('div', { class: 'space-wrap' }, space, banner),
      h('div', { class: 'blast-prompt' }, h('span', { class: 'muted small' }, answerWith === 'def' ? '词' : '解释'), promptText, promptSpeak),
    );
    state.draw();
    nextQuestion();
    stop();
    raf = requestAnimationFrame(frame);
  }

  function gameOver() {
    state.over = true;
    stop();
    const record = store.recordBest(set.id, 'blast', state.score);
    sound('done');
    const missed = [...state.missed.values()];
    setTimeout(() => {
      root.replaceChildren(
        head(),
        h(
          'div',
          { class: 'summary game-ready' },
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
          h(
            'div',
            { class: 'row center' },
            h('button', { class: 'btn primary', 'data-autofocus': '1', onclick: play }, '再玩一次'),
            h('a', { class: 'btn', href: `${base}/match` }, '玩配对'),
            h('a', { class: 'btn', href: base }, '回到卡片集'),
          ),
        ),
      );
      root.querySelector('[data-autofocus]')?.focus();
    }, 500);
  }

  function stop() {
    cancelAnimationFrame(raf);
    raf = null;
  }

  function onKey(e) {
    if (!state || state.over || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
      e.preventDefault();
      state.togglePause();
    } else if (/^[1-4]$/.test(e.key)) {
      e.preventDefault();
      state.shootKey(Number(e.key));
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
