// 国际象棋 (v1.82, ☰ 菜单单独一项): 跟电脑下 (8 个对手, 每人一个分)、跟教练下 (边下边教)、复盘 (每一步好坏、准确率、教练讲解),
// 棋从 chess.com 拿或者粘贴棋谱。
//   #/chess               首页: 教练、三个大按钮、chess.com 的棋、下过的棋
//   #/chess/play          跟电脑下 (没在下: 先挑对手、执白执黑)
//   #/chess/coach         跟教练下 (没在下: 先挑教练、休闲 / 均势 / 挑战)
//   #/chess/review/<编号>  复盘一盘存着的棋
// 用户 2026-11-13 要的: 参考 chess.com、Lichess, 用干鳕鱼引擎; 主要是 chess.com 的复盘要收费, 而且它有动画、有人物讲, 比 Lichess 光秃秃的舒服。
// 人物在 chesspeople.js (用户定的), 头像在 chessface.js, 对手怎么走在 chessbot.js。

import { h, fill, icon, toast, openDialog } from '../dom.js';
import { Chess } from '../vendor/chess.js';
import {
  START_FEN,
  MATE,
  zhSan,
  winPct,
  evalText,
  classify,
  sacrificeValue,
  readPgn,
  positionsOf,
  judgeGame,
  countKinds,
  turningPoint,
  keyMoments,
  skillsOfMove,
  mateIn,
  gameAccuracy,
  gameRating,
  areaGrades,
  materialOf,
  PIECE_ZH,
  AREAS,
  resultText,
  gameRecord,
  gameList,
  nextRating,
  START_RATING,
  KINDS,
  kindOf,
  BAD,
  VALUE,
} from '../chess.js';
import { MOOD, threatText } from '../chesscoach.js';
import { moveFacts, punishFacts, coachLine, bestLine, summaryLine, triviaLine, voiceOf, speakable, keepMoves, fillLine, TRIVIA } from '../chessvoice.js';
import { loadBook, bookMoves } from '../chessbook.js';
import { EX_DBS, explore } from '../chessexplorer.js';
import { speak, stopSpeaking, canSpeak } from '../speech.js';
import { OPPONENTS, DEFAULT_COACH, personOf, coachOf, coachesFor, pickLine, ratingText } from '../chesspeople.js';
import { botParams, pickMove, bookMove, STYLES } from '../chessbot.js';
import { getEngine, engineName } from '../chessengine.js';
import { recentGames, ccRating, NAME as CC_NAME } from '../chesscom.js';
import { createBoard, chessSound, PIECE_IMG } from './chessboard.js';
import { kindIcon, skillIcon, endIcon } from './chessicons.js';
import { SKILLS, SKILL_CATS, skillOf, openSkills, skillPoints, skillClaimed, claimSkill, emptySkills } from '../chessskills.js';
import { liveFace, faceSvg } from './chessface.js';

const LAST_KEY = 'wengu:chess-last'; // 上次挑的对手、教练、难度、执哪方 (这台设备上)
const DIFFS = [
  { key: 'easy', name: '休闲', hint: '比你弱一些，专心学', delta: -200 },
  { key: 'even', name: '均势', hint: '跟你差不多', delta: 0 },
  { key: 'hard', name: '挑战', hint: '比你强一些', delta: 200 },
];
// 温温: 复盘完一盘棋以后才出现
const wenwenOpen = (chess) => gameList(chess).some((g) => g.review);
const reducedMotion = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const readLast = () => {
  try {
    return JSON.parse(localStorage.getItem(LAST_KEY) ?? 'null') ?? {};
  } catch {
    return {};
  }
};
const saveLast = (x) => {
  try {
    localStorage.setItem(LAST_KEY, JSON.stringify(x));
  } catch {}
};

const dateText = (t) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function renderChess(ctx, sub = []) {
  if (sub[0] === 'play') return renderPlay(ctx, 'bot');
  if (sub[0] === 'coach') return renderPlay(ctx, 'coach');
  if (sub[0] === 'review' && sub[1]) return renderReview(ctx, decodeURIComponent(sub[1]));
  if (sub[0] === 'analysis') return renderAnalysis(ctx);
  return renderHub(ctx);
}

// ---- 人物 + 说话的气泡 ----
// tools: 放在气泡右上角的小按钮 (复盘的「念出来」开关)
// stack: 上一句话不马上消失, 挪到上面一个小气泡里, 最近两句叠着 (下棋时用, 照 chess.com 的教练模式, v1.85.1)
function coachPanel(person, { size = 76, cls = '', tools = null, stack = false } = {}) {
  const face = liveFace(person, { size });
  const name = h('span', { class: 'chess-say-name' }, person.name);
  const head = h('div', { class: 'chess-say-head', hidden: true });
  const text = h('p', { class: 'chess-say-text', 'aria-live': 'polite' });
  const bubble = h('div', { class: 'chess-bubble' }, tools ? h('div', { class: 'chess-bubble-tools' }, tools) : null, name, head, text);
  const prevText = h('p', { class: 'chess-say-text' });
  const prev = h('div', { class: 'chess-bubble chess-bubble-prev', hidden: true }, prevText);
  const el = h('div', { class: `chess-coach ${cls}` }, face.el, stack ? h('div', { class: 'chess-bubbles' }, prev, bubble) : bubble);
  let timer = 0;
  let full = '';
  const finish = () => {
    clearInterval(timer);
    timer = 0;
    text.textContent = full;
  };
  bubble.addEventListener('click', finish);
  return {
    el,
    face,
    setPerson(p) {
      person = p;
      face.setPerson(p);
      name.textContent = p.name;
    },
    // 气泡最上面一行 (复盘: 好坏的图标、这步、打分); null: 换回人物的名字
    setHead(node) {
      head.hidden = !node;
      name.hidden = Boolean(node);
      head.replaceChildren(...(node ? [node] : []));
    },
    say(str, mood = null) {
      if (mood) face.setMood(mood);
      clearInterval(timer);
      str = keepMoves(str); // 走法 (后×h7) 中间不换行
      if (stack && full && full !== str) {
        prevText.textContent = full;
        prev.hidden = false;
      }
      full = str;
      bubble.classList.remove('pop');
      void bubble.offsetWidth;
      bubble.classList.add('pop');
      if (reducedMotion() || !str) {
        text.textContent = str;
        return;
      }
      let i = 0;
      text.textContent = '';
      face.talk(Math.min(4000, str.length * 45));
      timer = setInterval(() => {
        i += 1;
        text.textContent = str.slice(0, i);
        if (i >= str.length) finish();
      }, 32);
    },
    stop: finish,
  };
}

// 一排人物头像 (挑对手、挑教练): 名字下面一行小字 (对手写分数, 教练写教法)
function peoplePicker(list, selected, onPick, { label = '挑人物' } = {}) {
  return h(
    'div',
    { class: 'chess-people', role: 'radiogroup', 'aria-label': label },
    list.map((p) =>
      h(
        'button',
        { type: 'button', class: `chess-person${p.id === selected ? ' on' : ''}`, role: 'radio', 'aria-checked': String(p.id === selected), title: p.intro, onclick: () => onPick(p.id) },
        faceSvg(p, { mood: p.id === selected ? 'smile' : 'normal', size: 56 }),
        h('span', { class: 'chess-person-name' }, p.name),
        h('span', { class: 'chess-person-sub' }, p.rating !== undefined ? ratingText(p) : p.teach),
      ),
    ),
  );
}

// 一个人物的介绍卡: 大头像、名字、哪里 · 什么年代、介绍 (对手再写分数和下法)
function personCard(p) {
  return h(
    'div',
    { class: 'chess-card' },
    faceSvg(p, { mood: 'smile', size: 88 }),
    h(
      'div',
      { class: 'chess-card-text' },
      h('strong', {}, p.name, p.rating !== undefined ? h('span', { class: 'chess-card-rating' }, ratingText(p)) : null),
      h('span', { class: 'muted small' }, [p.place, p.era, p.teach && p.rating === undefined ? `${p.teach}型教练` : ''].filter(Boolean).join(' · ')),
      h('span', { class: 'small' }, p.intro),
      p.style ? h('span', { class: 'small muted' }, `下法：${p.style}`) : null,
      h('span', { class: 'chess-card-hi' }, `「${(p.hi ?? p.lines?.hi)[0]}」`),
    ),
  );
}

// 我大约多少分: 填过 chess.com 用户名的先拿那边的分 (这次打开温故拿一次), 以后每下完一盘按 Elo 算法变
let ccRatingCache = null; // { name, rating }
async function myRating(store) {
  const chess = store.data.chess;
  if (chess?.elo) return chess.elo;
  const name = chess?.user?.name;
  if (name) {
    if (ccRatingCache?.name !== name) ccRatingCache = { name, rating: await ccRating(name).catch(() => 0) };
    if (ccRatingCache.rating) return { rating: ccRatingCache.rating, games: 0, cc: 1 };
  }
  return { rating: START_RATING, games: 0 };
}

// ---- 首页 ----
let ccCache = null; // { name, at, games }: 这次打开温故拿过的 chess.com 棋 (两分钟内不重拿)

