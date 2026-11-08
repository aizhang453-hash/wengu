// 错题集: 题按「题目集」放 (像卡片集: 一个题目集里放着一组题, 比如「AP微积分」「Il Postino 电影题」)。
//   #/mistakes          所有题目集 (今天一共该重做几道; 每个题目集几道、该重做几道、掌握了多少); 新建题目集; 在所有题里搜
//   #/mistakes/set/<id> 一个题目集: 今天该重做几道、按题型数一数 (哪类错得最多, 能单练一类)、一道道列出来 (可以筛、可以搜),
//                       记新的 (打字, 或者拍照让 AI 记)、改、删; 「选择」勾好几道 (或全选一类) 一起删、一起挪到别的题目集;
//                       题目集改名、删掉 (连里面的题)

import { h, fill, toast, menuButton, icon, askText, openDialog } from '../dom.js';
import { rich, cardImage } from '../cardview.js';
import { DAY } from '../srs.js';
import { dueMistakes, mistakeStatus, matchesSearch, answerLabel, mineLabel, kindOf, kindIn, kindStats, attempted, qsetCounts } from '../mistakes.js';

const FILTER_KEY = 'wengu:mistakes-filter';
export const LAST_QSET_KEY = 'wengu:last-qset'; // 上次往哪个题目集里记的: 下次记题先选上它

export const qsetHref = (id) => `#/mistakes/set/${encodeURIComponent(id)}`;
const reviewHref = (id, sub = '') => `#/mistakes/review/set:${encodeURIComponent(id)}${sub ? `/${sub}` : ''}`;
const qsetName = (q) => q?.title || '未命名题目集';

// 下次哪天重做, 说成人话
export function statusText(m, now = Date.now()) {
  const st = mistakeStatus(m, now);
  if (st === 'mastered') return '已掌握';
  if (st === 'due') return '今日待重做';
  const days = Math.round((new Date(m.review.due).setHours(0, 0, 0, 0) - new Date(now).setHours(0, 0, 0, 0)) / DAY);
  return days <= 1 ? '明日重做' : `${days} 天后重做`;
}

// 新建题目集: 问名字, 建好了调 then(题目集)
export function newQsetDialog(store, then) {
  askText({
    title: '新建题目集',
    label: '题目集名称',
    placeholder: '如 AP微积分、SAT 阅读、Il Postino 电影题',
    okText: '新建',
    onOk: (name) => {
      if (!name.trim()) return toast('请填写名称');
      then(store.addQset(name.trim()));
    },
  });
}

// 记题时默认放哪个题目集: 说好了的 (从题目集里点「添加题目」) → 上次记的 → 最近动过的; 一个都没有: '' (按题型自动放)
export function defaultQset(store, wanted = '') {
  if (wanted && store.getQset(wanted)) return wanted;
  let last = '';
  try {
    last = localStorage.getItem(LAST_QSET_KEY) ?? '';
  } catch {
    // 用最近的
  }
  if (store.getQset(last)) return last;
  return store.allQsets()[0]?.id ?? '';
}

export function rememberQset(id) {
  try {
    if (id) localStorage.setItem(LAST_QSET_KEY, id);
  } catch {
    // 记不住就算了
  }
}

// 选题目集的下拉 (记一道、拍照录入用): 已有的题目集, 最后是「＋ 新建题目集…」; 还没有题目集时第一项是「按题型自动归类」。
// 返回 { el, value }; 换了调 onChange(id)
export function qsetPicker(store, initial = '', onChange = null) {
  let value = defaultQset(store, initial);
  const el = h('select', { class: 'input qset-pick', 'aria-label': '题目集' });
  function draw() {
    const qsets = store.allQsets();
    fill(el, qsets.length ? null : h('option', { value: '' }, '按题型自动归类'), qsets.map((q) => h('option', { value: q.id }, qsetName(q))), h('option', { value: '__new' }, '＋ 新建题目集…'));
    el.value = value;
  }
  el.addEventListener('change', () => {
    if (el.value !== '__new') {
      value = el.value;
      return onChange?.(value);
    }
    el.value = value; // 先退回去, 建好了再选上
    newQsetDialog(store, (q) => {
      value = q.id;
      draw();
      onChange?.(value);
    });
  });
  draw();
  return {
    el,
    get value() {
      return value;
    },
  };
}

