// 一个题目集: 开始答题、我的成绩 (排行榜)、所有题目

import { h, toast } from '../dom.js';
import { rich, cardImage } from '../cardview.js';
import { openShareDialog } from './share.js';
import { SHAPES, optionsOf, isMulti, topRuns } from '../quiz.js';

const dateText = (t) => {
  const d = new Date(t);
  return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

export const typeLabel = (q) => (q.type === 'tf' ? '判断题' : isMulti(q) ? '多选题' : '单选题');

// 排行榜: 限时答的分数从高到低; mark 是这一次 (答完的页面上标出来)
export function scoreBoard(runs, { mark = null, n = 5 } = {}) {
  const top = topRuns(runs, n);
  if (!top.length) return null;
  return h(
    'ol',
    { class: 'score-board' },
    top.map((r, i) =>
      h(
        'li',
        { class: r.at === mark ? 'this' : '' },
        h('span', { class: 'sb-rank' }, ['🥇', '🥈', '🥉'][i] ?? String(i + 1)),
        h('span', { class: 'sb-score' }, `${r.score} 分`),
        h('span', { class: 'sb-meta' }, `对 ${r.correct}/${r.total} · ${r.at === mark ? '这次' : dateText(r.at)}`),
      ),
    ),
  );
}

export function renderQuizSet({ store, go }, set) {
  const base = `#/set/${encodeURIComponent(set.id)}`;
  const total = set.cards.length;
  const last = set.runs[0];
  const board = scoreBoard(set.runs);

  const list = h(
    'ol',
    { class: 'quiz-list' },
    set.cards.map((card, i) => {
      const q = card.q;
      const options = optionsOf(q);
      return h(
        'li',
        { class: 'quiz-item' },
        h('div', { class: 'qi-head' }, h('span', { class: 'qi-num' }, `${i + 1}`), h('span', { class: 'qi-tag' }, typeLabel(q)), h('span', { class: 'muted small' }, q.time < 60 ? `${q.time} 秒` : `${q.time / 60} 分钟`)),
        h('div', { class: 'qi-question' }, cardImage(card.image, 'qi-img'), rich(card.term)),
        h(
          'ul',
          { class: `qi-options${q.type === 'tf' ? ' tf' : ''}` },
          options.map((text, j) =>
            h('li', { class: q.correct.includes(j) ? 'right' : '' }, h('span', { class: `qi-shape opt-c${q.type === 'tf' ? (j === 0 ? 1 : 0) : j}`, 'aria-hidden': 'true' }, q.type === 'tf' ? (j === 0 ? '✓' : '✕') : SHAPES[j]), rich(text), q.correct.includes(j) ? h('span', { class: 'qi-right', 'aria-label': '对的答案' }, '✓') : null),
          ),
        ),
      );
    }),
  );

  return {
    title: set.title,
    el: h(
      'section',
      { class: 'quiz-set' },
      h('a', { class: 'back', href: '#/' }, '← 我的卡片集'),
      h('h1', {}, set.title || '未命名题目集'),
      set.description ? h('p', { class: 'description' }, set.description) : null,
      h('p', { class: 'muted' }, `📝 题目集 · ${total} 道题`),
      h(
        'div',
        { class: 'quiz-hero' },
        h(
          'div',
          {},
          h('strong', {}, set.best.quiz ? `最高 ${set.best.quiz} 分` : '还没答过'),
          h('div', { class: 'muted small' }, last ? `上次: ${last.timed ? `${last.score} 分, ` : '不限时, '}对 ${last.correct}/${last.total} 题` : '每题限时, 答得越快分越高, 连对还加分'),
        ),
        h('a', { class: 'btn primary big-choice', href: `${base}/play` }, '▶ 开始答题'),
      ),
      board ? h('div', { class: 'quiz-board' }, h('h2', { class: 'games-title' }, '我的成绩'), board) : null,
      h(
        'div',
        { class: 'row' },
        h('a', { class: 'btn', href: `${base}/edit` }, '编辑'),
        h('button', { class: 'btn', onclick: () => openShareDialog(set) }, '分享'),
        h(
          'button',
          {
            class: 'btn danger',
            onclick: () => {
              if (!confirm(`删掉「${set.title || '未命名题目集'}」? 删了就找不回来了。`)) return;
              store.deleteSet(set.id);
              toast('删掉了');
              go('#/');
            },
          },
          '删除',
        ),
      ),
      h('h2', {}, `题目 (${total})`),
      list,
    ),
  };
}
