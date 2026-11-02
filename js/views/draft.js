// 游戏厅「人生草稿」的页面: 规则在 ../draft.js, 内容在 ../draftdata.js, 批注怎么存在 ../arcade.js
//   开局页: 写过几稿、见过几个结局、最高分; 开始新的一稿 / 接着写上次没写完的; 结局图鉴
//   挑出身、性格、心愿 (各给三个, 解锁了稀有的再多一个; 上一稿传下来的性格自动带上) → 一年一年往下过: 「下一年」或者「自动」, 到了路口停下来选;
//     选项下面写着以前的稿选这条路后来怎么样 (批注), 要以前的稿走过才出现的选项标着「前稿」
//   走了: 结局、享年、评语、分数 (记进游戏厅的成绩, 批注跟着同步), 新解锁的稀有开局, 挑一个性格传给下一稿, 这一稿走过的路口
//   写到一半的存在这个浏览器里 (wengu:draft-run), 关了页面下次接着写; 不同步
//   键盘: 空格 / 回车 下一年, 数字键选路口上的选项

import { h, fill, openDialog } from '../dom.js';
import { STATS, MAX, offers, newLife, advance, choose, finish, noteFor, restoreLife, newlyUnlocked, isOpen, heirOf, traitsOf, withHeir, originOf, traitOf, wishOf, endingOf, choiceOf, ORIGINS, TRAITS, ENDINGS, WISHES } from '../draft.js';
import { progressOf, bestOf, TOP_N } from '../arcade.js';

const RUN_KEY = 'wengu:draft-run';
const AUTO_MS = 520; // 自动往下过: 一年多久

function loadRun() {
  try {
    return restoreLife(JSON.parse(localStorage.getItem(RUN_KEY) ?? 'null'));
  } catch {
    return null;
  }
}

function saveRun(life) {
  try {
    if (life) localStorage.setItem(RUN_KEY, JSON.stringify(life));
    else localStorage.removeItem(RUN_KEY);
  } catch {
    // 存不了就算了: 这一页开着的时候照样能玩
  }
}

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const signed = (n) => (n > 0 ? `+${n}` : `−${-n}`);
const statLine = (fx) =>
  STATS.filter(([k]) => fx?.[k])
    .map(([k, name]) => `${name} ${signed(fx[k])}`)
    .join(' · ');