function renderHub({ store, go }) {
  const chess = () => store.data.chess;
  let coach = coachOf(chess()?.coach?.id ?? DEFAULT_COACH);
  const panel = coachPanel(coach, { cls: 'hub' });
  setTimeout(() => panel.say(pickLine(coach.hi), 'smile'), 150);

  const changeCoach = () => {
    let pick = coach.id;
    const intro = h('p', { class: 'muted small chess-intro' }, coach.intro);
    const grid = h('div');
    const draw = () =>
      fill(
        grid,
        peoplePicker(
          coachesFor(wenwenOpen(chess())),
          pick,
          (id) => {
            pick = id;
            intro.textContent = coachOf(id).intro;
            draw();
          },
          { label: '挑教练' },
        ),
      );
    draw();
    const dlg = openDialog({
      title: '挑教练',
      body: [grid, intro],
      footer: h(
        'button',
        {
          class: 'btn primary',
          type: 'button',
          onclick: () => {
            store.updateChess((c) => ({ ...c, coach: { id: pick, at: Date.now() } }));
            coach = coachOf(pick);
            panel.setPerson(coach);
            panel.say(pickLine(coach.hi), 'happy');
            dlg.close();
          },
        },
        '就是 TA',
      ),
    });
  };

  const cur = chess()?.current;
  const big = (href, iconText, title, sub) => h('a', { class: 'chess-big', href }, h('span', { class: 'chess-big-icon', 'aria-hidden': 'true' }, iconText), h('span', { class: 'chess-big-text' }, h('strong', {}, title), h('span', { class: 'muted small' }, sub)));
  const busyBot = cur?.mode === 'bot';
  const busyCoach = cur?.mode === 'coach';
  const play = big('#/chess/play', '♞', busyBot ? '接着下' : '跟电脑下', busyBot ? `对手：${personOf(cur.who).name}（${cur.rating || '最强'}）` : `8 个对手，从 ${OPPONENTS[0].rating} 分到最强`);
  const teach = big('#/chess/coach', '🎓', busyCoach ? '接着下' : '跟教练下', busyCoach ? `教练：${personOf(cur.who).name}` : '边下边教，走错了能收回');
  const paste = h(
    'button',
    { class: 'chess-big', type: 'button', onclick: () => pasteDialog(store, go) },
    h('span', { class: 'chess-big-icon', 'aria-hidden': 'true' }, '📋'),
    h('span', { class: 'chess-big-text' }, h('strong', {}, '粘贴棋谱'), h('span', { class: 'muted small' }, 'PGN，Lichess 等网站都能导出')),
  );

  // chess.com 的棋
  const cc = h('section', { class: 'chess-sec' });
  const drawCC = async (refresh = false) => {
    const name = chess()?.user?.name ?? '';
    if (!name) {
      const input = h('input', { class: 'input', type: 'text', placeholder: 'chess.com 用户名', autocapitalize: 'off', autocomplete: 'off', spellcheck: 'false', enterkeyhint: 'go', 'aria-label': 'chess.com 用户名' });
      const save = () => {
        const v = input.value.trim();
        if (!CC_NAME.test(v)) return toast('用户名不对');
        store.updateChess((c) => ({ ...c, user: { name: v, at: Date.now() } }));
        drawCC(true);
      };
      input.addEventListener('keydown', (e) => e.key === 'Enter' && !e.isComposing && save());
      fill(cc, h('h2', {}, 'chess.com 的棋'), h('div', { class: 'chess-cc-form' }, input, h('button', { class: 'btn primary', type: 'button', onclick: save }, '拿棋')));
      return;
    }
    const head = h(
      'div',
      { class: 'chess-sec-head' },
      h('h2', {}, `chess.com · ${name}`),
      h(
        'button',
        {
          class: 'btn small',
          type: 'button',
          onclick: () => {
            store.updateChess((c) => ({ ...c, user: { name: '', at: Date.now() } }));
            ccCache = null;
            drawCC();
          },
        },
        '换人',
      ),
    );
    const list = h('ul', { class: 'chess-list' });
    fill(cc, head, list);
    if (!refresh && ccCache?.name === name && Date.now() - ccCache.at < 120000) return fillCC(list, ccCache.games);
    fill(list, h('li', { class: 'muted small' }, '正在拿……'));
    try {
      const games = await recentGames(name, { limit: 20 });
      ccCache = { name, at: Date.now(), games };
      fillCC(list, games);
    } catch (e) {
      fill(list, h('li', { class: 'muted small' }, `${e.message || '没拿到'}。`, h('button', { class: 'btn small', type: 'button', onclick: () => drawCC(true) }, '再试一次')));
    }
  };
  const fillCC = (list, games) => {
    if (!games.length) return fill(list, h('li', { class: 'muted small' }, '最近两个月没有下过棋。'));
    const saved = chess()?.games ?? {};
    fill(
      list,
      games.map((g) => {
        const id = `cc${g.url.split('/').pop()}`;
        const done = saved[id]?.review && !saved[id].gone;
        const res = resultText(g.result, g.me);
        return h(
          'li',
          {},
          h(
            'button',
            { class: 'chess-row', type: 'button', onclick: () => openCC(store, go, g) },
            h('span', { class: `chess-res ${res === '赢了' ? 'win' : res === '输了' ? 'lose' : 'draw'}` }, res === '赢了' ? '赢' : res === '输了' ? '输' : '和'),
            h('span', { class: 'chess-row-text' }, h('strong', {}, `对 ${g.opponent}${g.opponentRating ? `（${g.opponentRating}）` : ''}`), h('span', { class: 'muted small' }, [g.kind, g.how, g.end ? dateText(g.end) : ''].filter(Boolean).join(' · '))),
            h('span', { class: 'chess-row-go' }, done ? '看复盘' : '复盘'),
          ),
        );
      }),
    );
  };
  drawCC();

  // 下过的棋
  const mine = h('section', { class: 'chess-sec' });
  const drawMine = () => {
    const list = gameList(chess());
    if (!list.length) return fill(mine);
    fill(
      mine,
      h('h2', {}, '下过的棋'),
      h(
        'ul',
        { class: 'chess-list' },
        list.map((g) => {
          const res = resultText(g.result, g.me);
          const title = g.src === 'cpu' ? `对 ${personOf(g.who).name}（${g.mode === 'coach' ? '教练 · ' : ''}${g.rating || '最强'}）` : `${g.white || '白方'} 对 ${g.black || '黑方'}`;
          const acc = g.review && g.me ? myAccuracy(g) : null;
          return h(
            'li',
            { class: 'chess-mine' },
            h(
              'a',
              { class: 'chess-row', href: `#/chess/review/${encodeURIComponent(g.id)}` },
              h('span', { class: `chess-res ${res === '赢了' || (!g.me && res === '白胜') ? 'win' : res === '输了' ? 'lose' : 'draw'}` }, res.slice(0, 2)),
              h('span', { class: 'chess-row-text' }, h('strong', {}, title), h('span', { class: 'muted small' }, [{ cpu: '跟电脑下', cc: 'chess.com', pgn: '棋谱' }[g.src], g.date, acc !== null ? `准确率 ${acc.toFixed(1)}` : g.review ? '' : '还没复盘'].filter(Boolean).join(' · '))),
            ),
            h(
              'button',
              {
                class: 'icon-btn',
                type: 'button',
                'aria-label': '删掉这盘',
                title: '删掉',
                onclick: () => {
                  if (!confirm('删掉这盘棋？')) return;
                  store.updateChess((c, now) => ({ ...c, games: { ...c.games, [g.id]: { id: g.id, at: now, gone: 1 } } }));
                  drawMine();
                },
              },
              icon('trash', 18),
            ),
          );
        }),
      ),
    );
  };
  drawMine();

  return {
    title: '国际象棋',
    el: h(
      'section',
      { class: 'chess-page chess-hub' },
      h('a', { class: 'back', href: '#/' }, '← 主页'),
      h('div', { class: 'chess-hub-head' }, h('h1', {}, '国际象棋'), h('button', { class: 'btn small', type: 'button', onclick: changeCoach }, '换教练')),
      panel.el,
      h('div', { class: 'chess-bigs' }, play, teach, paste, big('#/chess/analysis', '🔍', '分析', '开局浏览器、电脑分析')),
      cc,
      mine,
      h('p', { class: 'muted small chess-foot' }, `引擎：${engineName()}（Stockfish，GPL-3.0）。`, h('a', { href: '#/settings' }, '换引擎')),
    ),
    cleanup: () => panel.stop(),
  };
}

function myAccuracy(g) {
  const parsed = readPgn(g.pgn);
  if (!parsed || !g.review) return null;
  return gameAccuracy(g.review.ev, g.me, parsed.moves[0]?.color ?? 'w');
}

function openCC(store, go, g) {
  const id = `cc${g.url.split('/').pop()}`;
  const old = store.data.chess?.games?.[id];
  if (!old || old.gone) {
    const rec = gameRecord({ pgn: g.pgn, src: 'cc', me: g.me, url: g.url, id });
    if (!rec) return toast('这盘棋读不了');
    if (g.end) rec.end = g.end;
    store.updateChess((c) => ({ ...c, games: { ...c.games, [id]: rec } }));
  }
  go(`#/chess/review/${encodeURIComponent(id)}`);
}

function pasteDialog(store, go) {
  const area = h('textarea', { class: 'input chess-pgn', rows: '8', placeholder: '[Event "…"]\n1. e4 e5 2. Nf3 …', spellcheck: 'false', 'aria-label': '棋谱' });
  let me = 'w';
  const side = h(
    'div',
    { class: 'chess-seg', role: 'radiogroup', 'aria-label': '你是哪一方' },
    [
      ['w', '我执白'],
      ['b', '我执黑'],
      ['', '都不是'],
    ].map(([v, t]) =>
      h(
        'button',
        {
          type: 'button',
          class: `chess-seg-btn${v === me ? ' on' : ''}`,
          onclick: (e) => {
            me = v;
            for (const b of side.children) b.classList.toggle('on', b === e.currentTarget);
          },
        },
        t,
      ),
    ),
  );
  const dlg = openDialog({
    title: '粘贴棋谱',
    body: [area, side],
    footer: h(
      'button',
      {
        class: 'btn primary',
        type: 'button',
        onclick: () => {
          const rec = gameRecord({ pgn: area.value, src: 'pgn', me });
          if (!rec) return toast('读不了这个棋谱');
          store.updateChess((c) => ({ ...c, games: { ...c.games, [rec.id]: rec } }));
          dlg.close();
          go(`#/chess/review/${encodeURIComponent(rec.id)}`);
        },
      },
      '复盘',
    ),
  });
  setTimeout(() => area.focus(), 50);
}

// ---- 走子列表 (1. e4 e5 2. 马f3 …): 点了跳到那一步 ----
// 走子列表里标图标的: 好棋、妙着、走坏了的, 还有最后一步开局谱着 (从那以后离开了开局谱)
const LIST_MARKED = new Set(['brilliant', 'great', 'inaccuracy', 'mistake', 'miss', 'blunder']);
// skills: 能领技巧分的步 (走法的下标), 走法后面加一个技巧的小图标
function moveList(moves, { judged = null, onPick = null, skills = null } = {}) {
  const box = h('ol', { class: 'chess-moves' });
  const cells = [];
  const lastBook = judged ? judged.map((j) => j.kind).lastIndexOf('book') : -1;
  for (let i = 0; i < moves.length; i += 2) {
    const cell = (j) => {
      if (j >= moves.length) return h('span', { class: 'chess-mv chess-mv-none' });
      const k = judged?.[j] ? kindOf(judged[j].kind) : null;
      const marked = k && (LIST_MARKED.has(k.key) || j === lastBook);
      const b = h('button', { type: 'button', class: `chess-mv${marked ? ` ck-${k.key}` : ''}`, onclick: () => onPick?.(j + 1) }, marked ? kindIcon(k.key, 16) : null, zhSan(moves[j].san), skills?.has(j) ? skillIcon(14) : null);
      cells[j] = b;
      return b;
    };
    box.append(h('li', {}, h('span', { class: 'chess-mv-n' }, `${Math.floor(i / 2) + 1}.`), cell(i), cell(i + 1)));
  }
  return {
    el: box,
    mark(ply) {
      cells.forEach((c, j) => c?.classList.toggle('on', j === ply - 1));
      const c = cells[ply - 1];
      if (c && box.scrollHeight > box.clientHeight) box.scrollTop = c.offsetTop - box.clientHeight / 2;
    },
  };
}

const checkSquare = (game) => {
  if (!game.inCheck()) return null;
  const k = game.findPiece({ type: 'k', color: game.turn() });
  return k?.[0] ?? null;
};

// ---- 跟电脑下 (mode 'bot': 8 个对手) / 跟教练下 (mode 'coach') ----
function renderPlay(ctx, mode) {
  const cur = ctx.store.data.chess?.current;
  if (cur?.mode === mode) return renderGame(ctx, cur);
  return renderSetup(ctx, mode);
}

function seg(list, value, onPick, label) {
  return h(
    'div',
    { class: 'chess-seg', role: 'radiogroup', 'aria-label': label },
    list.map(([v, t]) => h('button', { type: 'button', class: `chess-seg-btn${v === value ? ' on' : ''}`, role: 'radio', 'aria-checked': String(v === value), onclick: () => onPick(v) }, t)),
  );
}

