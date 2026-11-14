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
  gameAccuracy,
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
import { MOOD, explainMove, summary, threatText } from '../chesscoach.js';
import { OPPONENTS, DEFAULT_COACH, personOf, coachOf, coachesFor, pickLine, ratingText } from '../chesspeople.js';
import { botParams, pickMove, bookMove, STYLES } from '../chessbot.js';
import { getEngine, engineName } from '../chessengine.js';
import { recentGames, ccRating, NAME as CC_NAME } from '../chesscom.js';
import { createBoard, chessSound } from './chessboard.js';
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
  return renderHub(ctx);
}

// ---- 人物 + 说话的气泡 ----
function coachPanel(person, { size = 76, cls = '' } = {}) {
  const face = liveFace(person, { size });
  const name = h('span', { class: 'chess-say-name' }, person.name);
  const text = h('p', { class: 'chess-say-text', 'aria-live': 'polite' });
  const bubble = h('div', { class: 'chess-bubble' }, name, text);
  const el = h('div', { class: `chess-coach ${cls}` }, face.el, bubble);
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
    say(str, mood = null) {
      if (mood) face.setMood(mood);
      clearInterval(timer);
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
      h('div', { class: 'chess-bigs' }, play, teach, paste),
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
function moveList(moves, { judged = null, onPick = null } = {}) {
  const box = h('ol', { class: 'chess-moves' });
  const cells = [];
  for (let i = 0; i < moves.length; i += 2) {
    const cell = (j) => {
      if (j >= moves.length) return h('span', { class: 'chess-mv chess-mv-none' });
      const k = judged?.[j] ? kindOf(judged[j].kind) : null;
      const b = h('button', { type: 'button', class: `chess-mv${k ? ` ck-${k.key}` : ''}`, onclick: () => onPick?.(j + 1) }, zhSan(moves[j].san), k?.mark ? h('span', { class: 'chess-mv-mark' }, k.mark) : null);
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

  const panel = coachPanel(person, { size: 80, cls: 'play' });
  const lines = (key) => (coachMode ? person[key] : person.lines[key]);
  const thinking = h('span', { class: 'chess-thinking', hidden: true }, '思考中', h('i'), h('i'), h('i'));
  const tag = coachMode ? `${person.teach}型教练 · ${DIFFS.find((d) => d.key === cur.diff)?.name ?? ''} · 按 ${cur.rating} 分下` : `${cur.rating || '最强'} · ${person.place}`;
  const top = h('div', { class: 'chess-player' }, faceSvg(person, { size: 34 }), h('strong', {}, person.name), h('span', { class: 'muted small' }, tag), thinking);
  const bottom = h('div', { class: 'chess-player' }, h('span', { class: `chess-dot ${me}` }), h('strong', {}, '你'), h('span', { class: 'muted small' }, me === 'w' ? '执白' : '执黑'));
  const listBox = h('div', { class: 'chess-moves-box' });
  const askBox = h('div', { class: 'chess-ask', hidden: true });
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
      board.badge(m.to, kind);
      const why = () => explainMove({ m, kind, ply: game.history().length - 1, before: before.ev, after: after.ev, best: before.best, reply: after.best, who: '你', whose: coachMode ? '对方' : '我' });
      if (coachMode) {
        if (kind === 'mistake' || kind === 'blunder' || kind === 'miss') {
          // 走错了: 教练讲为什么, 等我挑收回还是接着下
          panel.say(`${pickLine(person.say[kind])}${why().join('')}`, MOOD[kind]);
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
          said = true;
        } else if (kind === 'brilliant' || kind === 'great' || kind === 'inaccuracy' || Math.random() < 0.25) {
          panel.say(`${pickLine(person.say[kind])}${kind === 'brilliant' || kind === 'great' || kind === 'inaccuracy' ? ` ${why().join('')}` : ''}`, MOOD[kind]);
          said = true;
        }
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
      if (!coachMode && !said) {
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

// ---- 复盘 ----
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
  const panel = coachPanel(coach, { size: 84, cls: 'review' });
  let alive = true;
  let engine = null;
  let review = g.review && g.review.ev.length === fens.length ? g.review : null;
  let judged = null;
  let ply = 0;
  let trying = null; // 试走: { game, from: 从第几步开始 }

  const nameOf = (c) => (c === me ? '你' : me ? '对手' : c === 'w' ? '白方' : '黑方');
  const whiteName = g.src === 'cpu' ? (g.me === 'w' ? '你' : personOf(g.who).name) : g.white || '白方';
  const blackName = g.src === 'cpu' ? (g.me === 'b' ? '你' : personOf(g.who).name) : g.black || '黑方';

  const evalFill = h('div', { class: 'chess-eval-fill' });
  const evalNum = h('span', { class: 'chess-eval-num' });
  const evalBar = h('div', { class: 'chess-eval', 'aria-hidden': 'true' }, evalFill, evalNum);
  const board = createBoard({
    orientation: me || 'w',
    dests: (sq) => {
      if (!review) return [];
      const gm = trying?.game ?? new Chess(fens[ply]);
      if (gm.isGameOver()) return [];
      return gm.moves({ square: sq, verbose: true }).map((m) => m.to);
    },
    onMove: (uci) => tryMove(uci),
  });
  const boardWrap = h('div', { class: 'chess-board-wrap' }, evalBar, board.el);
  const info = h('div', { class: 'chess-info' });
  const graphBox = h('div', { class: 'chess-graph-box' });
  const listBox = h('div', { class: 'chess-moves-box' });
  let list = null;

  const setEval = (ev) => {
    const w = winPct(ev);
    evalFill.style.height = `${w}%`;
    evalNum.textContent = evalText(ev);
    evalBar.classList.toggle('black-ahead', w < 50);
  };

  // 走到第 p 步 (0: 开局, 显示总结)
  function show(p, { animate = true } = {}) {
    trying = null;
    ply = Math.max(0, Math.min(moves.length, p));
    const m = moves[ply - 1];
    const gm = new Chess(fens[ply]);
    board.set(fens[ply], { animate, last: m ? [m.from, m.to] : null, check: checkSquare(gm) });
    list?.mark(ply);
    graph?.mark(ply);
    if (!review) return;
    setEval(review.ev[ply]);
    const arrows = [];
    if (ply === 0) {
      board.badge(null);
      board.arrows([]);
      drawSummary();
      return;
    }
    const j = judged[ply - 1];
    board.badge(m.to, j.kind);
    const best = review.bm[ply - 1];
    if (best && best !== m.from + m.to + (m.promotion ?? '') && j.kind !== 'excellent' && j.kind !== 'great' && j.kind !== 'brilliant') arrows.push({ from: best.slice(0, 2), to: best.slice(2, 4), tone: 'best' });
    board.arrows(arrows);
    const mover = m.color;
    const mine = !me || mover === me;
    const lines = explainMove({ m, kind: j.kind, ply: ply - 1, before: review.ev[ply - 1], after: review.ev[ply], best, reply: review.bm[ply] ?? '', who: nameOf(mover), whose: nameOf(mover === 'w' ? 'b' : 'w') });
    let mood = MOOD[j.kind];
    let lead = pickLine(coach.say[j.kind], ((ply * 7) % 10) / 10);
    if (!mine) {
      lead = BAD.has(j.kind) ? '对手走错了！' : j.kind === 'brilliant' || j.kind === 'great' ? '对手这步厉害。' : '';
      mood = BAD.has(j.kind) ? 'happy' : j.kind === 'brilliant' || j.kind === 'great' ? 'hmm' : 'normal';
    }
    panel.say(`${lead}${lead ? ' ' : ''}${lines.join('')}`, mood);
    const k = kindOf(j.kind);
    fill(
      info,
      h(
        'div',
        { class: 'chess-info-row' },
        h('span', { class: `chess-kind ck-${k.key}` }, k.mark ? h('b', {}, k.mark) : null, k.name),
        h('span', { class: 'muted small' }, `第 ${Math.ceil(ply / 2)} 回合 · ${nameOf(mover)}走 ${zhSan(m.san)}`),
      ),
    );
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
    h('button', { class: 'btn', type: 'button', 'aria-label': '翻转棋盘', title: '翻转棋盘', onclick: () => board.flip() }, '⇅'),
  );

  function drawSummary() {
    const acc = { w: gameAccuracy(review.ev, 'w', startTurn), b: gameAccuracy(review.ev, 'b', startTurn) };
    const counts = countKinds(moves, judged);
    const turning = turningPoint(judged);
    panel.say(summary({ acc, counts, turning, me }).join(''), me && acc[me] !== null ? (acc[me] >= 85 ? 'happy' : acc[me] >= 65 ? 'smile' : 'hmm') : 'smile');
    setEval(review.ev[0]);
    const accBox = (c, name) => h('div', { class: `chess-acc ${c}` }, h('span', { class: 'chess-acc-name' }, name), h('strong', {}, acc[c] === null ? '—' : acc[c].toFixed(1)), h('span', { class: 'muted small' }, '准确率'));
    fill(
      info,
      h('div', { class: 'chess-accs' }, accBox('w', whiteName), accBox('b', blackName)),
      h(
        'table',
        { class: 'chess-counts' },
        h('tbody', {}, KINDS.filter((k) => k.key !== 'forced').map((k) => h('tr', { class: (counts.w[k.key] ?? 0) + (counts.b[k.key] ?? 0) ? '' : 'zero' }, h('td', {}, counts.w[k.key] ?? 0), h('td', {}, h('span', { class: `chess-kind ck-${k.key}` }, k.mark ? h('b', {}, k.mark) : null, k.name)), h('td', {}, counts.b[k.key] ?? 0)))),
      ),
      h('div', { class: 'chess-nav' }, h('button', { class: 'btn primary', type: 'button', onclick: () => show(1) }, '从第一步看起'), turning !== null ? h('button', { class: 'btn', type: 'button', onclick: () => show(turning + 1) }, '看最关键的一步') : null),
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
    board.set(base.fen(), { last: [m.from, m.to], check: checkSquare(base) });
    board.arrows([]);
    board.badge(null);
    fill(info, h('div', { class: 'chess-info-row' }, h('span', { class: 'chess-kind' }, '试走'), h('span', { class: 'muted small' }, `${zhSan(m.san)}，引擎在看……`)), h('div', { class: 'chess-nav' }, h('button', { class: 'btn primary', type: 'button', onclick: () => show(ply) }, '回到棋局')));
    const e = engine ?? (engine = await getEngine());
    const [b, a] = await Promise.all([e.analyse(fen, { depth: 12 }), base.isGameOver() ? Promise.resolve(null) : e.analyse(base.fen(), { depth: 12 })]);
    if (!alive || trying?.game !== base || !b) return;
    const afterEv = base.isCheckmate() ? (base.turn() === 'w' ? -MATE : MATE) : base.isGameOver() ? 0 : a?.ev ?? b.ev;
    const kind = classify({ before: b.ev, after: afterEv, turn: m.color, played: uci, best: b.best, legal: new Chess(fen).moves().length, sac: sacrificeValue(fen, m.san) });
    board.badge(m.to, kind);
    if (a?.best) board.arrows([{ from: a.best.slice(0, 2), to: a.best.slice(2, 4), tone: 'move' }]);
    setEval(afterEv);
    const k = kindOf(kind);
    panel.say(`${pickLine(coach.say[kind])} ${explainMove({ m, kind, ply: 20, before: b.ev, after: afterEv, best: b.best, reply: a?.best ?? '', who: '你', whose: '对手' }).join('')}`, MOOD[kind]);
    fill(info, h('div', { class: 'chess-info-row' }, h('span', { class: `chess-kind ck-${k.key}` }, k.mark ? h('b', {}, k.mark) : null, `试走：${k.name}`), h('span', { class: 'muted small' }, `${zhSan(m.san)} · ${evalText(afterEv)}`)), h('div', { class: 'chess-nav' }, h('button', { class: 'btn primary', type: 'button', onclick: () => show(ply) }, '回到棋局')));
  }

  // 局势曲线: 白方胜率, 点了跳到那一步; 失误的地方有点
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
    const dots = judged
      .map((j, i) => (BAD.has(j.kind) && j.kind !== 'inaccuracy' ? `<circle class="ck-dot ck-${j.kind}" cx="${pts[i + 1][0].toFixed(1)}" cy="${pts[i + 1][1].toFixed(1)}" r="4" vector-effect="non-scaling-stroke"/>` : ''))
      .join('');
    // 只有写死的图形和算出来的数字
    svg.innerHTML = `<rect class="chess-graph-bg" x="0" y="0" width="${W}" height="${H}"/><path class="chess-graph-area" d="${area}"/><line class="chess-graph-mid" x1="0" y1="${H / 2}" x2="${W}" y2="${H / 2}"/><line class="chess-graph-now" x1="0" y1="0" x2="0" y2="${H}"/>${dots}`;
    const now = svg.querySelector('.chess-graph-now');
    svg.addEventListener('click', (e) => {
      const r = svg.getBoundingClientRect();
      show(Math.round(((e.clientX - r.left) / r.width) * n));
    });
    fill(graphBox, svg);
    graph = {
      mark(p) {
        const x = (p / n) * W;
        now.setAttribute('x1', String(x));
        now.setAttribute('x2', String(x));
      },
    };
  }

  // 还没复盘: 让引擎一个局面一个局面看
  async function analyse() {
    const progress = h('div', { class: 'chess-progress' }, h('div', { class: 'chess-progress-fill' }));
    const note = h('span', { class: 'muted small' }, '');
    fill(info, h('div', { class: 'chess-analysing' }, progress, note));
    panel.say(`我先把这盘棋看一遍，${moves.length} 步，稍等一下……`, 'hmm');
    panel.face.el.classList.add('cf-thinking');
    try {
      engine ??= await getEngine();
    } catch {
      panel.say('引擎打不开，刷新一下试试。', 'worried');
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
          panel.say('引擎出了点问题，刷新一下再试。', 'worried');
          return;
        }
        ev.push(r.ev);
        bm.push(r.best);
        ev2.push(r.ev2);
      }
      progress.firstChild.style.width = `${((i + 1) / fens.length) * 100}%`;
      note.textContent = `${i + 1} / ${fens.length}`;
    }
    review = { depth, ev, bm, ev2 };
    store.updateChess((c, now) => ({ ...c, games: { ...c.games, [id]: { ...c.games[id], review, at: now } } }));
    panel.face.el.classList.remove('cf-thinking');
    ready();
  }

  function ready() {
    judged = judgeGame(moves, review);
    list = moveList(moves, { judged, onPick: (p) => show(p) });
    fill(listBox, list.el);
    drawGraph();
    show(0, { animate: false });
  }

  const onKey = (e) => {
    if (e.target.closest?.('input, textarea, [contenteditable]') || document.querySelector('dialog[open]')) return;
    if (e.key === 'ArrowLeft') show(ply - 1);
    else if (e.key === 'ArrowRight') show(ply + 1);
    else return;
    e.preventDefault();
  };
  document.addEventListener('keydown', onKey);

  board.set(fens[0], { animate: false });
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
      ),
      h('div', { class: 'chess-layout' }, h('div', { class: 'chess-board-col' }, boardWrap, navRow), h('div', { class: 'chess-side' }, panel.el, info, graphBox, listBox)),
    ),
    cleanup: () => {
      alive = false;
      engine?.cancel();
      panel.stop();
      document.removeEventListener('keydown', onKey);
    },
  };
}
