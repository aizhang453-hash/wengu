// 弹珠台「星际远航」的页面: 台面、物理、规则在 ../pinball.js, 3D 画面在 ../pinball3d.js (打开这一页才下载 three.js),
// 点阵屏在 ../pindmd.js, 声音在 ../pinsound.js
//   开局选模式: 远航模式 (选一个队员, 队员按经验升级, 存在 data.arcade.pinball.progress, 跟着同步) / 经典模式 (没有队员, 排行榜分开)
//   远航模式发射前按挡板 (← →) 换队员
//   键盘: ← / Z / 左 Shift 左挡板, → / / / 右 Shift 右挡板, 空格 / ↓ / 回车 拉弹簧 (按住, 松开发射), N / ↑ 撞台子, P / Esc 暂停
//   手机: 点屏幕左半边 / 右半边打挡板 (两个手指能一起), 按住右下角「发射」, 左下角「撞」
//   切到别的应用、别的标签页自动暂停; 太卡了画面自己降一级 (像素 → 影子 → 发光)

import { h, fill, icon } from '../dom.js';
import { Pinball, LANE_X, STORY, CHAPTERS, CREW, LEVEL_XP, MAX_LEVEL, crewById, crewLevel, xpFor } from '../pinball.js';
import { bestOf, progressOf, TOP_N } from '../arcade.js';
import { soundToggle } from './match.js';
import { play, stopHum } from '../pinsound.js';
import { createDmd } from '../pindmd.js';

const PREFS_KEY = 'wengu:pinball';
let three = null; // 下载过一次就留着

function loadPrefs() {
  try {
    return { helped: false, follow: true, mode: 'voyage', crew: 'pilot', ...JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') };
  } catch {
    return { helped: false, follow: true, mode: 'voyage', crew: 'pilot' };
  }
}
function savePrefs(p) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p));
  } catch {
    // 存不了就算了
  }
}

