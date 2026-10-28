// 右下角的小乌龟温温 (想法、要说的话在 ../pet.js):
//   点它: 说一句有用的 (今天还要背几张、错题该重做了、计划跟不上了、哪张卡片老是忘……, 带按钮直接去),
//         跟《论语》、学习小窍门轮着来; 说过的不重复, 数变了才再说。下面一排: 还有呢、学得怎么样、论语、小窝
//   自己说话: 每天第一次见面打个招呼 (隔一个星期说说这 7 天学得怎么样); 过一阵念一句《论语》(挑合适现在的);
//            长大了、解锁了装扮、连续打卡到了天数 (放烟花)、今天的背完了、有新的难记卡的时候说一声
//   只在首页、卡片集页这些地方; 背卡、测试、游戏、编辑、打字的时候不出来 (不挡按钮、不打扰)
//   「温温的小窝」: 长到哪了、心情、装扮、起名字, 这台设备上显示不显示、自己说不说话、缩成小圆点

import { h, fill, openDialog, askText, switchRow, dialogOpen } from '../dom.js';
import { todayAll } from './plan.js';
import { editCardDialog } from './cardedit.js';
import { openExamList } from './examlist.js';
import { reviewedToday, plannedSets, newToday, isNew, nearestExam } from '../plan.js';
import { dueMistakes, kindStats, OTHER_KIND } from '../mistakes.js';
import { streak, dueTomorrow, dayKey, startOfDay, daysLater, DAY, LEECH, isSuspended } from '../srs.js';
import { historyOf, AGAIN } from '../revlog.js';
import { stripMarks } from '../rich.js';
import { MATURE, timeOfDay, bestTime } from '../stats.js';
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
  report,
  QUOTES,
  STUDY_TIPS,
  quoteTags,
  pickNext,
  quoteSource,
  milestoneDue,
  cheered,
  cleanPet,
} from '../pet.js';

const PREFS_KEY = 'wengu:pet';
// 出来的页面
const SHOW_ON = new Set(['home', 'set', 'folder', 'stats', 'mistakes', 'search', 'games', 'sync', 'settings', 'arcade']);
const QUOTE_EVERY = [6 * 60e3, 12 * 60e3]; // 自己念《论语》: 隔 6–12 分钟一次

// 这台设备上的: hidden 不显示, quiet 不自己说话 (没设过算不说: 默认只在点它的时候说话), mini 缩成小圆点, greeted 哪天打过招呼, cleared 哪天说过「背完了」,
//   reported 哪天说过「这 7 天学得怎么样」, heardQ / heardT 这一轮念过的《论语》、小窍门 (都说一遍才从头来)
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


// 难记卡几张 (只数)
function countLeeches(sets) {
  let n = 0;
  for (const set of sets) for (const card of set.cards) if (set.stats[card.id]?.lapses >= LEECH) n++;
  return n;
}

export function situation(store, now = Date.now()) {
  const data = store.data;
  const sets = store.allSets();
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
    examDays: nearestExam([...data.sets, ...data.folders], now)?.days ?? null,
    tomorrow: dueTomorrow(store.dailySets(), now) + q.held,
    xp,
    stage: g.stage,
    progress: g.progress,
  };
  c.mood = moodOf(c);
  return c;
}

// 一天里什么时候记得最牢: 要翻最近半年的复习记录, 一天算一次就够了 (习惯不会一会儿就变)
let timeCache = null;
function timeInfo(store, sets, now) {
  const day = dayKey(now);
  if (timeCache?.day !== day || timeCache.store !== store) timeCache = { day, store, value: bestTime(timeOfDay(sets, store.data.revlog, now)) };
  return timeCache.value;
}

const dayTime = (key) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).getTime();
};
const shortText = (text, n = 18) => {
  const t = stripMarks(String(text ?? '')).replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
};

