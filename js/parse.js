// 把粘贴进来的文字拆成卡片。
// Quizlet 导出时可以选「词和解释之间」用 Tab / 逗号 / 自定义,
// 「卡片和卡片之间」用换行 / 分号 / 自定义, 这里都认。

export const TERM_SEPS = {
  tab: '\t',
  comma: ',',
};

export const CARD_SEPS = {
  newline: '\n',
  semicolon: ';',
};

// sep 可以是上面的名字 (tab、comma、newline、semicolon), 也可以是任意一串字
function resolve(sep, table) {
  if (sep in table) return table[sep];
  return sep;
}

// 猜词和解释之间用的什么: 有 Tab 就是 Tab, 不然是逗号
export function guessTermSep(text) {
  return text.includes('\t') ? 'tab' : 'comma';
}

// 猜卡片之间用的什么: 有换行就是换行; 一行里有分号就是分号
export function guessCardSep(text) {
  const trimmed = text.trim();
  if (trimmed.includes('\n')) return 'newline';
  if (trimmed.includes(';')) return 'semicolon';
  return 'newline';
}

// 返回 [{ term, def }], 空的跳过。词和解释只在第一个分隔处拆开,
// 所以解释里有逗号也不怕。
export function parseCards(text, { termSep = 'tab', cardSep = 'newline' } = {}) {
  const ts = resolve(termSep, TERM_SEPS);
  const cs = resolve(cardSep, CARD_SEPS);
  if (!ts || !cs) return [];

  const normalized = text.replace(/\r\n?/g, '\n');
  const cards = [];
  for (const chunk of normalized.split(cs)) {
    if (!chunk.trim()) continue;
    const at = chunk.indexOf(ts);
    const term = (at === -1 ? chunk : chunk.slice(0, at)).trim();
    const def = (at === -1 ? '' : chunk.slice(at + ts.length)).trim();
    if (!term && !def) continue;
    cards.push({ term, def });
  }
  return cards;
}

// 反过来: 把卡片变回文字 (用来导出, 能再粘回 Quizlet)
export function formatCards(cards, { termSep = 'tab', cardSep = 'newline' } = {}) {
  const ts = resolve(termSep, TERM_SEPS);
  const cs = resolve(cardSep, CARD_SEPS);
  return cards.map((c) => `${c.term}${ts}${c.def}`).join(cs);
}
