// 右下角的小乌龟温温 (想法、要说的话在 ../pet.js):
//   点它: 说一句有用的 (今天还要背几张、错题该重做了……, 带按钮直接去), 再点念一句《论语》, 轮着来
//   自己说话: 每天第一次见面打个招呼; 过一阵念一句《论语》; 长大了、解锁了装扮、连续打卡到了天数 (放烟花)、
//            今天的背完了、碰到难记卡的时候说一声
//   只在首页、卡片集页这些地方; 背卡、测试、游戏、编辑、打字的时候不出来 (不挡按钮、不打扰)
//   「温温的小窝」: 长到哪了、心情、装扮、起名字, 这台设备上显示不显示、自己说不说话、缩成小圆点

import { h, fill, openDialog, askText, switchRow, dialogOpen } from '../dom.js';
import { todayAll } from './plan.js';
import { reviewedToday, examTime } from '../plan.js';
import { dueMistakes } from '../mistakes.js';
import { streak, dueTomorrow, dayKey, startOfDay, daysLater, DAY, LEECH } from '../srs.js';
import {
  STAGES,
  OUTFITS,
  stageOf,
  growth,
  xpOf,
  newUnlocks,
  moodOf,
  MOOD_TEXT,
  tips,
  idleDays,
  greeting,
  eventLine,
  randomQuote,
  quoteSource,
  milestoneDue,
  cheered,
  cleanPet,
} from '../pet.js';

const PREFS_KEY = 'wengu:pet';
// 出来的页面
const SHOW_ON = new Set(['home', 'set', 'folder', 'stats', 'mistakes', 'search', 'games', 'sync']);
const QUOTE_EVERY = [6 * 60e3, 12 * 60e3]; // 自己念《论语》: 隔 6–12 分钟一次

// 这台设备上的: hidden 不显示, quiet 不自己说话, mini 缩成小圆点, greeted 哪天打过招呼, cleared 哪天说过「背完了」
function loadPrefs() {
  try {
    const raw = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}');
    return raw && typeof raw === 'object' ? raw : {};
  } catch {
    return {};
  }
}
function savePrefs(prefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // 存不下就只管这次
  }
}

// ---- 画温温 (自己画的, 颜色跟着白天、夜间模式换) ----
// stage 0 蛋 … 4 学霸龟; mood 见 pet.js; wear 戴的装扮; progress 离下一个样子 0–1 (蛋快孵出来时有裂缝)

const FACES = {
  normal:
    '<circle class="p-eye" cx="16" cy="52" r="3.4"/><circle class="p-eye" cx="28" cy="52" r="3.4"/><circle class="p-hi" cx="17.2" cy="50.8" r="1.1"/><circle class="p-hi" cx="29.2" cy="50.8" r="1.1"/><path class="p-stroke" d="M19 60 Q22 63 25 60"/>',
  happy: '<path class="p-stroke" d="M12.5 53 Q16 48 19.5 53M24.5 53 Q28 48 31.5 53"/><path class="p-mouth p-line w2" d="M18 59 Q22 66.5 26 59 Z"/>',
  hungry:
    '<circle class="p-eye" cx="16" cy="52.5" r="3.3"/><circle class="p-eye" cx="28" cy="52.5" r="3.3"/><circle class="p-hi" cx="16.8" cy="50.6" r="1.2"/><circle class="p-hi" cx="28.8" cy="50.6" r="1.2"/><path class="p-stroke w16" d="M12.8 47.8 L18.6 46.2M25.4 46.2 L31.2 47.8"/><ellipse class="p-mouth p-line w16" cx="22" cy="61.4" rx="2.7" ry="3.1"/><path class="p-tear" d="M24.6 63.4 Q25.6 66.2 24.6 67.8 Q23.6 66.2 24.6 63.4 Z"/>',
  worried:
    '<circle class="p-eye" cx="16" cy="52.5" r="3.2"/><circle class="p-eye" cx="28" cy="52.5" r="3.2"/><circle class="p-hi" cx="17" cy="51.4" r="1"/><circle class="p-hi" cx="29" cy="51.4" r="1"/><path class="p-stroke w18" d="M12.5 47.5 L19 45M25 45 L31.5 47.5"/><path class="p-stroke" d="M18 61 Q20 59 22 61 Q24 63 26 61"/><path class="p-tear" d="M38 38 Q41.5 43.5 38 46 Q34.5 43.5 38 38 Z"/>',
  sleepy:
    '<path class="p-stroke" d="M12.5 52 Q16 55 19.5 52M24.5 52 Q28 55 31.5 52"/><path class="p-stroke" d="M20.5 61 Q22 62.2 23.5 61"/><text class="p-z p-z1" x="36" y="38">z</text><text class="p-z p-z2" x="43" y="29">Z</text>',
  sad: '<circle class="p-eye" cx="16" cy="52.5" r="3.2"/><circle class="p-eye" cx="28" cy="52.5" r="3.2"/><circle class="p-hi" cx="17" cy="51.4" r="1"/><circle class="p-hi" cx="29" cy="51.4" r="1"/><path class="p-stroke w18" d="M12.5 48.2 L19 45.6M25 45.6 L31.5 48.2"/><path class="p-stroke" d="M18.5 62.5 Q22 59 25.5 62.5"/><path class="p-tear" d="M14 57 Q16.6 61 14 63.2 Q11.4 61 14 57 Z"/>',
};