// 一道题 (列表里): 状态、题型、题目、答案、笔记; 下面重做、编辑、删除。
// opts: { qset 在题目集里看 (题型去掉科目), setTag 写出在哪个题目集 (搜所有题时), selecting, picked, toggle, onDelete }
export function itemEl(store, m, now, opts = {}) {
  const st = mistakeStatus(m, now);
  const mine = mineLabel(m);
  const box = opts.selecting ? h('input', { type: 'checkbox', class: 'mk-pick', checked: opts.picked, 'aria-label': '选择这道题', onchange: opts.toggle }) : null;
  const where = opts.setTag ? store.getQset(m.set) : null;
  const li = h(
    'li',
    {
      class: `mk-item${opts.picked ? ' picked' : ''}`,
      // 选择时点整道题就是勾上 / 取消
      onclick: opts.selecting ? (e) => (e.target.closest('input') ? null : opts.toggle()) : null,
    },
    h(
      'div',
      { class: 'mk-item-head' },
      box,
      h('span', { class: `mk-status ${st}` }, statusText(m, now)),
      where ? h('a', { class: 'qi-tag mk-set-tag', href: qsetHref(where.id) }, qsetName(where)) : null,
      h('span', { class: `qi-tag mk-kind${m.kind ? '' : ' guess'}`, title: m.kind ? '题型' : '自动识别的题型，可在编辑中修改' }, opts.qset ? kindIn(m, opts.qset) : kindOf(m)),
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
    opts.selecting
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
                if (!confirm('删除这道题？删除后无法恢复。')) return;
                store.deleteMistakes([m.id]);
                toast('已删除');
                opts.onDelete?.();
              },
            },
            '删除',
          ),
        ),
  );
  return { li, box };
}

// 今天该重做几道 + 按钮 (所有题目集的, 或者一个题目集的)
function heroContent(all, { reviewDue, reviewAll, empty }) {
  const due = dueMistakes(all);
  const mastered = all.filter((m) => m.review?.mastered);
  const learning = all.filter((m) => !m.review?.mastered);
  const tomorrow = learning.filter((m) => mistakeStatus(m) === 'later' && m.review.due < new Date().setHours(0, 0, 0, 0) + 2 * DAY).length;
  return [
    h(
      'div',
      {},
      h('strong', {}, due.length ? `今日待重做 ${due.length} 道` : all.length ? '今日没有待重做的题' : '暂无题目'),
      h('div', { class: 'muted small' }, all.length ? `共 ${all.length} 道 · 已掌握 ${mastered.length} 道${tomorrow ? ` · 明日 ${tomorrow} 道` : ''}` : empty),
    ),
    h(
      'div',
      { class: 'row' },
      due.length ? h('a', { class: 'btn primary big-choice', href: reviewDue }, `开始重做（${due.length}）`) : null,
      learning.length > due.length ? h('a', { class: `btn${due.length ? '' : ' primary'}`, href: reviewAll }, `重做全部未掌握（${learning.length}）`) : null,
    ),
  ];
}

function meter(pct) {
  return h('span', { class: 'meter', title: `已掌握 ${pct}%` }, h('span', { class: 'meter-fill', style: `width:${pct}%` }));
}

// 题目集的方块 (错题集首页、主页上都用)
export function qsetTile(q, list, now = Date.now()) {
  const c = qsetCounts(list, now);
  const pct = c.total ? Math.round((c.mastered / c.total) * 100) : 0;
  const state = !c.total ? '暂无题目' : c.due ? `今日待重做 ${c.due}` : c.mastered === c.total ? '已全部掌握' : `已掌握 ${pct}%`;
  return h(
    'li',
    {},
    h(
      'a',
      { class: `set-tile qset-tile${c.due ? ' has-due' : ''}`, href: qsetHref(q.id) },
      h('span', { class: 'set-tile-title' }, qsetName(q)),
      h('span', { class: 'set-tile-meta' }, `${c.total} 道`, h('span', {}, state)),
      meter(pct),
    ),
  );
}