function renderSetup({ store, go }, mode) {
  const coachMode = mode === 'coach';
  const last = readLast()[mode] ?? {};
  const people = coachMode ? coachesFor(wenwenOpen(store.data.chess)) : OPPONENTS;
  let who = people.some((p) => p.id === last.who) ? last.who : coachMode ? store.data.chess?.coach?.id ?? DEFAULT_COACH : OPPONENTS[1].id;
  if (!people.some((p) => p.id === who)) who = people[0].id;
  let diff = DIFFS.some((d) => d.key === last.diff) ? last.diff : 'even';
  let color = ['w', 'b', 'r'].includes(last.color) ? last.color : 'w';
  let mine = null; // 我大约多少分 (跟教练下用)
  const other = store.data.chess?.current; // 另一种没下完的
  const box = h('div', { class: 'chess-setup' });
  const mineNote = () => {
    if (!mine) return '正在看你大约多少分……';
    const how = mine.games ? `按你在温故下的 ${mine.games} 盘棋算` : mine.cc ? '按你在 chess.com 快棋的分' : '还不知道你的水平，先这么算，下几盘就准了';
    const target = Math.max(100, mine.rating + DIFFS.find((d) => d.key === diff).delta);
    return `你现在大约 ${mine.rating} 分（${how}）。教练这盘按 ${target} 分下。`;
  };
  const draw = () => {
    const p = personOf(who);
    fill(
      box,
      other
        ? h('p', { class: 'chess-other' }, `还有一盘没下完（对 ${personOf(other.who).name}）。`, h('a', { href: other.mode === 'coach' ? '#/chess/coach' : '#/chess/play' }, '接着下'), '；开始新的就不要那盘了。')
        : null,
      h('h2', {}, coachMode ? '教练' : '对手'),
      peoplePicker(
        people,
        who,
        (id) => {
          who = id;
          draw();
        },
        { label: coachMode ? '挑教练' : '挑对手' },
      ),
      personCard(p),
      coachMode
        ? [
            h('h2', {}, '难度'),
            h(
              'div',
              { class: 'chess-diffs', role: 'radiogroup', 'aria-label': '难度' },
              DIFFS.map((d) =>
                h('button', { type: 'button', class: `chess-diff${d.key === diff ? ' on' : ''}`, role: 'radio', 'aria-checked': String(d.key === diff), onclick: () => ((diff = d.key), draw()) }, h('strong', {}, d.name), h('span', {}, d.hint)),
              ),
            ),
            h('p', { class: 'muted small chess-intro' }, mineNote()),
          ]
        : null,
      h('h2', {}, '你执'),
      seg(
        [
          ['w', '白（先走）'],
          ['b', '黑'],
          ['r', '随便'],
        ],
        color,
        (v) => ((color = v), draw()),
        '执白还是执黑',
      ),
      h(
        'button',
        {
          class: 'btn primary chess-start',
          type: 'button',
          onclick: () => {
            if (other && !confirm('那盘没下完的就不要了？')) return;
            saveLast({ ...readLast(), [mode]: { who, diff, color } });
            const c = color === 'r' ? (Math.random() < 0.5 ? 'w' : 'b') : color;
            const rating = coachMode ? Math.max(100, Math.min(3000, (mine?.rating ?? START_RATING) + DIFFS.find((d) => d.key === diff).delta)) : p.rating;
            store.updateChess((x, now) => ({ ...x, current: { moves: '', color: c, who, mode, rating, ...(coachMode ? { diff } : {}), start: now, at: now } }));
            go(coachMode ? '#/chess/coach' : '#/chess/play');
          },
        },
        '开始',
      ),
    );
  };
  draw();
  if (coachMode)
    myRating(store).then((r) => {
      mine = r;
      draw();
    });
  const title = coachMode ? '跟教练下' : '跟电脑下';
  return { title, el: h('section', { class: 'chess-page' }, h('a', { class: 'back', href: '#/chess' }, '← 国际象棋'), h('h1', {}, title), box) };
}

function renderGame({ store, go }, cur) {
  const me = cur.color;
  const cpu = me === 'w' ? 'b' : 'w';
  const coachMode = cur.mode === 'coach';
  const person = personOf(cur.who);
  const params = botParams(cur.rating);
  const style = coachMode ? null : STYLES[person.id] ?? null;
  const game = new Chess();
  for (const m of cur.moves.split(' ').filter(Boolean)) {
    try {
      game.move({ from: m.slice(0, 2), to: m.slice(2, 4), promotion: m[4] });
    } catch {
      break;
    }
  }
  let engine = null;
  let busy = false;
  let alive = true;
  let pre = null; // 轮到我走时, 引擎先把这个局面算好 (判断我这步好坏、提示用)
  let over = false;
  let waiting = null; // 跟教练下: 我走错了, 等我挑「收回重走」还是「接着下」

  const panel = coachPanel(person, { size: 80, cls: 'play', stack: true });
  const lines = (key) => (coachMode ? person[key] : person.lines[key]);
  const thinking = h('span', { class: 'chess-thinking', hidden: true }, '思考中', h('i'), h('i'), h('i'));
  // 名字旁边只写分数 (v1.85.1, 用户说「最强型教练 · 均势 · 按 800 分下」像废话, chess.com 只写名字和分数)
  const tag = coachMode ? String(cur.rating) : `${cur.rating || '最强'} · ${person.place}`;
  const topCaps = h('span', { class: 'chess-player-caps' });
  const bottomCaps = h('span', { class: 'chess-player-caps' });
  const top = h('div', { class: 'chess-player' }, faceSvg(person, { size: 34 }), h('strong', {}, person.name), h('span', { class: 'muted small' }, tag), topCaps, thinking);
  const bottom = h('div', { class: 'chess-player' }, h('span', { class: `chess-dot ${me}` }), h('strong', {}, '你'), h('span', { class: 'muted small' }, me === 'w' ? '执白' : '执黑'), bottomCaps);
  const listBox = h('div', { class: 'chess-moves-box' });
  const askBox = h('div', { class: 'chess-ask', hidden: true });
  // 走子记录上面写现在是什么开局 (v1.85.1, 用户说 chess.com 下棋时会写); 开局谱第一次用到才下载, 冷门的、没中文名的不写
  const openName = h('div', { class: 'chess-open-name', hidden: true });
  let openBook = null;
  const bookList = () => {
    const hist = game.history({ verbose: true });
    return openBook && hist.length ? bookMoves(openBook, [hist[0].before, ...hist.map((m) => m.after)]) : [];
  };
  const drawOpening = () => {
    const name = bookList().filter((x) => x.book && x.name).at(-1)?.name ?? '';
    openName.textContent = name;
    openName.hidden = !name;
  };
  loadBook()
    .then((b) => {
      openBook = b;
      if (alive) drawOpening();
    })
    .catch(() => {});
  const lastUci = () => {
    const m = game.history({ verbose: true }).at(-1);
    return m ? [m.from, m.to] : null;
  };

  const board = createBoard({
    orientation: me,
    dests: (sq) => (busy || over || waiting || game.turn() !== me ? [] : game.moves({ square: sq, verbose: true }).map((m) => m.to)),
    onMove: (uci) => myMove(uci),
  });

  const save = () => {
    const moves = game.history({ verbose: true }).map((m) => m.from + m.to + (m.promotion ?? ''));
    store.updateChess((c, now) => ({ ...c, current: { ...cur, moves: moves.join(' '), at: now } }));
  };
  const draw = (animate = true) => {
    board.set(game.fen(), { animate, last: lastUci(), check: checkSquare(game) });
    const list = moveList(game.history({ verbose: true }));
    fill(listBox, list.el);
    list.mark(game.history().length);
    listBox.scrollTop = listBox.scrollHeight;
    drawOpening();
    const mat = materialOf(game.fen());
    fill(topCaps, capsOf(mat, cpu));
    fill(bottomCaps, capsOf(mat, me));
  };
  const sound = (m) => chessSound(game.inCheck() ? 'check' : m.captured ? 'capture' : 'move');
  const uciOf = (m) => m.from + m.to + (m.promotion ?? '');

  async function engineReady() {
    engine ??= await getEngine();
    return engine;
  }
  const analyseNow = async () => (await engineReady()).analyse(game.fen(), { depth: 11 });
  const prepare = () => {
    pre = analyseNow();
    pre.catch(() => {});
  };

  // 跟教练下: 对手下一步想干什么, 有威胁就提醒 (假装轮到对手再走一步, 看引擎最想走哪步)
  async function warnThreat() {
    if (!coachMode || game.inCheck()) return;
    const parts = game.fen().split(' ');
    parts[1] = cpu;
    parts[3] = '-';
    const flipped = parts.join(' ');
    try {
      new Chess(flipped);
    } catch {
      return;
    }
    const e = await engineReady();
    const r = await e.analyse(flipped, { depth: 8 }).catch(() => null);
    if (!alive || !r?.best || game.turn() !== me || waiting) return;
    const mate = Math.abs(r.ev) >= MATE - 1000 ? MATE - Math.abs(r.ev) : 0;
    const mateForThem = mate && (r.ev > 0) === (cpu === 'w') ? mate : 0;
    // 吃了以后我能不能吃回来: 能吃回来、又不亏的不提醒
    const m = new Chess(flipped).move({ from: r.best.slice(0, 2), to: r.best.slice(2, 4), promotion: r.best[4] });
    let gain = 0;
    if (m.captured) {
      const after = new Chess(m.after);
      gain = VALUE[m.captured] - (after.isAttacked(m.to, me) ? VALUE[m.piece] : 0);
    }
    if (!mateForThem && gain < 2) return;
    const text = threatText(game.fen(), r.best, { mate: mateForThem });
    if (text) {
      panel.say(`${pickLine(lines('warn'))}${text}`, 'worried');
      board.arrows([{ from: m.from, to: m.to, tone: 'hint' }]);
    }
  }

  async function myMove(uci) {
    if (busy || over || waiting) return;
    const fen = game.fen();
    let m;
    try {
      m = game.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    } catch {
      return draw(false);
    }
    busy = true;
    board.arrows([]);
    board.badge(null);
    sound(m);
    draw();
    save();
    const before = await pre?.catch(() => null);
    if (!alive) return;
    if (game.isGameOver()) return finish();
    thinking.hidden = coachMode;
    const t0 = Date.now();
    const after = await analyseNow().catch(() => null);
    if (!alive) return;
    let said = false;
    if (before?.ev !== null && before?.ev !== undefined && after) {
      const legal = new Chess(fen).moves().length;
      const kind = classify({ before: before.ev, after: after.ev, turn: me, played: uci, best: before.best, legal, sac: sacrificeValue(fen, m.san) });
      // 下棋时棋盘上不贴好坏的图标 (v1.85.1, 用户说 chess.com 只有复盘时才有); 好坏只拿来让教练、对手说话
      const ply = game.history().length - 1;
      const facts = () => moveFacts({ m, kind, ply, before: before.ev, after: after.ev, best: before.best, reply: after.best, prev: game.history({ verbose: true }).at(-2) ?? null, book: bookList().at(-1) ?? null, them: '我' });
      if (coachMode) {
        // 你的每一步教练都说一句 (照 chess.com 的教练模式, v1.85.1): 按自己的性格讲这步做了什么, 走坏了说吃什么亏、该怎么走
        const line = coachLine(person, facts(), { mine: true, who: '你', whose: '我', seed: ply });
        if (kind === 'mistake' || kind === 'blunder' || kind === 'miss') {
          // 走错了: 教练讲为什么, 红箭头指出对方接下来怎么走 (照 chess.com 的教练模式), 等我挑收回还是接着下
          panel.say(line, MOOD[kind]);
          if (after.best) board.arrows([{ from: after.best.slice(0, 2), to: after.best.slice(2, 4), tone: 'danger' }]);
          thinking.hidden = true;
          const choice = await new Promise((resolve) => {
            waiting = resolve;
            fill(askBox, h('button', { class: 'btn primary', type: 'button', onclick: () => resolve('back') }, pickLine(person.back)), h('button', { class: 'btn', type: 'button', onclick: () => resolve('go') }, '就这样，接着下'));
            askBox.hidden = false;
          });
          waiting = null;
          askBox.hidden = true;
          if (!alive) return;
          if (choice === 'back') {
            game.undo();
            board.badge(null);
            draw();
            save();
            busy = false;
            pre = Promise.resolve(before);
            if (before.best) board.arrows([]);
            panel.say('好，再想一次。', 'smile');
            return;
          }
          board.arrows([]);
        } else panel.say(line, MOOD[kind]);
        said = true;
      } else {
        // 对手: 你走了好棋、走错了, 它说两句 (从它那边看: 你走好了它着急, 你走错了它高兴)
        if (kind === 'brilliant' || kind === 'great') (panel.say(pickLine(person.lines.good), kind === 'brilliant' ? 'shock' : 'worried'), (said = true));
        else if (kind === 'blunder' || kind === 'miss' || (kind === 'mistake' && Math.random() < 0.6)) (panel.say(pickLine(person.lines.bad), 'happy'), (said = true));
        else if (m.captured && VALUE[m.captured] >= 3 && Math.random() < 0.7) (panel.say(pickLine(person.lines.lost), 'worried'), (said = true));
      }
    }
    await cpuMove(t0, said);
  }

  async function cpuMove(t0 = Date.now(), said = false) {
    busy = true;
    thinking.hidden = false;
    board.lock(true);
    const e = await engineReady().catch(() => null);
    if (!e) {
      thinking.hidden = true;
      panel.say('引擎打不开，刷新一下试试。', 'worried');
      return;
    }
    const legal = game.moves({ verbose: true }).map((m) => ({ ...m, uci: uciOf(m) }));
    let uci = null;
    const book = coachMode ? null : bookMove(person.id, cpu, game.history());
    if (book) uci = legal.find((m) => m.san === book)?.uci ?? null;
    if (!uci) {
      try {
        if (params.full) uci = (await e.analyse(game.fen(), { depth: params.depth, movetime: params.movetime })).best;
        else {
          const a = await e.analyse(game.fen(), { depth: params.depth, multipv: params.multipv });
          uci = a ? pickMove({ cands: a.lines, legal, turn: cpu, params, style }) : null;
        }
      } catch {}
    }
    if (!alive) return;
    if (!uci && legal[0]) uci = legal[0].uci;
    await sleep(Math.max(0, 450 + Math.random() * 400 - (Date.now() - t0)));
    if (!alive) return;
    thinking.hidden = true;
    if (uci) {
      const m = game.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
      sound(m);
      draw();
      save();
      if (coachMode) {
        // 教练自己走完也说一句这步在干什么 (照 chess.com 的教练模式, v1.85.1; 上一句挪到上面的小气泡里)
        const ply = game.history().length - 1;
        const f = moveFacts({ m, kind: 'best', ply, prev: game.history({ verbose: true }).at(-2) ?? null, book: bookList().at(-1) ?? null, them: '你' });
        panel.say(coachLine(person, f, { mine: true, who: '我', whose: '你', seed: ply, plain: true }), game.isCheckmate() ? 'happy' : 'smile');
      } else if (!said) {
        if (m.captured && VALUE[m.captured] >= 3 && Math.random() < 0.6) panel.say(pickLine(person.lines.take), 'happy');
        else if (game.inCheck() && Math.random() < 0.5) panel.say(pickLine(person.lines.check), 'smile');
      }
    }
    if (game.isGameOver()) return finish();
    prepare();
    busy = false;
    board.lock(false);
    warnThreat();
  }

  async function finish(resigned = false) {
    over = true;
    busy = false;
    board.lock(true);
    thinking.hidden = true;
    askBox.hidden = true;
    let result = '1/2-1/2';
    let how = '和棋';
    if (resigned) {
      result = me === 'w' ? '0-1' : '1-0';
      how = '你认输了';
    } else if (game.isCheckmate()) {
      result = game.turn() === 'w' ? '0-1' : '1-0';
      how = '将死';
    } else if (game.isStalemate()) how = '逼和（没棋可走）';
    else if (game.isThreefoldRepetition()) how = '三次重复局面';
    else if (game.isInsufficientMaterial()) how = '子力不够将死';
    else if (game.isDrawByFiftyMoves()) how = '五十步没吃子没动兵';
    const iWon = result === (me === 'w' ? '1-0' : '0-1');
    const drawn = result === '1/2-1/2';
    const now = new Date();
    const them = `${person.name}（${coachMode ? '教练 · ' : ''}${cur.rating || '最强'}）`;
    game.setHeader('Event', coachMode ? '温故 · 跟教练下' : '温故 · 跟电脑下');
    game.setHeader('Site', '温故');
    game.setHeader('Date', `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, '0')}.${String(now.getDate()).padStart(2, '0')}`);
    game.setHeader('White', me === 'w' ? '你' : them);
    game.setHeader('Black', me === 'b' ? '你' : them);
    game.setHeader('Result', result);
    let id = null;
    let rated = null;
    // 我的分: 至少走了几步才算 (开局就认输的不算)
    const counted = game.history().length >= 6;
    const before = counted ? await myRating(store) : null;
    if (counted) rated = { old: before.rating, rating: nextRating(before.rating, before.games, cur.rating, iWon ? 1 : drawn ? 0.5 : 0) };
    const rec = game.history().length >= 2 ? gameRecord({ pgn: game.pgn(), src: 'cpu', me, rating: cur.rating, who: person.id, mode: cur.mode }) : null;
    if (rec) {
      id = rec.id;
      rec.date = dateText(Date.now());
    }
    store.updateChess((c, t) => ({
      ...c,
      current: null,
      games: rec ? { ...c.games, [rec.id]: rec } : c.games,
      elo: rated ? { rating: rated.rating, games: (before.games ?? 0) + 1, ...(before.cc ? { cc: 1 } : {}), at: t } : c.elo,
    }));
    const end = drawn ? lines('draw') : iWon ? lines('lose') : lines('win');
    panel.say(pickLine(end), drawn ? 'smile' : iWon ? (coachMode ? 'wow' : 'worried') : coachMode ? 'smile' : 'happy');
    const diffText = rated ? `你的分：${rated.old} → ${rated.rating}（${rated.rating >= rated.old ? '+' : ''}${rated.rating - rated.old}）` : '';
    fill(
      side,
      panel.el,
      h(
        'div',
        { class: `chess-over ${drawn ? 'draw' : iWon ? 'win' : 'lose'}` },
        h('strong', {}, drawn ? '和棋' : iWon ? '你赢了！' : '你输了'),
        h('span', { class: 'muted small' }, [how, diffText].filter(Boolean).join(' · ')),
        h(
          'div',
          { class: 'chess-over-btns' },
          id ? h('a', { class: 'btn primary', href: `#/chess/review/${encodeURIComponent(id)}` }, '复盘这盘棋') : null,
          // 网址跟现在一样, 用 go 才会重新画 (挑对手的页面)
          h('button', { class: 'btn', type: 'button', onclick: () => go(coachMode ? '#/chess/coach' : '#/chess/play') }, '再来一盘'),
        ),
      ),
      openName,
      listBox,
    );
  }

  const undo = async () => {
    const hist = () => game.history({ verbose: true });
    if (over || waiting || !hist().some((m) => m.color === me)) return;
    engine?.cancel();
    // 退掉电脑的最后一步 (有的话) 和我的最后一步, 回到上次轮到我走
    if (hist().at(-1)?.color !== me) game.undo();
    if (hist().at(-1)?.color === me) game.undo();
    board.arrows([]);
    board.badge(null);
    draw();
    save();
    busy = false;
    thinking.hidden = true;
    if (game.turn() !== me) return cpuMove();
    board.lock(false);
    prepare();
    panel.say(coachMode ? '好，重来这步。' : pickLine(person.lines.hi), 'normal');
  };
  const hint = async () => {
    if (busy || over || waiting || game.turn() !== me) return;
    const r = await (pre ?? analyseNow()).catch(() => null);
    if (!r?.best || !alive) return;
    const m = new Chess(game.fen()).move({ from: r.best.slice(0, 2), to: r.best.slice(2, 4), promotion: r.best[4] });
    board.arrows([{ from: m.from, to: m.to, tone: 'hint' }]);
    // 跟对手下: 提示不从对手嘴里说出来
    if (coachMode) panel.say(`试试 ${zhSan(m.san)}。`, 'smile');
    else toast(`提示：试试 ${zhSan(m.san)}`);
  };
  const resign = () => {
    if (over) return;
    if (!confirm('认输吗？')) return;
    engine?.cancel();
    waiting?.('go');
    finish(true);
  };

  const side = h(
    'div',
    { class: 'chess-side' },
    panel.el,
    askBox,
    h(
      'div',
      { class: 'chess-tools' },
      h('button', { class: 'btn', type: 'button', onclick: undo }, icon('undo', 18), '悔棋'),
      h('button', { class: 'btn', type: 'button', onclick: hint }, '💡 提示'),
      h('button', { class: 'btn', type: 'button', onclick: () => board.flip() }, '⇅ 翻转'),
      h('button', { class: 'btn', type: 'button', onclick: resign }, '🏳 认输'),
    ),
    openName,
    listBox,
  );

  draw(false);
  setTimeout(() => {
    if (!alive) return;
    if (!game.history().length) panel.say(pickLine(lines('hi')), 'smile');
    if (game.isGameOver()) return finish();
    if (game.turn() === cpu) cpuMove();
    else prepare();
  }, 200);

  return {
    title: coachMode ? '跟教练下' : '跟电脑下',
    el: h(
      'section',
      { class: 'chess-page chess-play' },
      h('a', { class: 'back', href: '#/chess' }, '← 国际象棋'),
      h('div', { class: 'chess-layout' }, h('div', { class: 'chess-board-col' }, top, board.el, bottom), side),
    ),
    cleanup: () => {
      alive = false;
      waiting?.('go');
      engine?.cancel();
      panel.stop();
    },
  };
}

