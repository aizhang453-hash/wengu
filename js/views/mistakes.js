// 错题集: 记下的错题, 今天该重做几道、按题型数一数 (哪类错得最多, 能单练一类)、一道道列出来 (可以筛、可以搜),
// 记新的 (打字, 或者拍照让 AI 记)、改、删

import { h, toast, menuButton } from '../dom.js';
import { rich, cardImage } from '../cardview.js';
import { DAY } from '../srs.js';
import { dueMistakes, mistakeStatus, matchesSearch, answerLabel, mineLabel, kindOf, kindStats } from '../mistakes.js';

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
  const due = dueMistakes(all);
  const mastered = all.filter((m) => m.review?.mastered);
  const learning = all.filter((m) => !m.review?.mastered);
  let filter = 'all';
  try {
    filter = localStorage.getItem(FILTER_KEY) || 'all';
  } catch {
    // 用默认的
  }
  let query = '';
  let kind = ''; // 只看这类 (空: 全部)

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
  const kinds = kindStats(all);
  const kindPick =
    kinds.length > 1
      ? h(
          'select',
          { class: 'input mk-kind-pick', 'aria-label': '按题型筛选', onchange: (e) => ((kind = e.target.value), drawList()) },
          h('option', { value: '' }, '全部题型'),
          kinds.map((k) => h('option', { value: k.kind }, `${k.kind} (${k.total})`)),
        )
      : null;

  function drawList() {
    const now = Date.now();
    const count = { all: all.length, due: dueMistakes(all, now).length, learning: all.filter((m) => !m.review?.mastered).length, mastered: all.filter((m) => m.review?.mastered).length };
    chips.forEach((c, i) => {
      const [key, label] = filters[i];
      c.textContent = `${label} ${count[key]}`;
      c.classList.toggle('on', key === filter);
    });
    const shown = all.filter((m) => {
      if (filter === 'due' && mistakeStatus(m, now) !== 'due') return false;
      if (filter === 'learning' && m.review?.mastered) return false;
      if (filter === 'mastered' && !m.review?.mastered) return false;
      if (kind && kindOf(m) !== kind) return false;
      return matchesSearch(m, query);
    });
    listEl.replaceChildren(
      ...(shown.length
        ? shown.map((m) => {
            const st = mistakeStatus(m, now);
            const mine = mineLabel(m);
            return h(
              'li',
              { class: 'mk-item' },
              h(
                'div',
                { class: 'mk-item-head' },
                h('span', { class: `mk-status ${st}` }, statusText(m, now)),
                h('span', { class: `qi-tag mk-kind${m.kind ? '' : ' guess'}`, title: m.kind ? '题型' : '自动识别的题型，可在编辑中修改' }, kindOf(m)),
                h('span', { class: 'qi-tag' }, m.type === 'input' ? '填空题' : '选择题'),
                m.passage ? h('span', { class: 'qi-tag' }, '含材料') : null,
                m.images.length ? h('span', { class: 'qi-tag' }, `${m.images.length} 张图`) : null,
                m.review?.right || m.review?.wrong ? h('span', { class: 'muted small' }, `重做 ${m.review.right + m.review.wrong} 次，答对 ${m.review.right} 次`) : null,
              ),
              m.question ? h('div', { class: 'mk-question' }, rich(m.question)) : null,
              m.images.length ? h('div', { class: 'mk-thumbs' }, m.images.slice(0, 3).map((id) => cardImage(id, 'mk-thumb'))) : null,
              h('div', { class: 'mk-line ok' }, h('span', { class: 'mk-line-label' }, '正确答案'), rich(answerLabel(m))),
              mine ? h('div', { class: 'mk-line bad' }, h('span', { class: 'mk-line-label' }, '我的答案'), rich(mine)) : null,
              m.note ? h('div', { class: 'mk-note' }, rich(m.note)) : null,
              h(
                'div',
                { class: 'row mk-actions' },
                h('a', { class: 'btn small', href: `#/mistakes/review/${encodeURIComponent(m.id)}` }, '重做'),
                h('a', { class: 'btn small', href: `#/mistakes/${encodeURIComponent(m.id)}/edit` }, '编辑'),
                h(
                  'button',
                  {
                    class: 'btn small danger',
                    onclick: () => {
                      if (!confirm('删除这道错题？删除后无法恢复。')) return;
                      store.deleteMistake(m.id);
                      toast('已删除');
                      all.splice(all.indexOf(m), 1);
                      drawList();
                    },
                  },
                  '删除',
                ),
              ),
            );
          })
        : [h('li', { class: 'muted empty-note' }, query ? '没有找到相关错题。' : filter === 'due' ? '今日没有待重做的错题。' : filter === 'mastered' ? '暂无已掌握的错题。重做时连续答对 3 次即为掌握。' : '暂无错题。')]),
    );
  }

  const tomorrow = learning.filter((m) => mistakeStatus(m) === 'later' && m.review.due < new Date().setHours(0, 0, 0, 0) + 2 * DAY).length;
  const hero = h(
    'div',
    { class: 'quiz-hero' },
    h(
      'div',
      {},
      h('strong', {}, due.length ? `今日待重做 ${due.length} 道` : all.length ? '今日没有待重做的错题' : '暂无错题'),
      h('div', { class: 'muted small' }, all.length ? `共 ${all.length} 道 · 已掌握 ${mastered.length} 道${tomorrow ? ` · 明日 ${tomorrow} 道` : ''}` : '记录做错的题目，按间隔重做；连续答对 3 次即为掌握'),
    ),
    h(
      'div',
      { class: 'row' },
      due.length ? h('a', { class: 'btn primary big-choice', href: '#/mistakes/review' }, `开始重做（${due.length}）`) : null,
      learning.length > due.length ? h('a', { class: `btn${due.length ? '' : ' primary'}`, href: '#/mistakes/review/all' }, `重做全部未掌握（${learning.length}）`) : null,
    ),
  );

  drawList();
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
      hero,
      kindSection(kinds, all.length),
      all.length ? h('div', { class: 'mk-tools' }, h('div', { class: 'chips' }, chips), kindPick, search) : null,
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