const addMenu = (setId = '') =>
  menuButton(
    [
      { label: '手动记录', icon: 'edit', href: setId ? `#/mistakes/new/${encodeURIComponent(setId)}` : '#/mistakes/new' },
      { label: '拍照录入', icon: 'camera', href: setId ? `#/mistakes/import/${encodeURIComponent(setId)}` : '#/mistakes/import' },
    ],
    { label: '添加题目', text: '添加题目', cls: setId ? 'btn primary' : 'btn', iconName: 'plus' },
  );

// ---- 题目集页 (v1.63 以前叫「错题集」): 所有题目集 ----
export function renderMistakes({ store, go }) {
  const qsets = store.allQsets();
  const all = store.allMistakes();
  const now = Date.now();
  const bySet = new Map(qsets.map((q) => [q.id, []]));
  for (const m of all) bySet.get(m.set)?.push(m);

  const resultsEl = h('div', { class: 'mk-results' });
  const search = h('input', {
    class: 'input mk-search',
    type: 'search',
    placeholder: '在所有题目集中搜索',
    'aria-label': '在所有题目集中搜索',
    oninput: () => drawResults(),
  });
  function drawResults() {
    const q = search.value.trim();
    if (!q) return fill(resultsEl);
    const found = all.filter((m) => matchesSearch(m, q));
    const t = Date.now();
    fill(
      resultsEl,
      h('p', { class: 'muted small' }, found.length ? `找到 ${found.length} 道` : '没有找到相关题目。'),
      found.length ? h('ul', { class: 'mk-list' }, found.slice(0, 100).map((m) => itemEl(store, m, t, { setTag: true, onDelete: () => go('#/mistakes') }).li)) : null,
    );
  }

  const newSet = () => newQsetDialog(store, (q) => go(qsetHref(q.id)));
  return {
    title: '题目集',
    el: h(
      'section',
      { class: 'mistakes-page' },
      h('a', { class: 'back', href: '#/' }, '← 首页'),
      h('div', { class: 'page-head' }, h('h1', {}, '题目集'), h('div', { class: 'row' }, qsets.length ? addMenu() : null, h('button', { class: 'btn primary', type: 'button', onclick: newSet }, icon('plus', 18), '新建题目集'))),
      all.length ? h('div', { class: 'quiz-hero' }, heroContent(all, { reviewDue: '#/mistakes/review', reviewAll: '#/mistakes/review/all', empty: '' })) : null,
      qsets.length
        ? [
            h('div', { class: 'list-head' }, h('h2', {}, '全部'), h('span', { class: 'muted small' }, `${qsets.length} 个`)),
            h('ul', { class: 'set-grid qset-grid' }, qsets.map((q) => qsetTile(q, bySet.get(q.id), now))),
            all.length ? h('div', { class: 'mk-search-all' }, search) : null,
            resultsEl,
          ]
        : h(
            'div',
            { class: 'empty-note mk-empty' },
            h('p', {}, '还没有题目集。'),
            h('p', { class: 'muted small' }, '题目集像卡片集一样，用来放一组题，比如「AP微积分」「SAT 阅读」。做错的题和还没做过的练习题都可以放进去，按间隔重做；连续答对 3 次即为掌握。'),
            h('div', { class: 'row center' }, h('button', { class: 'btn primary', type: 'button', onclick: newSet }, '新建题目集')),
          ),
    ),
  };
}

