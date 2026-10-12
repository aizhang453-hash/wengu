// 搜索: 在所有卡片集的标题、简介、词、解释里找 (不管大小写和格式记号)

import { stripMarks } from './rich.js';

function fold(text) {
  return stripMarks(String(text ?? '')).normalize('NFKC').toLowerCase();
}

// 返回 { sets: [set], cards: [{ set, card }] }
export function search(sets, query, { limit = 200 } = {}) {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return { sets: [], cards: [] };
  const hit = (...texts) => {
    const all = texts.map(fold).join('\n');
    return words.every((w) => all.includes(w));
  };
  const outSets = sets.filter((s) => hit(s.title, s.description));
  const outCards = [];
  for (const set of sets) {
    for (const card of set.cards) {
      if (outCards.length >= limit) break;
      if (hit(card.term, card.def)) outCards.push({ set, card });
    }
  }
  return { sets: outSets, cards: outCards };
}

// 把找到的词标出来: 返回 [{ text, hit }]
export function highlight(text, query) {
  const plain = stripMarks(String(text ?? ''));
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length || !plain) return [{ text: plain, hit: false }];
  const lower = plain.normalize('NFKC').toLowerCase();
  // NFKC 可能改变长度 (全角字母), 那样就不标了, 免得标错地方
  if (lower.length !== plain.length) return [{ text: plain, hit: false }];
  const marks = new Array(plain.length).fill(false);
  for (const w of words) {
    let at = lower.indexOf(w);
    while (at !== -1) {
      for (let i = at; i < at + w.length; i++) marks[i] = true;
      at = lower.indexOf(w, at + w.length);
    }
  }
  const out = [];
  for (let i = 0; i < plain.length; i++) {
    const last = out.at(-1);
    if (last && last.hit === marks[i]) last.text += plain[i];
    else out.push({ text: plain[i], hit: marks[i] });
  }
  return out;
}
