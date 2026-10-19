// 入口: 按网址 # 后面的部分决定显示哪一页
//   #/                    首页 (所有卡片集)
//   #/new                 新建卡片集
//   #/new-quiz            新建题目集 (像 Kahoot 那样每道题自己写选项)
//   #/import              新建卡片集, 打开「导入」
//   #/search/<字>         搜索
//   #/games               游戏 (#/games/<游戏>: 先选上那个游戏), 再挑拿哪个卡片集玩
//   #/mistakes            错题集 (#/mistakes/new 记一道, #/mistakes/<id>/edit 改,
//                         #/mistakes/review 重做今天该做的, /review/all 还没掌握的全做, /review/<id> 只做一道)
//   #/share/<..>          打开别人分享的卡片集
//   #/quizlet             从 Quizlet 一键搬 (书签小工具)
//   #/sync                多设备同步 (#/sync/connect/<..>: 手机扫码连接)
//   #/review              今天的复习 (#/review/<卡片集或 folder:文件夹>: 只复习那里的)
//   #/stats               统计 (#/stats/<卡片集或 folder:文件夹>: 只看那里的)
//   #/folder/<id>         文件夹 (#/set/folder:<id>/... 是把文件夹里的卡片集合起来学)
//   #/set/<id>            一个卡片集
//   #/set/<id>/edit       编辑
//   #/set/<id>/cards      单词卡
//   #/set/<id>/learn      学习
//   #/set/<id>/test       测试
//   #/set/<id>/match      配对游戏
//   #/set/<id>/blast      打陨石游戏
//   #/set/<id>/blocks     方块游戏
//   #/set/<id>/gems       宝石游戏
//   #/set/<id>/wordle     Wordle
//   #/set/<id>/diagram    标注图练习
//   #/set/<id>/play       题目集: 限时答题 (卡片集页、编辑页碰到题目集就换成题目集的)

import { Store, KEY } from './store.js';
import { cleanMedia } from './media.js';
import { h, toast, icon } from './dom.js';
import { renderHome } from './views/home.js';
import { renderSet } from './views/set.js';
import { renderEdit } from './views/edit.js';
import { renderCards } from './views/cards.js';
import { renderLearn } from './views/learn.js';
import { renderExam } from './views/exam.js';
import { renderMatch } from './views/match.js';
import { renderBlast } from './views/blast.js';
import { renderBlocks } from './views/blocks.js';
import { renderGems } from './views/gems.js';
import { renderWordle } from './views/wordle.js';
import { renderDiagramPractice } from './views/diagram.js';
import { renderSearch } from './views/search.js';
import { renderFolder } from './views/folder.js';
import { renderReview } from './views/review.js';
import { renderStats } from './views/stats.js';
import { renderSync } from './views/sync.js';
import { renderShareImport } from './views/share.js';
import { renderQuizlet } from './views/quizlet.js';
import { renderGames } from './views/gamehub.js';
import { renderQuizEdit } from './views/quizedit.js';
import { renderQuizSet } from './views/quizset.js';
import { renderQuizPlay } from './views/quizplay.js';
import { renderMistakes } from './views/mistakes.js';
import { renderMistakeEdit } from './views/mistakeedit.js';
import { renderMistakeReview } from './views/mistakereview.js';
import { GAME_KEYS } from './games.js';
import { SyncManager, loadConfig, expiryInfo } from './sync.js';
import { installAudioUnlock } from './unlock.js';
import { dayKey } from './srs.js';

const store = new Store(globalThis.localStorage, { batch: true });
// 答题攒着没存的: 离开页面、切到别的应用时马上存 (要在同步之前, 同步看见有改的才会赶紧推)
window.addEventListener('pagehide', () => store.flush());
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') store.flush();
  // 开着过了一夜再回来: 首页、卡片集页这些「今天」的数字换成今天的
  else if (current && current.day !== dayKey() && ['home', 'set', 'folder', 'mistakes', 'stats'].includes(current.page)) render();
});
let lastSaveError = 0;
store.onSaveError = () => {
  // 一直存不进去时别每次都弹
  if (Date.now() - lastSaveError < 10000) return;
  lastSaveError = Date.now();
  toast('存不进去了: 浏览器给的空间满了, 或者开着无痕模式。刚才的改动可能没存上, 先导出备份。');
};
const main = document.getElementById('main');

let current = null; // 当前页 { cleanup, canLeave }
let shownHash = null;
let outsideHash = null; // 进游戏之前在哪一页 (游戏里点 ✕ 回游戏板块还是回卡片集)