// 手机、平板 (或者核少的电脑): 画面先用省一点的
const lowEnd = () => (window.matchMedia?.('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 820) || (navigator.hardwareConcurrency ?? 8) <= 4;

export function renderPinball({ store }) {
  let prefs = loadPrefs();
  let game = null;
  let scene = null;
  let paused = true;
  let disposed = false;
  let raf = 0;
  let last = 0;
  let overScore = null;
  let dirty = true; // 暂停的时候要不要重画一张
  const perf = { since: 0, frames: 0, time: 0, more: true };

  const dmdCanvas = h('canvas', { class: 'pb-dmd', 'aria-hidden': 'true' });
  const dmd = createDmd(dmdCanvas);
  const live = h('div', { class: 'pb-live', role: 'status', 'aria-live': 'polite' });
  const canvas = h('canvas', { class: 'pb-gl', 'aria-label': '星际远航弹珠台' });
  const launchBtn = h('button', { class: 'pb-launch', type: 'button', 'aria-label': '发射 (按住拉弹簧, 松开发射)' }, '发射');
  const nudgeBtn = h('button', { class: 'pb-nudge', type: 'button', 'aria-label': '撞台子 (N)' }, '撞');
  const touch = h('div', { class: 'pb-touch', 'aria-hidden': 'true' }, h('span', { class: 'pb-touch-l' }), h('span', { class: 'pb-touch-r' }));
  const overlay = h('div', { class: 'pb-overlay', hidden: true });
  const crewPanel = h('div', { class: 'pb-crew', hidden: true });
  const stage = h('div', { class: 'pb-stage' }, canvas, touch, crewPanel, launchBtn, nudgeBtn, overlay);
  const pauseBtn = h('button', { class: 'icon-btn tool', type: 'button', title: '暂停 (P)', 'aria-label': '暂停', onclick: () => pause() }, icon('pause', 22));
  const root = h(
    'section',
    { class: 'pinball-page' },
    h(
      'div',
      { class: 'pb-head' },
      h('a', { class: 'icon-btn tool', href: '#/arcade', title: '不玩了', 'aria-label': '不玩了, 回游戏厅' }, icon('x', 22)),
      h('div', { class: 'pb-dmd-box' }, dmdCanvas),
      pauseBtn,
      soundToggle(),
    ),
    live,
    stage,
  );

  // ---- 大小 ----
  function layout() {
    const rect = stage.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    scene?.resize(rect.width, rect.height);
    dmd.resize();
    dirty = true;
  }
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => layout()) : null;

  // ---- 读屏、发射钮 ----
  let shownMsg = null;
  function hud() {
    const s = game.state;
    const msg = s.messageLeft > 0 ? s.message : '';
    if (msg !== shownMsg) {
      shownMsg = msg;
      live.textContent = msg;
    }
    launchBtn.hidden = !game.balls.some((b) => b.x > LANE_X && b.y > game.table.plunger.top - 60 && !b.held);
    launchBtn.classList.toggle('pulling', game.input.plunger);
    nudgeBtn.hidden = s.status !== 'play';
    const pick = picking();
    if (crewPanel.hidden === pick) {
      crewPanel.hidden = !pick;
      if (pick) drawCrew();
    }
  }

  // ---- 队员 ----
  const progress = () => progressOf(store.data.arcade, 'pinball');
  const unlocked = (c) => progress().bosses >= c.unlock;
  const levelOf = (id) => crewLevel(progress().xp[id] ?? 0);
  // 远航模式、第一个球还没发射: 能换队员
  const picking = () => mode === 'voyage' && game.state.status === 'ready' && game.state.ball === 1 && game.state.score === 0 && !paused;
  function chooseCrew(id) {
    const c = crewById(id);
    if (!c || !unlocked(c)) return;
    prefs = { ...prefs, crew: id };
    savePrefs(prefs);
    const level = levelOf(id);
    game.setCrew({ id, level });
    game.say(`队员: ${c.name} · ${c.role} ${level} 级`, 3);
    drawCrew();
  }
  function cycleCrew(step) {
    const open = CREW.filter(unlocked);
    const i = open.findIndex((c) => c.id === game.crew?.id);
    chooseCrew(open[(i + step + open.length) % open.length].id);
  }
  function drawCrew() {
    const c = crewById(game.crew?.id) ?? CREW[0];
    const xp = progress().xp[c.id] ?? 0;
    const lv = crewLevel(xp);
    const next = LEVEL_XP[lv] ?? null;
    fill(
      crewPanel,
      h('button', { class: 'pb-crew-arrow', type: 'button', 'aria-label': '上一个队员', onclick: () => cycleCrew(-1) }, '◀'),
      h(
        'div',
        { class: 'pb-crew-card' },
        h('div', { class: 'pb-crew-top' }, h('span', { class: 'pb-crew-mark', style: `--c:${c.color}` }, c.mark), h('div', {}, h('strong', {}, `${c.name} · ${c.role}`), h('span', { class: 'small' }, `${lv} 级${lv < MAX_LEVEL ? ` · 经验 ${xp}/${next}` : ' · 满级'}`))),
        lv < MAX_LEVEL ? h('div', { class: 'pb-crew-xp' }, h('span', { style: `width:${Math.round(((xp - LEVEL_XP[lv - 1]) / (next - LEVEL_XP[lv - 1])) * 100)}%` })) : null,
        h('p', { class: 'small' }, c.skill(lv)),
        h(
          'div',
          { class: 'pb-crew-row' },
          CREW.map((x) =>
            h(
              'span',
              { class: `pb-crew-dot${x.id === c.id ? ' on' : ''}${unlocked(x) ? '' : ' locked'}`, style: `--c:${x.color}`, title: unlocked(x) ? `${x.name} · ${x.role}` : `再渡过 ${x.unlock - progress().bosses} 场危机, ${x.name} (${x.role}) 加入` },
              unlocked(x) ? x.mark : '🔒',
            ),
          ),
        ),
        h('p', { class: 'pb-crew-tip small' }, touchFirst() ? '点左右两边换队员, 按住「发射」出发' : '← → 换队员, 按住空格出发'),
      ),
      h('button', { class: 'pb-crew-arrow', type: 'button', 'aria-label': '下一个队员', onclick: () => cycleCrew(1) }, '▶'),
    );
  }

  // ---- 一帧 ----
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const raw = (now - last) / 1000 || 0;
    const dt = Math.min(0.05, raw);
    last = now;
    if (!paused) {
      game.update(dt);
      for (const e of game.events) {
        play(e);
        dmd.event(e, now);
        if (e.type === 'over') overScore = e.score;
      }
      scene.render(game, dt, now);
      game.events.length = 0;
      watch(now, raw);
    } else if (dirty && scene) {
      scene.render(game, 0, now);
      dirty = false;
    }
    dmd.draw(game, now);
    hud();
    if (overScore !== null) {
      gameOver(overScore);
      overScore = null;
    }
  }

  // 每 3 秒看一次快不快: 平均一帧超过 1/45 秒就降一级
  function watch(now, raw) {
    if (!perf.more || document.visibilityState !== 'visible' || raw > 0.25) return;
    if (!perf.since) perf.since = now + 1500; // 刚开始编译着色器, 先不算
    if (now < perf.since) return;
    perf.frames++;
    perf.time += raw;
    if (now - perf.since < 3000) return;
    if (perf.time / perf.frames > 1 / 45) perf.more = scene.degrade();
    Object.assign(perf, { since: now, frames: 0, time: 0 });
  }

  // ---- 暂停、怎么玩、结束 ----
  const helpText = () =>
    h(
      'ul',
      { class: 'pb-help' },
      h('li', {}, h('b', {}, '挡板: '), '键盘 ← 或 Z 左边, → 或 / 右边; 手机点屏幕左半边 / 右半边 (两边能一起按)'),
      h('li', {}, h('b', {}, '发射: '), '按住空格 (手机: 右下角「发射」) 拉弹簧, 松开发射。落进顶上闪着的那条通道 → 技巧射击'),
      h('li', {}, h('b', {}, '四个星系: '), CHAPTERS.map((c, i) => `${i + 1}. ${c.name}`).join(' → '), ' → 终章 曙光星。每个星系三个任务, 做完了来一场危机'),
      h('li', {}, h('b', {}, '任务: '), '右边三个红色任务靶都打亮 → 打进中间的黑洞, 按挡板选任务。要打的路线有白色箭头在闪, 屏上写着还剩几秒; 没做完时间到了, 做到哪留着, 下次接着做'),
      h('li', {}, h('b', {}, '危机: '), '一个星系的任务都做完 → 打进黑洞迎战 (两个球一起打), 打闪着箭头的路线扣它的血, 血扣完跃迁到下一个星系 (第二、四章送一个球)'),
      h('li', {}, h('b', {}, '着陆: '), '四个星系都过了 → 打进黑洞开始终章, 四个球, 亮着的五条路线都打一遍, 最后打进黑洞着陆曙光星'),
      h('li', {}, h('b', {}, '别的: '), '坡道 (左边透明的) 打上去曲速 +1, 5 级跃迁; 打上去两次锁球灯亮, 锁满两个三个球一起玩。坡道、轨道、黑洞几秒内接着打中是连击。没事的时候黑洞是补给舱 (随机奖励)。左边五个黄色靶都打倒 → 救生舱亮'),
      h('li', {}, h('b', {}, '撞台子: '), 'N 或 ↑ (手机: 左下角「撞」) 把球撞开一点, 8 秒内撞三次就倾斜。每个球开始 10 秒有护盾'),
      h('li', {}, h('b', {}, '队员: '), '远航模式开局选一个队员, 每个人本事不一样; 玩完一局得经验, 升级本事更大; 渡过危机会有新队员加入。经典模式没有队员, 比分数公平'),
    );

  function showOverlay(...children) {
    fill(overlay, h('div', { class: 'pb-panel' }, ...children));
    overlay.hidden = false;
    overlay.querySelector('button')?.focus();
  }

  function resume() {
    if (!scene) return;
    paused = false;
    overlay.hidden = true;
    document.activeElement?.blur?.(); // 空格是拉弹簧, 别按到还有焦点的钮
    last = performance.now();
  }

  function pause() {
    if (!scene || game.state.status === 'over' || paused) return;
    paused = true;
    dirty = true;
    release();
    stopHum();
    const best = bestOf(store.data.arcade, boardKey());
    const c = mode === 'voyage' ? crewById(game.crew?.id) : null;
    showOverlay(
      h('h2', {}, '暂停'),
      h('p', { class: 'muted small' }, `${mode === 'voyage' ? `远航模式${c ? ` · ${c.name} (${c.role}) ${game.crew.level} 级` : ''}` : '经典模式'} · 第 ${game.state.chapter + 1} 章 ${CHAPTERS[game.state.chapter].name}${best ? ` · 最高 ${best.toLocaleString('en-US')}` : ''}`),
      h('div', { class: 'pb-buttons' }, h('button', { class: 'btn primary', type: 'button', onclick: resume }, '继续'), h('button', { class: 'btn', type: 'button', onclick: restart }, '重新开始'), h('button', { class: 'btn', type: 'button', onclick: chooseMode }, '换模式')),
      h(
        'label',
        { class: 'pb-check' },
        h('input', {
          type: 'checkbox',
          checked: prefs.follow,
          onchange: (e) => {
            prefs = { ...prefs, follow: e.target.checked };
            savePrefs(prefs);
            scene.setFollow(prefs.follow);
            dirty = true;
          },
        }),
        ' 镜头跟着球 (横着的屏幕; 不勾就看整张台)',
      ),
      helpText(),
      h('a', { class: 'btn ghost', href: '#/arcade' }, '回游戏厅'),
    );
  }

  const touchFirst = () => window.matchMedia?.('(pointer: coarse)').matches;
  let mode = prefs.mode === 'classic' ? 'classic' : 'voyage';
  const boardKey = () => (mode === 'classic' ? 'pinball-classic' : 'pinball');
  // 一局开始: 远航模式带上队员 (上次选的, 没解锁的换成第一个); 说怎么发射 (手机、电脑不一样)
  function newGame() {
    let crew = null;
    if (mode === 'voyage') {
      const c = crewById(prefs.crew);
      const id = c && unlocked(c) ? c.id : CREW[0].id;
      crew = { id, level: levelOf(id) };
    }
    const g = new Pinball({ crew });
    g.say(touchFirst() ? '按住右下角「发射」, 松开发射' : '按住空格拉弹簧, 松开发射', 6);
    return g;
  }

  function restart() {
    stopHum();
    game = newGame();
    dirty = true;
    resume();
    if (picking()) drawCrew();
  }

  // 选模式 (每次打开、换模式): 故事 + 两个钮
  function chooseMode() {
    paused = true;
    release();
    stopHum();
    const best = (key) => bestOf(store.data.arcade, key);
    const go = (m) => {
      mode = m;
      prefs = { ...prefs, mode: m, helped: true };
      savePrefs(prefs);
      restart();
    };
    showOverlay(
      h('h2', {}, '星际远航'),
      h('div', { class: 'pb-story' }, STORY.intro.map((x) => h('p', {}, x))),
      h(
        'div',
        { class: 'pb-modes' },
        h('button', { class: `pb-mode${mode === 'voyage' ? ' primary' : ''}`, type: 'button', onclick: () => go('voyage') }, h('strong', {}, '远航模式'), h('span', {}, '选一个队员出发, 队员会升级'), best('pinball') ? h('span', { class: 'small' }, `最高 ${best('pinball').toLocaleString('en-US')}`) : null),
        h('button', { class: `pb-mode${mode === 'classic' ? ' primary' : ''}`, type: 'button', onclick: () => go('classic') }, h('strong', {}, '经典模式'), h('span', {}, '没有队员加成, 比分数公平'), best('pinball-classic') ? h('span', { class: 'small' }, `最高 ${best('pinball-classic').toLocaleString('en-US')}`) : null),
      ),
      h('details', { class: 'pb-how', open: !prefs.helped }, h('summary', {}, '怎么玩'), helpText()),
    );
    overlay.querySelector('.pb-mode.primary')?.focus();
  }

  function gameOver(score) {
    const s = game.state;
    const lines = [];
    let rec;
    if (mode === 'voyage' && game.crew) {
      // 队员得经验、升级; 渡过的危机多了有新队员加入
      const before = progress();
      const c = crewById(game.crew.id);
      const gained = xpFor({ score, ...s.stats });
      const xp = (before.xp[c.id] ?? 0) + gained;
      const after = { xp: { ...before.xp, [c.id]: xp }, bosses: before.bosses + s.stats.bosses, landings: before.landings + s.stats.landings };
      rec = store.recordArcade('pinball', score, Date.now(), after);
      const lv0 = crewLevel(before.xp[c.id] ?? 0);
      const lv1 = crewLevel(xp);
      lines.push(h('p', {}, `${c.name} +${gained} 经验${lv1 > lv0 ? ` · 升到 ${lv1} 级! ${c.skill(lv1)}` : ''}`));
      for (const x of CREW) if (before.bosses < x.unlock && after.bosses >= x.unlock) lines.push(h('p', { class: 'pb-new' }, `新队员加入: ${x.name} (${x.role}) · ${x.skill(1)}`));
    } else rec = store.recordArcade('pinball-classic', score);
    const where = s.stats.landings ? `着陆曙光星 ${s.stats.landings} 次!` : `到了第 ${s.chapter + 1} 章 · ${CHAPTERS[s.chapter].name}`;
    const top = store.data.arcade?.[boardKey()]?.top ?? [];
    release();
    stopHum();
    showOverlay(
      h('h2', {}, rec.best ? '新纪录! 🎉' : '游戏结束'),
      h('p', { class: 'pb-final' }, score.toLocaleString('en-US')),
      h('p', { class: 'muted small' }, `${mode === 'voyage' ? '远航模式' : '经典模式'} · ${where} · 做完 ${s.stats.missions} 个任务, 渡过 ${s.stats.bosses} 场危机`),
      lines.length ? h('div', { class: 'pb-gain' }, lines) : null,
      top.length
        ? h(
            'ol',
            { class: 'pb-top' },
            top.slice(0, TOP_N).map((r, i) => h('li', { class: rec.rank === i + 1 ? 'me' : '' }, h('span', {}, r.score.toLocaleString('en-US')), h('span', { class: 'muted small' }, new Date(r.at).toLocaleDateString('zh-CN')))),
          )
        : null,
      h('div', { class: 'pb-buttons' }, h('button', { class: 'btn primary', type: 'button', onclick: restart }, '再来一局'), h('button', { class: 'btn', type: 'button', onclick: chooseMode }, '换模式'), h('a', { class: 'btn', href: '#/arcade' }, '回游戏厅')),
    );
  }

  // ---- 键盘 ----
  const LEFT = new Set(['ArrowLeft', 'KeyZ', 'ShiftLeft']);
  const RIGHT = new Set(['ArrowRight', 'Slash', 'ShiftRight', 'KeyM']);
  const PLUNGER = new Set(['Space', 'ArrowDown', 'Enter', 'NumpadEnter']);
  const NUDGE = new Set(['KeyN', 'ArrowUp']);
  function onKey(e) {
    if (e.target.closest?.('input, textarea, select')) return;
    const down = e.type === 'keydown';
    const code = e.code;
    if (down && (code === 'KeyP' || code === 'Escape')) {
      e.preventDefault();
      return paused ? game.state.status !== 'over' && overlay.querySelector('.btn.primary')?.click() : pause();
    }
    if (paused) return;
    if (down && !e.repeat && picking() && (LEFT.has(code) || RIGHT.has(code))) cycleCrew(LEFT.has(code) ? -1 : 1);
    let used = true;
    if (LEFT.has(code)) game.input.left = down;
    else if (RIGHT.has(code)) game.input.right = down;
    else if (PLUNGER.has(code)) game.input.plunger = down;
    else if (NUDGE.has(code)) game.input.nudge = down;
    else used = false;
    if (used) e.preventDefault();
  }

  // ---- 手指、鼠标 ----
  const pointers = new Map(); // pointerId → 'left' | 'right'
  function syncTouch() {
    const sides = [...pointers.values()];
    game.input.left = sides.includes('left');
    game.input.right = sides.includes('right');
    touch.classList.toggle('l', game.input.left);
    touch.classList.toggle('r', game.input.right);
  }
  touch.addEventListener('pointerdown', (e) => {
    if (paused) return;
    e.preventDefault();
    const rect = touch.getBoundingClientRect();
    const side = e.clientX - rect.left < rect.width / 2 ? 'left' : 'right';
    if (picking()) cycleCrew(side === 'left' ? -1 : 1);
    pointers.set(e.pointerId, side);
    touch.setPointerCapture?.(e.pointerId);
    syncTouch();
  });
  const up = (e) => {
    pointers.delete(e.pointerId);
    syncTouch();
  };
  touch.addEventListener('pointerup', up);
  touch.addEventListener('pointercancel', up);
  touch.addEventListener('contextmenu', (e) => e.preventDefault());
  // 按住的钮: 发射 (拉弹簧)、撞台子
  function holdButton(btn, key) {
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (paused) return;
      btn.setPointerCapture?.(e.pointerId);
      game.input[key] = true;
    });
    const off = () => (game.input[key] = false);
    btn.addEventListener('pointerup', off);
    btn.addEventListener('pointercancel', off);
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  holdButton(launchBtn, 'plunger');
  holdButton(nudgeBtn, 'nudge');

  function release() {
    pointers.clear();
    Object.assign(game.input, { left: false, right: false, plunger: false, nudge: false });
    syncTouch();
  }

  // 切走了: 暂停
  const onHide = () => document.visibilityState === 'hidden' && pause();
  const onBlur = () => pause();
  document.addEventListener('keydown', onKey);
  document.addEventListener('keyup', onKey);
  document.addEventListener('visibilitychange', onHide);
  window.addEventListener('blur', onBlur);
  window.addEventListener('resize', layout);

  game = newGame();

  // ---- 下载 three.js, 搭台面 ----
  showOverlay(h('div', { class: 'pb-loading' }, h('span', { class: 'pb-spinner', 'aria-hidden': 'true' }), h('p', {}, '正在准备 3D 台面…')));
  async function start() {
    try {
      three ??= import('../vendor/three.js');
      const THREE = await three;
      if (disposed) return;
      scene = (await import('../pinball3d.js')).createScene(THREE, canvas, game.table, { quality: lowEnd() ? 'low' : 'high' });
    } catch (err) {
      three = null; // 下次再试
      if (disposed) return;
      const webgl = !/fetch|import|module/i.test(String(err?.message));
      showOverlay(
        h('h2', {}, '3D 画面打不开'),
        h('p', {}, webgl ? '这个浏览器 (或者这台设备) 不支持 WebGL, 换一个浏览器试试 (Chrome、Safari、Edge 都行)。' : '没下载下来, 连上网再打开一次。'),
        h('div', { class: 'pb-buttons' }, h('a', { class: 'btn primary', href: '#/arcade' }, '回游戏厅')),
      );
      return;
    }
    if (disposed) return scene.dispose();
    scene.setFollow(prefs.follow);
    layout();
    ro?.observe(stage);
    last = performance.now();
    raf = requestAnimationFrame(frame);
    chooseMode();
  }
  // 放进页面以后才量得出大小
  requestAnimationFrame(() => start());

  return {
    title: '星际远航',
    el: root,
    cleanup: () => {
      disposed = true;
      cancelAnimationFrame(raf);
      ro?.disconnect();
      stopHum();
      scene?.dispose();
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('keyup', onKey);
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('resize', layout);
    },
  };
}
