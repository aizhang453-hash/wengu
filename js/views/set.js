// 一个卡片集: 选学习方式, 看所有卡片

import { h, fill, toast, download, openDialog, switchRow, icon } from '../dom.js';
import { isSuspended, LEECH } from '../srs.js';
import { formatCards } from '../parse.js';
import { stripMarks } from '../rich.js';
import { rich, cardImage, sayButton, dictButton } from '../cardview.js';
import { editButton, editCardDialog } from './cardedit.js';
import { diagramSection } from './diagram.js';
import { pinnedCards } from '../diagram.js';
import { printSet } from '../print.js';
import { openShareDialog } from './share.js';
import { openExportDialog } from './export.js';
import { newFolder } from './folder.js';
import { planPanel } from './plan.js';

export function renderSet({ store, go }, id) {
  const set = store.getSet(id);
  if (!set) {
    return {
      title: '找不到',
      el: h(
        'section',
        { class: 'empty' },
        h('h1', {}, '找不到这个卡片集'),
        h('a', { class: 'btn primary', href: '#/' }, '回首页'),
      ),
    };
  }
  const base = `#/set/${encodeURIComponent(set.id)}`;
  let filter = 'all'; // all 全部 | starred 星标 | suspended 暂停的 | leech 难记卡

  const listEl = h('ul', { class: 'card-list' });
  const filters = {
    all: h('button', { class: 'chip on', onclick: () => setFilter('all') }, '全部'),
    starred: h('button', { class: 'chip', onclick: () => setFilter('starred') }, ''),
    leech: h('button', { class: 'chip', title: `忘了 ${LEECH} 次以上的`, onclick: () => setFilter('leech') }, ''),
    suspended: h('button', { class: 'chip', title: '暂停了的不排进复习', onclick: () => setFilter('suspended') }, ''),
  };

  function setFilter(kind) {
    filter = kind;
    for (const [k, b] of Object.entries(filters)) b.classList.toggle('on', k === kind);
    drawList();
  }

  function drawList() {
    const starred = new Set(set.starred);
    const stats = set.stats;
    const pinNumber = new Map(pinnedCards(set).map((p) => [p.cardId, p.number]));
    const match = {
      all: () => true,
      starred: (c) => starred.has(c.id),
      leech: (c) => stats[c.id]?.lapses >= LEECH,
      suspended: (c) => isSuspended(stats[c.id]),
    };
    const counts = Object.fromEntries(Object.keys(match).map((k) => [k, k === 'all' ? set.cards.length : set.cards.filter(match[k]).length]));
    filters.starred.textContent = `★ 星标 (${counts.starred})`;
    filters.leech.textContent = `🐌 难记卡 (${counts.leech})`;
    filters.suspended.textContent = `⏸ 暂停的 (${counts.suspended})`;
    // 没有难记卡、暂停的就不显示那个 (正在看的除外)
    filters.leech.hidden = !counts.leech && filter !== 'leech';
    filters.suspended.hidden = !counts.suspended && filter !== 'suspended';
    const cards = set.cards.filter(match[filter]);
    listEl.replaceChildren(
      ...(cards.length
        ? cards.map((card) => {
            const stat = stats[card.id];
            const paused = isSuspended(stat);
            const pause = h(
              'button',
              {
                class: `icon-btn pause${paused ? ' on' : ''}`,
                title: paused ? '暂停了 (不排进复习), 点一下恢复' : '暂停: 不排进复习 (记录都留着)',
                'aria-label': '暂停',
                'aria-pressed': String(paused),
                onclick: () => {
                  store.suspend(set.id, [card.id], !paused);
                  toast(paused ? '恢复了, 照常排进复习' : '暂停了, 不排进复习');
                  drawList();
                  drawTop(); // 上面的「暂停几张」「今天要背几张」也跟着变
                },
              },
              icon('pause', 14),
            );
            const star = h(
              'button',
              {
                class: `icon-btn star${starred.has(card.id) ? ' on' : ''}`,
                title: '星标',
                'aria-label': '星标',
                'aria-pressed': String(starred.has(card.id)),
                onclick: () => {
                  store.toggleStar(set.id, card.id);
                  drawList();
                },
              },
              '★',
            );
            return h(
              'li',
              { class: 'card-row' },
              h('div', { class: 'card-side term' }, rich(card.term, { class: 'text' }), sayButton(card, 'term', set)),
              h(
                'div',
                { class: 'card-side def' },
                h('span', { class: 'def-body' }, rich(card.def, { class: 'text' }), cardImage(card.image, 'card-thumb')),
                sayButton(card, 'def', set),
              ),
              h(
                'div',
                { class: 'card-row-tools' },
                pinNumber.has(card.id) ? h('span', { class: 'pin-badge', title: '标注图上的点' }, `📍${pinNumber.get(card.id)}`) : null,
                stat?.lapses >= LEECH ? h('span', { class: 'badge leech-badge', title: `复习时忘了 ${stat.lapses} 次` }, '难记卡') : null,
                paused ? h('span', { class: 'badge paused-badge' }, '暂停了') : levelBadge(set.learn[card.id]),
                dictButton(card, set),
                editButton(() => editCardDialog({ store, setId: set.id, card, onSaved: drawList })),
                pause,
                star,
              ),
            );
          })
        : [
            h(
              'li',
              { class: 'muted empty-note' },
              { all: '还没有卡片。', starred: '还没有加星标的卡片。点卡片右边的 ★ 加星标。', leech: '没有难记卡了。', suspended: '没有暂停的卡片了。' }[filter],
            ),
          ]),
    );
  }

  const total = set.cards.length;
  const modes = h(
    'div',
    { class: 'modes' },
    mode('单词卡', '翻面背, 标记会不会', `${base}/cards`, total > 0),
    mode('学习', '选择题加打字, 答对为止', `${base}/learn`, total > 0),
    mode('测试', '出一套卷子打分', `${base}/test`, total > 0),
    pinnedCards(set).length >= 2 ? mode('标注图', '这是哪个? 在图上找出来', `${base}/diagram`, true) : null,
  );

  const actions = h(
    'div',
    { class: 'row' },
    h('a', { class: 'btn', href: `${base}/edit` }, '编辑'),
    h(
      'button',
      {
        class: 'btn',
        disabled: total === 0,
        onclick: async () => {
          // 格式记号去掉, 粘回 Quizlet 才干净
          const text = formatCards(set.cards.map((c) => ({ term: stripMarks(c.term), def: stripMarks(c.def) })));
          try {
            await navigator.clipboard.writeText(text);
            toast('复制好了 (Tab 和换行隔开, 能直接粘回 Quizlet)');
          } catch {
            download(`${set.title || '卡片集'}.txt`, text, 'text/plain;charset=utf-8');
          }
        },
      },
      '复制成文字',
    ),
    h('button', { class: 'btn', disabled: total === 0, onclick: () => openExportDialog(set) }, '导出文件'),
    h('button', { class: 'btn', disabled: total === 0, onclick: () => openShareDialog(set) }, '分享'),
    h('button', { class: 'btn', disabled: total === 0, onclick: () => printSet(set) }, '打印'),
    h('button', { class: 'btn', onclick: () => pickFolders() }, '📁 加到文件夹'),
    h('a', { class: 'btn', href: `#/stats/${encodeURIComponent(set.id)}` }, '📊 统计'),
    h(
      'button',
      {
        class: 'btn',
        disabled: set.known.length === 0,
        onclick: () => {
          if (!confirm('把「会了」的记录都清掉, 从头背?')) return;
          store.resetKnown(set.id);
          go(base);
        },
      },
      '清掉进度',
    ),
    h(
      'button',
      {
        class: 'btn danger',
        onclick: () => {
          if (!confirm(`删掉「${set.title || '未命名卡片集'}」? 删了就找不回来了。`)) return;
          store.deleteSet(set.id);
          toast('删掉了');
          go('#/');
        },
      },
      '删除',
    ),
  );

  // 放进哪些文件夹 (可以放进好几个)
  function pickFolders() {
    const folders = store.allFolders();
    const d = openDialog({
      title: '加到文件夹',
      body: [
        folders.length
          ? folders.map((f) =>
              switchRow({
                label: `📁 ${f.name || '未命名文件夹'}`,
                desc: `${f.setIds.length} 个卡片集`,
                checked: f.setIds.includes(set.id),
                onchange: (v) => store.setInFolder(f.id, set.id, v),
              }),
            )
          : h('p', { class: 'muted' }, '还没有文件夹。'),
        h(
          'button',
          {
            class: 'btn small',
            onclick: () => {
              d.close();
              newFolder(store, (f) => {
                store.setInFolder(f.id, set.id, true);
                toast(`放进「${f.name}」了`);
                go(base);
              });
            },
          },
          '＋ 新建文件夹',
        ),
      ],
      // 关掉时重画这一页 (显示在哪些文件夹里); 已经换到别的页就不管了
      onClose: () => {
        if (location.hash === base) go(base);
      },
    });
  }

  const inFolders = store.foldersOf(set.id);

  // 上面那行 (几张卡片、排进复习的、暂停的) 和每天背新词的计划 (今天要背几张)
  const progressEl = h('p', { class: 'muted' });
  const planBox = h('div', { class: 'plan-box' });
  function drawTop() {
    progressEl.textContent = progressLine(set);
    fill(planBox, total ? planPanel({ store, go }, set) : null);
  }

  drawList();
  drawTop();

  return {
    title: set.title || '未命名卡片集',
    el: h(
      'section',
      {},
      h('a', { class: 'back', href: '#/' }, '← 主页'),
      h('h1', {}, set.title || '未命名卡片集'),
      set.description ? h('p', { class: 'description' }, set.description) : null,
      progressEl,
      inFolders.length
        ? h(
            'p',
            { class: 'in-folders small' },
            '在文件夹: ',
            inFolders.map((f, i) => [i ? '、' : '', h('a', { href: `#/folder/${encodeURIComponent(f.id)}` }, `📁 ${f.name || '未命名文件夹'}`)]),
          )
        : null,
      planBox, // 每天背新词的计划, 今天要背的
      modes,
      actions,
      set.virtual ? null : diagramSection(set),
      h(
        'div',
        { class: 'list-head' },
        h('h2', {}, `卡片 (${total})`),
        h('div', { class: 'row' }, filters.all, filters.starred, filters.leech, filters.suspended),
      ),
      listEl,
    ),
  };
}