// 细算的 (要翻复习记录, 卡片多了要几十毫秒): 点它、打招呼、看「学得怎么样」的时候才算
//   perCard 平时答一题要多久 (毫秒), retention 最近 7 天复习时记住的, pace 计划跟不上了的, rest 考前只复习了还有新词的,
//   leech 忘得最多的那张, neglect 很久没碰、还有好多新词的卡片集, week 这 7 天 (「学得怎么样」用)
export function insight(store, now = Date.now()) {
  const data = store.data;
  const sets = store.allSets();
  const today0 = startOfDay(now);
  const from7 = daysLater(now, -6); // 今天和前 6 天
  const from14 = daysLater(now, -13);
  const hrefOf = (x) => (x.virtual ? `#/folder/${encodeURIComponent(x.folderId)}` : `#/set/${encodeURIComponent(x.id)}`);
  const times = [];
  let n = 0;
  let ok = 0;
  let fresh7 = 0;
  let studied = 0;
  let mature = 0;
  let worst = null;
  for (const set of sets) {
    for (const card of set.cards) {
      const stat = set.stats[card.id];
      if (!stat) continue;
      if (stat.first >= from7) fresh7++;
      const paused = isSuspended(stat);
      if (stat.due > 0 && !paused) {
        studied++;
        if (stat.interval >= MATURE) mature++;
      }
      if (stat.lapses >= LEECH && !paused && (!worst || stat.lapses > worst.lapses)) worst = { set, card, lapses: stat.lapses };
      // 两个星期没答过的, 记录里也没有最近的
      if (!(stat.at >= from14)) continue;
      const list = historyOf(data.revlog, card.id);
      for (let i = 0; i < list.length; i++) {
        const { at, rating } = list[i];
        if (at < from14 || at > now) continue;
        times.push(at);
        // 记住了几成: 复习的 (不算第一次, 同一天又看的也不算)
        if (i && at >= from7 && startOfDay(at) !== startOfDay(list[i - 1].at)) {
          n++;
          if (rating !== AGAIN) ok++;
        }
      }
    }
  }
  // 平时答一题多久: 两次之间隔了多久 (隔太久是走开了, 算一会儿)
  times.sort((a, b) => a - b);
  let ms = 0;
  for (let i = 1; i < times.length; i++) {
    const gap = times[i] - times[i - 1];
    ms += gap > 5 * 60e3 ? 8000 : Math.min(gap, 60e3);
  }
  const perCard = times.length >= 50 ? (ms + 8000) / times.length : null;

  // 按考试日期的计划: 最近 7 天少学了好多; 到了考前只复习, 还有新词没学
  let pace = null;
  let rest = null;
  const week0 = daysLater(now, -7);
  for (const x of [...plannedSets(sets), ...store.plannedFolders()]) {
    const info = newToday(x, now);
    if (!info.on) continue;
    const title = x.title || '未命名';
    if (info.mode === 'rest' && info.left > 0 && (!rest || info.left > rest.left)) rest = { href: hrefOf(x), title, left: info.left };
    if (info.mode !== 'exam' || !(x.plan.at > 0 && x.plan.at < now - 8 * DAY)) continue; // 刚定的计划先不说
    const need7 = info.perDay * 7;
    let learned7 = 0;
    const stats = x.stats; // 文件夹合起来的每次读都要现算, 只读一次
    for (const card of x.cards) {
      const first = stats[card.id]?.first;
      if (first >= week0 && first < today0) learned7++;
    }
    if (need7 >= 7 && learned7 < need7 * 0.6 && (!pace || need7 - learned7 > pace.need7 - pace.learned7)) pace = { href: hrefOf(x), title, learned7, need7, perDay: info.perDay };
  }

  // 很久没碰、还有好多新词、也没定计划的卡片集
  let neglect = null;
  const inPlan = new Set(data.folders.filter((f) => f.plan?.on).flatMap((f) => f.setIds));
  for (const set of sets) {
    if (set.plan?.on || inPlan.has(set.id)) continue;
    let fresh = 0;
    let last = 0;
    for (const card of set.cards) {
      const stat = set.stats[card.id];
      if (isNew(stat) && !isSuspended(stat)) fresh++;
      if (stat?.at > last) last = stat.at;
    }
    if (fresh < 20 || (last ? last > now - 14 * DAY : set.createdAt > now - 7 * DAY)) continue;
    if (!neglect || fresh > neglect.fresh) neglect = { href: hrefOf(set), title: set.title || '未命名', fresh, days: last ? Math.round((today0 - startOfDay(last)) / DAY) : 0 };
  }

  // 这 7 天、上一个 7 天
  let answers7 = 0;
  let answersPrev = 0;
  let days7 = 0;
  for (let i = 0; i < 14; i++) {
    const v = data.activity[dayKey(daysLater(now, -i))] ?? 0;
    if (i < 7) {
      answers7 += v;
      if (v) days7++;
    } else answersPrev += v;
  }
  const mastered = data.mistakes.filter((m) => m.review?.mastered).length;
  // 错得最多的题型 (错题有 5 道以上, 这类占三成以上才说)
  const kinds = kindStats(data.mistakes);
  const top = kinds[0];
  const topKind = data.mistakes.length >= 5 && top && top.kind !== OTHER_KIND && top.total >= 3 && top.total / data.mistakes.length >= 0.3 ? { ...top, share: top.total / data.mistakes.length } : null;
  return {
    at: now,
    perCard,
    retention: { n, ok, target: data.settings.retention },
    pace,
    rest,
    neglect,
    topKind,
    bestTime: timeInfo(store, sets, now),
    leech: worst ? { term: shortText(worst.card.term) || shortText(worst.card.def) || '这张卡片', lapses: worst.lapses, setId: worst.set.id, cardId: worst.card.id } : null,
    week: { days7, answers7, answersPrev, fresh7, studied, mature, mastered, mistakesLeft: data.mistakes.length - mastered, topKind },
  };
}

