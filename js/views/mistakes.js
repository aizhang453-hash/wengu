// 错题集: 记下的错题, 今天该重做几道、按题型数一数 (哪类错得最多, 能单练一类)、一道道列出来 (可以筛、可以搜),
// 记新的 (打字, 或者拍照让 AI 记)、改、删; 「选择」勾好几道 (或全选一类) 一起删

import { h, fill, toast, menuButton, icon } from '../dom.js';
import { rich, cardImage } from '../cardview.js';
import { DAY } from '../srs.js';
import { dueMistakes, mistakeStatus, matchesSearch, answerLabel, mineLabel, kindOf, kindStats, attempted } from '../mistakes.js';

const FILTER_KEY = 'wengu:mistakes-filter';

// 下次哪天重做, 说成人话
export function statusText(m, now = Date.now()) {
  const st = mistakeStatus(m, now);
  if (st === 'mastered') return '已掌握';
  if (st === 'due') return '今日待重做';
  const days = Math.round((new Date(m.review.due).setHours(0, 0, 0, 0) - new Date(now).setHours(0, 0, 0, 0)) / DAY);
  return days <= 1 ? '明日重做' : `${days} 天后重做`;
}

export function renderMistakes({ store }) {
  const all = store.allMistakes();
  let filter = 'all';
  try {
    filter = localStorage.getItem(FILTER_KEY) || 'all';
  } catch {
    // 用默认的
  }
  let query = '';
  let kind = ''; // 只看这类 (空: 全部)
  let shown = []; // 现在列出来的
  // 选择: 勾好几道一起删 (只算现在列出来的: 换了筛选、搜索, 看不见的就不选了)
  let selecting = false;
  const selected = new Set();
  const rows = new Map(); // id → { li, box }: 勾一道只改这一道, 不整个重画 (图片不用重新读)

  const listEl = h('ul', { class: 'mk-list' });
  const filters = [
    ['all', '全部'],
    ['due', '待重做'],
    ['learning', '未掌握'],
    ['mastered', '已掌握'],
  ];
  const chips = filters.map(([key]) =>
    h(
      'button',
      {
        class: 'chip',
        type: 'button',
        onclick: () => {
          filter = key;
          try {
            localStorage.setItem(FILTER_KEY, key);
          } catch {
            // 存不了就算了
          }
          drawList();
        },
      },
    ),
  );
  const search = h('input', { class: 'input mk-search', type: 'search', placeholder: '搜索错题', 'aria-label': '搜索错题', oninput: () => ((query = search.value), drawList()) });
  const kindPick = h('select', { class: 'input mk-kind-pick', 'aria-label': '按题型筛选', onchange: (e) => ((kind = e.target.value), drawList()) });
  const selectBtn = h('button', { class: 'btn small mk-select-btn', type: 'button', onclick: () => setSelecting(!selecting) }, '选择');
  const toolsEl = h('div', { class: 'mk-tools' }, h('div', { class: 'chips' }, chips), h('div', { class: 'mk-tools-right' }, kindPick, search, selectBtn));

  // 选择时上面的一条: 已选几道、全选、删除、完成
  const pickedText = h('span', { class: 'mk-select-count' });
  const allBtn = h('button', { class: 'btn small', type: 'button', onclick: toggleAll });
  const deleteBtn = h('button', { class: 'btn small primary', type: 'button', onclick: deleteSelected }, icon('trash', 16), '删除');
  const selectBar = h('div', { class: 'mk-select-bar', hidden: true }, pickedText, h('div', { class: 'row' }, allBtn, deleteBtn, h('button', { class: 'btn small quiet', type: 'button', onclick: () => setSelecting(false) }, '完成')));

  const heroEl = h('div', { class: 'quiz-hero' });
  const kindsEl = h('div');

  function setSelecting(on) {
    selecting = on;
    selected.clear();
    selectBtn.classList.toggle('on', on);
    selectBtn.textContent = on ? '取消选择' : '选择';
    drawList();
  }

  function pick(id, on) {
    if (on) selected.add(id);
    else selected.delete(id);
    const row = rows.get(id);
    if (!row) return;
    row.li.classList.toggle('picked', on);
    row.box.checked = on;
  }

  function toggleAll() {
    const every = shown.length && shown.every((m) => selected.has(m.id));
    for (const m of shown) pick(m.id, !every);
    drawSelectBar();
  }

  function drawSelectBar() {
    selectBar.hidden = !selecting;
    if (!selecting) return;
    const every = shown.length && shown.every((m) => selected.has(m.id));
    pickedText.textContent = selected.size ? `已选 ${selected.size} 道` : '点击题目进行选择';
    allBtn.textContent = every ? '取消全选' : `全选（${shown.length}）`;
    allBtn.disabled = !shown.length;
    deleteBtn.disabled = !selected.size;
  }

  function remove(ids) {
    const n = store.deleteMistakes(ids);
    const gone = new Set(ids);
    for (let i = all.length - 1; i >= 0; i--) if (gone.has(all[i].id)) all.splice(i, 1);
    return n;
  }

  function deleteSelected() {
    const ids = [...selected];
    if (!ids.length || !confirm(`删除所选的 ${ids.length} 道错题？删除后无法恢复。`)) return;
    const n = remove(ids);
    toast(`已删除 ${n} 道`);
    setSelecting(false);
    drawTop();
  }

  function drawList() {
    const now = Date.now();
    const count = { all: all.length, due: dueMistakes(all, now).length, learning: all.filter((m) => !m.review?.mastered).length, mastered: all.filter((m) => m.review?.mastered).length };
    chips.forEach((c, i) => {
      const [key, label] = filters[i];
      c.textContent = `${label} ${count[key]}`;
      c.classList.toggle('on', key === filter);
    });
    shown = all.filter((m) => {
      if (filter === 'due' && mistakeStatus(m, now) !== 'due') return false;
      if (filter === 'learning' && m.review?.mastered) return false;
      if (filter === 'mastered' && !m.review?.mastered) return false;
      if (kind && kindOf(m) !== kind) return false;
      return matchesSearch(m, query);
    });
    const visible = new Set(shown.map((m) => m.id));
    for (const id of [...selected]) if (!visible.has(id)) selected.delete(id);
    listEl.classList.toggle('selecting', selecting);
    rows.clear();
    fill(
      listEl,
      shown.length
        ? shown.map((m) => itemEl(m, now))
        : h('li', { class: 'muted empty-note' }, query ? '没有找到相关错题。' : filter === 'due' ? '今日没有待重做的错题。' : filter === 'mastered' ? '暂无已掌握的错题。重做时连续答对 3 次即为掌握。' : '暂无错题。'),
    );
    drawSelectBar();
  }

  function itemEl(m, now) {
    const st = mistakeStatus(m, now);
    const mine = mineLabel(m);
    const picked = selected.has(m.id);
    const toggle = () => {
      pick(m.id, !selected.has(m.id));
      drawSelectBar();
    };
    const box = selecting ? h('input', { type: 'checkbox', class: 'mk-pick', checked: picked, 'aria-label': '选择这道错题', onchange: toggle }) : null;
    const li = h(
      'li',
      {
        class: `mk-item${picked ? ' picked' : ''}`,
        // 选择时点整道题就是勾上 / 取消
        onclick: selecting ? (e) => (e.target.closest('input') ? null : toggle()) : null,
      },
      h(
        'div',
        { class: 'mk-item-head' },
        box,
        h('span', { class: `mk-status ${st}` }, statusText(m, now)),
        h('span', { class: `qi-tag mk-kind${m.kind ? '' : ' guess'}`, title: m.kind ? '题型' : '自动识别的题型，可在编辑中修改' }, kindOf(m)),
        h('span', { class: 'qi-tag' }, m.type === 'input' ? '填空题' : '选择题'),
        // 还没做过的练习题 (没记我的答案, 也还没重做过)
        attempted(m) || m.review?.right || m.review?.wrong ? null : h('span', { class: 'qi-tag' }, '未作答'),
        m.passage ? h('span', { class: 'qi-tag' }, '含材料') : null,
        m.images.length ? h('span', { class: 'qi-tag' }, `${m.images.length} 张图`) : null,
        m.review?.right || m.review?.wrong ? h('span', { class: 'muted small' }, `重做 ${m.review.right + m.review.wrong} 次，答对 ${m.review.right} 次`) : null,
      ),
      m.question ? h('div', { class: 'mk-question' }, rich(m.question)) : null,
      m.images.length ? h('div', { class: 'mk-thumbs' }, m.images.slice(0, 3).map((id) => cardImage(id, 'mk-thumb'))) : null,
      h('div', { class: 'mk-line ok' }, h('span', { class: 'mk-line-label' }, '正确答案'), rich(answerLabel(m))),
      mine ? h('div', { class: 'mk-line bad' }, h('span', { class: 'mk-line-label' }, '我的答案'), rich(mine)) : null,
      m.note ? h('div', { class: 'mk-note' }, rich(m.note)) : null,
      selecting
        ? null
        : h(
            'div',
            { class: 'row mk-actions' },
            h('a', { class: 'btn small', href: `#/mistakes/review/${encodeURIComponent(m.id)}` }, '重做'),
            h('a', { class: 'btn small', href: `#/mistakes/${encodeURIComponent(m.id)}/edit` }, '编辑'),
            h(
              'button',
              {
                class: 'btn small danger',
                type: 'button',
                onclick: () => {
                  if (!confirm('删除这道错题？删除后无法恢复。')) return;
                  remove([m.id]);
                  toast('已删除');
                  drawTop();
                },
              },
              '删除',
            ),
          ),
    );
    if (box) rows.set(m.id, { li, box });
    return li;
  }

  // 上面的: 今天该重做几道、题型分布、题型的下拉 (删了题以后跟着变)
  function drawTop() {
    const due = dueMistakes(all);
    const mastered = all.filter((m) => m.review?.mastered);
    const learning = all.filter((m) => !m.review?.mastered);
    const tomorrow = learning.filter((m) => mistakeStatus(m) === 'later' && m.review.due < new Date().setHours(0, 0, 0, 0) + 2 * DAY).length;
    fill(
      heroEl,
      h(
        'div',
        {},
        h('strong', {}, due.length ? `今日待重做 ${due.length} 道` : all.length ? '今日没有待重做的错题' : '暂无错题'),
        h('div', { class: 'muted small' }, all.length ? `共 ${all.length} 道 · 已掌握 ${mastered.length} 道${tomorrow ? ` · 明日 ${tomorrow} 道` : ''}` : '记录错题或练习题，按间隔重做；连续答对 3 次即为掌握'),
      ),
      h(
        'div',
        { class: 'row' },
        due.length ? h('a', { class: 'btn primary big-choice', href: '#/mistakes/review' }, `开始重做（${due.length}）`) : null,
        learning.length > due.length ? h('a', { class: `btn${due.length ? '' : ' primary'}`, href: '#/mistakes/review/all' }, `重做全部未掌握（${learning.length}）`) : null,
      ),
    );
    const kinds = kindStats(all);
    fill(kindsEl, kindSection(kinds, all.length));
    if (kind && !kinds.some((k) => k.kind === kind)) kind = ''; // 这类删光了
    fill(kindPick, h('option', { value: '' }, '全部题型'), kinds.map((k) => h('option', { value: k.kind }, `${k.kind} (${k.total})`)));
    kindPick.value = kind;
    kindPick.hidden = kinds.length < 2;
    toolsEl.hidden = !all.length;
    drawList();
  }

  drawTop();
  return {
    title: '错题集',
    el: h(
      'section',
      { class: 'mistakes-page' },
      h('a', { class: 'back', href: '#/' }, '← 首页'),
      h(
        'div',
        { class: 'page-head' },
        h('h1', {}, '错题集'),
        menuButton(
          [
            { label: '手动记录', icon: 'edit', href: '#/mistakes/new' },
            { label: '拍照录入', icon: 'camera', href: '#/mistakes/import' },
          ],
          { label: '添加错题', text: '添加', cls: 'btn primary', iconName: 'plus' },
        ),
      ),
      heroEl,
      kindsEl,
      toolsEl,
      selectBar,
      listEl,
    ),
  };
}

