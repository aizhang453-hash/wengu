// 一个卡片集: 今天的计划、学习方式 (单词卡、学习、测试、游戏、标注图), 所有卡片。
// 不常用的 (统计、文件夹、分享、复制、导出、打印、清掉进度、删除) 收在标题旁边的「更多」里

import { h, fill, toast, download, openDialog, switchRow, icon, menuButton } from '../dom.js';
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
import { GAMES, whyNotPlayable } from '../games.js';

const num = (n) => n.toLocaleString('zh-CN');

export function renderSet({ store, go }, id) {
  const set = store.getSet(id);
  if (!set) {
    return {
      title: '找不到',
      el: h('section', { class: 'empty' }, h('h1', {}, '卡片集不存在'), h('a', { class: 'btn primary', href: '#/' }, '返回首页')),
    };
  }
  const base = `#/set/${encodeURIComponent(set.id)}`;
  const title = set.title || '未命名卡片集';
  let filter = 'all'; // all 全部 | starred 星标 | suspended 暂停的 | leech 难记卡

  const listEl = h('ul', { class: 'card-list' });
  const filters = {
    all: h('button', { class: 'chip on', type: 'button', onclick: () => setFilter('all') }, '全部'),
    starred: h('button', { class: 'chip', type: 'button', onclick: () => setFilter('starred') }, ''),
    leech: h('button', { class: 'chip', type: 'button', title: `遗忘 ${LEECH} 次以上`, onclick: () => setFilter('leech') }, ''),
    suspended: h('button', { class: 'chip', type: 'button', title: '暂停的卡片不安排复习', onclick: () => setFilter('suspended') }, ''),
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
    filters.starred.textContent = `星标 ${counts.starred}`;
    filters.leech.textContent = `难记 ${counts.leech}`;
    filters.suspended.textContent = `已暂停 ${counts.suspended}`;
    // 没有难记卡、暂停的就不显示那个 (正在看的除外)
    filters.leech.hidden = !counts.leech && filter !== 'leech';
    filters.suspended.hidden = !counts.suspended && filter !== 'suspended';
    const cards = set.cards.filter(match[filter]);
    fill(
      listEl,
      cards.length
        ? cards.map((card) => {
            const stat = stats[card.id];
            const paused = isSuspended(stat);
            // 查词典、暂停不常用: 电脑上指到这一行才显示, 手机上不显示 (暂停了的一直显示, 好恢复)
            const pause = h(
              'button',
              {
                class: `icon-btn pause${paused ? ' on' : ' row-extra'}`,
                type: 'button',
                title: paused ? '已暂停，点击恢复' : '暂停：不安排复习',
                'aria-label': paused ? '恢复' : '暂停',
                'aria-pressed': String(paused),
                onclick: () => {
                  store.suspend(set.id, [card.id], !paused);
                  toast(paused ? '已恢复' : '已暂停');
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
                type: 'button',
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
            const dict = dictButton(card, set);
            dict?.classList.add('row-extra');
            return h(
              'li',
              { class: 'card-row' },
              h('div', { class: 'card-side term' }, rich(card.term, { class: 'text' }), sayButton(card, 'term', set)),
              h('div', { class: 'card-side def' }, h('span', { class: 'def-body' }, rich(card.def, { class: 'text' }), cardImage(card.image, 'card-thumb')), sayButton(card, 'def', set)),
              h(
                'div',
                { class: 'card-row-tools' },
                pinNumber.has(card.id) ? h('span', { class: 'pin-badge', title: '标注图上的编号' }, `#${pinNumber.get(card.id)}`) : null,
                stat?.lapses >= LEECH ? h('span', { class: 'badge leech-badge', title: `遗忘 ${stat.lapses} 次` }, '难记') : null,
                paused ? h('span', { class: 'badge paused-badge' }, '已暂停') : levelBadge(set.learn[card.id]),
                dict,
                editButton(() => editCardDialog({ store, setId: set.id, card, onSaved: drawList })),
                pause,
                star,
              ),
            );
          })
        : h('li', { class: 'muted empty-note' }, { all: '暂无卡片。', starred: '暂无星标卡片。', leech: '暂无难记卡片。', suspended: '暂无暂停的卡片。' }[filter]),
    );
  }

  const total = set.cards.length;
  const modes = h(
    'div',
    { class: 'modes' },
    mode('cards', '单词卡', '翻卡记忆', `${base}/cards`, total > 0),
    mode('learn', '学习', '选择、拼写，逐张掌握', `${base}/learn`, total > 0),
    mode('test', '测试', '生成试卷并评分', `${base}/test`, total > 0),
    total > 0 ? h('button', { class: 'mode', type: 'button', onclick: pickGame }, modeIcon('game'), h('span', { class: 'mode-name' }, '游戏'), h('span', { class: 'mode-hint' }, '配对、打陨石等')) : mode('game', '游戏', '', null, false),
    pinnedCards(set).length >= 2 ? mode('pin', '标注图', '在图上辨认位置', `${base}/diagram`, true) : null,
  );

  // 挑一个游戏, 拿这个卡片集玩
  function pickGame() {
    const d = openDialog({
      title: '选择游戏',
      body: h(
        'div',
        { class: 'game-pick' },
        GAMES.map((g) => {
          const why = whyNotPlayable(g.key, set);
          return why
            ? h('div', { class: 'game-pick-item disabled' }, h('span', { class: 'game-pick-name' }, g.name), h('span', { class: 'muted small' }, why))
            : h('a', { class: 'game-pick-item', href: `${base}/${g.key}`, onclick: () => d.close() }, h('span', { class: 'game-pick-name' }, g.name), h('span', { class: 'muted small' }, g.hint));
        }),
      ),
    });
  }

  async function copyText() {
    // 格式记号去掉, 粘回 Quizlet 才干净
    const text = formatCards(set.cards.map((c) => ({ term: stripMarks(c.term), def: stripMarks(c.def) })));
    try {
      await navigator.clipboard.writeText(text);
      toast('已复制（Tab 分隔词与解释，可粘贴回 Quizlet）');
    } catch {
      download(`${title}.txt`, text, 'text/plain;charset=utf-8');
    }
  }

  const more = menuButton(
    [
      { label: '统计', icon: 'chart', href: `#/stats/${encodeURIComponent(set.id)}` },
      { label: '加入文件夹', icon: 'folder', onclick: () => pickFolders() },
      null,
      { label: '分享', icon: 'share', disabled: !total, onclick: () => openShareDialog(set) },
      { label: '复制为文本', icon: 'copy', disabled: !total, onclick: copyText },
      { label: '导出文件', icon: 'export', disabled: !total, onclick: () => openExportDialog(set) },
      { label: '打印', icon: 'print', disabled: !total, onclick: () => printSet(set) },
      null,
      {
        label: '重置单词卡进度',
        icon: 'undo',
        disabled: !set.known.length,
        onclick: () => {
          if (!confirm('清除单词卡中「会了」的标记，从头开始？')) return;
          store.resetKnown(set.id);
          go(base);
        },
      },
      {
        label: '删除卡片集',
        icon: 'trash',
        danger: true,
        onclick: () => {
          if (!confirm(`删除「${title}」？删除后无法恢复。`)) return;
          store.deleteSet(set.id);
          toast('已删除');
          go('#/');
        },
      },
    ],
    { label: '更多操作', cls: 'btn icon-only' },
  );

  // 放进哪些文件夹 (可以放进好几个)
  function pickFolders() {
    const folders = store.allFolders();
    const d = openDialog({
      title: '加入文件夹',
      body: [
        folders.length
          ? folders.map((f) =>
              switchRow({
                label: f.name || '未命名文件夹',
                desc: `${f.setIds.length} 个卡片集`,
                checked: f.setIds.includes(set.id),
                onchange: (v) => store.setInFolder(f.id, set.id, v),
              }),
            )
          : h('p', { class: 'muted' }, '暂无文件夹。'),
        h(
          'button',
          {
            class: 'btn small',
            type: 'button',
            onclick: () => {
              d.close();
              newFolder(store, (f) => {
                store.setInFolder(f.id, set.id, true);
                toast(`已加入「${f.name}」`);
                go(base);
              });
            },
          },
          '新建文件夹',
        ),
      ],
      // 关掉时重画这一页 (显示在哪些文件夹里); 已经换到别的页就不管了
      onClose: () => {
        if (location.hash === base) go(base);
      },
    });
  }

  const inFolders = store.foldersOf(set.id);

  // 标题下面那行 (几张卡片、学了几张、暂停的) 和每天背新词的计划 (今天要背几张)
  const progressEl = h('p', { class: 'set-meta' });
  const planBox = h('div', { class: 'plan-box' });
  function drawTop() {
    fill(
      progressEl,
      progressLine(set),
      inFolders.length ? [' · ', inFolders.map((f, i) => [i ? '、' : '', h('a', { href: `#/folder/${encodeURIComponent(f.id)}` }, f.name || '未命名文件夹')])] : null,
    );
    fill(planBox, total ? planPanel({ store, go }, set) : null);
  }

  drawList();
  drawTop();

  return {
    title,
    el: h(
      'section',
      { class: 'set-page' },
      h('a', { class: 'back', href: '#/' }, '← 首页'),
      h('div', { class: 'set-head' }, h('h1', {}, title), h('div', { class: 'row' }, h('a', { class: 'btn', href: `${base}/edit` }, icon('edit', 16), '编辑'), more)),
      progressEl,
      set.description ? h('p', { class: 'description' }, set.description) : null,
      planBox, // 每天背新词的计划, 今天要背的
      modes,
      set.virtual ? null : diagramSection(set),
      h('div', { class: 'list-head' }, h('h2', {}, `卡片 · ${num(total)}`), h('div', { class: 'chips' }, filters.all, filters.starred, filters.leech, filters.suspended)),
      listEl,
    ),
  };
}

function progressLine(set) {
  const total = set.cards.length;
  const parts = [`${num(total)} 张卡片`];
  const scheduled = set.cards.filter((c) => set.stats[c.id]?.due > 0).length;
  const mastered = Object.values(set.learn).filter((l) => l === 2).length;
  if (scheduled) parts.push(`复习中 ${num(scheduled)}`);
  if (mastered) parts.push(`已掌握 ${num(mastered)}`);
  if (set.known.length) parts.push(`单词卡已会 ${num(set.known.length)}`);
  const paused = set.cards.filter((c) => isSuspended(set.stats[c.id])).length;
  if (paused) parts.push(`已暂停 ${num(paused)}`);
  return parts.join(' · ');
}

function levelBadge(level) {
  if (level === 2) return h('span', { class: 'badge good', title: '学习模式中已掌握' }, '已掌握');
  if (level === 1) return h('span', { class: 'badge mid', title: '学习模式中已认识，尚需拼写' }, '已认识');
  return null;
}

const MODE_ICONS = { cards: 'cards', learn: 'bulb', test: 'list', game: 'game', pin: 'folder' };
const modeIcon = (key) => h('span', { class: 'mode-icon' }, icon(MODE_ICONS[key] ?? key, 20));

// 学习方式的一格 (卡片集页、文件夹页都用)
export function mode(key, name, hint, href, enabled) {
  if (!enabled) return h('div', { class: 'mode disabled', 'aria-disabled': 'true' }, modeIcon(key), h('span', { class: 'mode-name' }, name), h('span', { class: 'mode-hint' }, '请先添加卡片'));
  return h('a', { class: 'mode', href }, modeIcon(key), h('span', { class: 'mode-name' }, name), h('span', { class: 'mode-hint' }, hint));
}