// ---- 右下角 ----

export function setupPet({ store }) {
  let prefs = loadPrefs();
  const quiet = () => prefs.quiet !== false;
  let page = null;
  let c = null; // 最近算的 situation
  let base = null; // 这次打开网页以后第一次算的 (比一比吃了几口、多了几张难记卡)
  const events = []; // 等着说的事
  let talkN = 0;
  let lastKind = 'quote'; // 上次说的是《论语》还是小窍门 (轮着来)
  const said = new Map(); // 这一阵说过的有用的话: id → 说的字 (数变了可以再说)
  let lastTap = 0;
  let deep = null; // insight 算过的 (数据变了、过了 10 分钟重算)
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

  function savePref(patch) {
    prefs = { ...prefs, ...patch };
    savePrefs(prefs);
  }

  // 细算过的也放进来 (给 tips 用)
  function full() {
    if (!deep || Date.now() - deep.at > 10 * 60e3) deep = insight(store);
    const minutes = deep.perCard && c.due ? Math.max(1, Math.round(((c.reviews + c.fresh * 3) * deep.perCard) / 60000)) : null;
    return { ...c, minutes, pace: deep.pace, rest: deep.rest, retention: deep.retention, leech: deep.leech, neglect: deep.neglect, topKind: deep.topKind, bestTime: deep.bestTime };
  }

  function myReport() {
    full();
    return report({ ...deep.week, retention: deep.retention, bestTime: deep.bestTime, streak: c.streak, examDays: c.examDays });
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
    if (bubble.hidden && !quiet() && !prefs.mini) {
      const hello = prefs.greeted !== dayKey();
      if (hello) savePref({ greeted: dayKey() });
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
      savePref({ cleared: dayKey() });
      if (!first) found.push({ kind: 'cleared', tomorrow: c.tomorrow });
    }
    // 考试前一天、考试那天: 提醒看考前清单 (这台设备上一天一次)
    if (c.examDays !== null && c.examDays <= 1 && prefs.examList !== dayKey()) {
      savePref({ examList: dayKey() });
      found.push({ kind: 'examlist', days: c.examDays });
    }
    if (base) {
      if (c.leeches > base.leeches) found.push({ kind: 'leech', n: c.leeches - base.leeches });
      const ate = c.xp - base.xp;
      if (ate > 0) feed(ate);
    }
    base = { xp: c.xp, leeches: c.leeches };
    // 重要的先说: 烟花 > 长大 > 解锁 > 背完了 > 难记卡
    const order = ['hello', 'examlist', 'milestone', 'stage', 'unlock', 'cleared', 'leech'];
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

  // line: { text, src?, plain?, list?: [字], action?: { label, href } | { label, panel: true } | { label, edit: { setId, cardId } } }
  // auto: 自己说的 (过一会儿自己收起来)
  function say(line, { auto = false } = {}) {
    if (!line) return;
    clearTimeout(hideTimer);
    const pet = petData();
    const a = line.action;
    const action = !a
      ? null
      : a.href
        ? h('a', { class: 'btn small primary', href: a.href, onclick: () => hideBubble(false) }, a.label)
        : h('button', { class: 'btn small primary', type: 'button', onclick: () => (a.edit ? editCard(a.edit) : a.list ? (hideBubble(false), openExamList(store)) : openPanel()) }, a.label);
    const chip = (label, onclick) => h('button', { class: 'pet-chip', type: 'button', onclick }, label);
    fill(
      bubble,
      h('button', { class: 'pet-x', type: 'button', 'aria-label': '收起来', onclick: () => hideBubble() }, '✕'),
      h('p', { class: 'pet-name' }, pet.name),
      h('p', { class: `pet-say${line.src ? ' quote' : ''}` }, line.text),
      line.src ? h('p', { class: 'pet-src' }, `—— ${line.src}`) : null,
      line.plain ? h('p', { class: 'pet-plain' }, `意思是: ${line.plain}`) : null,
      line.list?.length ? h('ul', { class: 'pet-list' }, line.list.map((x) => h('li', {}, x))) : null,
      action ? h('div', { class: 'pet-actions' }, action) : null,
      h('div', { class: 'pet-chips' }, chip('还有呢', more), chip('学得怎么样', sayReport), chip('论语', () => say(quote())), a?.panel ? null : chip('小窝', openPanel)),
    );
    bubble.hidden = false;
    sign.hidden = true;
    if (line.fireworks) fireworks();
    root.classList.add('talking');
    hideTimer = setTimeout(function later() {
      // 鼠标在上面、正在点里面的按钮: 等一会儿再收
      if (bubble.matches(':hover') || bubble.contains(document.activeElement)) hideTimer = setTimeout(later, 3000);
      else hideBubble();
    }, auto ? (line.list ? 20000 : 12000) : 30000);
  }

  // 改那张老是忘的卡片
  function editCard({ setId, cardId }) {
    const card = store.getSet(setId)?.cards.find((x) => x.id === cardId);
    if (!card) return;
    hideBubble(false);
    editCardDialog({ store, setId, card, onSaved: () => (deep = null) });
  }

  // next: 收起来以后接着说等着的事
  function hideBubble(next = true) {
    clearTimeout(hideTimer);
    if (bubble.hidden) return;
    if (bubble.contains(document.activeElement)) body.focus({ preventScroll: true });
    bubble.hidden = true;
    root.classList.remove('talking');
    draw();
    if (next && events.length && !quiet()) setTimeout(() => shown() && bubble.hidden && sayEvent(), 1500);
  }

  function sayEvent() {
    const e = events.shift();
    if (!e) return false;
    draw();
    if (e.kind === 'hello') {
      const pet = petData();
      const grown = e.stage > 0 ? `你已学习 ${e.xp} 次，我已成长为「${STAGES[e.stage].name}」。${e.outfits ? `解锁了 ${e.outfits} 件装扮。` : ''}` : '每完成一题，我就会成长一点。';
      say({ text: `你好，我是小乌龟${pet.name}。${grown}点击我可查看今日建议。`, action: { label: '查看', panel: true } });
      return true;
    }
    say(eventLine(e), { auto: true });
    return true;
  }

  function greet() {
    const today = dayKey();
    // 隔了一个星期: 说说这 7 天学得怎么样 (第一次只记下日子; 最近两个星期学了 3 天以上才说)
    const last = /^\d{4}-\d{2}-\d{2}$/.test(prefs.reported ?? '') ? prefs.reported : null;
    if (!last) savePref({ reported: today });
    else if (Math.round((dayTime(today) - dayTime(last)) / DAY) >= 7) {
      const from = dayKey(daysLater(Date.now(), -13));
      const studied = Object.entries(store.data.activity).filter(([d, v]) => v > 0 && d >= from).length;
      if (studied >= 3) {
        savePref({ reported: today });
        const r = myReport();
        say({ ...r, text: `${greeting(c.hour)}! 又过了一个星期, 说说这 7 天: ${r.text}` }, { auto: true });
        return;
      }
    }
    const first = tips(full())[0];
    said.set(first.id, first.text);
    say({ ...first, text: `${greeting(c.hour)}! ${first.text}` }, { auto: true });
  }

  // 《论语》: 100 句都念一遍才从头来, 一半的时候挑合适现在的 (有错题说改错的, 好几天没来说坚持的……)
  function quote() {
    const { index, heard } = pickNext(QUOTES, prefs.heardQ, { tags: c ? quoteTags(c) : [] });
    savePref({ heardQ: heard });
    const x = QUOTES[index];
    return { text: `${x.who ?? '孔子'}说: 「${x.text}」`, src: quoteSource(x), plain: x.plain };
  }

  function studyTip() {
    const { index, heard } = pickNext(STUDY_TIPS, prefs.heardT);
    savePref({ heardT: heard });
    return STUDY_TIPS[index];
  }

  // 还没说过的有用的话 (说过的数变了也算)
  function freshTip() {
    return tips(full()).find((t) => said.get(t.id) !== t.text) ?? null;
  }

  function sayTip(t) {
    said.set(t.id, t.text);
    say(t);
  }

  function refresh() {
    c = situation(store);
    draw();
  }

  // 点它: 先说事; 没事就 有用的话、《论语》、有用的话、小窍门 轮着来 (有用的话说完了就《论语》和小窍门轮着)
  function tap() {
    if (prefs.mini) {
      setPrefs({ mini: false });
      if (!shown()) return;
    }
    if (events.length && sayEvent()) return;
    // 隔了一阵再点: 从最要紧的说起
    if (Date.now() - lastTap > 10 * 60e3) {
      said.clear();
      talkN = 0;
    }
    lastTap = Date.now();
    refresh();
    const slot = talkN++ % 4;
    if (slot % 2 === 0) {
      const t = freshTip();
      if (t) return sayTip(t);
    }
    const kind = slot === 1 ? 'quote' : slot === 3 ? 'study' : lastKind === 'quote' ? 'study' : 'quote';
    lastKind = kind;
    say(kind === 'quote' ? quote() : { text: `小窍门: ${studyTip()}` });
  }

  // 「还有呢」: 下一句有用的话; 都说完了送一个小窍门
  function more() {
    lastTap = Date.now();
    refresh();
    const t = freshTip();
    if (t) return sayTip(t);
    say({ text: `今天要紧的都说完啦。送你一个小窍门: ${studyTip()}` });
  }

  function sayReport() {
    lastTap = Date.now();
    refresh();
    const r = myReport();
    say({ text: r.text, list: r.list });
  }

  function scheduleQuote() {
    clearTimeout(quoteTimer);
    const [lo, hi] = QUOTE_EVERY;
    quoteTimer = setTimeout(() => {
      quoteTimer = null;
      const busy = dialogOpen() || document.visibilityState !== 'visible' || !bubble.hidden;
      if (shown() && !busy && !quiet() && !prefs.mini) say(quote(), { auto: true });
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
    const deepNow = insight(store);
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
      h('h3', {}, '这 7 天学得怎么样'),
      (() => {
        const r = report({ ...deepNow.week, retention: deepNow.retention, bestTime: deepNow.bestTime, streak: now.streak, examDays: now.examDays });
        return [h('p', {}, r.text), h('ul', { class: 'pet-list' }, r.list.map((x) => h('li', {}, x)))];
      })(),
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
      switchRow({ label: '主动提示', desc: '每日问候、《论语》摘句、成长提醒；关闭时仅在点击后显示', checked: !quiet(), onchange: (on) => setPrefs({ quiet: !on }) }),
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
      deep = null;
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