// 按题型: 每类几道、还有几道没掌握、重做时对了几成, 能单练一类; 错得最多的写在上面
function kindSection(kinds, total) {
  if (total < 3 || !kinds.length) return null;
  const top = kinds[0];
  const pct = (k) => (k.right + k.wrong ? `正确率 ${Math.round((k.right / (k.right + k.wrong)) * 100)}%` : '尚未重做');
  // 题型多的先列 5 类, 其余点「显示全部」
  const SHOW = 5;
  const list = h(
    'ul',
    { class: 'mk-kind-list' },
    kinds.map((k, i) =>
      h(
        'li',
        { hidden: i >= SHOW },
        h('span', { class: 'mk-kind-name' }, k.kind),
        h('span', { class: 'mk-kind-bar', 'aria-hidden': 'true' }, h('span', { style: `width: ${Math.round((k.total / top.total) * 100)}%` })),
        h('span', { class: 'muted small' }, `${k.total} 道 · 未掌握 ${k.left} · ${pct(k)}`),
        k.left ? h('a', { class: 'btn small', href: `#/mistakes/review/kind:${encodeURIComponent(k.kind)}` }, '专项练习') : h('span', { class: 'muted small' }, '已全部掌握'),
      ),
    ),
  );
  const more =
    kinds.length > SHOW
      ? h(
          'button',
          {
            class: 'btn small quiet',
            type: 'button',
            onclick: () => {
              list.querySelectorAll('li[hidden]').forEach((li) => (li.hidden = false));
              more.remove();
            },
          },
          `显示全部 ${kinds.length} 类`,
        )
      : null;
  return h(
    'section',
    { class: 'mk-kinds' },
    h('h2', {}, '题型分布'),
    h(
      'p',
      { class: 'muted small' },
      kinds.length > 1 ? `错题最多的题型是「${top.kind}」，共 ${top.total} 道，占 ${Math.round((top.total / total) * 100)}%。` : `全部为「${top.kind}」。`,
    ),
    list,
    more,
  );
}