// ---- 复盘 ---- (新的写在下面)
// v1.83 照 chess.com 的「对局回顾」加了: 好坏的图标、开局谱着、总结 (准确率、各种好坏几步、棋局等级、开局 / 战术 / 战略 / 残局)、
// 教练按自己的性格一步一步讲 (chessvoice.js) 还会念出来、走得不是最好的步按「正着」看该怎么走、分析时教练讲小知识。
const VOICE_KEY = 'wengu:chess-voice'; // 复盘时教练念不念出来 (这台设备上; 默认念)
const voiceOn = () => {
  try {
    return localStorage.getItem(VOICE_KEY) !== 'off';
  } catch {
    return true;
  }
};
const setVoiceOn = (on) => {
  try {
    localStorage.setItem(VOICE_KEY, on ? 'on' : 'off');
  } catch {}
};
// 这一页上点过、按过键没有: 浏览器要人动过才肯出声, 没动过就先不念 (不然一打开就弹「浏览器不让朗读」)
const userActed = () => globalThis.navigator?.userActivation?.hasBeenActive ?? true;

// 名字旁边吃掉的对方的子 (同一种叠在一起) 和多几分: mat 是 materialOf 的结果, c 是哪一方
function capsOf(mat, c) {
  const groups = [];
  for (const t of mat.took[c]) {
    if (groups.at(-1)?.t === t) groups.at(-1).n++;
    else groups.push({ t, n: 1 });
  }
  const other = c === 'w' ? 'b' : 'w';
  return [
    h(
      'span',
      { class: 'chess-caps', 'aria-label': mat.took[c].length ? `吃掉了${mat.took[c].map((t) => PIECE_ZH[t]).join('、')}` : '' },
      groups.map((x) => h('span', { class: 'chess-cap-group' }, Array.from({ length: x.n }, () => h('img', { src: PIECE_IMG(`${other}${x.t}`), alt: '' })))),
    ),
    mat.lead[c] > 0 ? h('span', { class: 'chess-lead' }, `+${mat.lead[c]}`) : null,
  ];
}

// 总结表里的棋手头像: 跟电脑下的对手用他的头像, 别的画一个兵
function playerAvatar(color, person, size = 44) {
  if (person) return faceSvg(person, { mood: 'smile', size });
  return h('span', { class: `chess-avatar ${color}`, style: `width:${size}px;height:${size}px` }, h('img', { src: PIECE_IMG(`${color}p`), alt: '' }));
}