// ---- 一个题目集 ----
export function renderQset({ store, go }, id) {
  const qset = store.getQset(id);
  if (!qset) {
    return { title: '找不到', el: h('section', { class: 'empty' }, h('h1', {}, '题目集不存在'), h('p', { class: 'muted' }, '可能已经删除了。'), h('a', { class: 'btn primary', href: '#/mistakes' }, '返回题目集')) };
  }
  let all = store.mistakesIn(id);
  let filter = 'all';
  try {
    filter = localStorage.getItem(FILTER_KEY) || 'all';
  } catch {
    // 用默认的
  }
  let query = '';
  let kind = ''; // 只看这类 (空: 全部)
  let shown = []; // 现在列出来的
  // 选择: 勾好几道一起删 / 挪 (只算现在列出来的: 换了筛选、搜索, 看不见的就不选了)
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
  const search = h('input', { class: 'input mk-search', type: 'search', placeholder: '搜索题目', 'aria-label': '搜索题目', oninput: () => ((query = search.value), drawList()) });
  const kindPick = h('select', { class: 'input mk-kind-pick', 'aria-label': '按题型筛选', onchange: (e) => ((kind = e.target.value), drawList()) });
  const selectBtn = h('button', { class: 'btn small mk-select-btn', type: 'button', onclick: () => setSelecting(!selecting) }, '选择');
  const toolsEl = h('div', { class: 'mk-tools' }, h('div', { class: 'chips' }, chips), h('div', { class: 'mk-tools-right' }, kindPick, search, selectBtn));

  // 选择时上面的一条: 已选几道、全选、移到、删除、完成
  const pickedText = h('span', { class: 'mk-select-count' });
  const allBtn = h('button', { class: 'btn small', type: 'button', onclick: toggleAll });
  const moveBtn = h('button', { class: 'btn small', type: 'button', onclick: moveSelected }, '移到…');
  const deleteBtn = h('button', { class: 'btn small primary', type: 'button', onclick: deleteSelected }, icon('trash', 16), '删除');
  const selectBar = h('div', { class: 'mk-select-bar', hidden: true }, pickedText, h('div', { class: 'row' }, allBtn, moveBtn, deleteBtn, h('button', { class: 'btn small quiet', type: 'button', onclick: () => setSelecting(false) }, '完成')));

  const heroEl = h('div', { class: 'quiz-hero' });
  const kindsEl = h('div');
  const emptyEl = h('div');

  function setSelecting(on) {
    selecting = on;
    selected.clear();
    selectBtn.classList.toggle('on', on);
    selectBtn.textContent = on ? '取消选择' : '选择';
    drawList();
  }

  function pick(mid, on) {
    if (on) selected.add(mid);
    else selected.delete(mid);
    const row = rows.get(mid);
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
    moveBtn.disabled = !selected.size;
    deleteBtn.disabled = !selected.size;
  }

  // 题变了 (删了、挪走了): 重新读这个题目集的题, 上面的数字跟着变
  function reload() {
    all = store.mistakesIn(id);
    drawTop();
  }

  function deleteSelected() {
    const ids = [...selected];
    if (!ids.length || !confirm(`删除所选的 ${ids.length} 道题？删除后无法恢复。`)) return;
    const n = store.deleteMistakes(ids);
    toast(`已删除 ${n} 道`);
    setSelecting(false);
    reload();
  }

  // 挪到别的题目集 (或者新建一个挪过去)
  function moveSelected() {
    const ids = [...selected];
    if (!ids.length) return;
    const moveTo = (target) => {
      const n = store.moveMistakes(ids, target.id);
      dialog?.close();
      toast(`已将 ${n} 道移到「${qsetName(target)}」`);
      setSelecting(false);
      reload();
    };
    const others = store.allQsets().filter((q) => q.id !== id);
    const dialog = openDialog({
      title: `移动 ${ids.length} 道题`,
      body: h(
        'ul',
        { class: 'pick-list' },
        others.map((q) => h('li', {}, h('button', { class: 'pick-row', type: 'button', onclick: () => moveTo(q) }, h('span', { class: 'pick-body' }, h('span', { class: 'pick-title' }, qsetName(q)), h('span', { class: 'pick-meta' }, `${store.mistakesIn(q.id).length} 道`)), icon('right', 20)))),
        h('li', {}, h('button', { class: 'pick-row', type: 'button', onclick: () => (dialog.close(), newQsetDialog(store, moveTo)) }, h('span', { class: 'pick-body' }, h('span', { class: 'pick-title' }, '＋ 新建题目集')), icon('plus', 20))),
      ),
    });
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
    for (const mid of [...selected]) if (!visible.has(mid)) selected.delete(mid);
    listEl.classList.toggle('selecting', selecting);
    rows.clear();
    fill(
      listEl,
      shown.length
        ? shown.map((m) => {
            const toggle = () => {
              pick(m.id, !selected.has(m.id));
              drawSelectBar();
            };
            const { li, box } = itemEl(store, m, now, { qset, selecting, picked: selected.has(m.id), toggle, onDelete: reload });
            if (box) rows.set(m.id, { li, box });
            return li;
          })
        : all.length
          ? h('li', { class: 'muted empty-note' }, query ? '没有找到相关题目。' : filter === 'due' ? '今日没有待重做的题。' : filter === 'mastered' ? '暂无已掌握的题。重做时连续答对 3 次即为掌握。' : '没有符合条件的题。')
          : null,
    );
    drawSelectBar();
  }

  // 上面的: 今天该重做几道、题型分布、题型的下拉 (删了题以后跟着变)
  function drawTop() {
    fill(heroEl, heroContent(all, { reviewDue: reviewHref(id), reviewAll: reviewHref(id, 'all'), empty: '' }));
    heroEl.hidden = !all.length;
    const kinds = kindStats(all, (m) => kindIn(m, qset));
    fill(kindsEl, kindSection(kinds, all.length, id));
    if (kind && !kinds.some((k) => k.kind === kind)) kind = ''; // 这类删光了
    fill(kindPick, h('option', { value: '' }, '全部题型'), kinds.map((k) => h('option', { value: k.kind }, `${k.label} (${k.total})`)));
    kindPick.value = kind;
    kindPick.hidden = kinds.length < 2;
    toolsEl.hidden = !all.length;
    fill(
      emptyEl,
      all.length
        ? null
        : h(
            'div',
            { class: 'empty-note mk-empty' },
            h('p', {}, '这个题目集还没有题。'),
            h('p', { class: 'muted small' }, '可以手动记录，也可以把题目的照片发给 AI 识别后批量录入。'),
            h('div', { class: 'row center' }, h('a', { class: 'btn primary', href: `#/mistakes/new/${encodeURIComponent(id)}` }, '手动记录'), h('a', { class: 'btn', href: `#/mistakes/import/${encodeURIComponent(id)}` }, '拍照录入')),
          ),
    );
    drawList();
  }

  const titleEl = h('h1', {}, qsetName(qset));
  const more = menuButton(
    [
      {
        label: '重命名',
        icon: 'edit',
        onclick: () =>
          askText({
            title: '重命名题目集',
            label: '题目集名称',
            value: qset.title,
            okText: '保存',
            onOk: (name) => {
              if (!name.trim()) return toast('请填写名称');
              store.renameQset(id, name.trim());
              titleEl.textContent = qsetName(qset);
              document.title = `${qsetName(qset)} · 温故`;
            },
          }),
      },
      null,
      {
        label: '删除题目集',
        icon: 'trash',
        danger: true,
        onclick: () => {
          const n = store.mistakesIn(id).length;
          if (!confirm(n ? `删除题目集「${qsetName(qset)}」和里面的 ${n} 道题？删除后无法恢复。` : `删除题目集「${qsetName(qset)}」？`)) return;
          store.deleteQset(id);
          toast('已删除');
          go('#/mistakes');
        },
      },
    ],
    { label: '更多' },
  );

  drawTop();
  rememberQset(id);
  return {
    title: qsetName(qset),
    el: h(
      'section',
      { class: 'mistakes-page' },
      h('a', { class: 'back', href: '#/mistakes' }, '← 全部题目集'),
      h('div', { class: 'page-head' }, h('div', { class: 'qset-head' }, titleEl, more), addMenu(id)),
      heroEl,
      emptyEl,
      kindsEl,
      toolsEl,
      selectBar,
      listEl,
    ),
  };
}

// 按题型: 每类几道、还有几道没掌握、重做时对了几成, 能单练一类; 错得最多的写在上面
function kindSection(kinds, total, setId) {
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
        h('span', { class: 'mk-kind-name' }, k.label),
        h('span', { class: 'mk-kind-bar', 'aria-hidden': 'true' }, h('span', { style: `width: ${Math.round((k.total / top.total) * 100)}%` })),
        h('span', { class: 'muted small' }, `${k.total} 道 · 未掌握 ${k.left} · ${pct(k)}`),
        k.left ? h('a', { class: 'btn small', href: reviewHref(setId, `kind:${encodeURIComponent(k.kind)}`) }, '专项练习') : h('span', { class: 'muted small' }, '已全部掌握'),
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
    h('p', { class: 'muted small' }, kinds.length > 1 ? `错得最多的题型是「${top.label}」，共 ${top.total} 道，占 ${Math.round((top.total / total) * 100)}%。` : `全部为「${top.label}」。`),
    list,
    more,
  );
}
