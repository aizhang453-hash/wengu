// 国际象棋每一步好坏的小图标 (v1.83, 温故自己画的): 彩色圆底 + 白色记号, 颜色是 css 的 .ck-<好坏> (--ck)。
// 棋盘上刚走的子右上角、走子列表、总结的表、教练气泡里都用这一套。

import { kindOf } from '../chess.js';

const NS = 'http://www.w3.org/2000/svg';

// 五角星的点 (中心 cx, cy; 外圈 r1, 里圈 r2)
function star(cx, cy, r1, r2) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? r2 : r1;
    const a = ((-90 + i * 36) * Math.PI) / 180;
    pts.push(`${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`);
  }
  return pts.join(' ');
}

const bang = (x) => `<rect x="${x - 1.3}" y="4.2" width="2.6" height="7.6" rx="1.3"/><circle cx="${x}" cy="14.7" r="1.55"/>`;
const text = (s, size) => `<text x="10" y="${10 + size * 0.36}" text-anchor="middle" font-size="${size}" font-weight="800" font-family="system-ui, -apple-system, sans-serif" letter-spacing="-0.6">${s}</text>`;

// 白色的记号 (20×20 的格子里画; 只用写死的图形)
export const GLYPHS = {
  brilliant: `${bang(6.9)}${bang(13.1)}`,
  great: bang(10),
  book: '<path d="M3.6 6.1c2.2-1 4.6-.9 5.9.4v8.3c-1.4-1-3.6-1.2-5.9-.4zM16.4 6.1c-2.2-1-4.6-.9-5.9.4v8.3c1.4-1 3.6-1.2 5.9-.4z"/>',
  best: `<polygon points="${star(10, 10.6, 6.6, 2.75)}"/>`,
  excellent: '<path d="M4.4 9.4h2.4v6.4H4.4zM8 15.8V9.6l2.5-4.4c.4-.8 1.8-.6 1.8.4v2.8h2.9c1 0 1.7.9 1.4 1.8l-1.1 4.4c-.2.7-.8 1.2-1.5 1.2z"/>',
  good: '<path d="M5.4 10.5l3.1 3.1 6.1-6.7" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>',
  forced: '<path d="M4.8 10h9.4M11.2 6.6l3.6 3.4-3.6 3.4" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>',
  inaccuracy: text('?!', 11),
  mistake: text('?', 14),
  miss: '<path d="M6.6 6.6l6.8 6.8M13.4 6.6l-6.8 6.8" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/>',
  blunder: text('??', 11.5),
};

// 一个好坏的图标 (svg); 不认识的好坏: null
export function kindIcon(key, size = 18) {
  const k = kindOf(key);
  if (!k) return null;
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 20 20');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('class', `ck-icon ck-${k.key}`);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', k.name);
  // 只有上面写死的图形
  svg.innerHTML = `<title>${k.name}</title><circle cx="10" cy="10" r="10" class="ck-icon-bg"/><g fill="#fff">${GLYPHS[k.key] ?? ''}</g>`;
  return svg;
}

// 技巧的图标 (v1.85): 紫色圆底 + 白色闪光星; locked: 还没解锁 (灰色)
export function skillIcon(size = 18, { locked = false, label = '技巧' } = {}) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 20 20');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('class', `ck-icon ck-skill${locked ? ' locked' : ''}`);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', label);
  // 只有写死的图形
  svg.innerHTML = `<circle cx="10" cy="10" r="10" class="ck-icon-bg"/><path fill="#fff" d="M10 3.4l1.7 4.9 4.9 1.7-4.9 1.7-1.7 4.9-1.7-4.9L3.4 10l4.9-1.7z"/><circle cx="15.2" cy="4.9" r="1.1" fill="#fff"/>`;
  return svg;
}

// 终局贴在王上的标记 (v1.85, 照 chess.com 终局的样子): win 赢了 (皇冠) / mated 被将死 (#) / lost 认输、超时 (小白旗) / draw 和棋 (½)
const END = {
  win: { cls: 'end-win', label: '赢了', glyph: '<path d="M4.6 13.6 3.8 7.2l3.4 2.6L10 5.2l2.8 4.6 3.4-2.6-.8 6.4z"/><rect x="4.6" y="14.4" width="10.8" height="1.8" rx=".6"/>' },
  mated: { cls: 'end-lose', label: '被将死', glyph: text('#', 12.5) },
  lost: { cls: 'end-lose', label: '输了', glyph: '<path d="M6.4 4.4v11.4" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/><path d="M7.2 5h7.4l-1.8 2.7 1.8 2.7H7.2z"/>' },
  draw: { cls: 'end-draw', label: '和棋', glyph: text('½', 12) },
};
export function endIcon(type, size = 18) {
  const e = END[type];
  if (!e) return null;
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 20 20');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('class', `ck-icon ${e.cls}`);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', e.label);
  // 只有上面写死的图形
  svg.innerHTML = `<title>${e.label}</title><circle cx="10" cy="10" r="10" class="ck-icon-bg"/><g fill="#fff">${e.glyph}</g>`;
  return svg;
}