function renderReview({ store, go }, id) {
  const g = store.data.chess?.games?.[id];
  const parsed = g && !g.gone ? readPgn(g.pgn) : null;
  if (!parsed) {
    return {
      title: '复盘',
      el: h('section', { class: 'chess-page' }, h('a', { class: 'back', href: '#/chess' }, '← 国际象棋'), h('p', {}, '找不到这盘棋（可能删掉了）。')),
    };
  }
  const moves = parsed.moves;
  const { fens } = positionsOf(moves);
  const me = g.me;
  const startTurn = moves[0].color;
  const coach = coachOf(store.data.chess?.coach?.id ?? DEFAULT_COACH);
  const tts = voiceOf(coach.id).tts ?? {};
  let alive = true;
  let engine = null;
  let review = g.review && g.review.ev.length === fens.length ? g.review : null;
  let judged = null;
  let book = null; // 每一步在不在开局谱上
  let ply = 0;
  let trying = null; // 试走、看正着: { game }
  let explaining = null; // 「解析」: { at 第几步, line 引擎想的几步 (chess.js 的走法), ev 打分, step 看到第几步 }
  let keys = []; // 「下一页」停的步 (keyMoments, 走法的下标)
  const pvCache = new Map(); // 解析过的步: 引擎算的结果 (这次打开复盘时留着, 再按不用重算)
  let skillMoves = []; // 每一步练到的技巧 (v1.85; 只有自己的步, 走坏了的不算)
  const skillState = () => store.data.chess?.skills ?? emptySkills();
  const claimKey = (i) => `${id}:${i}`;
  // 第 i 步现在算数的技巧: 这盘领过的, 或者开着、还没学会的
  const liveSkills = (i) => {
    const st = skillState();
    const open = openSkills(st);
    return (skillMoves[i] ?? []).filter((sid) => skillClaimed(st, sid, claimKey(i)) || (open.has(sid) && !st.mastered[sid]));
  };
  let said = ''; // 教练刚说的话 (开念出来时补念)
  let triviaTimer = 0;

  const nameOf = (c) => (c === me ? '你' : me ? '对手' : c === 'w' ? '白方' : '黑方');
  const whiteName = g.src === 'cpu' ? (g.me === 'w' ? '你' : personOf(g.who).name) : g.white || '白方';
  const blackName = g.src === 'cpu' ? (g.me === 'b' ? '你' : personOf(g.who).name) : g.black || '黑方';
  const personFor = (c) => (g.src === 'cpu' && g.me !== c ? personOf(g.who) : null);
  // 两边平常大约多少分 (算棋局等级时往这个分靠): 跟电脑下的, 对手是他的分 (最强的算 2900), 你是你现在的分; 别的看棋谱里写的分
  const priorOf = (c) => {
    if (g.src === 'cpu') return c === g.me ? store.data.chess?.elo?.rating || START_RATING : g.rating || 2900;
    return Number(parsed.headers[c === 'w' ? 'WhiteElo' : 'BlackElo']) || 0;
  };

  // 念出来的开关 (气泡右上角)
  const voiceBtn = h('button', { type: 'button', class: 'chess-voice-btn', onclick: () => toggleVoice() });
  const drawVoiceBtn = () => {
    const on = voiceOn();
    voiceBtn.replaceChildren(icon(on ? 'volume' : 'mute', 18));
    voiceBtn.setAttribute('aria-label', on ? '教练正在念，点了不念' : '教练不念，点了念出来');
    voiceBtn.title = on ? '不念' : '念出来';
  };
  drawVoiceBtn();
  const panel = coachPanel(coach, { size: 84, cls: 'review', tools: canSpeak() ? voiceBtn : null });

  function talk(text, mood = null) {
    said = text;
    panel.say(text, mood);
    if (voiceOn() && canSpeak() && userActed()) speak(speakable(text), 'zh-CN', tts);
  }
  function toggleVoice() {
    setVoiceOn(!voiceOn());
    drawVoiceBtn();
    if (voiceOn()) {
      if (said) speak(speakable(said), 'zh-CN', tts);
    } else stopSpeaking();
  }

  const evalFill = h('div', { class: 'chess-eval-fill' });
  const evalNum = h('span', { class: 'chess-eval-num' });
  const evalBar = h('div', { class: 'chess-eval', 'aria-hidden': 'true' }, evalFill, evalNum);
  const board = createBoard({
    orientation: me || 'w',
    dests: (sq) => {
      if (!review || explaining) return [];
      const gm = trying?.game ?? new Chess(fens[ply]);
      if (gm.isGameOver()) return [];
      return gm.moves({ square: sq, verbose: true }).map((m) => m.to);
    },
    onMove: (uci) => tryMove(uci),
  });
  const boardWrap = h('div', { class: 'chess-board-wrap' }, evalBar, board.el);
  // 棋盘上下的名字栏: 头像、名字、吃掉的对方的子、子力多几分 (照 chess.com; 翻转棋盘时上下换)
  const topBar = h('div', { class: 'chess-bar' });
  const bottomBar = h('div', { class: 'chess-bar' });
  let shownFen = fens[0];
  function drawBars(fen = shownFen) {
    shownFen = fen;
    const mat = materialOf(fen);
    const bar = (c) => [playerAvatar(c, personFor(c), 30), h('span', { class: 'chess-bar-name' }, c === 'w' ? whiteName : blackName), ...capsOf(mat, c)];
    const down = board.orientation();
    fill(bottomBar, bar(down));
    fill(topBar, bar(down === 'w' ? 'b' : 'w'));
  }
  const setBoard = (fen, opts) => {
    board.set(fen, opts);
    drawBars(fen);
  };
  const info = h('div', { class: 'chess-info' });
  const graphBox = h('div', { class: 'chess-graph-box' });
  const listBox = h('div', { class: 'chess-moves-box' });
  const side = h('div', { class: 'chess-side' }, panel.el, info, listBox, graphBox);
  let list = null;

  const setEval = (ev) => {
    const w = winPct(ev);
    evalFill.style.height = `${w}%`;
    evalNum.textContent = evalText(ev);
    evalBar.classList.toggle('black-ahead', w < 50);
  };

  // 气泡最上面一行: 图标 + 这步 + 好坏 (开局谱着写开局名) + 打分
  const headRow = (kind, mv, ev, extra = '') => {
    const k = kindOf(kind);
    return h(
      'div',
      { class: `chess-head-row ck-${k.key}` },
      kindIcon(k.key, 22),
      h('strong', {}, mv),
      h('span', { class: 'chess-head-kind' }, extra || k.name),
      ev === null ? null : h('span', { class: `chess-head-ev${ev < 0 ? ' neg' : ''}` }, evalText(ev)),
    );
  };

  // 这一步的说明 (教练讲的、正着按钮要用)
  function factsAt(p) {
    const m = moves[p - 1];
    const mover = m.color;
    return moveFacts({
      m,
      kind: judged[p - 1].kind,
      ply: p - 1,
      before: review.ev[p - 1],
      after: review.ev[p],
      best: review.bm[p - 1],
      reply: review.bm[p] ?? '',
      prev: moves[p - 2] ?? null,
      book: book?.[p - 1] ?? null,
      them: nameOf(mover === 'w' ? 'b' : 'w'),
    });
  }

  // 走到第 p 步 (0: 开局, 显示总结)
  function show(p, { animate = true } = {}) {
    trying = null;
    explaining = null;
    ply = Math.max(0, Math.min(moves.length, p));
    const m = moves[ply - 1];
    const gm = new Chess(fens[ply]);
    setBoard(fens[ply], { animate, last: m ? [m.from, m.to] : null, check: checkSquare(gm) });
    list?.mark(ply);
    graph?.mark(ply);
    side.classList.toggle('is-summary', ply === 0 && Boolean(review));
    if (!review) return;
    setEval(review.ev[ply]);
    if (ply === 0) {
      board.badge(null);
      board.arrows([]);
      drawSummary();
      return;
    }
    if (graph) graphBox.append(graph.svg);
    const j = judged[ply - 1];
    board.badge(m.to, j.kind, ply === moves.length ? endMarks() : []);
    const f = factsAt(ply);
    const played = m.from + m.to + (m.promotion ?? '');
    const best = review.bm[ply - 1];
    const arrows = [];
    if (BAD.has(j.kind) && best && best !== played) arrows.push({ from: best.slice(0, 2), to: best.slice(2, 4), tone: 'best' });
    board.arrows(arrows);
    const mover = m.color;
    const mine = !me || mover === me;
    const punish = !mine && BAD.has(j.kind) ? punishFacts(m.after, review.bm[ply] ?? '', review.ev[ply], me, nameOf(mover)) : null;
    let mood = MOOD[j.kind];
    if (!mine) mood = BAD.has(j.kind) ? 'happy' : j.kind === 'brilliant' || j.kind === 'great' ? 'hmm' : 'normal';
    panel.setHead(headRow(j.kind, zhSan(m.san), review.ev[ply], j.kind === 'book' && j.open ? `开局谱 · ${j.open}` : ''));
    talk(coachLine(coach, f, { mine, who: nameOf(mover), whose: nameOf(mover === 'w' ? 'b' : 'w'), punish, seed: ply }), mood);
    const canBest = f.best && !['best', 'book', 'forced', 'brilliant', 'great'].includes(j.kind);
    const atEnd = ply >= moves.length;
    // 技巧: 走到这步就领分 (没开的、学会了的、这盘领过的不加)
    const got = claimAt(ply - 1);
    for (const x of got) board.pop(m.to, h('span', { class: 'cb-pop' }, skillIcon(16), '+1'));
    const master = got.find((x) => x.mastered);
    if (master) {
      const v = voiceOf(coach.id);
      const sk = skillOf(master.id);
      const next = master.unlocked ? skillOf(master.unlocked) : null;
      talk(`${fillLine(pickLine(v.mastered, (ply % 10) / 10), { skill: sk.name })}${next ? fillLine(pickLine(v.unlocked, 0), { skill: next.name }) : ''}`, 'wow');
      showMastery(sk, next);
      refreshSkills();
    }
    const skillRows = [...new Set([...got.map((x) => x.id), ...liveSkills(ply - 1)])].map((sid) => skillRow(sid));
    fill(
      info,
      h(
        'div',
        { class: 'chess-nav chess-move-tools' },
        canBest ? h('button', { class: 'btn', type: 'button', onclick: () => showBest(f) }, kindIcon('best', 18), '正着') : null,
        h('button', { class: 'btn', type: 'button', onclick: () => explain() }, icon('bulb', 18), '解析'),
        atEnd ? null : h('button', { class: 'btn primary chess-next', type: 'button', onclick: () => nextKey() }, '下一页', icon('right', 18)),
      ),
      // 最后一步: 回到总结、再下一盘 (照 chess.com 终局的样子)
      atEnd
        ? h(
            'div',
            { class: 'chess-nav chess-end-tools' },
            h('button', { class: 'btn', type: 'button', onclick: () => show(0) }, icon('left', 18), '回到总结'),
            h('button', { class: 'btn primary', type: 'button', onclick: () => go(g.mode === 'coach' ? '#/chess/coach' : '#/chess/play') }, '新棋局'),
          )
        : null,
      ...skillRows,
      h('div', { class: 'muted small chess-move-at' }, `第 ${Math.ceil(ply / 2)} 回合 · ${nameOf(mover)}走`),
    );
  }

  // 终局两个王上贴的标记: 赢的皇冠, 输的「#」(被将死) 或小白旗 (认输、超时), 和棋两边「½」; 没下完的不贴
  function endMarks() {
    if (!['1-0', '0-1', '1/2-1/2'].includes(g.result)) return [];
    const gm = new Chess(fens[moves.length]);
    const sq = (c) => gm.findPiece({ type: 'k', color: c })[0];
    if (g.result === '1/2-1/2') return ['w', 'b'].map((c) => ({ sq: sq(c), node: endIcon('draw') }));
    const win = g.result === '1-0' ? 'w' : 'b';
    const lose = win === 'w' ? 'b' : 'w';
    return [
      { sq: sq(win), node: endIcon('win') },
      { sq: sq(lose), node: endIcon(gm.isCheckmate() ? 'mated' : 'lost') },
    ];
  }

  // ---- 技巧 (v1.85) ----
  function claimAt(i) {
    let st = skillState();
    const out = [];
    for (const sid of skillMoves[i] ?? []) {
      const r = claimSkill(st, sid, claimKey(i));
      if (!r.got) continue;
      st = r.state;
      out.push({ id: sid, mastered: r.mastered, unlocked: r.unlocked });
    }
    if (out.length) store.updateChess((c) => ({ ...c, skills: st }));
    return out;
  }
  // 一个技巧的进度: 图标、名字、进度条、几分 (点了打开技巧页)
  function skillRow(sid) {
    const sk = skillOf(sid);
    const st = skillState();
    const pts = skillPoints(st, sid);
    const done = Boolean(st.mastered[sid]);
    return h(
      'button',
      { type: 'button', class: `chess-skill-row${done ? ' done' : ''}`, onclick: () => skillsDialog(store, sid) },
      skillIcon(26),
      h('strong', {}, sk.name),
      h('span', { class: 'chess-skill-bar' }, h('span', { style: `width:${Math.min(100, (pts / sk.need) * 100)}%` })),
      h('span', { class: 'chess-skill-n' }, done ? '学会了' : `${pts} / ${sk.need}`),
    );
  }
  // 学会了: 棋盘上盖一层「学会了一个技巧！」, 点「继续」收起来
  function showMastery(sk, next) {
    boardWrap.querySelector('.chess-master')?.remove();
    const layer = h(
      'div',
      { class: 'chess-master', role: 'dialog', 'aria-label': '学会了一个技巧' },
      h(
        'div',
        { class: 'chess-master-card' },
        skillIcon(72),
        h('strong', {}, '学会了一个技巧！'),
        h('span', { class: 'chess-master-name' }, sk.name),
        next ? h('span', { class: 'muted small' }, `下一个：${next.name}`) : null,
        h('button', { class: 'btn primary', type: 'button', onclick: () => layer.remove() }, '继续'),
      ),
    );
    boardWrap.append(layer);
  }
  // 走子列表的技巧小图标、「下一页」停的步 (学会一个技巧以后要重新算: 下一个技巧开了)
  function refreshSkills() {
    const marks = new Set(skillMoves.map((_, i) => i).filter((i) => liveSkills(i).length));
    keys = [...new Set([...keyMoments(moves, judged, me), ...marks])].sort((a, b) => a - b);
    list = moveList(moves, { judged, onPick: (p) => show(p), skills: marks });
    fill(listBox, list.el);
    list.mark(ply);
  }

  // 「下一页」: 跳到下一个关键的步 (keyMoments); 后面没有了到最后一步, 最后一步再按回到总结
  function nextKey() {
    const i = keys.find((k) => k >= ply);
    if (i !== undefined) show(i + 1);
    else if (ply < moves.length) show(moves.length);
    else show(0);
  }

  // 「解析」: 回到这步之前, 把引擎想的那几步 (最多 6 步, 第一步就是该走的那步) 一步一步走出来, 教练每步讲一句
  async function explain() {
    const at = ply;
    explaining = { at, line: null, ev: 0, step: 0 };
    trying = null;
    board.badge(null);
    board.arrows([]);
    const before = fens[at - 1];
    setBoard(before, { animate: false, last: moves[at - 2] ? [moves[at - 2].from, moves[at - 2].to] : null, check: checkSquare(new Chess(before)) });
    panel.setHead(h('div', { class: 'chess-head-row ck-great' }, icon('bulb', 20), h('span', { class: 'chess-head-kind' }, '解析')));
    talk(pickLine(voiceOf(coach.id).thinking, Math.random()), 'hmm');
    fill(info, h('div', { class: 'chess-nav chess-move-tools' }, h('button', { class: 'btn', type: 'button', onclick: () => show(at) }, '回到棋局')));
    let r = pvCache.get(at);
    if (!r) {
      try {
        engine ??= await getEngine();
        r = await engine.analyse(before, { depth: 14, movetime: 3000 });
      } catch {
        r = null;
      }
      if (!alive || explaining?.at !== at) return;
      if (!r?.pv?.length) {
        talk('引擎出了点问题，再按一次试试。', 'worried');
        return;
      }
      pvCache.set(at, r);
    }
    const gm = new Chess(before);
    const line = [];
    for (const uci of r.pv.slice(0, 6)) {
      try {
        line.push(gm.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }));
      } catch {
        break;
      }
      if (gm.isGameOver()) break;
    }
    if (!line.length) return show(at);
    explaining = { at, line, ev: r.ev, step: 0 };
    setTimeout(() => alive && explaining?.line === line && lineStep(0), 250);
  }

  // 解析里第 k 步以后的打分: 有杀棋的照步数倒数 (只算了开头那个局面, 后面的局面不再让引擎算)
  const lineEv = (L, k) => {
    const n = mateIn(L.ev);
    if (!n) return L.ev;
    const winner = n > 0 ? 'w' : 'b';
    const left = Math.abs(n) - L.line.slice(0, k + 1).filter((m) => m.color === winner).length;
    return Math.sign(n) * (MATE - Math.max(0, left));
  };

  function lineStep(k) {
    const L = explaining;
    if (!L?.line) return;
    k = Math.max(0, Math.min(L.line.length - 1, k));
    const back = k < L.step;
    L.step = k;
    const m = L.line[k];
    const after = new Chess(m.after);
    if (back) setBoard(m.before, { animate: false });
    setBoard(m.after, { animate: true, last: [m.from, m.to], check: checkSquare(after) });
    board.badge(null);
    board.arrows([]);
    chessSound(after.inCheck() ? 'check' : m.captured ? 'capture' : 'move');
    const evAfter = lineEv(L, k);
    setEval(evAfter);
    const them = nameOf(m.color === 'w' ? 'b' : 'w');
    const f = moveFacts({ m, kind: 'best', ply: L.at - 1 + k, before: k ? lineEv(L, k - 1) : L.ev, after: evAfter, prev: k ? L.line[k - 1] : moves[L.at - 2] ?? null, them });
    const v = voiceOf(coach.id);
    const last = k === L.line.length - 1;
    const text = `${k === 0 ? pickLine(v.lineStart, (L.at % 10) / 10) : ''}${coachLine(coach, f, { mine: true, who: nameOf(m.color), whose: them, seed: L.at + k, plain: true })}${last ? pickLine(v.lineEnd, (L.at % 10) / 10) : ''}`;
    panel.setHead(h('div', { class: 'chess-head-row ck-great' }, icon('bulb', 20), h('span', { class: 'chess-head-kind' }, '解析'), h('strong', {}, zhSan(m.san)), h('span', { class: `chess-head-ev${evAfter < 0 ? ' neg' : ''}` }, evalText(evAfter))));
    talk(text, k === 0 ? 'smile' : 'normal');
    // 引擎想的那几步: 1. d4 d5 2. c4 …, 点了跳到那一步
    const steps = L.line.map((x, i) => {
      const n = Math.floor((L.at - 1 + i + (startTurn === 'b' ? 1 : 0)) / 2) + 1;
      const num = x.color === 'w' ? `${n}.` : i === 0 ? `${n}…` : '';
      return h('button', { type: 'button', class: `chess-line-mv${i === k ? ' on' : ''}`, onclick: () => lineStep(i) }, num ? h('span', { class: 'muted' }, num) : null, zhSan(x.san));
    });
    fill(
      info,
      h(
        'div',
        { class: 'chess-nav chess-move-tools' },
        h('button', { class: 'btn', type: 'button', 'aria-label': '解析：上一步', disabled: k === 0, onclick: () => lineStep(k - 1) }, icon('left', 18)),
        h('button', { class: `btn${last ? '' : ' primary'}`, type: 'button', 'aria-label': '解析：下一步', disabled: last, onclick: () => lineStep(k + 1) }, icon('right', 18)),
        h('button', { class: `btn${last ? ' primary' : ''}`, type: 'button', onclick: () => show(L.at) }, icon('check', 18), '明白了！'),
      ),
      h('div', { class: 'chess-line' }, steps),
    );
  }

  // 「正着」: 回到这步之前, 把引擎最想走的那步走出来
  function showBest(f) {
    const before = fens[ply - 1];
    const best = review.bm[ply - 1];
    const gm = new Chess(before);
    let m;
    try {
      m = gm.move({ from: best.slice(0, 2), to: best.slice(2, 4), promotion: best[4] });
    } catch {
      return;
    }
    trying = { game: gm };
    setBoard(before, { animate: false, last: moves[ply - 2] ? [moves[ply - 2].from, moves[ply - 2].to] : null });
    setTimeout(() => {
      if (!alive || trying?.game !== gm) return;
      chessSound(gm.inCheck() ? 'check' : m.captured ? 'capture' : 'move');
      setBoard(gm.fen(), { last: [m.from, m.to], check: checkSquare(gm) });
      board.badge(m.to, 'best');
      board.arrows([{ from: m.from, to: m.to, tone: 'best' }]);
    }, 260);
    panel.setHead(headRow('best', zhSan(m.san), null, '正着'));
    talk(bestLine(coach, f, ply), 'smile');
    fill(info, h('div', { class: 'chess-nav chess-move-tools' }, h('button', { class: 'btn primary', type: 'button', onclick: () => show(ply) }, '回到棋局')));
  }

  const nextBad = () => {
    for (let i = ply; i < moves.length; i++) if (BAD.has(judged[i].kind) && (!me || moves[i].color === me)) return show(i + 1);
    toast('后面没有失误了');
  };
  // 一步一步看的按钮: 放在棋盘下面 (手机上不用往下翻)
  const navRow = h(
    'div',
    { class: 'chess-nav chess-steps' },
    h('button', { class: 'btn', type: 'button', 'aria-label': '开头', onclick: () => show(0) }, '⏮'),
    h('button', { class: 'btn', type: 'button', 'aria-label': '上一步', onclick: () => show(ply - 1) }, '◀'),
    h('button', { class: 'btn primary', type: 'button', 'aria-label': '下一步', onclick: () => show(ply + 1) }, '▶'),
    h('button', { class: 'btn', type: 'button', 'aria-label': '最后', onclick: () => show(moves.length) }, '⏭'),
    h('button', { class: 'btn', type: 'button', onclick: () => nextBad() }, me ? '下一个失误' : '下一个错'),
    h(
      'button',
      {
        class: 'btn',
        type: 'button',
        'aria-label': '翻转棋盘',
        title: '翻转棋盘',
        onclick: () => {
          board.flip();
          drawBars();
        },
      },
      '⇅',
    ),
  );

  // 总结: 教练一两句话、局势曲线、双方的准确率、各种好坏几步、棋局等级、四个方面
  function drawSummary() {
    const acc = { w: gameAccuracy(review.ev, 'w', startTurn), b: gameAccuracy(review.ev, 'b', startTurn) };
    const counts = countKinds(moves, judged);
    const turning = turningPoint(judged);
    const rating = { w: gameRating(moves, review, judged, 'w', priorOf('w')), b: gameRating(moves, review, judged, 'b', priorOf('b')) };
    const grades = { w: areaGrades(moves, review, judged, 'w'), b: areaGrades(moves, review, judged, 'b') };
    const badN = me ? ['mistake', 'blunder', 'miss'].reduce((n, k) => n + (counts[me][k] ?? 0), 0) : 0;
    const skillTotal = skillMoves.reduce((n, _, i) => n + liveSkills(i).length, 0);
    panel.setHead(null);
    const mood = me && acc[me] !== null ? (acc[me] >= 85 ? 'happy' : acc[me] >= 65 ? 'smile' : 'hmm') : 'smile';
    talk(summaryLine(coach, { acc, me, result: g.result, grades, bad: badN, turning, seed: moves.length }), mood);
    const col = (c, node) => h('div', { class: `chess-sum-cell ${c}${c === me ? ' me' : ''}` }, node);
    const row = (label, w, mid, b, cls = '') => h('div', { class: `chess-sum-row ${cls}` }, h('div', { class: 'chess-sum-label' }, label), col('w', w), h('div', { class: 'chess-sum-mid' }, mid), col('b', b));
    const num = (x) => h('span', { class: 'chess-sum-box' }, x === null || x === undefined ? '—' : String(x));
    const grade = (k) => (k ? kindIcon(k, 26) : h('span', { class: 'muted' }, '—'));
    const table = h(
      'div',
      { class: 'chess-sum' },
      row('', h('div', { class: 'chess-sum-player' }, playerAvatar('w', personFor('w')), h('span', {}, whiteName)), null, h('div', { class: 'chess-sum-player' }, playerAvatar('b', personFor('b')), h('span', {}, blackName)), 'players'),
      row('准确率', num(acc.w === null ? null : acc.w.toFixed(1)), null, num(acc.b === null ? null : acc.b.toFixed(1)), 'big'),
      me ? row('技巧', me === 'w' ? h('span', { class: 'chess-sum-n ck-skill' }, `+${skillTotal}`) : h('span', { class: 'muted' }, '—'), skillIcon(22), me === 'b' ? h('span', { class: 'chess-sum-n ck-skill' }, `+${skillTotal}`) : h('span', { class: 'muted' }, '—'), 'kind skill') : null,
      ...KINDS.filter((k) => k.key !== 'forced').map((k) => {
        const w = counts.w[k.key] ?? 0;
        const b = counts.b[k.key] ?? 0;
        return row(k.name, h('span', { class: `chess-sum-n ck-${k.key}` }, w), kindIcon(k.key, 22), h('span', { class: `chess-sum-n ck-${k.key}` }, b), w + b ? 'kind' : 'kind zero');
      }),
      row('棋局等级', num(rating.w), null, num(rating.b), 'big rating'),
      ...AREAS.map((a) => row(a.name, grade(grades.w[a.key]), null, grade(grades.b[a.key]), 'area')),
    );
    fill(
      info,
      graph ? h('div', { class: 'chess-graph-box' }, graph.svg) : null,
      table,
      h(
        'div',
        { class: 'chess-nav chess-sum-go' },
        h('button', { class: 'btn primary chess-start-review', type: 'button', onclick: () => nextKey() }, '开始回顾'),
      ),
      h(
        'div',
        { class: 'chess-nav chess-sum-more' },
        h('button', { class: 'btn', type: 'button', onclick: () => show(1) }, '从第一步看起'),
        turning !== null ? h('button', { class: 'btn', type: 'button', onclick: () => show(turning + 1) }, '看最关键的一步') : null,
      ),
    );
  }

  // 试走: 在复盘的棋盘上自己走一步, 引擎看看好不好
  async function tryMove(uci) {
    const base = trying?.game ?? new Chess(fens[ply]);
    const fen = base.fen();
    let m;
    try {
      m = base.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    } catch {
      return;
    }
    trying = { game: base };
    chessSound(base.inCheck() ? 'check' : m.captured ? 'capture' : 'move');
    setBoard(base.fen(), { last: [m.from, m.to], check: checkSquare(base) });
    board.arrows([]);
    board.badge(null);
    panel.setHead(null);
    fill(info, h('div', { class: 'chess-info-row' }, h('span', { class: 'chess-kind' }, '试走'), h('span', { class: 'muted small' }, `${zhSan(m.san)}，引擎在看……`)), h('div', { class: 'chess-nav' }, h('button', { class: 'btn primary', type: 'button', onclick: () => show(ply) }, '回到棋局')));
    const e = engine ?? (engine = await getEngine());
    const [b, a] = await Promise.all([e.analyse(fen, { depth: 12 }), base.isGameOver() ? Promise.resolve(null) : e.analyse(base.fen(), { depth: 12 })]);
    if (!alive || trying?.game !== base || !b) return;
    const afterEv = base.isCheckmate() ? (base.turn() === 'w' ? -MATE : MATE) : base.isGameOver() ? 0 : a?.ev ?? b.ev;
    const kind = classify({ before: b.ev, after: afterEv, turn: m.color, played: uci, best: b.best, legal: new Chess(fen).moves().length, sac: sacrificeValue(fen, m.san) });
    board.badge(m.to, kind);
    if (a?.best) board.arrows([{ from: a.best.slice(0, 2), to: a.best.slice(2, 4), tone: 'move' }]);
    setEval(afterEv);
    const f = moveFacts({ m, kind, ply: 20, before: b.ev, after: afterEv, best: b.best, reply: a?.best ?? '', them: '对手' });
    panel.setHead(headRow(kind, zhSan(m.san), afterEv, `试走：${kindOf(kind).name}`));
    talk(coachLine(coach, f, { mine: true, who: '你', whose: '对手', seed: Date.now() % 10 }), MOOD[kind]);
    fill(info, h('div', { class: 'chess-nav' }, h('button', { class: 'btn primary', type: 'button', onclick: () => show(ply) }, '回到棋局')));
  }

  // 局势曲线: 白方胜率, 点了跳到那一步; 好棋、走坏了的地方有点
  let graph = null;
  function drawGraph() {
    const W = 600;
    const H = 90;
    const n = Math.max(1, review.ev.length - 1);
    const pts = review.ev.map((ev, i) => [(i / n) * W, H - (winPct(ev) / 100) * H]);
    const area = `M0 ${H} ${pts.map(([x, y]) => `L${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')} L${W} ${H} Z`;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('class', 'chess-graph');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', '局势曲线');
    const DOTS = new Set(['brilliant', 'great', 'mistake', 'miss', 'blunder']);
    const dots = judged.map((j, i) => (DOTS.has(j.kind) ? `<circle class="ck-dot ck-${j.kind}" cx="${pts[i + 1][0].toFixed(1)}" cy="${pts[i + 1][1].toFixed(1)}" r="4" vector-effect="non-scaling-stroke"/>` : '')).join('');
    // 只有写死的图形和算出来的数字
    svg.innerHTML = `<rect class="chess-graph-bg" x="0" y="0" width="${W}" height="${H}"/><path class="chess-graph-area" d="${area}"/><line class="chess-graph-mid" x1="0" y1="${H / 2}" x2="${W}" y2="${H / 2}"/><line class="chess-graph-now" x1="0" y1="0" x2="0" y2="${H}"/>${dots}`;
    const now = svg.querySelector('.chess-graph-now');
    svg.addEventListener('click', (e) => {
      const r = svg.getBoundingClientRect();
      show(Math.round(((e.clientX - r.left) / r.width) * n));
    });
    graph = {
      svg,
      mark(p) {
        const x = (p / n) * W;
        now.setAttribute('x1', String(x));
        now.setAttribute('x2', String(x));
      },
    };
  }

  // 还没复盘: 让引擎一个局面一个局面看; 教练先说一句, 然后隔一会儿讲一个小知识
  async function analyse() {
    const progress = h('div', { class: 'chess-progress' }, h('div', { class: 'chess-progress-fill' }));
    const note = h('span', { class: 'muted small' }, '');
    fill(info, h('div', { class: 'chess-analysing' }, progress, note));
    talk(fillLine(pickLine(voiceOf(coach.id).analyse, Math.random()), { n: moves.length }), 'hmm');
    panel.face.el.classList.add('cf-thinking');
    // 头一个小知识 4 秒后讲, 以后 9 秒一个
    let tip = Math.floor(Math.random() * TRIVIA.length);
    const nextTip = (ms) => {
      triviaTimer = setTimeout(() => {
        if (!alive) return;
        talk(triviaLine(coach, tip++), 'smile');
        nextTip(9000);
      }, ms);
    };
    nextTip(4000);
    try {
      engine ??= await getEngine();
    } catch {
      clearTimeout(triviaTimer);
      talk('引擎打不开，刷新一下试试。', 'worried');
      return;
    }
    const ev = [];
    const bm = [];
    const ev2 = [];
    const depth = 13;
    for (let i = 0; i < fens.length; i++) {
      const gm = new Chess(fens[i]);
      if (gm.isGameOver()) {
        ev.push(gm.isCheckmate() ? (gm.turn() === 'w' ? -MATE : MATE) : 0);
        bm.push('');
        ev2.push(null);
      } else {
        const r = await engine.analyse(fens[i], { depth, multipv: 2, movetime: 2500 }).catch(() => null);
        if (!alive) return;
        if (!r || r.ev === null) {
          clearTimeout(triviaTimer);
          talk('引擎出了点问题，刷新一下再试。', 'worried');
          return;
        }
        ev.push(r.ev);
        bm.push(r.best);
        ev2.push(r.ev2);
      }
      progress.firstChild.style.width = `${((i + 1) / fens.length) * 100}%`;
      note.textContent = `${i + 1} / ${fens.length}`;
    }
    clearTimeout(triviaTimer);
    review = { depth, ev, bm, ev2 };
    store.updateChess((c, now) => ({ ...c, games: { ...c.games, [id]: { ...c.games[id], review, at: now } } }));
    panel.face.el.classList.remove('cf-thinking');
    ready();
  }

  async function ready() {
    // 开局谱: 第一次复盘时才下载 (80 KB); 下载不了就当没有开局谱着
    book = await loadBook()
      .then((b) => bookMoves(b, fens))
      .catch(() => null);
    if (!alive) return;
    judged = judgeGame(moves, review, { book });
    skillMoves = moves.map((m, i) => (me && m.color === me ? skillsOfMove(m, { i, prev: moves[i - 1] ?? null, bad: BAD.has(judged[i].kind) }) : []));
    refreshSkills();
    drawGraph();
    show(0, { animate: false });
  }

  const onKey = (e) => {
    if (e.target.closest?.('input, textarea, [contenteditable]') || document.querySelector('dialog[open]')) return;
    if (explaining?.line) {
      // 解析时: 左右键在引擎想的那几步里走, Esc 回到棋局
      if (e.key === 'ArrowLeft') lineStep(explaining.step - 1);
      else if (e.key === 'ArrowRight') lineStep(explaining.step + 1);
      else if (e.key === 'Escape') show(explaining.at);
      else return;
      e.preventDefault();
      return;
    }
    if (e.key === 'ArrowLeft') show(ply - 1);
    else if (e.key === 'ArrowRight') show(ply + 1);
    else return;
    e.preventDefault();
  };
  document.addEventListener('keydown', onKey);

  setBoard(fens[0], { animate: false });
  if (review) setTimeout(() => alive && ready(), 0);
  else {
    list = moveList(moves, { onPick: (p) => show(p) });
    fill(listBox, list.el);
    setTimeout(() => alive && analyse(), 100);
  }

  const res = resultText(g.result, me);
  return {
    title: '复盘',
    el: h(
      'section',
      { class: 'chess-page chess-review' },
      h('a', { class: 'back', href: '#/chess' }, '← 国际象棋'),
      h(
        'div',
        { class: 'chess-review-head' },
        h('h1', {}, `${whiteName} 对 ${blackName}`),
        h('span', { class: 'muted small' }, [res, g.date].filter(Boolean).join(' · ')),
        g.url ? h('a', { class: 'small', href: g.url, target: '_blank', rel: 'noopener' }, '在 chess.com 打开') : null,
        h('button', { class: 'btn chess-skills-btn', type: 'button', onclick: () => skillsDialog(store) }, skillIcon(18), '技巧'),
      ),
      h('div', { class: 'chess-layout' }, h('div', { class: 'chess-board-col' }, topBar, boardWrap, bottomBar, navRow), side),
    ),
    cleanup: () => {
      alive = false;
      clearTimeout(triviaTimer);
      engine?.cancel();
      panel.stop();
      stopSpeaking();
      document.removeEventListener('keydown', onKey);
    },
  };
}

