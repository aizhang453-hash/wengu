// 生成二维码 (用 js/vendor/qrcode.js, Kazuhiko Arase 写的, MIT 许可)

import qrcode from './vendor/qrcode.js';

// 返回黑白格子: [[true/false...]...], 放不下就返回 null
export function qrMatrix(text) {
  try {
    const qr = qrcode(0, 'M'); // 0 = 自动选大小
    qr.addData(text);
    qr.make();
    const n = qr.getModuleCount();
    return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => qr.isDark(r, c)));
  } catch {
    return null; // 太长了
  }
}

// 画成 SVG (白底, 四周留白)
export function qrSvg(text, px = 220) {
  const m = qrMatrix(text);
  if (!m) return null;
  const n = m.length;
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `-4 -4 ${n + 8} ${n + 8}`);
  svg.setAttribute('width', String(px));
  svg.setAttribute('height', String(px));
  svg.setAttribute('shape-rendering', 'crispEdges');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', '二维码');
  const bg = document.createElementNS(ns, 'rect');
  bg.setAttribute('x', '-4');
  bg.setAttribute('y', '-4');
  bg.setAttribute('width', String(n + 8));
  bg.setAttribute('height', String(n + 8));
  bg.setAttribute('fill', '#fff');
  svg.append(bg);
  let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (m[r][c]) d += `M${c} ${r}h1v1h-1z`;
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', d);
  path.setAttribute('fill', '#000');
  svg.append(path);
  return svg;
}