const WEAR = {
  scarf: '<path class="p-scarf p-line w2" d="M11 65 Q24 72 39 64 L40 71 Q24 80 10 72 Z"/><path class="p-scarf p-line w2" d="M29 72 L31 85 L37 83.5 L35 71 Z"/>',
  flower:
    '<g class="p-flower"><circle class="p-petal" cx="31" cy="35.6" r="2.9"/><circle class="p-petal" cx="35.2" cy="38.6" r="2.9"/><circle class="p-petal" cx="33.6" cy="43.4" r="2.9"/><circle class="p-petal" cx="28.4" cy="43.4" r="2.9"/><circle class="p-petal" cx="26.8" cy="38.6" r="2.9"/><circle class="p-gold" cx="31" cy="40" r="2.2"/></g>',
  hat: '<path class="p-hat p-line w2" d="M7 47 Q7 28 22 28 Q37 28 37 47 Z"/><rect class="p-hat2 p-line w2" x="5.5" y="42" width="33" height="6.5" rx="3.2"/><circle class="p-hat2 p-line w2" cx="22" cy="26" r="4.2"/>',
  glasses:
    '<circle class="p-glass p-line w18" cx="16" cy="52" r="5.4"/><circle class="p-glass p-line w18" cx="28" cy="52" r="5.4"/><path class="p-stroke w18" d="M21.4 51.5 Q22 50.5 22.6 51.5M10.6 51 L6.5 48.5"/>',
  cap: '<path class="p-dark" d="M12 43 Q22 47.5 32 43 L32 37 Q22 33.5 12 37 Z"/><path class="p-dark p-line w2" d="M3 35.5 L22 28.5 L41 35.5 L22 42.5 Z"/><path class="p-stroke p-tassel w16" d="M22 35.5 L37 38.5 L37 46"/><rect class="p-gold" x="35.4" y="45" width="3.2" height="4.5" rx="1"/>',
  crown: '<path class="p-gold p-line w2" d="M9 43 L10.5 30 L16 36.5 L22 27 L28 36.5 L33.5 30 L35 43 Z"/><circle class="p-gem" cx="22" cy="38" r="2"/>',
};