export function renderDraft({ store }) {
  let life = loadRun();
  let result = null; // 走了以后: finish() 的结果, 加上 rank / best
  let auto = false;
  let timer = 0;
  let picks = null; // 开局给挑的
  let chosen = null; // 开局选了哪个

  const root = h('section', { class: 'draft-page' });
  const live = h('div', { class: 'draft-live', role: 'status', 'aria-live': 'polite' });
  const profile = () => progressOf(store.data.arcade, 'draft');

  function stopAuto() {
    clearTimeout(timer);
    timer = 0;
  }

  // ---- 开局页 ----
  function home() {
    stopAuto();
    auto = false;
    const p = profile();
    const best = bestOf(store.data.arcade, 'draft');
    const last = p.last ? endingOf(p.last.end) : null;
    const saved = life && !life.dead ? life : null;
    fill(
      root,
      h('a', { class: 'back', href: '#/arcade' }, '← 游戏厅'),
      h('header', { class: 'draft-hero' }, h('h1', {}, '人生草稿'), h('p', { class: 'draft-tagline' }, '人生没有草稿，这里有。')),
      h(
        'div',
        { class: 'draft-tally' },
        tally('已写', `${p.runs}`, '稿'),
        tally('结局', `${p.endings.filter((k) => endingOf(k)).length}`, `/ ${ENDINGS.length}`),
        tally('最高分', best ? best.toLocaleString('en-US') : '—', ''),
      ),
      last ? h('p', { class: 'muted small draft-last' }, `上一稿：活到 ${p.last.age} 岁 ·「${last.name}」`) : null,
      heirOf(p) ? h('p', { class: 'small draft-last' }, `传给下一稿的性格：「${traitOf(heirOf(p)).name}」`) : null,
      h(
        'div',
        { class: 'row draft-actions' },
        saved
          ? [
              h('button', { class: 'btn primary', type: 'button', onclick: () => play() }, `继续第 ${saved.run} 稿（${saved.age} 岁）`),
              h('button', { class: 'btn', type: 'button', onclick: () => confirm(`放弃第 ${saved.run} 稿，重新开始？`) && setup() }, '重新开始'),
            ]
          : h('button', { class: 'btn primary', type: 'button', onclick: () => setup() }, `开始第 ${p.runs + 1} 稿`),
        h('button', { class: 'btn', type: 'button', onclick: () => gallery() }, '结局图鉴'),
      ),
      h('p', { class: 'muted small' }, `稀有开局：已解锁 ${rares().filter((x) => isOpen(x, p)).length} / ${rares().length}`),
      h(
        'div',
        { class: 'draft-how' },
        h('h2', {}, '怎么玩'),
        h(
          'ul',
          {},
          h('li', {}, '一稿就是一辈子：挑一个出身、一种性格和一个心愿，然后一年一年过下去。'),
          h('li', {}, '走到人生路口时自己选。选项下面的批注，记着以前的稿选这条路后来怎么样。'),
          h('li', {}, '有些路要以前的稿走过才会出现，标着「前稿」。'),
          h('li', {}, '越玩越强：拿到某些结局会解锁稀有的出身和性格，开局时多给一张；每写完一稿，可以挑一个性格传给下一稿。'),
          h('li', {}, '走完一生，按年纪、学识、人缘、家底、体魄、心愿和结局打分。'),
        ),
      ),
    );
    root.querySelector('.btn.primary')?.focus({ preventScroll: true });
  }

  const rares = () => [...ORIGINS, ...TRAITS].filter((x) => x.rare);

  function tally(label, value, unit) {
    return h('div', { class: 'draft-tile' }, h('span', { class: 'muted small' }, label), h('span', {}, h('b', {}, value), unit ? ` ${unit}` : ''));
  }

  // ---- 挑出身、性格、心愿 ----
  function setup() {
    stopAuto();
    auto = false;
    life = null;
    result = null;
    saveRun(null);
    const p = profile();
    picks = offers(p);
    const heir = heirOf(p);
    chosen = { origin: null, trait: null, wish: null, heir };
    const start = h('button', { class: 'btn primary', type: 'button', disabled: true, onclick: () => begin() }, '落笔');
    const group = (title, field, keys, of, extra) =>
      h(
        'section',
        { class: 'draft-group' },
        h('h2', {}, title),
        h(
          'div',
          { class: 'draft-picks', role: 'radiogroup', 'aria-label': title },
          keys.map((key) => {
            const x = of(key);
            const card = h(
              'button',
              {
                class: 'draft-pick',
                type: 'button',
                role: 'radio',
                'aria-checked': 'false',
                onclick: () => {
                  chosen[field] = key;
                  for (const b of card.parentElement.children) b.setAttribute('aria-checked', String(b === card));
                  start.disabled = !(chosen.origin && chosen.trait && chosen.wish);
                },
              },
              h('strong', {}, x.name, x.rare ? h('em', { class: 'draft-tag' }, '稀有') : null),
              x.desc ? h('span', { class: 'draft-pick-desc' }, x.desc) : null,
              extra ? h('span', { class: 'draft-pick-meta' }, extra(x)) : null,
            );
            return card;
          }),
        ),
      );
    fill(
      root,
      h('button', { class: 'back draft-back', type: 'button', onclick: () => home() }, '← 人生草稿'),
      h('h1', {}, `第 ${p.runs + 1} 稿`),
      h('p', { class: 'muted' }, '挑一个出身、一种性格和一个心愿。'),
      group('出身', 'origin', picks.origins, originOf, (o) => STATS.map(([k, name]) => `${name} ${o.stats[k]}`).join(' · ')),
      heir ? h('p', { class: 'draft-heir' }, '上一稿传下来的性格：', h('strong', {}, `「${traitOf(heir).name}」`), `（${[statLine(traitOf(heir).stats), traitOf(heir).desc.replace(/。$/, '')].filter(Boolean).join('；')}），这一稿自动带上。`) : null,
      group(heir ? '再挑一个性格' : '性格', 'trait', picks.traits, traitOf, (t) => statLine(t.stats)),
      group('心愿', 'wish', picks.wishes, wishOf, (w) => `怎么达成：${w.hint}`),
      h('div', { class: 'row draft-start' }, start, h('span', { class: 'muted small' }, '心愿了了加 80 分。')),
    );
    window.scrollTo(0, 0);
  }

  function begin() {
    life = newLife(chosen, profile()); // chosen.heir: 传下来的性格
    saveRun(life);
    play();
  }

  // ---- 一年一年过 ----
  let els = null;

  function play() {
    stopAuto();
    if (life.dead && !result) settle();
    const o = originOf(life.origin);
    const stats = STATS.map(([k, name]) => {
      const num = h('b', {}, '');
      const bar = h('i', {});
      const el = h('div', { class: 'draft-stat', dataset: { k } }, h('span', {}, name), num, h('span', { class: 'draft-bar' }, bar));
      return { k, el, num, bar };
    });
    const next = h('button', { class: 'btn primary draft-next', type: 'button', onclick: () => step() }, '下一年');
    const autoBtn = h('button', { class: 'btn', type: 'button', 'aria-pressed': 'false', onclick: () => toggleAuto() }, '自动');
    els = {
      age: h('strong', {}, ''),
      wish: h('span', { class: 'draft-wish' }),
      stats,
      log: h('ol', { class: 'draft-log' }),
      next,
      autoBtn,
      controls: h('div', { class: 'draft-controls' }, next, autoBtn, h('span', { class: 'muted small draft-keys' }, '空格键：下一年')),
      slot: h('div', { class: 'draft-slot' }),
    };
    els.foot = h('div', { class: 'draft-foot' }, els.slot, els.controls);
    fill(
      root,
      h('button', { class: 'back draft-back', type: 'button', onclick: () => home() }, '← 人生草稿'),
      h(
        'div',
        { class: 'draft-top' },
        h('div', { class: 'draft-head' }, h('span', { class: 'draft-run' }, `第 ${life.run} 稿 · `, els.age), h('span', { class: 'muted small' }, [o.name, ...traitsOf(life).map((k) => traitOf(k).name)].join(' · '))),
        h('div', { class: 'draft-stats' }, stats.map((s) => s.el)),
        els.wish,
      ),
      els.log,
      els.foot,
      live,
    );
    for (const y of life.years) els.log.append(yearEl(y));
    refresh(false);
    window.scrollTo(0, document.body.scrollHeight);
  }

  function refresh(animate = true) {
    els.age.textContent = `${life.age} 岁`;
    for (const s of els.stats) {
      const v = life.stats[s.k];
      if (animate && s.num.textContent !== '' && Number(s.num.textContent) !== v) {
        s.el.classList.remove('up', 'down');
        void s.el.offsetWidth; // 重新播一次闪动
        s.el.classList.add(v > Number(s.num.textContent) ? 'up' : 'down');
      }
      s.num.textContent = String(v);
      s.bar.style.width = `${(v / MAX) * 100}%`;
    }
    const w = wishOf(life.wish);
    fill(els.wish, h('span', { class: 'muted' }, '心愿：'), w.name, life.wishAt !== null ? h('span', { class: 'draft-done' }, ` ✓ ${life.wishAt} 岁达成`) : null);
    els.controls.hidden = Boolean(life.dead || life.pending);
    els.autoBtn.textContent = auto ? '暂停' : '自动';
    els.autoBtn.setAttribute('aria-pressed', String(auto));
    els.autoBtn.classList.toggle('on', auto);
    if (life.dead) fill(els.slot, endCard());
    else if (life.pending) fill(els.slot, choiceCard());
    else fill(els.slot);
  }

  // 焦点跟着走 (按钮被藏起来、选项点完没了的时候): 路口、结局放在整块上 (不放在第一个选项上, 免得连按空格选错), 不然回「下一年」
  function keepFocus() {
    if (root.contains(document.activeElement) && document.activeElement.offsetParent !== null) return;
    const target = life.dead || life.pending ? els.slot.firstElementChild : els.next;
    target?.focus({ preventScroll: true });
  }

  function yearEl(y) {
    const d = STATS.filter(([k]) => y.delta?.[k]).map(([k, name]) => h('span', { class: y.delta[k] > 0 ? 'up' : 'down' }, `${name} ${signed(y.delta[k])}`));
    return h(
      'li',
      { class: 'draft-year' },
      h('span', { class: 'draft-age' }, `${y.age} 岁`),
      h(
        'div',
        { class: 'draft-lines' },
        y.lines.map((l) => h('p', { class: l.k ? `k-${l.k}` : null }, l.k === 'choice' ? '选择：' : l.k === 'wish' ? '✦ ' : '', l.t)),
        d.length ? h('div', { class: 'draft-delta' }, d) : null,
      ),
    );
  }

  // 改了最后一年 (选了路口) 或者多了一年: 只动最后一个
  function updateLast(added) {
    const y = life.years[life.years.length - 1];
    const el = yearEl(y);
    if (added) {
      if (!reducedMotion()) el.classList.add('fresh');
      els.log.append(el);
    } else els.log.lastElementChild?.replaceWith(el);
    live.textContent = `${y.age} 岁。${y.lines.map((l) => l.t).join('')}`;
    saveRun(life.dead ? null : life);
    if (life.dead && !result) settle();
    refresh();
    keepFocus();
    els.foot.scrollIntoView({ block: 'end', behavior: reducedMotion() ? 'auto' : 'smooth' });
  }

  function toggleAuto() {
    auto = !auto;
    if (auto) step();
    else stopAuto();
    refresh(false);
  }

  function step() {
    if (!life || life.dead || life.pending) return;
    advance(life, profile());
    updateLast(true);
    schedule();
  }

  function schedule() {
    stopAuto();
    if (auto && life && !life.dead && !life.pending) timer = setTimeout(step, AUTO_MS);
  }

  function pick(key) {
    if (!life?.pending) return;
    choose(life, key, profile());
    updateLast(false);
    schedule();
  }

  function choiceCard() {
    const ch = choiceOf(life.pending.id);
    const p = profile();
    return h(
      'div',
      { class: 'draft-choice', role: 'group', 'aria-label': `人生路口：${ch.text}`, tabindex: '-1' },
      h('p', { class: 'draft-choice-q' }, h('span', { class: 'draft-choice-age' }, `${life.age} 岁`), ch.text),
      h(
        'div',
        { class: 'draft-options' },
        life.pending.opts.map((key, i) => {
          const o = ch.options.find((x) => x.key === key);
          const note = noteFor(p, ch.id, key);
          return h(
            'button',
            { class: 'draft-opt', type: 'button', onclick: () => pick(key) },
            h('span', { class: 'draft-opt-n', 'aria-hidden': 'true' }, String(i + 1)),
            h(
              'span',
              { class: 'draft-opt-body' },
              h('span', { class: 'draft-opt-text' }, o.text, o.new ? h('em', { class: 'draft-tag' }, '前稿') : null),
              o.hint ? h('span', { class: 'draft-opt-hint' }, o.hint) : null,
              note ? h('span', { class: 'draft-note' }, `第 ${note.run} 稿选过：活到 ${note.age} 岁${note.end ? ` ·「${note.end}」` : ''}`) : null,
            ),
          );
        }),
      ),
    );
  }

  // ---- 走了 ----
  function settle() {
    const before = profile();
    const r = finish(life, before);
    const { rank, best } = store.recordArcade('draft', r.score, Date.now(), r.profile);
    result = { ...r, rank, best, unlocked: newlyUnlocked(before, r.profile) };
    saveRun(null);
  }

  function endCard() {
    const r = result;
    const w = wishOf(life.wish);
    return h(
      'div',
      { class: 'draft-end', tabindex: '-1', 'aria-label': `第 ${life.run} 稿写完了：「${r.ending.name}」` },
      h('p', { class: 'draft-end-kicker' }, `第 ${life.run} 稿 · 享年 ${life.age} 岁`),
      h('h2', { class: 'draft-end-name' }, `「${r.ending.name}」`, r.newEnding ? h('span', { class: 'draft-new' }, '新结局') : null),
      h('p', { class: 'draft-end-desc' }, r.ending.desc),
      h('p', { class: 'draft-comment' }, h('span', { class: 'draft-comment-label' }, '评语'), r.comment),
      h(
        'div',
        { class: 'draft-score' },
        h('b', {}, r.score.toLocaleString('en-US')),
        ' 分',
        r.best ? h('span', { class: 'draft-new' }, '新纪录') : r.rank ? h('span', { class: 'muted small' }, ` · 第 ${r.rank} 名（前 ${TOP_N} 名记着）`) : null,
      ),
      h('p', { class: 'muted small' }, life.wishAt !== null ? `心愿「${w.name}」在 ${life.wishAt} 岁达成，加 80 分。` : `心愿「${w.name}」没能达成。`, r.ending.pts ? `结局加 ${r.ending.pts} 分。` : ''),
      r.unlocked.length ? h('p', { class: 'draft-unlock' }, `新解锁稀有开局：${r.unlocked.map((x) => `「${x.name}」`).join('')}。以后开局时会多给一张稀有卡。`) : null,
      heirPicker(),
      life.choices.length
        ? h(
            'details',
            { class: 'draft-path' },
            h('summary', {}, `这一稿的 ${life.choices.length} 个路口`),
            h(
              'ul',
              {},
              life.choices.map((x) => {
                const ch = choiceOf(x.id);
                const o = ch?.options.find((y) => y.key === x.opt);
                return h('li', {}, h('span', { class: 'muted' }, `${x.age} 岁 · ${ch?.text ?? ''}`), h('span', {}, ` → ${o?.text ?? ''}`));
              }),
            ),
          )
        : null,
      h(
        'div',
        { class: 'row draft-actions' },
        h('button', { class: 'btn primary', type: 'button', onclick: () => setup() }, '再写一稿'),
        h('button', { class: 'btn', type: 'button', onclick: () => gallery() }, '结局图鉴'),
        h('a', { class: 'btn', href: '#/arcade' }, '回游戏厅'),
      ),
    );
  }

  // 结局页上: 挑这一稿的一个性格传给下一稿 (再点一下取消)
  function heirPicker() {
    const box = h('div', { class: 'draft-heir-pick' });
    const draw = () => {
      const cur = heirOf(profile());
      fill(
        box,
        h('p', { class: 'small' }, '传给下一稿：挑一个性格，下一稿开局自动带上。'),
        h(
          'div',
          { class: 'row' },
          traitsOf(life).map((k) =>
            h(
              'button',
              {
                class: `btn${cur === k ? ' on' : ''}`,
                type: 'button',
                'aria-pressed': String(cur === k),
                onclick: () => {
                  store.recordArcade('draft', 0, Date.now(), withHeir(profile(), cur === k ? '' : k));
                  draw();
                },
              },
              cur === k ? `✓ 已传「${traitOf(k).name}」` : `传「${traitOf(k).name}」`,
            ),
          ),
        ),
      );
    };
    draw();
    return box;
  }

  // ---- 结局图鉴 ----
  function gallery() {
    const p = profile();
    const seen = new Set(p.endings);
    const wishes = new Set(p.marks.filter((m) => m.startsWith('wish:')).map((m) => m.slice(5)));
    openDialog({
      title: '结局图鉴',
      body: h(
        'div',
        { class: 'draft-gallery' },
        h('p', { class: 'muted small' }, `见过 ${ENDINGS.filter((e) => seen.has(e.key)).length} / ${ENDINGS.length} 个结局。没见过的只给提示。`),
        h(
          'ul',
          { class: 'draft-endings' },
          ENDINGS.map((e) =>
            seen.has(e.key)
              ? h('li', { class: 'seen' }, h('strong', {}, `「${e.name}」`), h('span', { class: 'small' }, e.desc))
              : h('li', {}, h('strong', {}, '？？？'), h('span', { class: 'muted small' }, `提示：${e.hint}`)),
          ),
        ),
        h('h3', {}, `心愿 · 了过 ${WISHES.filter((w) => wishes.has(w.key)).length} / ${WISHES.length}`),
        h(
          'ul',
          { class: 'draft-wishes' },
          WISHES.map((w) => h('li', { class: wishes.has(w.key) ? 'seen' : null }, wishes.has(w.key) ? '✓ ' : '', w.name)),
        ),
        h('h3', {}, `稀有开局 · 解锁了 ${rares().filter((x) => isOpen(x, p)).length} / ${rares().length}`),
        h(
          'ul',
          { class: 'draft-endings' },
          rares().map((x) =>
            isOpen(x, p)
              ? h('li', { class: 'seen' }, h('strong', {}, `${ORIGINS.includes(x) ? '出身' : '性格'}「${x.name}」`), h('span', { class: 'small' }, ORIGINS.includes(x) ? x.desc : `${statLine(x.stats)}。${x.desc}`))
              : h('li', {}, h('strong', {}, `${ORIGINS.includes(x) ? '出身' : '性格'}「？？？」`), h('span', { class: 'muted small' }, `解锁条件：${x.lock}`)),
          ),
        ),
      ),
    });
  }

  // ---- 键盘 ----
  function onKey(e) {
    if (!els || !root.isConnected || !life || e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
    if (document.querySelector('dialog[open]')) return;
    const tag = e.target?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (life.pending && /^[1-9]$/.test(e.key)) {
      const key = life.pending.opts[Number(e.key) - 1];
      if (key) {
        e.preventDefault();
        pick(key);
      }
      return;
    }
    // 焦点在按钮上时空格、回车按的是那个按钮, 不另外再过一年
    if ((e.key === ' ' || e.key === 'Enter') && tag !== 'BUTTON' && tag !== 'A' && !life.pending && !life.dead) {
      e.preventDefault();
      step();
    }
  }
  document.addEventListener('keydown', onKey);

  if (life) play();
  else home();

  return {
    title: '人生草稿',
    el: root,
    cleanup() {
      stopAuto();
      document.removeEventListener('keydown', onKey);
    },
  };
}

