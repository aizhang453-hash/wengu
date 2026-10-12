// 造网页元素的小工具。用户写的字一律当文字放进去 (textContent), 不会被当成网页代码。

// h('button', { class: 'btn', onclick: fn }, '保存')
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  const later = [];
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value === undefined || value === null || value === false) continue;
    if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === 'class') {
      el.className = value;
    } else if (key === 'dataset') {
      Object.assign(el.dataset, value);
    } else if (key === 'value' || key === 'checked' || key === 'selected') {
      later.push([key, value]); // select 的 value 要等选项放进去以后才设得上
    } else if (value === true) {
      el.setAttribute(key, '');
    } else {
      el.setAttribute(key, String(value));
    }
  }
  append(el, children);
  for (const [key, value] of later) el[key] = value;
  return el;
}

// 换掉 el 里的东西; 跟 h 一样, null / false 跳过, 数组摊开
// (浏览器自带的 replaceChildren 会把 null 显示成「null」这几个字)
export function fill(el, ...children) {
  el.replaceChildren();
  append(el, children);
  return el;
}

function append(el, children) {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    if (Array.isArray(child)) append(el, child);
    else el.append(child instanceof Node ? child : String(child));
  }
}

// 页面底下弹一句话, 几秒后消失
export function toast(message) {
  document.querySelectorAll('.toast').forEach((old) => old.remove());
  const el = h('div', { class: 'toast', role: 'status' }, message);
  document.body.append(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 300);
  }, 2600);
}

// 让浏览器下载一个文字文件
export function download(filename, text, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = h('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// 打乱顺序 (返回新数组)
export function shuffled(list) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function today() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// 弹出窗口 (设置用)。点外面、按 Esc、点 ✕ 都会关。返回 { el, close }
export function openDialog({ title, body, footer = null, onClose = null }) {
  const dialog = h(
    'dialog',
    { class: 'dialog', 'aria-label': title },
    h(
      'div',
      { class: 'dialog-inner' },
      h('div', { class: 'dialog-head' }, h('h2', {}, title), h('button', { class: 'icon-btn', 'aria-label': '关闭', onclick: () => close() }, '✕')),
      h('div', { class: 'dialog-body' }, body),
      footer ? h('div', { class: 'dialog-foot' }, footer) : null,
    ),
  );
  function close() {
    if (dialog.open) dialog.close();
  }
  dialog.addEventListener('close', () => {
    dialog.remove();
    onClose?.();
  });
  // 点到窗口外面的灰色地方
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) close();
  });
  document.body.append(dialog);
  dialog.showModal();
  return { el: dialog, close };
}

export function dialogOpen() {
  return Boolean(document.querySelector('dialog[open]'));
}

// 一行开关: 左边字, 右边开关
export function switchRow({ label, desc = null, checked = false, disabled = false, onchange }) {
  const input = h('input', {
    type: 'checkbox',
    role: 'switch',
    class: 'switch',
    checked,
    disabled,
    onchange: (e) => onchange?.(e.target.checked, e.target),
  });
  const row = h(
    'label',
    { class: `switch-row${disabled ? ' disabled' : ''}` },
    h('span', { class: 'switch-text' }, h('span', { class: 'switch-label' }, label), desc ? h('span', { class: 'switch-desc' }, desc) : null),
    input,
  );
  row.input = input;
  return row;
}

// 小图标 (自己画的, 不靠字体, 哪台电脑看都一样)
const ICONS = {
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  shuffle: '<path d="M16 3h5v5"/><path d="M4 20 21 3"/><path d="M21 16v5h-5"/><path d="m15 15 6 6"/><path d="M4 4l5 5"/>',
  undo: '<path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-15-6.7L3 13"/>',
  play: '<path d="M6 4l14 8-14 8z" fill="currentColor"/>',
  pause: '<path d="M7 4h3v16H7zM14 4h3v16h-3z" fill="currentColor"/>',
  expand: '<path d="M8 3H3v5M16 3h5v5M21 16v5h-5M3 16v5h5"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  left: '<path d="M19 12H5M12 19l-7-7 7-7"/>',
  right: '<path d="M5 12h14M12 5l7 7-7 7"/>',
  bulb: '<path d="M9 18h6M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.2 1 2V17h6v-.3c0-.8.4-1.5 1-2A7 7 0 0 0 12 2z"/>',
  keyboard: '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>',
};

export function icon(name, size = 20) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('svg-icon');
  svg.innerHTML = ICONS[name] ?? ''; // 只用上面写死的图形, 没有用户的字
  return svg;
}