function turtleMarkup({ stage, mood, wear, progress }) {
  if (stage === 0) {
    const crack = progress >= 0.5 ? '<path class="p-stroke w25" d="M41 54 L48 49 L54 56 L61 48 L68 55 L75 49 L83 55 L87 52"/>' : '';
    const z = mood === 'sleepy' ? '<text class="p-z p-z1" x="90" y="30">z</text><text class="p-z p-z2" x="98" y="20">Z</text>' : '';
    return `<ellipse class="p-shadow" cx="64" cy="93" rx="30" ry="4"/><g class="p-egg-g"><path class="p-egg p-line" d="M64 24 C84 24 92 50 92 64 C92 82 80 91 64 91 C48 91 36 82 36 64 C36 50 44 24 64 24 Z"/><circle class="p-shell2" cx="54" cy="44" r="5"/><circle class="p-shell2" cx="76" cy="62" r="6"/><circle class="p-shell2" cx="58" cy="78" r="4"/><circle class="p-shell2" cx="79" cy="40" r="3.5"/>${crack}</g>${z}`;
  }
  const scale = [1, 0.8, 0.9, 0.97, 1][stage];
  const head = stage === 1 ? 'translate(22 54) scale(1.12) translate(-22 -54)' : '';
  const droop = mood === 'hungry' || mood === 'sad' ? 'translate(0 3)' : '';
  const hex = stage === 4 ? 'p-gold' : 'p-shell2';
  const spots = stage >= 3 ? '<circle class="p-shell2" cx="40" cy="67" r="4"/><circle class="p-shell2" cx="92" cy="67" r="4"/>' : '';
  // 宝宝: 头上还顶着半个蛋壳 (戴了帽子就不顶了)
  const shellCap = stage === 1 && !['hat', 'cap', 'crown'].includes(wear) ? '<path class="p-egg p-line w2" d="M7 46 L11 40 L15 45 L19 38.5 L23 44 L27 38.5 L31 45 L35 40 L37 45 Q36 31 22 31 Q8 31 7 46 Z"/>' : '';
  const front = wear === 'scarf' ? '' : WEAR[wear] ?? '';
  return `<ellipse class="p-shadow" cx="64" cy="93" rx="40" ry="4"/>
<g transform="translate(64 92) scale(${scale}) translate(-64 -92)">
<path class="p-skin p-line w25" d="M101 76 Q113 77 115 70 Q107 71.5 101 69.5 Z"/>
<rect class="p-skin2 p-line w25" x="89" y="72" width="13" height="16" rx="6"/>
<rect class="p-skin2 p-line w25" x="29" y="72" width="13" height="16" rx="6"/>
<ellipse class="p-skin p-line w25" cx="33" cy="66" rx="10" ry="9"/>
<path class="p-shell p-line" d="M26 76 C26 30 106 26 106 76 Z"/>
<polygon class="${hex} p-line w2" points="58,50 74,50 81,61 74,72 58,72 51,61"/>
<path class="p-stroke" d="M58 50 L54 43M74 50 L78 43M51 61 L30 62M81 61 L102 61M58 72 L55 75M74 72 L77 75"/>
${spots}
<path class="p-rim p-line w25" d="M22 74 H110 Q114 74 114 78 Q114 82 110 82 H22 Q18 82 18 78 Q18 74 22 74 Z"/>
<rect class="p-skin p-line w25" x="36" y="76" width="14" height="14" rx="6"/>
<rect class="p-skin p-line w25" x="82" y="76" width="14" height="14" rx="6"/>
${wear === 'scarf' ? WEAR.scarf : ''}
<g class="p-head" transform="${droop}"><g transform="${head}">
<circle class="p-skin p-line" cx="22" cy="54" r="16"/>
<ellipse class="p-cheek" cx="11" cy="60" rx="3.2" ry="2"/><ellipse class="p-cheek" cx="33" cy="60" rx="3.2" ry="2"/>
<g class="p-face">${FACES[mood] ?? FACES.normal}</g>
${shellCap}${front}
</g></g>
</g>`;
}

export function turtleSvg({ stage = 2, mood = 'normal', wear = '', progress = 0, size = 96 } = {}) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 120 100');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(Math.round((size * 100) / 120)));
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('turtle', `mood-${mood}`, `stage-${stage}`);
  svg.innerHTML = turtleMarkup({ stage, mood, wear, progress }); // 只有上面写死的图形, 没有用户的字
  return svg;
}