// ---- 技巧页 (v1.85): 五类, 每个技巧的进度; 点一个看说明和一张小棋盘 (摆好的例子, 箭头指着该走的那步) ----
function skillsDialog(store, focus = null) {
  const st = store.data.chess?.skills ?? emptySkills();
  const open = openSkills(st);
  const body = h('div', { class: 'chess-skills' });
  let timer = 0;
  const stateText = (s) => (st.mastered[s.id] ? '学会了' : open.has(s.id) ? `${skillPoints(st, s.id)} / ${s.need}` : '还没解锁');

  function listView() {
    clearTimeout(timer);
    fill(
      body,
      h('p', { class: 'muted small chess-skills-note' }, '复盘自己的棋时领分，学会一个开下一个。'),
      SKILL_CATS.map((c) =>
        h(
          'section',
          { class: 'chess-skill-cat' },
          h('h3', {}, c.name),
          h(
            'div',
            { class: 'chess-skill-list' },
            SKILLS.filter((s) => s.cat === c.key).map((s) => {
              const done = Boolean(st.mastered[s.id]);
              const isOpen = open.has(s.id);
              const pts = skillPoints(st, s.id);
              return h(
                'button',
                { type: 'button', class: `chess-skill${done ? ' done' : ''}${isOpen ? '' : ' locked'}`, onclick: () => detail(s) },
                skillIcon(32, { locked: !isOpen }),
                h('span', { class: 'chess-skill-text' }, h('strong', {}, s.name), h('span', { class: 'muted small' }, stateText(s))),
                isOpen && !done ? h('span', { class: 'chess-skill-bar' }, h('span', { style: `width:${(pts / s.need) * 100}%` })) : null,
              );
            }),
          ),
        ),
      ),
    );
  }

  function detail(s) {
    clearTimeout(timer);
    const b = createBoard({ orientation: 'w', dests: () => [] });
    b.lock?.(true);
    const play = () => {
      clearTimeout(timer);
      b.arrows([]);
      b.set(s.example.fen, { animate: false });
      timer = setTimeout(() => {
        const g = new Chess(s.example.fen);
        const mv = s.example.move;
        const m = g.move({ from: mv.slice(0, 2), to: mv.slice(2, 4), promotion: mv[4] });
        b.set(g.fen(), { last: [m.from, m.to], check: checkSquare(g) });
        b.arrows([{ from: m.from, to: m.to, tone: 'best' }]);
      }, 700);
    };
    const isOpen = open.has(s.id);
    fill(
      body,
      h('button', { type: 'button', class: 'chess-skills-back', onclick: () => listView() }, icon('left', 16), '全部技巧'),
      h(
        'div',
        { class: 'chess-skill-detail' },
        h('div', { class: 'chess-skill-board' }, b.el),
        h('div', { class: 'chess-skill-head' }, skillIcon(28, { locked: !isOpen }), h('strong', {}, s.name), h('span', { class: 'muted small' }, `${SKILL_CATS.find((c) => c.key === s.cat).name} · ${stateText(s)}`)),
        h('p', {}, s.desc),
        h('div', { class: 'chess-nav' }, h('button', { class: 'btn', type: 'button', onclick: play }, '再看一遍'), h('button', { class: 'btn primary', type: 'button', onclick: () => dlg.close() }, '知道了')),
      ),
    );
    play();
  }

  const dlg = openDialog({ title: '技巧', body, onClose: () => clearTimeout(timer) });
  dlg.el.classList.add('chess-skills-dialog');
  const f = focus && skillOf(focus);
  if (f) detail(f);
  else listView();
}

