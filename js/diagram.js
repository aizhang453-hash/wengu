// 标注图 (照 Quizlet 的 Diagrams): 一张图, 上面标几个点, 每个点是一张卡片。
// set.diagram = { image: 图片的媒体 id, pins: [{ cardId, x, y }] }, x、y 是 0~1 (占图片宽、高的几分之几)。
// 点的编号就是在 pins 里的顺序 (从 1 开始)。

import { distractors, shuffle } from './questions.js';

const MEDIA = /^m_[\w-]+$/;
const clamp01 = (n) => Math.min(1, Math.max(0, n));

// 存之前整理: 图片 id 不对就没有标注图; 点要对得上卡片, 一张卡片一个点
export function cleanDiagram(raw, cardIds) {
  if (!raw || typeof raw !== 'object' || typeof raw.image !== 'string' || !MEDIA.test(raw.image)) return null;
  const seen = new Set();
  const pins = [];
  for (const p of Array.isArray(raw.pins) ? raw.pins : []) {
    if (!p || !cardIds.has(p.cardId) || seen.has(p.cardId)) continue;
    const x = Number(p.x);
    const y = Number(p.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    seen.add(p.cardId);
    pins.push({ cardId: p.cardId, x: clamp01(x), y: clamp01(y) });
  }
  return { image: raw.image, pins };
}

// 标了点的卡片: [{ cardId, x, y, number, card }]
export function pinnedCards(set) {
  if (!set?.diagram) return [];
  const byId = new Map(set.cards.map((c) => [c.id, c]));
  return set.diagram.pins.map((p, i) => ({ ...p, number: i + 1, card: byId.get(p.cardId) })).filter((p) => p.card);
}

export function pinOf(set, cardId) {
  return pinnedCards(set).find((p) => p.cardId === cardId) ?? null;
}

// 点在图上哪里 (x、y 是 0~1), 找最近的点; 太远 (超过 maxDist) 算没点中
export function nearestPin(pins, x, y, maxDist = 0.12) {
  let best = null;
  let bestD = Infinity;
  for (const p of pins) {
    const d = Math.hypot(p.x - x, p.y - y);
    if (d < bestD) {
      best = p;
      bestD = d;
    }
  }
  return bestD <= maxDist ? best : null;
}

// 练习题, 每个点两种:
//   name   「这是哪个?」: 点亮一个点, 从几个词里选
//   locate 「找到它」: 给一个词, 在图上点出来
export function diagramQuestions(set, { kinds = ['name', 'locate'], rng = Math.random } = {}) {
  const pins = pinnedCards(set);
  const cards = pins.map((p) => p.card);
  const out = [];
  for (const pin of pins) {
    for (const kind of kinds) {
      if (kind === 'name') {
        const options = shuffle([pin.card.term, ...distractors(pin.card, cards, 'term', 3, rng)], rng);
        out.push({ kind, card: pin.card, pin, options, correctIndex: options.indexOf(pin.card.term) });
      } else if (kind === 'locate') {
        out.push({ kind, card: pin.card, pin });
      }
    }
  }
  return shuffle(out, rng);
}