// ---- 温温现在的情况 ----

function examDaysOf(store, now) {
  const today0 = startOfDay(now);
  let best = null;
  for (const x of [...store.data.sets, ...store.data.folders]) {
    if (!x.plan?.on || !x.plan.exam) continue;
    const d = Math.round((examTime(x.plan.exam) - today0) / DAY);
    if (d >= 0 && (best === null || d < best)) best = d;
  }
  return best;
}

// 难记卡几张 (只数)
function countLeeches(sets) {
  let n = 0;
  for (const set of sets) for (const card of set.cards) if (set.stats[card.id]?.lapses >= LEECH) n++;
  return n;
}

export function situation(store, now = Date.now()) {
  const data = store.data;
  const sets = store.allSets().filter((s) => s.kind !== 'quiz');
  const q = todayAll(store);
  const s = streak(data.activity, now);
  const xp = xpOf(data.pet, data.activity);
  const g = growth(xp);
  const hour = new Date(now).getHours();
  const today = data.activity[dayKey(now)] ?? 0;
  const due = q.reviews.length + q.fresh.length;
  const c = {
    now,
    hour,
    sets: data.sets.length,
    today,
    due,
    reviews: q.reviews.length,
    fresh: q.fresh.length,
    held: q.held,
    reviewed: reviewedToday(sets, now),
    streak: s,
    // 这次连续打卡从哪天开始 (今天还没学就从昨天往前数)
    streakFrom: s ? dayKey(daysLater(now, (today ? 0 : -1) - (s - 1))) : '',
    idleDays: idleDays(data.activity, now) ?? 0,
    mistakes: dueMistakes(data.mistakes, now).length,
    leeches: countLeeches(sets),
    examDays: examDaysOf(store, now),
    tomorrow: dueTomorrow(sets, now) + q.held,
    xp,
    stage: g.stage,
    progress: g.progress,
  };
  c.mood = moodOf(c);
  return c;
}

// ---- 右下角 ----