function parse(hash) {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  if (parts.length === 0) return { page: 'home' };
  if (parts[0] === 'new') return { page: 'edit', id: null };
  if (parts[0] === 'new-quiz') return { page: 'quiz-edit', id: null };
  if (parts[0] === 'import') return { page: 'edit', id: null, openImport: true };
  if (parts[0] === 'search') return { page: 'search', query: parts.slice(1).join('/') };
  if (parts[0] === 'games') return { page: 'games', game: parts[1] ?? null };
  if (parts[0] === 'mistakes') {
    if (!parts[1]) return { page: 'mistakes' };
    if (parts[1] === 'new') return { page: 'mistake-edit', mistake: null };
    if (parts[1] === 'review') return { page: 'mistake-review', which: parts[2] ?? null };
    if (parts[2] === 'edit') return { page: 'mistake-edit', mistake: parts[1] };
  }
  if (parts[0] === 'folder' && parts[1]) return { page: 'folder', id: parts[1] };
  if (parts[0] === 'review') return { page: 'review', id: parts[1] ?? null };
  if (parts[0] === 'stats') return { page: 'stats', id: parts[1] ?? null };
  if (parts[0] === 'share') return { page: 'share', code: parts[1] ?? '' };
  if (parts[0] === 'quizlet') return { page: 'quizlet' };
  if (parts[0] === 'sync') return { page: 'sync', sub: parts[1] ?? null, data: parts[2] ?? null };
  // 合起来学的「卡片集页」就是文件夹页
  if (parts[0] === 'set' && parts[1]?.startsWith('folder:') && !parts[2]) return { page: 'folder', id: parts[1].slice(7) };
  if (parts[0] === 'set' && parts[1]) {
    const sub = parts[2] ?? '';
    if (sub === '') return { page: 'set', id: parts[1] };
    if (sub === 'edit') return { page: 'edit', id: parts[1] };
    if (sub === 'cards') return { page: 'cards', id: parts[1] };
    if (sub === 'learn') return { page: 'learn', id: parts[1] };
    if (sub === 'test') return { page: 'test', id: parts[1] };
    if (sub === 'match') return { page: 'match', id: parts[1] };
    if (sub === 'blast') return { page: 'blast', id: parts[1] };
    if (sub === 'blocks') return { page: 'blocks', id: parts[1] };
    if (sub === 'gems') return { page: 'gems', id: parts[1] };
    if (sub === 'wordle') return { page: 'wordle', id: parts[1] };
    if (sub === 'diagram') return { page: 'diagram', id: parts[1] };
    if (sub === 'play') return { page: 'play', id: parts[1] };
  }
  return { page: 'missing' };
}

export function go(hash) {
  if (location.hash === hash) render();
  else location.hash = hash;
}

function render() {
  const hash = location.hash || '#/';
  // 编辑到一半要离开: 先问一下, 不走就把网址改回去
  if (current?.canLeave && shownHash !== null && hash !== shownHash && !current.canLeave()) {
    history.replaceState(null, '', shownHash);
    return;
  }
  // 换页时 (比如按了浏览器的返回) 关掉还开着的弹出窗口
  for (const d of document.querySelectorAll('dialog[open]')) d.close();
  current?.cleanup?.();
  current = null;
  shownHash = hash;

  const route = parse(hash);
  // 游戏: 整页深色, 顶上的搜索栏收起来 (照 Quizlet)
  const inGame = GAME_KEYS.includes(route.page) || route.page === 'play';
  document.body.classList.toggle('in-game', inGame);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', inGame ? '#0a092d' : '#b8372e');
  if (!inGame) outsideHash = hash;
  const ctx = { store, go, syncer, from: outsideHash };
  let view;
  const quiz = route.id ? store.getSet(route.id)?.kind === 'quiz' : false;
  if (route.page === 'home') view = renderHome(ctx);
  else if (route.page === 'quiz-edit' || (route.page === 'edit' && quiz)) view = renderQuizEdit(ctx, route.id);
  else if (route.page === 'edit') view = renderEdit(ctx, route.id, { openImport: route.openImport });
  else if (route.page === 'set' && quiz) view = renderQuizSet(ctx, store.getSet(route.id));
  else if (route.page === 'set') view = renderSet(ctx, route.id);
  else if (route.page === 'play') view = renderQuizPlay(ctx, route.id);
  else if (route.page === 'cards') view = renderCards(ctx, route.id);
  else if (route.page === 'learn') view = renderLearn(ctx, route.id);
  else if (route.page === 'test') view = renderExam(ctx, route.id);
  else if (route.page === 'match') view = renderMatch(ctx, route.id);
  else if (route.page === 'blast') view = renderBlast(ctx, route.id);
  else if (route.page === 'blocks') view = renderBlocks(ctx, route.id);
  else if (route.page === 'gems') view = renderGems(ctx, route.id);
  else if (route.page === 'wordle') view = renderWordle(ctx, route.id);
  else if (route.page === 'diagram') view = renderDiagramPractice(ctx, route.id);
  else if (route.page === 'search') view = renderSearch(ctx, route.query);
  else if (route.page === 'games') view = renderGames(ctx, route.game);
  else if (route.page === 'mistakes') view = renderMistakes(ctx);
  else if (route.page === 'mistake-edit') view = renderMistakeEdit(ctx, route.mistake);
  else if (route.page === 'mistake-review') view = renderMistakeReview(ctx, route.which);
  else if (route.page === 'folder') view = renderFolder(ctx, route.id);
  else if (route.page === 'review') view = renderReview(ctx, route.id);
  else if (route.page === 'stats') view = renderStats(ctx, route.id);
  else if (route.page === 'sync') view = renderSync(ctx, route.sub, route.data);
  else if (route.page === 'share') view = renderShareImport(ctx, route.code);
  else if (route.page === 'quizlet') view = renderQuizlet(ctx);
  else view = missing();

  view.page = route.page;
  view.day = dayKey();
  current = view;
  main.replaceChildren(view.el);
  document.title = view.title ? `${view.title} · 温故` : '温故';
  window.scrollTo(0, 0);
  view.focus?.focus();
}