function progressLine(set) {
  const total = set.cards.length;
  const levels = Object.values(set.learn);
  const mastered = levels.filter((l) => l === 2).length;
  const learning = levels.filter((l) => l === 1).length;
  const parts = [`${total} 张卡片`];
  const scheduled = set.cards.filter((c) => set.stats[c.id]?.due > 0).length;
  if (scheduled) parts.push(`排进复习的 ${scheduled} 张`);
  const paused = set.cards.filter((c) => isSuspended(set.stats[c.id])).length;
  if (paused) parts.push(`暂停 ${paused} 张`);
  if (mastered || learning) parts.push(`学习: 掌握 ${mastered} 张, 认得 ${learning} 张`);
  if (set.known.length) parts.push(`单词卡: 会了 ${set.known.length} 张`);
  return parts.join(' · ');
}

function levelBadge(level) {
  if (level === 2) return h('span', { class: 'badge good', title: '学习模式里掌握了' }, '掌握了');
  if (level === 1) return h('span', { class: 'badge mid', title: '学习模式里认得了, 还要会写' }, '认得了');
  return null;
}

function mode(name, hint, href, enabled, disabledHint = '先加卡片') {
  if (!enabled) {
    return h(
      'div',
      { class: 'mode disabled', 'aria-disabled': 'true' },
      h('span', { class: 'mode-name' }, name),
      h('span', { class: 'muted small' }, disabledHint),
    );
  }
  return h(
    'a',
    { class: 'mode', href },
    h('span', { class: 'mode-name' }, name),
    h('span', { class: 'muted small' }, hint),
  );
}