export function setupPet({ store }) {
  let prefs = loadPrefs();
  let page = null;
  let c = null; // 最近算的 situation
  let base = null; // 这次打开网页以后第一次算的 (比一比吃了几口、多了几张难记卡)
  const events = []; // 等着说的事
  let talkN = 0;
  let lastQuote = null;
  let hideTimer = null;
  let quoteTimer = null;
  let changeTimer = null;
  let typing = false;

  const root = h('div', { class: 'pet', hidden: true });
  const bubble = h('div', { class: 'pet-bubble', role: 'status', 'aria-live': 'polite', hidden: true });
  const sign = h('div', { class: 'pet-sign', 'aria-hidden': 'true', hidden: true, onclick: () => tap() });
  const fx = h('div', { class: 'pet-fx', 'aria-hidden': 'true' });
  const body = h('button', { class: 'pet-body', type: 'button', onclick: () => tap() });
  const dot = h('span', { class: 'pet-dot', 'aria-hidden': 'true', hidden: true });
  root.append(bubble, sign, fx, body, dot);
  document.body.append(root);

  const shown = () => !root.hidden;
  const petData = () => store.data.pet ?? cleanPet({});

  function visibleNow() {
    return !prefs.hidden && SHOW_ON.has(page) && !typing && !document.body.classList.contains('in-game');
  }

  function setPrefs(patch) {
    prefs = { ...loadPrefs(), ...patch };
    savePrefs(prefs);
    update();
  }

  // 画: 样子、心情、牌子、小圆点
  function draw() {
    if (!c) return;
    const pet = petData();
    root.classList.toggle('mini', Boolean(prefs.mini));
    root.dataset.mood = c.mood;
    const mini = Boolean(prefs.mini);
    fill(body, turtleSvg({ stage: c.stage, mood: c.mood, wear: pet.wear, progress: c.progress, size: mini ? 44 : 100 }));
    body.setAttribute('aria-label', `小乌龟${pet.name} (${MOOD_TEXT[c.mood]}): 点一下听它说话`);
    body.title = `${pet.name}: ${MOOD_TEXT[c.mood]}`;
    // 还有好多没背: 举个牌子
    const showSign = c.mood === 'worried' && !mini && bubble.hidden;
    sign.hidden = !showSign;
    if (showSign) sign.textContent = `还有 ${c.due} 张`;
    dot.hidden = !(mini && events.length);
  }

  // 该不该出来 (马上); 出来了就算一算, 看有没有事要说 (卡片多了要算一会儿: 等页面画好了再算)
  let computeTimer = null;
  function update() {
    const show = visibleNow();
    root.hidden = !show || !c;
    document.body.classList.toggle('has-pet', show && !prefs.mini);
    clearTimeout(computeTimer);
    if (!show) {
      hideBubble(false);
      clearTimeout(quoteTimer);
      quoteTimer = null;
      return;
    }
    computeTimer = setTimeout(compute, 30);
  }

  function compute() {
    if (!visibleNow()) return;
    try {
      c = situation(store);
    } catch {
      return; // 算不出来 (数据坏了) 就不出来捣乱
    }
    if (!store.loadError) checkEvents();
    root.hidden = false;
    draw();
    if (!quoteTimer) scheduleQuote();
    // 有事先说事; 没有事, 今天第一次见面打个招呼
    if (bubble.hidden && !prefs.quiet && !prefs.mini) {
      const hello = prefs.greeted !== dayKey();
      if (hello) {
        prefs = { ...prefs, greeted: dayKey() };
        savePrefs(prefs);
      }
      if (events.length) setTimeout(() => shown() && bubble.hidden && sayEvent(), 700);
      else if (hello) setTimeout(() => shown() && bubble.hidden && greet(), 1200);
    }
  }

  // 长大、解锁、连续打卡、背完了、难记卡: 有新的放进 events, 记到数据里 (同步到别的设备, 不会再说一遍)
  function checkEvents() {
    const first = store.data.pet === null;
    const pet = petData();
    const patch = {};
    const found = [];
    const unlocks = newUnlocks(pet, { streak: c.streak, xp: c.xp, cleared: c.reviewed > 0 && c.due === 0 });
    if (first) {
      // 第一次见面: 以前学过的直接算上, 以前的烟花不补放
      patch.stageSeen = c.stage;
      patch.unlocked = unlocks.map((o) => o.key);
      if (c.streak) patch.cheer = cheered(c.streakFrom, c.streak);
      events.unshift({ kind: 'hello', xp: c.xp, stage: c.stage, outfits: unlocks.length });
    } else {
      if (c.stage > pet.stageSeen) {
        patch.stageSeen = c.stage;
        found.push({ kind: 'stage', stage: c.stage });
      }
      const m = c.streak ? milestoneDue(pet.cheer, c.streakFrom, c.streak) : 0;
      if (m) {
        patch.cheer = cheered(c.streakFrom, c.streak);
        found.push({ kind: 'milestone', days: m });
      }
      if (unlocks.length) {
        patch.unlocked = [...pet.unlocked, ...unlocks.map((o) => o.key)];
        found.push(...unlocks.map((outfit) => ({ kind: 'unlock', outfit })));
      }
    }
    if (Object.keys(patch).length) store.updatePet({ ...pet, ...patch });
    // 这台设备上一天说一次「背完了」
    if (c.reviewed > 0 && c.due === 0 && prefs.cleared !== dayKey()) {
      prefs = { ...prefs, cleared: dayKey() };
      savePrefs(prefs);
      if (!first) found.push({ kind: 'cleared', tomorrow: c.tomorrow });
    }
    if (base) {
      if (c.leeches > base.leeches) found.push({ kind: 'leech', n: c.leeches - base.leeches });
      const ate = c.xp - base.xp;
      if (ate > 0) feed(ate);
    }
    base = { xp: c.xp, leeches: c.leeches };
    // 重要的先说: 烟花 > 长大 > 解锁 > 背完了 > 难记卡
    const order = ['hello', 'milestone', 'stage', 'unlock', 'cleared', 'leech'];
    events.push(...found);
    events.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
  }

  // 吃东西: 冒个 +几, 嚼一嚼
  function feed(n) {
    if (prefs.mini) return;
    const plus = h('span', { class: 'pet-plus' }, `+${n}`);
    fx.append(plus);
    setTimeout(() => plus.remove(), 1600);
    root.classList.remove('eat');
    void root.offsetWidth; // 重新播放动画
    root.classList.add('eat');
    setTimeout(() => root.classList.remove('eat'), 1000);
  }

  function fireworks() {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const colors = ['#e0574b', '#f2c94c', '#5cbf85', '#7aa7f5', '#ff7aa2'];
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      const r = 50 + (i % 3) * 18;
      const spark = h('span', { class: 'pet-spark' });
      spark.style.setProperty('--dx', `${Math.cos(a) * r}px`);
      spark.style.setProperty('--dy', `${Math.sin(a) * r - 30}px`);
      spark.style.background = colors[i % colors.length];
      spark.style.animationDelay = `${(i % 3) * 120}ms`;
      fx.append(spark);
      setTimeout(() => spark.remove(), 1800);
    }
  }

  // ---- 说话 ----

  // line: { text, src?, plain?, action?: { label, href } | { label, panel: true } }; auto: 自己说的 (过一会儿自己收起来)
  function say(line, { auto = false } = {}) {
    if (!line) return;
    clearTimeout(hideTimer);
    const pet = petData();
    const actions = [];
    if (line.action?.href) actions.push(h('a', { class: 'btn small primary', href: line.action.href, onclick: () => hideBubble(false) }, line.action.label));
    else if (line.action?.panel) actions.push(h('button', { class: 'btn small primary', type: 'button', onclick: () => openPanel() }, line.action.label));
    actions.push(h('button', { class: 'btn small', type: 'button', onclick: () => tap() }, '再说一句'));
    if (!line.action?.panel) actions.push(h('button', { class: 'btn small ghost', type: 'button', onclick: () => openPanel() }, '小窝'));
    fill(
      bubble,
      h('button', { class: 'pet-x', type: 'button', 'aria-label': '收起来', onclick: () => hideBubble() }, '✕'),
      h('p', { class: 'pet-name' }, pet.name),
      h('p', { class: `pet-say${line.src ? ' quote' : ''}` }, line.text),
      line.src ? h('p', { class: 'pet-src' }, `—— ${line.src}`) : null,
      line.plain ? h('p', { class: 'pet-plain' }, `意思是: ${line.plain}`) : null,
      h('div', { class: 'pet-actions' }, actions),
    );
    bubble.hidden = false;
    sign.hidden = true;
    if (line.fireworks) fireworks();
    root.classList.add('talking');
    hideTimer = setTimeout(function later() {
      // 鼠标在上面、正在点里面的按钮: 等一会儿再收
      if (bubble.matches(':hover') || bubble.contains(document.activeElement)) hideTimer = setTimeout(later, 3000);
      else hideBubble();
    }, auto ? 12000 : 30000);
  }

  // next: 收起来以后接着说等着的事
  function hideBubble(next = true) {
    clearTimeout(hideTimer);
    if (bubble.hidden) return;
    if (bubble.contains(document.activeElement)) body.focus({ preventScroll: true });
    bubble.hidden = true;
    root.classList.remove('talking');
    draw();
    if (next && events.length && !prefs.quiet) setTimeout(() => shown() && bubble.hidden && sayEvent(), 1500);
  }

  function sayEvent() {
    const e = events.shift();
    if (!e) return false;
    draw();
    if (e.kind === 'hello') {
      const pet = petData();
      const grown = e.stage > 0 ? `你已经学了 ${e.xp} 次, 我一下就长成「${STAGES[e.stage].name}」了!${e.outfits ? ` 还送你 ${e.outfits} 件装扮。` : ''}` : '我现在还是个蛋。你每学一题就是喂我一口, 喂够了我就孵出来。';
      say({ text: `你好! 我是小乌龟${pet.name}, 以后住在这个角落陪你学习。${grown} 点我, 我会告诉你今天该做什么。`, action: { label: '去小窝看看', panel: true } });
      return true;
    }
    say(eventLine(e), { auto: true });
    return true;
  }

  function greet() {
    const first = tips(c)[0];
    say({ ...first, text: `${greeting(c.hour)}! ${first.text}` }, { auto: true });
  }

  function quote() {
    const q = randomQuote(lastQuote);
    lastQuote = q;
    const who = q.who ?? '孔子';
    return { text: `${who}说: 「${q.text}」`, src: quoteSource(q), plain: q.plain };
  }

  // 点它: 先说事; 没事就有用的话和《论语》轮着来
  function tap() {
    if (prefs.mini) {
      setPrefs({ mini: false });
      if (!shown()) return;
    }
    if (events.length && sayEvent()) return;
    c = situation(store);
    draw();
    const list = tips(c);
    const n = talkN++;
    say(n % 2 === 0 && list.length ? list[(n / 2) % list.length] : quote());
  }

  function scheduleQuote() {
    clearTimeout(quoteTimer);
    const [lo, hi] = QUOTE_EVERY;
    quoteTimer = setTimeout(() => {
      quoteTimer = null;
      const busy = dialogOpen() || document.visibilityState !== 'visible' || !bubble.hidden;
      if (shown() && !busy && !prefs.quiet && !prefs.mini) say(quote(), { auto: true });
      if (shown()) scheduleQuote();
    }, lo + Math.random() * (hi - lo));
  }

  // 打字的时候 (手机上键盘弹出来) 不出来
  document.addEventListener('focusin', (e) => {
    const t = e.target;
    const now = Boolean(t?.matches?.('input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=file]), textarea, select, [contenteditable="true"]')) && !t.closest('dialog');
    if (now !== typing) {
      typing = now;
      update();
    }
  });
  document.addEventListener('focusout', () =>
    setTimeout(() => {
      if (!typing) return;
      const t = document.activeElement;
      if (t?.matches?.('input, textarea, select, [contenteditable="true"]')) return;
      typing = false;
      update();
    }, 0),
  );
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !bubble.hidden && root.contains(document.activeElement)) hideBubble();
  });
  // 过了一阵 (晚上困了、第二天了) 换个心情
  setInterval(() => shown() && bubble.hidden && update(), 5 * 60e3);

  // ---- 温温的小窝 ----

  function panelBody(refresh) {
    const pet = petData();
    const now = situation(store);
    const g = growth(now.xp);
    const next = g.to === null ? null : STAGES[g.stage + 1];
    const reason = {
      sleepy: '很晚了, 它困了。早点睡, 睡着的时候白天背的会记得更牢。',
      sad: `已经 ${now.idleDays} 天没来了, 它想你了。背几张, 它就高兴了。`,
      worried: `还有 ${now.due} 张没背, 它有点着急。`,
      hungry: '今天还没学, 它饿了。背几张就喂饱了。',
      happy: now.due ? '今天学了不少, 它很开心。' : '今天的背完了, 它吃饱了, 很开心。',
      normal: now.due ? `今天还有 ${now.due} 张, 背完它就吃饱了。` : '今天没有要背的。',
    }[now.mood];
    const outfit = (key, name, need, unlocked) =>
      h(
        'button',
        {
          type: 'button',
          class: `outfit${pet.wear === key ? ' on' : ''}${unlocked ? '' : ' locked'}`,
          'aria-pressed': String(pet.wear === key),
          disabled: !unlocked,
          title: unlocked ? name : `${name}: ${need}解锁`,
          onclick: () => {
            store.updatePet({ wear: key }, { stamp: true });
            refresh();
            draw();
          },
        },
        turtleSvg({ stage: Math.max(2, g.stage), mood: 'happy', wear: key, size: 64 }),
        h('span', { class: 'outfit-name' }, name),
        unlocked ? null : h('span', { class: 'outfit-need' }, need),
      );
    return [
      h('div', { class: 'pet-home' }, h('div', { class: 'pet-preview' }, turtleSvg({ stage: g.stage, mood: now.mood, wear: pet.wear, progress: g.progress, size: 150 }))),
      h(
        'div',
        { class: 'pet-title' },
        h('strong', {}, pet.name),
        h('span', { class: 'muted' }, ` · ${STAGES[g.stage].name}`),
        h(
          'button',
          {
            class: 'btn small ghost',
            type: 'button',
            onclick: () =>
              askText({
                title: '给小乌龟起个名字',
                label: '名字 (12 个字以内)',
                value: pet.name,
                okText: '好了',
                onOk: (name) => {
                  store.updatePet({ name }, { stamp: true });
                  refresh();
                  draw();
                },
              }),
          },
          '改名字',
        ),
      ),
      h('p', {}, `现在: ${MOOD_TEXT[now.mood]}。${reason}`),
      h(
        'div',
        { class: 'pet-grow' },
        h('div', { class: 'pet-bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(Math.round(g.progress * 100)) }, h('span', { style: `width: ${Math.round(g.progress * 100)}%` })),
        h('p', { class: 'small' }, `一共吃了 ${now.xp} 口。`, next ? `再吃 ${g.to - now.xp} 口长成「${next.name}」。` : '已经长到最大了!'),
        h(
          'ol',
          { class: 'pet-stages' },
          STAGES.map((s, i) => h('li', { class: i < g.stage ? 'done' : i === g.stage ? 'on' : '' }, s.name)),
        ),
      ),
      h('p', { class: 'muted small' }, '怎么喂: 答一题、重做一道错题、玩一局游戏, 都是喂它一口; 今天的复习背完, 它就吃饱了。几天不学它会饿、会想你, 但不会生病, 也不会离开。连续打卡到 3、7、14、30、50、100…… 天放烟花。'),
      now.streak ? h('p', { class: 'small' }, `已经连续打卡 ${now.streak} 天。`) : null,
      h('h3', {}, '装扮'),
      h('p', { class: 'muted small' }, '学到了就解锁, 不用买。点一下戴上。'),
      h(
        'div',
        { class: 'outfits' },
        outfit('', '不戴', '', true),
        OUTFITS.map((o) => outfit(o.key, o.name, o.need, pet.unlocked.includes(o.key))),
      ),
      h('h3', {}, '这台设备上'),
      switchRow({ label: `显示${pet.name}`, desc: '待在首页、卡片集页这些地方的右下角。背卡、测试、游戏、编辑的时候不出来', checked: !prefs.hidden, onchange: (on) => setPrefs({ hidden: !on }) }),
      switchRow({ label: '自己说话', desc: '每天打个招呼, 时不时念一句《论语》, 长大了、背完了说一声。关了就只在点它的时候说', checked: !prefs.quiet, onchange: (on) => setPrefs({ quiet: !on }) }),
      switchRow({ label: '缩成小圆点', desc: '不占地方, 点一下再出来', checked: Boolean(prefs.mini), onchange: (on) => setPrefs({ mini: on }) }),
    ];
  }

  function openPanel() {
    hideBubble(false);
    const box = h('div', { class: 'pet-panel' });
    const refresh = () => fill(box, panelBody(refresh));
    refresh();
    openDialog({ title: `${petData().name}的小窝`, body: box });
  }

  return {
    // 换页了
    route(p) {
      page = p;
      if (!SHOW_ON.has(p)) talkN = 0;
      update();
    },
    // 数据变了 (答了题、同步来了): 等一会儿再算 (答题一秒好几次)
    changed() {
      clearTimeout(changeTimer);
      changeTimer = setTimeout(() => shown() && update(), 1200);
    },
    openPanel,
    name: () => petData().name,
    summary: () => {
      const xp = xpOf(store.data.pet, store.data.activity);
      return STAGES[stageOf(xp)].name;
    },
  };
}