// ---- 分析 (v1.86): 自己摆棋, 两栏 ----
//   浏览 = 开局浏览器: 这个局面大家怎么走、每步走过几盘、占几成、白赢和棋黑赢 (资料库在 chessexplorer.js, 事先算好的)
//   分析 = 电脑想的几条走法和分数
// 照用户 2026-11-14 发的 chess.com「分析」页截图做的; 默认在「浏览」(用户要的是开局浏览器)。
const EX_DB_KEY = 'wengu:chess-ex-db'; // 上次看的资料库 (这台设备上)
const exDbLast = () => {
  try {
    const v = localStorage.getItem(EX_DB_KEY);
    return EX_DBS.some((d) => d.key === v) ? v : 'master';
  } catch {
    return 'master';
  }
};
// 盘数写成中文的样子: 8 盘、1.2 万、183 万
export function countText(n) {
  if (n < 10000) return String(n);
  const w = n / 10000;
  return `${w >= 100 ? Math.round(w) : w.toFixed(1).replace(/\.0$/, '')} 万`;
}

function renderAnalysis({ store }) {
  let line = []; // 走过的步 (chess.js 的走法)
  let at = 0; // 看到第几步
  let tab = 'explore';
  let db = exDbLast();
  let alive = true;
  let engine = null;
  let lines = []; // 电脑想的几条
  let lineFen = '';
  let book = null;
  let ask = 0; // 每次换局面加一, 晚到的结果不要

  const fenAt = (i) => (i === 0 ? START_FEN : line[i - 1].after);
  const gameAt = (i) => new Chess(fenAt(i));
  const evalFill = h('div', { class: 'chess-eval-fill' });
  const evalNum = h('span', { class: 'chess-eval-num' });
  const evalBar = h('div', { class: 'chess-eval', 'aria-hidden': 'true' }, evalFill, evalNum);
  const setEval = (ev) => {
    const w = winPct(ev);
    evalFill.style.height = `${w}%`;
    evalNum.textContent = evalText(ev);
    evalBar.classList.toggle('black-ahead', w < 50);
  };
  const board = createBoard({
    orientation: 'w',
    dests: (sq) => {
      const g = gameAt(at);
      return g.isGameOver() ? [] : g.moves({ square: sq, verbose: true }).map((m) => m.to);
    },
    onMove: (uci) => play(uci),
  });

  function play(uci) {
    const g = gameAt(at);
    let m;
    try {
      m = g.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    } catch {
      return show();
    }
    // 跟原来下一步一样: 只是往前走; 不一样: 后面的扔掉
    if (line[at] && line[at].from + line[at].to + (line[at].promotion ?? '') === uci) at++;
    else {
      line = [...line.slice(0, at), m];
      at = line.length;
    }
    chessSound(g.inCheck() ? 'check' : m.captured ? 'capture' : 'move');
    show();
  }

  const tabBtns = h('div', { class: 'chess-tabs', role: 'tablist' });
  const body = h('div', { class: 'chess-tab-body' });
  const listBox = h('div', { class: 'chess-moves-box' });
  const openName = h('div', { class: 'chess-open-name' });

  function drawTabs() {
    fill(
      tabBtns,
      [
        ['explore', '浏览', 'compass'],
        ['engine', '分析', 'search'],
      ].map(([k, name]) => h('button', { type: 'button', role: 'tab', class: `chess-tab${tab === k ? ' on' : ''}`, 'aria-selected': String(tab === k), onclick: () => ((tab = k), drawTabs(), drawBody()) }, name)),
    );
  }

  // 开局名: 这条线上最后一个在开局谱上、有名字的局面
  const openingName = () => {
    if (!book || !at) return at ? '' : '刚开局';
    const marks = bookMoves(book, [START_FEN, ...line.slice(0, at).map((m) => m.after)]);
    return marks.filter((x) => x.book && x.name).at(-1)?.name ?? '';
  };

  async function drawBody() {
    const myAsk = ask;
    const fen = fenAt(at);
    openName.textContent = openingName();
    if (tab === 'engine') {
      fill(body, lines.length && lineFen === fen ? engineRows(fen) : h('p', { class: 'muted small chess-ex-note' }, '电脑在想……'));
      return;
    }
    const select = h(
      'select',
      {
        class: 'input chess-ex-db',
        'aria-label': '资料库',
        onchange: (e) => {
          db = e.target.value;
          try {
            localStorage.setItem(EX_DB_KEY, db);
          } catch {}
          drawBody();
        },
      },
      EX_DBS.map((d) => h('option', { value: d.key, selected: d.key === db }, d.name)),
    );
    const table = h('div', { class: 'chess-ex' }, h('p', { class: 'muted small chess-ex-note' }, '正在拿……'));
    fill(body, h('div', { class: 'chess-ex-head' }, select), table);
    let rows;
    try {
      rows = await explore(db, fen);
    } catch {
      if (alive && myAsk === ask) fill(table, h('p', { class: 'muted small chess-ex-note' }, '没拿到，联网再试试。'));
      return;
    }
    if (!alive || myAsk !== ask) return;
    if (!rows.length) {
      fill(table, h('p', { class: 'muted small chess-ex-note' }, '这个资料库里没有这个局面。'));
      return;
    }
    const total = rows.reduce((s, r) => s + r.n, 0);
    const g = gameAt(at);
    const evOf = (uci) => (lineFen === fen ? lines.find((l) => l.uci === uci)?.ev : undefined);
    fill(
      table,
      rows.map((r) => {
        const m = new Chess(g.fen()).move({ from: r.uci.slice(0, 2), to: r.uci.slice(2, 4), promotion: r.uci[4] });
        const d = Math.max(0, 100 - r.w - r.b);
        const ev = evOf(r.uci);
        return h(
          'button',
          { type: 'button', class: 'chess-ex-row', onclick: () => play(r.uci), title: `${zhSan(m.san)}：走过 ${r.n} 盘` },
          h('strong', { class: 'chess-ex-mv' }, zhSan(m.san)),
          h('span', { class: `chess-ex-ev${ev === undefined ? ' none' : ev < 0 ? ' neg' : ''}` }, ev === undefined ? '' : evalText(ev)),
          h('span', { class: 'chess-ex-pct' }, r.n / total < 0.005 ? '<1%' : `${Math.round((r.n / total) * 100)}%`),
          h('span', { class: 'chess-ex-n' }, countText(r.n)),
          h(
            'span',
            { class: 'chess-ex-bar', 'aria-label': `白赢 ${r.w}%，和棋 ${d}%，黑赢 ${r.b}%` },
            h('span', { class: 'w', style: `width:${r.w}%` }, r.w >= 12 ? `${r.w}%` : ''),
            h('span', { class: 'd', style: `width:${d}%` }),
            h('span', { class: 'b', style: `width:${r.b}%` }, r.b >= 12 ? `${r.b}%` : ''),
          ),
        );
      }),
    );
  }

  // 「分析」栏: 电脑想的几条, 点了走第一步
  function engineRows(fen) {
    return lines.map((l) => {
      const g = new Chess(fen);
      const sans = [];
      for (const u of (l.pv ?? []).slice(0, 10)) {
        const num = g.moveNumber();
        let m;
        try {
          m = g.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
        } catch {
          break;
        }
        sans.push(`${m.color === 'w' ? `${num}. ` : sans.length ? '' : `${num}… `}${zhSan(m.san)}`);
      }
      return h('button', { type: 'button', class: 'chess-eng-row', onclick: () => play(l.uci) }, h('span', { class: `chess-head-ev${l.ev < 0 ? ' neg' : ''}` }, evalText(l.ev)), h('span', { class: 'chess-eng-line' }, sans.join(' ')));
    });
  }

  // 电脑想: 每换一个局面算一次 (五条, 浏览栏里的电脑分也用它)
  async function think() {
    const myAsk = ask;
    const fen = fenAt(at);
    const g = gameAt(at);
    if (g.isGameOver()) {
      lines = [];
      lineFen = fen;
      setEval(g.isCheckmate() ? (g.turn() === 'w' ? -MATE : MATE) : 0);
      return drawBody();
    }
    try {
      engine ??= await getEngine();
      engine.cancel();
      const r = await engine.analyse(fen, { depth: 14, multipv: 5, movetime: 4000 });
      if (!alive || myAsk !== ask || !r) return;
      lines = r.lines;
      lineFen = fen;
      setEval(r.ev);
      drawBody();
    } catch {}
  }

  function show() {
    ask++;
    const g = gameAt(at);
    const m = line[at - 1];
    board.set(fenAt(at), { last: m ? [m.from, m.to] : null, check: checkSquare(g) });
    const list = moveList(line, { onPick: (p) => ((at = p), show()) });
    fill(listBox, list.el);
    list.mark(at);
    drawBody();
    think();
  }

  const onKey = (e) => {
    if (e.target.closest?.('input, textarea, select, [contenteditable]') || document.querySelector('dialog[open]')) return;
    if (e.key === 'ArrowLeft') at = Math.max(0, at - 1);
    else if (e.key === 'ArrowRight') at = Math.min(line.length, at + 1);
    else return;
    e.preventDefault();
    show();
  };
  document.addEventListener('keydown', onKey);

  const navRow = h(
    'div',
    { class: 'chess-nav chess-steps' },
    h('button', { class: 'btn', type: 'button', 'aria-label': '开头', onclick: () => ((at = 0), show()) }, '⏮'),
    h('button', { class: 'btn', type: 'button', 'aria-label': '上一步', onclick: () => ((at = Math.max(0, at - 1)), show()) }, '◀'),
    h('button', { class: 'btn primary', type: 'button', 'aria-label': '下一步', onclick: () => ((at = Math.min(line.length, at + 1)), show()) }, '▶'),
    h('button', { class: 'btn', type: 'button', 'aria-label': '最后', onclick: () => ((at = line.length), show()) }, '⏭'),
    h('button', { class: 'btn', type: 'button', onclick: () => ((line = []), (at = 0), show()) }, '重来'),
    h('button', { class: 'btn', type: 'button', 'aria-label': '翻转棋盘', title: '翻转棋盘', onclick: () => board.flip() }, '⇅'),
  );

  loadBook()
    .then((b) => {
      book = b;
      if (alive) openName.textContent = openingName();
    })
    .catch(() => {});
  drawTabs();
  setEval(20);
  setTimeout(() => alive && show(), 0);

  return {
    title: '分析',
    el: h(
      'section',
      { class: 'chess-page chess-analysis' },
      h('a', { class: 'back', href: '#/chess' }, '← 国际象棋'),
      h('div', { class: 'chess-layout' }, h('div', { class: 'chess-board-col' }, h('div', { class: 'chess-board-wrap' }, evalBar, board.el), navRow), h('div', { class: 'chess-side' }, tabBtns, openName, body, listBox)),
    ),
    cleanup: () => {
      alive = false;
      engine?.cancel();
      document.removeEventListener('keydown', onKey);
    },
  };
}