function missing() {
  return {
    title: '找不到',
    el: h(
      'section',
      { class: 'empty' },
      h('h1', {}, '找不到这一页'),
      h('p', {}, '可能这个卡片集已经删掉了。'),
      h('a', { class: 'btn primary', href: '#/' }, '回首页'),
    ),
  };
}

window.addEventListener('hashchange', render);

// 顶上的搜索框
document.getElementById('search-form')?.addEventListener('submit', (e) => {
  e.preventDefault();
  const input = e.target.querySelector('input');
  const q = input.value.trim();
  input.value = '';
  input.blur();
  go(`#/search/${encodeURIComponent(q)}`);
});

// ---- 多设备同步 ----
const badge = document.getElementById('sync-badge');
const syncer = new SyncManager(store, {
  onStatus: ({ status, message }) => {
    if (!badge) return;
    badge.hidden = status === 'off';
    // 密钥还剩两周以内就过期: 顶上一直提醒 (出错时还是先说出错)
    const expiry = status !== 'off' && status !== 'error' ? expiryInfo(loadConfig()) : null;
    const warn = Boolean(expiry?.warn);
    badge.className = `sync-badge ${warn ? 'error' : status}`;
    const text = warn ? '密钥快过期' : ({ syncing: '同步中', ok: '已同步', error: '同步出错', idle: '同步' }[status] ?? '');
    badge.replaceChildren(h('span', { class: 'sync-icon', 'aria-hidden': 'true' }, icon(status === 'error' || warn ? 'alert' : status === 'syncing' ? 'refresh' : 'cloud', 18)), h('span', { class: 'sync-text' }, text));
    badge.title = status === 'error' ? `同步出错: ${message}` : status === 'syncing' && message ? `多设备同步: ${message}` : warn ? (expiry.expired ? '同步用的密钥可能已经过期了, 点这里换' : expiry.days === 0 ? '同步用的密钥今天过期, 点这里换' : `同步用的密钥还有 ${expiry.days} 天过期, 点这里换`) : `多设备同步: ${text}`;
  },
  // 别的设备的改动合并进来了: 首页、卡片集页这些直接重画; 正在背、正在编辑的不打断
  onApplied: () => {
    if (['home', 'set', 'folder', 'search', 'games', 'mistakes', 'stats'].includes(current?.page)) {
      const y = window.scrollY;
      render();
      window.scrollTo(0, y);
    }
  },
});
store.onChange = () => syncer.changed();

// 同时开了好几个标签页: 别的标签页存了东西, 这边重新读, 免得这边一存把那边的盖掉。
// 首页和卡片集页直接重画; 正在背、正在编辑的不打断 (它们存的时候按 id 找, 用的是新读的)
window.addEventListener('storage', (e) => {
  if (e.key !== null && e.key !== KEY) return;
  store.reload();
  if (['home', 'set', 'folder', 'games', 'mistakes', 'stats'].includes(current?.page)) {
    const y = window.scrollY;
    render();
    window.scrollTo(0, y);
  }
});
window.addEventListener('beforeunload', (e) => {
  if (current?.isDirty?.()) {
    e.preventDefault();
    e.returnValue = '';
  }
});

// 请浏览器别在空间紧的时候自己清掉卡片 (不一定答应, 答不答应都不影响用)
navigator.storage?.persist?.().catch(() => {});

// 断网也能用 (sw.js 把网页的文件存下来)。只有 https 或者自己电脑上才能开
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// 没有卡片用的图片、录音 (比如编辑时加了又没保存、别的设备删了卡片集), 过一会儿删掉;
// 已经没有了的卡片集在浏览器里另外记的东西 (背到哪了、学哪些……) 也删掉
setTimeout(() => {
  cleanMedia(store);
  store.pruneLocal();
}, 5000);

// v1.9 的 AI 功能去掉了: 以前存过的 API 密钥也从浏览器里删掉
try {
  localStorage.removeItem('wengu:ai');
  localStorage.removeItem('wengu:ai-api');
} catch {
  // 删不掉就算了
}

installAudioUnlock(); // iPhone: 第一次点屏幕时把声音解锁
render();
syncer.start();
